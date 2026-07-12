// TfL lines the widget covers — id/name/official brand colour/mode. Single
// source of truth shared by config (default + validation), the widget
// (LINE_META), and the settings/setup pickers.
export const TFL_LINES = [
  { id: 'bakerloo', name: 'Bakerloo', color: '#B36305', mode: 'Tube' },
  { id: 'central', name: 'Central', color: '#E32017', mode: 'Tube' },
  { id: 'circle', name: 'Circle', color: '#FFD300', mode: 'Tube' },
  { id: 'district', name: 'District', color: '#00782A', mode: 'Tube' },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: '#F3A9BB', mode: 'Tube' },
  { id: 'jubilee', name: 'Jubilee', color: '#A0A5A9', mode: 'Tube' },
  { id: 'metropolitan', name: 'Metropolitan', color: '#9B0056', mode: 'Tube' },
  { id: 'northern', name: 'Northern', color: '#000000', mode: 'Tube' },
  { id: 'piccadilly', name: 'Piccadilly', color: '#003688', mode: 'Tube' },
  { id: 'victoria', name: 'Victoria', color: '#0098D4', mode: 'Tube' },
  { id: 'waterloo-city', name: 'Waterloo & City', color: '#95CDBA', mode: 'Tube' },
  { id: 'elizabeth', name: 'Elizabeth line', color: '#6950A1', mode: 'Elizabeth' },
  { id: 'dlr', name: 'DLR', color: '#00A4A7', mode: 'DLR' },
  { id: 'liberty', name: 'Liberty', color: '#676767', mode: 'Overground' },
  { id: 'lioness', name: 'Lioness', color: '#FAA61A', mode: 'Overground' },
  { id: 'mildmay', name: 'Mildmay', color: '#0077AD', mode: 'Overground' },
  { id: 'suffragette', name: 'Suffragette', color: '#5BBD72', mode: 'Overground' },
  { id: 'weaver', name: 'Weaver', color: '#823A62', mode: 'Overground' },
  { id: 'windrush', name: 'Windrush', color: '#ED1B00', mode: 'Overground' },
];
export const TFL_TUBE_IDS = TFL_LINES.filter((l) => l.mode === 'Tube').map((l) => l.id);
export const TFL_LINE_IDS = new Set(TFL_LINES.map((l) => l.id));
export const TFL_MODES = ['Tube', 'Elizabeth', 'DLR', 'Overground'];
