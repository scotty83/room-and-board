// Inline SVG weather glyphs — tiny, stroke-based, tinted via currentColor.
// No icon font, no image requests.

const P = {
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  cloud: '<path d="M7 17h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.5 11 3.5 3.5 0 0 0 7 17z"/>',
  partly:
    '<circle cx="8" cy="9" r="3"/><path d="M8 3v1.8M3 9h1.8M4.7 5.7l1.2 1.2M8 14.2V16" opacity=".9"/><path d="M10 19h7.5a3 3 0 0 0 .5-5.96A4.5 4.5 0 0 0 9.5 14 2.9 2.9 0 0 0 10 19z"/>',
  rain: '<path d="M7 14h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.5 8 3.5 3.5 0 0 0 7 14z"/><path d="M8.5 17l-1 3M12.5 17l-1 3M16.5 17l-1 3"/>',
  drizzle: '<path d="M7 14h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.5 8 3.5 3.5 0 0 0 7 14z"/><path d="M9 17.5l-.5 1.5M13 17.5l-.5 1.5M17 17.5l-.5 1.5"/>',
  snow: '<path d="M7 14h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.5 8 3.5 3.5 0 0 0 7 14z"/><path d="M8.5 17.5h.01M12.5 19h.01M16.5 17.5h.01M10.5 20.5h.01M14.5 20.5h.01" stroke-linecap="round" stroke-width="2.4"/>',
  sleet: '<path d="M7 14h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.5 8 3.5 3.5 0 0 0 7 14z"/><path d="M8.5 17l-1 3M16.5 17l-1 3M12.5 18h.01" stroke-linecap="round"/>',
  thunder: '<path d="M7 13h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.5 7 3.5 3.5 0 0 0 7 13z"/><path d="M13 13l-3 4.5h3L11 22"/>',
  fog: '<path d="M5 10h14M4 13.5h16M6 17h12M8 20.5h8"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/>',
  pencil:
    '<path d="M14.5 5.5l4 4L8 20l-4.6 1 1-4.6L14.5 5.5zM12.5 7.5l4 4"/>',
};
P.clear = P.sun;
P.cloudy = P.cloud;

export function icon(name, cls = '') {
  const body = P[name] ?? P.sun;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
