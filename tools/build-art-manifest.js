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

// No human subjects at all (per Sean): landscapes, still lifes, ceramics,
// patterns. Museum subject tags catch most figures; titles are the backstop.
const HUMAN =
  /portrait|figure|people|person|\bmen\b|\bman\b|woman|women|child|children|\bboy\b|\bgirl\b|saint|madonna|virgin|christ|angel|apostle|holy|crucifixion|deity|buddha|luohan|god\b|goddess|dancer|musician|soldier|warrior|king\b|queen|emperor|empress|lady|gentleman|monk|nun\b|family|mother|father|wedding|nurse|reader|bather|self-portrait|equestrian|hunter|peasant|farmer|fisherman|shepherd|traders|officials|couple/i;

function isOfficeSafe(title, subjects) {
  if (UNSAFE.test(title ?? '') || HUMAN.test(title ?? '')) return false;
  return !(subjects ?? []).some((s) => UNSAFE.test(s) || HUMAN.test(s));
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

// No-humans review pass (2026-07-02): works whose figures the museum metadata
// does not tag — boat crews, travelers, riders, strollers. Matched by prefix
// so series numbering/subtitle variants stay covered.
const HUMAN_BLOCK_PREFIXES = [
  'Whalers',
  'Under the Wave off Kanagawa',
  'Shirasuka: Shiomi Slope',
  'Okabe: Mount Utsu',
  'Ejiri in Suruga Province',
  'Capture of the Tripoli by the Enterprise',
  'The Prairie on Fire',
  'Boston Common',
];

export function passesReview(title) {
  return !BLOCKLIST.has(title) && !HUMAN_BLOCK_PREFIXES.some((p) => title.startsWith(p));
}

async function getJSON(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': 'board-pro-signage-manifest-builder' } });
  if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(5000 * 2 ** attempt); // back off politely on throttling
    return getJSON(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Landscape-only: a 16:9 cover crop of a portrait canvas discards most of
// the work. Keep aspect (w/h) >= MIN_ASPECT; the slideshow letterboxes
// anything still short of true 16:9.
const MIN_ASPECT = 1.25;
// Ultra-wide handscrolls (aspect 15-38 in the Met's Asian collection) render
// as thin ribbons even letterboxed; cap keeps panoramas, drops scrolls.
const MAX_ASPECT = 4;

// The Met object API reports physical dimensions (cm) per element; the first
// element with both width and height gives the canvas aspect.
function metAspect(obj) {
  for (const m of obj.measurements ?? []) {
    const em = m?.elementMeasurements;
    if (em?.Width > 0 && em?.Height > 0) return em.Width / em.Height;
  }
  return null;
}

// The Met: highlighted public-domain paintings from a few departments.
async function fromMet(perDept = 20) {
  const items = [];
  // Landscape/still-life queries bias the pool toward peopleless works.
  const departments = [
    [11, 'landscape'], // European Paintings
    [11, 'still life'],
    [1, 'landscape'], // American Wing
    [6, 'landscape'], // Asian Art
  ];
  for (const [dept, q] of departments) {
    const search = await getJSON(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&isHighlight=true&departmentId=${dept}&q=${q}`,
    );
    for (const id of (search.objectIDs ?? []).slice(0, perDept * 10)) {
      if (items.filter((i) => i.dept === `${dept}:${q}`).length >= perDept) break;
      try {
        const obj = await getJSON(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
        );
        if (!obj.isPublicDomain || !obj.primaryImageSmall) continue;
        const tagTerms = (obj.tags ?? []).map((t) => t.term);
        if (!isOfficeSafe(obj.title, tagTerms) || !passesReview(obj.title)) continue;
        const ar = metAspect(obj);
        if (!ar || ar < MIN_ASPECT || ar > MAX_ASPECT) continue;
        items.push({
          img: obj.primaryImageSmall,
          imgFull: obj.primaryImage || null, // upgraded in verified() when sane
          ar: Math.round(ar * 100) / 100,
          title: obj.title,
          artist: obj.artistDisplayName || 'Unknown',
          year: obj.objectDate || '',
          source: 'The Met',
          dept: `${dept}:${q}`,
        });
      } catch {
        // skip failed objects
      }
      await sleep(150); // stay well under the Met's rate guidance
    }
  }
  return items.map(({ dept, ...rest }) => rest);
}

// Art Institute of Chicago: public-domain works with IIIF images.
// thumbnail.width/height are the full image's pixel dimensions.
async function fromAic(count = 40) {
  const items = [];
  for (let page = 1; items.length < count && page <= 12; page++) {
    const res = await getJSON(
      `https://api.artic.edu/api/v1/artworks/search?query[term][is_public_domain]=true&fields=id,title,artist_display,date_display,image_id,subject_titles,thumbnail&limit=50&page=${page}&q=landscape`,
    );
    for (const a of res.data ?? []) {
      if (items.length >= count) break;
      if (!a.image_id) continue;
      if (!isOfficeSafe(a.title, a.subject_titles) || !passesReview(a.title)) continue;
      const ar = a.thumbnail?.width > 0 && a.thumbnail?.height > 0
        ? a.thumbnail.width / a.thumbnail.height
        : null;
      if (!ar || ar < MIN_ASPECT || ar > MAX_ASPECT) continue;
      items.push({
        // 1686 is the widest size AIC's public IIIF serves.
        img: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`,
        ar: Math.round(ar * 100) / 100,
        title: a.title,
        artist: (a.artist_display ?? 'Unknown').split('\n')[0],
        year: a.date_display ?? '',
        source: 'Art Institute of Chicago',
      });
    }
  }
  return items;
}

// Probe a URL with a tiny range request; returns total byte size or null.
// The UA matters: AIC's CDN 403s Node's default user agent.
async function probe(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-64', 'User-Agent': 'Mozilla/5.0 board-pro-signage-manifest-builder' },
    });
    res.body?.cancel?.();
    if (!(res.ok || res.status === 206)) return null;
    const range = res.headers.get('content-range'); // "bytes 0-64/TOTAL"
    const total = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length'));
    return Number.isFinite(total) ? total : 0;
  } catch {
    return null;
  }
}

// Verify every image resolves, and upgrade Met entries to the full-resolution
// original when it exists and is small enough for gen1 boards to decode.
const MAX_FULL_BYTES = 3_000_000;

async function verified(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.title}|${item.artist}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { imgFull, ...entry } = item;
    if (imgFull) {
      const size = await probe(imgFull);
      if (size !== null && size > 0 && size <= MAX_FULL_BYTES) {
        out.push({ ...entry, img: imgFull });
        await sleep(40);
        continue;
      }
    }
    if ((await probe(entry.img)) !== null) out.push(entry);
    await sleep(40);
  }
  return out;
}

const [met, aic] = await Promise.all([fromMet(), fromAic()]);
const manifest = await verified([...met, ...aic]);
if (manifest.length < 20) throw new Error(`manifest too small: ${manifest.length}`);
await writeFile(OUT, JSON.stringify(manifest, null, 1));
console.log(`wrote ${manifest.length} artworks (${met.length} Met candidates, ${aic.length} AIC)`);
