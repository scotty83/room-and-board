// ZIP → location via Zippopotam (keyless, CORS-open, purpose-built for postal
// codes). The Open-Meteo geocoder used before matches place *names*, so most
// suburban US ZIPs (e.g. 11570 Rockville Centre) returned nothing.
export async function zipLookup(zip, fetchFn = fetch) {
  const res = await fetchFn(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return null;
  const place = (await res.json()).places?.[0];
  if (!place) return null;
  return {
    lat: Number(place.latitude),
    lon: Number(place.longitude),
    label: `${place['place name']} ${zip}`,
  };
}

// One search box, two upstreams: a 5-digit query is a US ZIP (zippopotam has
// the right centroid + label; Open-Meteo's geocoder fumbles ZIPs), anything
// else geocodes worldwide via Open-Meteo (keyless). Result: {lat, lon, label,
// cc} — cc drives the regional °F/°C default when a result is picked.
export async function locationSearch(query, fetchFn = fetch) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return [];
  try {
    if (/^\d{5}$/.test(q)) {
      const loc = await zipLookup(q, fetchFn);
      return loc ? [{ ...loc, cc: 'US' }] : [];
    }
    const res = await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`);
    if (!res.ok) return [];
    const results = (await res.json()).results ?? [];
    return results.map((r) => ({
      lat: r.latitude,
      lon: r.longitude,
      cc: r.country_code,
      label: `${r.name}${r.admin1 ? `, ${r.admin1}` : ''}${r.country_code !== 'US' ? ` (${r.country_code})` : ''}`,
    }));
  } catch {
    return []; // pickers show the no-match copy
  }
}
