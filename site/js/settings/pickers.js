// Pure selectors behind the tap-only station pickers.

export function boroughs(stations) {
  return [...new Set(stations.map((s) => s.borough))];
}

export function linesForBorough(stations, borough) {
  const lines = new Set();
  for (const s of stations) if (s.borough === borough) for (const l of s.lines) lines.add(l);
  return [...lines].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export function stationsForLine(stations, borough, line) {
  return stations
    .filter((s) => s.borough === borough && s.lines.includes(line))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function alphaSections(stations) {
  const sections = [];
  for (const s of stations) {
    const letter = s.name[0].toUpperCase();
    let section = sections[sections.length - 1];
    if (!section || section.letter !== letter) {
      section = { letter, stations: [] };
      sections.push(section);
    }
    section.stations.push(s);
  }
  return sections;
}

// Toggle membership of value in a list, returning a new list.
export function toggleIn(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function moveWidget(ids, id, delta) {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
