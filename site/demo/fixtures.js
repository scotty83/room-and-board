// Canned view-models for ?demo=1 — renders the full dashboard with zero
// network. Also the substrate for renderer smoke tests and screenshots.

export const DEMO_VMS = {
  weather: {
    now: { temp: 84, feels: 92, code: 1, label: 'Mostly clear', icon: 'clear' },
    hourly: [
      { h: '9 AM', temp: 84, code: 1 },
      { h: '10 AM', temp: 86, code: 1 },
      { h: '11 AM', temp: 89, code: 2 },
      { h: '12 PM', temp: 92, code: 2 },
      { h: '1 PM', temp: 94, code: 3 },
      { h: '2 PM', temp: 95, code: 95 },
      { h: '3 PM', temp: 93, code: 95 },
      { h: '4 PM', temp: 90, code: 80 },
    ],
    daily: [
      { day: 'Today', hi: 95, lo: 78, code: 95 },
      { day: 'Fri', hi: 91, lo: 77, code: 2 },
      { day: 'Sat', hi: 88, lo: 74, code: 0 },
      { day: 'Sun', hi: 85, lo: 71, code: 61 },
      { day: 'Mon', hi: 82, lo: 69, code: 3 },
    ],
    sunrise: '2026-07-02T05:28',
    sunset: '2026-07-02T20:30',
    alert: { event: 'Extreme Heat Watch', headline: 'Extreme Heat Watch in effect until Saturday 9 PM' },
  },
  subway: {
    updatedAt: 0,
    lines: [
      { line: '1', ok: true, headers: [] },
      { line: '2', ok: true, headers: [] },
      { line: '3', ok: false, headers: ['Downtown [3] trains are rerouted via the [2] line after 34 St-Penn Station while we address a signal problem.'] },
      { line: 'A', ok: true, headers: [] },
      { line: 'E', ok: false, headers: ['[E] trains are running with delays in both directions.'] },
    ],
  },
  lirr: {
    alerts: [{ header: 'Port Washington Branch trains may be delayed up to 15 minutes due to switch trouble at Woodside.' }],
    departures: [
      { min: 8, dest: 'Port Washington', branch: 'Port Washington', track: '17', trainNum: '706' },
      { min: 21, dest: 'Great Neck', branch: 'Port Washington', track: '19', trainNum: '712' },
      { min: 34, dest: 'Port Washington', branch: 'Port Washington', track: null, trainNum: '718' },
    ],
  },
  njt: {
    updatedAt: 0,
    stale: false,
    alerts: [{ header: 'Northeast Corridor trains subject to 10-15 minute delays due to Amtrak signal issues.' }],
    trains: [
      { min: 12, dest: 'Trenton', line: 'Northeast Corridor', track: '3', status: 'BOARDING' },
      { min: 26, dest: 'Dover', line: 'Morris & Essex', track: null, status: '' },
      { min: 41, dest: 'Bay Head', line: 'North Jersey Coast', track: '5', status: '' },
    ],
  },
  art: {
    img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP145911.jpg',
    title: 'Wheat Fields',
    artist: 'Jacob van Ruisdael',
    year: 'ca. 1670',
    source: 'The Met',
  },
  history: {
    events: [
      { year: 1776, text: 'The Continental Congress votes for independence from Great Britain.' },
      { year: 1881, text: 'President James A. Garfield is shot at the Baltimore and Potomac Railroad Station.' },
      { year: 1937, text: 'Amelia Earhart disappears over the Pacific Ocean during her circumnavigation attempt.' },
      { year: 1964, text: 'President Lyndon B. Johnson signs the Civil Rights Act into law.' },
      { year: 2002, text: 'Steve Fossett completes the first solo balloon circumnavigation of the world.' },
    ],
  },
  aqi: {
    aqi: 66,
    category: 'Moderate',
    sunrise: '2026-07-02T05:28',
    sunset: '2026-07-02T20:30',
    moonPhase: { name: 'Waning Gibbous', fraction: 0.62 },
  },
  quote: {
    text: 'The best way to predict the future is to invent it.',
    author: 'Alan Kay',
  },
  worldclock: [
    { city: 'New York', time: '8:13 AM', dayDiff: 0 },
    { city: 'Hyderabad', time: '5:43 PM', dayDiff: 0 },
    { city: 'London', time: '1:13 PM', dayDiff: 0 },
    { city: 'Los Angeles', time: '5:13 AM', dayDiff: 0 },
    { city: 'Hong Kong', time: '8:13 PM', dayDiff: 0 },
  ],
  markets: {
    updatedAt: 0,
    stale: false,
    indices: [
      { symbol: '^DJI', name: 'Dow Jones', price: 52147.83, change: 231.44, changePct: 0.45, spark: [51900, 51950, 52020, 51980, 52080, 52147] },
      { symbol: '^IXIC', name: 'Nasdaq', price: 24893.11, change: -87.62, changePct: -0.35, spark: [24980, 24950, 24870, 24910, 24860, 24893] },
      { symbol: '^GSPC', name: 'S&P 500', price: 7483.23, change: -16.13, changePct: -0.22, spark: [7499, 7490, 7470, 7458, 7481, 7483] },
    ],
  },
};
