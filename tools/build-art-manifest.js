// Builds site/data/art-manifest.json from The Met and Art Institute of
// Chicago open-access APIs (CC0 works only). Run: node tools/build-art-manifest.js
import { writeFile } from 'node:fs/promises';

const OUT = new URL('../site/data/art-manifest.json', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Office-safe screening. Museum metadata is the primary signal (the Met tags
// works "Nudes"/"Female Nudes"/..., AIC exposes subject_titles); title
// keywords are the backstop. Conservative by design — a false positive costs
// one artwork, a false negative costs a complaint to HR.
const UNSAFE = /nude|naked|bather|bathing|venus|leda|susanna|lucretia|danae|adam and eve|temptation|odalisque|toilette/i;

function isOfficeSafe(title, subjects) {
  if (UNSAFE.test(title ?? '')) return false;
  return !(subjects ?? []).some((s) => UNSAFE.test(s));
}

// Manual review blocklist: works that pass the keyword screen but were judged
// unsuitable for an office wall on inspection. Match by exact title.
const BLOCKLIST = new Set([
  'The Abduction of the Sabine Women',
  'The Abduction of Rebecca',
  'Mars and Venus United by Love',
  'Blind Orion Searching for the Rising Sun',
  // Vastraharana episode — gopis bathing; title evades the keyword screen.
  'The Gopis Plead with Krishna to Return Their Clothing: Folio from "Isarda" Bhagavata Purana',
]);

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'board-pro-signage-manifest-builder' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// The Met: highlighted public-domain paintings from a few departments.
async function fromMet(perDept = 20) {
  const items = [];
  const departments = [
    [11, 'painting'], // European Paintings
    [1, 'painting'], // American Wing
    [6, 'landscape'], // Asian Art
  ];
  for (const [dept, q] of departments) {
    const search = await getJSON(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&isHighlight=true&departmentId=${dept}&q=${q}`,
    );
    for (const id of (search.objectIDs ?? []).slice(0, perDept * 2)) {
      if (items.filter((i) => i.dept === dept).length >= perDept) break;
      try {
        const obj = await getJSON(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
        );
        if (!obj.isPublicDomain || !obj.primaryImageSmall) continue;
        const tagTerms = (obj.tags ?? []).map((t) => t.term);
        if (!isOfficeSafe(obj.title, tagTerms) || BLOCKLIST.has(obj.title)) continue;
        items.push({
          img: obj.primaryImageSmall,
          title: obj.title,
          artist: obj.artistDisplayName || 'Unknown',
          year: obj.objectDate || '',
          source: 'The Met',
          dept,
        });
      } catch {
        // skip failed objects
      }
      await sleep(60); // stay well under the Met's rate guidance
    }
  }
  return items.map(({ dept, ...rest }) => rest);
}

// Art Institute of Chicago: public-domain works with IIIF images.
async function fromAic(count = 40) {
  const items = [];
  for (let page = 1; items.length < count && page <= 5; page++) {
    const res = await getJSON(
      `https://api.artic.edu/api/v1/artworks/search?query[term][is_public_domain]=true&fields=id,title,artist_display,date_display,image_id,subject_titles&limit=50&page=${page}&q=painting`,
    );
    for (const a of res.data ?? []) {
      if (items.length >= count) break;
      if (!a.image_id) continue;
      if (!isOfficeSafe(a.title, a.subject_titles) || BLOCKLIST.has(a.title)) continue;
      items.push({
        img: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`,
        title: a.title,
        artist: (a.artist_display ?? 'Unknown').split('\n')[0],
        year: a.date_display ?? '',
        source: 'Art Institute of Chicago',
      });
    }
  }
  return items;
}

// Verify every image URL actually resolves; drop the ones that don't.
async function verified(items) {
  const out = [];
  for (const item of items) {
    try {
      const res = await fetch(item.img, { method: 'GET', headers: { Range: 'bytes=0-64' } });
      if (res.ok || res.status === 206) out.push(item);
      res.body?.cancel?.();
    } catch {
      // drop unreachable image
    }
    await sleep(40);
  }
  return out;
}

const [met, aic] = await Promise.all([fromMet(), fromAic()]);
const manifest = await verified([...met, ...aic]);
if (manifest.length < 20) throw new Error(`manifest too small: ${manifest.length}`);
await writeFile(OUT, JSON.stringify(manifest, null, 1));
console.log(`wrote ${manifest.length} artworks (${met.length} Met candidates, ${aic.length} AIC)`);
