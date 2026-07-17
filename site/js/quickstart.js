// The welcome screen's Quick Start preset — a curated full-grid showcase
// (captured from a hand-arranged board, 2026-07-13) rather than the bare
// DEFAULT_CONFIG. Only the fields that differ from defaults live here;
// normalizeConfig fills the rest, so default improvements still flow in.
// Nothing personal: no name, default NYC location, public feeds only.
export const QUICKSTART_CONFIG = {
  layout: [
    { id: 'weather', x: 0, y: 0, w: 3, h: 5 },
    { id: 'news', x: 3, y: 0, w: 3, h: 5 },
    { id: 'apod', x: 6, y: 0, w: 3, h: 4 },
    { id: 'worldclock', x: 9, y: 0, w: 3, h: 3 },
    { id: 'quote', x: 9, y: 3, w: 3, h: 2 },
    { id: 'markets', x: 0, y: 5, w: 3, h: 3 },
    { id: 'services', x: 3, y: 5, w: 3, h: 3 },
    { id: 'chart', x: 6, y: 4, w: 3, h: 4 },
    { id: 'subway', x: 9, y: 5, w: 3, h: 3 },
  ],
  news: { sources: ['nyt-home', 'npr', 'bbc'] },
  services: { list: ['webex', 'zoom', 'slack', 'm365'] },
  // New boards start on Momentum (native RoomOS look; real Cisco Sans on
  // Cisco glass). Explicit — NOT the DEFAULT_CONFIG default — so existing
  // configs without a theme field stay on Room & Board.
  theme: 'momentum',
};
