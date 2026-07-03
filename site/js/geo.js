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
