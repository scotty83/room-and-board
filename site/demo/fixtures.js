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
      { min: 8, t: 1783000480, dest: 'Port Washington', branch: 'Port Washington', track: '17', trainNum: '706' },
      { min: 21, t: 1783001260, dest: 'Great Neck', branch: 'Port Washington', track: '19', trainNum: '712' },
      { min: 34, t: 1783002040, dest: 'Port Washington', branch: 'Port Washington', track: null, trainNum: '718' },
    ],
  },
  mnr: {
    alerts: [],
    departures: [
      { min: 6, t: 1783000360, dest: 'Southeast', branch: 'Harlem', track: null },
      { min: 14, t: 1783000840, dest: 'Poughkeepsie', branch: 'Hudson', track: null },
      { min: 22, t: 1783001320, dest: 'New Haven-State St', branch: 'New Haven', track: null },
    ],
  },
  njt: {
    updatedAt: 0,
    stale: false,
    alerts: [{ header: 'Northeast Corridor trains subject to 10-15 minute delays due to Amtrak signal issues.' }],
    trains: [
      { min: 12, time: 1783000720, dest: 'Trenton', line: 'Northeast Corridor', track: '3', status: 'BOARDING' },
      { min: 26, time: 1783001560, dest: 'Dover', line: 'Morris & Essex', track: null, status: '' },
      { min: 41, time: 1783002460, dest: 'Bay Head', line: 'North Jersey Coast', track: '5', status: '' },
    ],
  },
  amtrak: {
    station: 'NYP', updatedAt: 1783000000, stale: false,
    alerts: [{ header: 'Northeast Regional trains are operating with reduced frequency this weekend due to track work south of Philadelphia.' }],
    departures: [
      { t: 1783000720, sch: 1783000720, dest: 'Washington Union', destCode: 'WAS', route: 'Northeast Regional', num: '171', status: 'On time', platform: null,
        stops: [['NWK', 1783001200], ['TRE', 1783002400], ['PHL', 1783003600], ['BAL', 1783006000], ['WAS', 1783007800]] },
      { t: 1783001580, sch: 1783001280, dest: 'Boston South', destCode: 'BOS', route: 'Acela', num: '2151', status: '5 min late', platform: '7',
        stops: [['STM', 1783003000], ['NHV', 1783004500], ['BOS', 1783012000]] },
      { t: 1783002400, sch: 1783002400, dest: 'Albany-Rensselaer', destCode: 'ALB', route: 'Empire Service', num: '233', status: 'On time', platform: null,
        stops: [['YNY', 1783003000], ['CRT', 1783003600], ['POU', 1783005000], ['ALB', 1783010000]] },
      { t: 1783003300, sch: 1783003300, dest: 'Harrisburg', destCode: 'HAR', route: 'Keystone', num: '643', status: 'On time', platform: null,
        stops: [['NWK', 1783003800], ['TRE', 1783004800], ['PHL', 1783006000], ['LNC', 1783009000], ['HAR', 1783010800]] },
      { t: 1783004200, sch: 1783004200, dest: 'Boston South', destCode: 'BOS', route: 'Northeast Regional', num: '175', status: 'On time', platform: null,
        stops: [['NHV', 1783007000], ['PVD', 1783011000], ['BOS', 1783013000]] },
    ],
  },
  path: {
    station: '33S',
    sections: [
      {
        dir: 'ToNJ',
        label: 'To New Jersey',
        rows: [
          { min: 3, t: 1783000180, dest: 'Journal Square', colors: ['FF9900'] },
          { min: 9, t: 1783000540, dest: 'Hoboken', colors: ['4D92FB'] },
          { min: 16, t: 1783000960, dest: 'Newark', colors: ['D93A30'] },
        ],
      },
    ],
  },
  ferry: {
    landing: '17',
    landingName: 'East 34th Street',
    departures: [
      { min: 5, t: 1783000300, dest: 'Wall St./Pier 11', route: { name: 'East River', color: '00839C' } },
      { min: 18, t: 1783001080, dest: 'Hunters Point South', route: { name: 'East River', color: '00839C' } },
      { min: 33, t: 1783001980, dest: 'Soundview', route: { name: 'Soundview', color: '4E008E' } },
    ],
  },
  wotd: {
    w: 'petrichor',
    pr: 'PET-rih-kor',
    pos: 'noun',
    def: 'The pleasant, earthy smell that follows rain on dry ground.',
    ex: 'The first storm of the season filled the street with petrichor.',
  },
  bus: { configured: true, stops: [
    { id: '550789', route: 'QM24', name: 'Madison Av / E 34 St', arrivals: [
      { dest: 'Wall St', min: 8, distance: '' }, { dest: 'Wall St', min: 21, distance: '' } ] } ] },
  sports: {
    rows: [
      { lg: 'mlb', abbr: 'NYM', name: 'Mets', record: '48-37', state: 'in', line: '3-2 vs ATL · Bot 7th', logo: 'https://a.espncdn.com/i/teamlogos/mlb/500-dark/nym.png', lastLine: 'L 3-9 vs TOR · Final' },
      { lg: 'nba', abbr: 'NYK', name: 'Knicks', record: '', state: 'pre', line: 'vs BOS · 10/24 - 7:30 PM', logo: 'https://a.espncdn.com/i/teamlogos/nba/500-dark/nyk.png', lastLine: 'W 112-104 @ BOS · Final' },
      { lg: 'nfl', abbr: 'NYJ', name: 'Jets', record: '', state: 'post', line: 'W 24-17 @ NE · Final', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500-dark/nyj.png', lastLine: null, nextLine: 'vs MIA · 10/28 - 8:15 PM EDT' },
    ],
  },
  // No demo stream: rights sit with the user, so demo/audit shows the
  // unconfigured tap-to-set-up state.
  iptv: { url: '', label: '' },
  golf: {
    name: 'The Open', state: 'in', startsAt: null, round: '3',
    players: [
      { pos: 1, name: 'S. Burns', score: '-10', today: '+3' },
      { pos: 2, name: 'R. Fox', score: '-8', today: '-2' },
      { pos: 3, name: 'S.W. Kim', score: '-8', today: 'E' },
      { pos: 4, name: 'R. Gerard', score: '-7', today: '-1' },
      { pos: 5, name: 'S. Scheffler', score: '-6', today: '+1' },
      { pos: 6, name: 'R. McIlroy', score: '-5', today: '-3' },
    ],
  },
  tennis: {
    name: 'Nordea Open',
    rows: [
      { tour: 'ATP', state: 'in', t: 1783000000000, round: 'Semifinal', a: 'C. Alcaraz', b: 'A. Zverev', sets: '6-4 3-2', winner: null, detail: 'Set 2' },
      { tour: 'WTA', state: 'pre', t: 1783005000000, round: 'Final', a: 'I. Swiatek', b: 'A. Sabalenka', sets: '', winner: null, detail: '3:00 PM' },
      { tour: 'WTA', state: 'post', t: 1782990000000, round: 'Quarterfinal', a: 'V. Strakhova', b: 'M. Bulgaru', sets: '6-2 6-2', winner: 'b', detail: 'Final' },
    ],
  },
  worldcup: {
    nowMs: 1783000000000,
    live: [
      { t: 1782998000000, state: 'in', detail: "68'", home: 'USA', away: 'CRC', hs: '2', as: '0', hf: 'https://a.espncdn.com/i/teamlogos/countries/500/usa.png', af: 'https://a.espncdn.com/i/teamlogos/countries/500/crc.png', note: '', stage: 'Round of 16' },
    ],
    upcoming: [
      { t: 1783015200000, state: 'pre', detail: '', home: 'FRA', away: 'NGA', hs: null, as: null, note: '', stage: 'Round of 16' },
      { t: 1783090000000, state: 'pre', detail: '', home: 'BRA', away: 'MEX', hs: null, as: null, note: '', stage: 'Round of 16' },
    ],
    results: [
      { t: 1782920000000, state: 'post', detail: 'FT-Pens', home: 'GER', away: 'PAR', hs: '1', as: '1', note: 'Paraguay advance 4-3 on penalties', stage: 'Round of 32' },
      { t: 1782910000000, state: 'post', detail: 'FT', home: 'BRA', away: 'JPN', hs: '2', as: '1', note: '', stage: 'Round of 32' },
    ],
  },
  news: {
    nowMs: 1783000000000,
    items: [
      { title: 'Council reaches deal on city budget ahead of deadline', t: 1782998200000, source: 'NYT New York' },
      { title: 'Federal Reserve signals patience on rate cuts', t: 1782996000000, source: 'NYT Business' },
      { title: 'Subway platform doors pilot expands to five stations', t: 1782990000000, source: 'Gothamist' },
      { title: 'World Cup crowds boost midtown restaurants', t: 1782980000000, source: 'NYT Top Stories' },
    ],
  },
  substack: {
    nowMs: 1783000000000,
    items: [
      { text: 'The AI Superforecasters Are Here — What happens when the models start beating the humans at their own game', t: 1782998200000, source: 'Astral Codex Ten' },
      { text: 'The Hidden Cost of Meetings — A field guide to reclaiming your calendar one recurring invite at a time', t: 1782910000000, source: 'Pragmatic Engineer' },
    ],
  },
  bsky: {
    nowMs: 1783000000000,
    items: [
      { text: 'Breaking: newest ferry pier opens with a ribbon cutting at sunrise', t: 1782998000000, source: 'NYT' },
      { text: 'Shipped a new feature today. The trick was deleting more code than I wrote.', t: 1782990000000, source: 'Jane Dev' },
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
    uv: 7,
    moonPhase: { name: 'Waning Gibbous', fraction: 0.62 },
  },
  quote: {
    text: 'The best way to predict the future is to invent it.',
    author: 'Alan Kay',
  },
  worldclock: [
    { city: 'San Francisco', time: '5:13 AM', dayDiff: 0 },
    { city: 'New York', time: '8:13 AM', dayDiff: 0 },
    { city: 'London', time: '1:13 PM', dayDiff: 0 },
    { city: 'Hyderabad', time: '5:43 PM', dayDiff: 0 },
    { city: 'Hong Kong', time: '12:13 AM', dayDiff: 1 },
  ],
  markets: {
    updatedAt: 1783000500,
    stale: false,
    indices: [
      { symbol: '^DJI', name: 'Dow Jones', price: 52147.83, change: 231.44, changePct: 0.45, spark: [51900, 51950, 52020, 51980, 52080, 52147], spark2: [51700, 51820, 51760, 51900, 51900, 51950, 52020, 51980, 52080, 52147], split: 5 },
      { symbol: '^IXIC', name: 'Nasdaq', price: 24893.11, change: -87.62, changePct: -0.35, spark: [24980, 24950, 24870, 24910, 24860, 24893], spark2: [25100, 25040, 25010, 24980, 24980, 24950, 24870, 24910, 24860, 24893], split: 5 },
      { symbol: '^GSPC', name: 'S&P 500', price: 7483.23, change: -16.13, changePct: -0.22, spark: [7499, 7490, 7470, 7458, 7481, 7483], spark2: [7520, 7505, 7512, 7499, 7499, 7490, 7470, 7458, 7481, 7483], split: 5 },
    ],
  },
  photos: { updatedAt: 1783000000, stale: false, photos: [
    { img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP145911.jpg', ar: 1.33, title: 'Beach', date: '2026-02-24' },
  ] },
  gdrivephotos: { updatedAt: 1783000000, stale: false, photos: [
    { img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP145911.jpg', ar: 1.33, title: 'Harbor', date: '2026-02-25' },
  ] },
  marketsnews: { items: [{ title: 'Fed holds rates', source: 'CNBC', t: 1783000000000 }], nowMs: 1783000100000 },
  tfl: { updatedAt: 1783000000, lines: [
    { id: 'central', name: 'Central', mode: 'Tube', ok: true, status: 'Good Service', reason: '' },
    { id: 'victoria', name: 'Victoria', mode: 'Tube', ok: true, status: 'Good Service', reason: '' },
    { id: 'district', name: 'District', mode: 'Tube', ok: false, status: 'Part Closure', reason: 'No service between Turnham Green and Richmond this weekend; use replacement buses.' },
  ] },
  citibike: { updatedAt: 1783000000, stations: [
    { id: '66dc7c31-0aca-11e7-82f6-3863bb44ef7c', bikes: 7, ebikes: 3, docks: 12, ok: true },
    { id: '66dc51e9-0aca-11e7-82f6-3863bb44ef7c', bikes: 0, ebikes: 0, docks: 25, ok: true },
    { id: '1869743938848725856', bikes: 4, ebikes: 0, docks: 0, ok: false },
  ] },
  f1: { updatedAt: 1783000000, stale: false,
    next: { name: 'Belgian Grand Prix', date: '2026-07-19', circuit: 'Circuit de Spa-Francorchamps', country: 'Belgium' },
    lastRace: 'British Grand Prix',
    podium: [
      { pos: 1, driver: 'Leclerc', nat: 'Monegasque', cid: 'ferrari' },
      { pos: 2, driver: 'Russell', nat: 'British', cid: 'mercedes' },
      { pos: 3, driver: 'Hamilton', nat: 'British', cid: 'ferrari' },
    ],
    drivers: [
      { pos: 1, name: 'Antonelli', nat: 'Italian', cid: 'mercedes', pts: 179 },
      { pos: 2, name: 'Russell', nat: 'British', cid: 'mercedes', pts: 154 },
      { pos: 3, name: 'Hamilton', nat: 'British', cid: 'ferrari', pts: 147 },
      { pos: 4, name: 'Leclerc', nat: 'Monegasque', cid: 'ferrari', pts: 108 },
      { pos: 5, name: 'Norris', nat: 'British', cid: 'mclaren', pts: 97 },
      { pos: 6, name: 'Piastri', nat: 'Australian', cid: 'mclaren', pts: 82 },
      { pos: 7, name: 'Verstappen', nat: 'Dutch', cid: 'red_bull', pts: 76 },
      { pos: 8, name: 'Hadjar', nat: 'French', cid: 'rb', pts: 52 },
    ],
    teams: [
      { pos: 1, cid: 'mercedes', name: 'Mercedes', pts: 333 },
      { pos: 2, cid: 'ferrari', name: 'Ferrari', pts: 255 },
      { pos: 3, cid: 'mclaren', name: 'McLaren', pts: 179 },
      { pos: 4, cid: 'red_bull', name: 'Red Bull', pts: 128 },
      { pos: 5, cid: 'alpine', name: 'Alpine', pts: 60 },
      { pos: 6, cid: 'rb', name: 'RB F1 Team', pts: 59 },
    ] },
  chart: { updatedAt: 1783000000, charts: [{
    id: '28744',
    title: 'How Global Population Growth Is Slowing',
    desc: 'This chart shows the annual growth rate of the world population from 1950 to 2100 (projected).',
    date: '2026-07-10',
    url: 'https://cdn.statcdn.com/Infographic/images/normal/28744.jpeg',
    link: 'https://www.statista.com/chart/28744/world-population-growth-timeline-and-forecast/' }, {
    id: '28730',
    title: 'How Voters Rate the Economy',
    desc: 'A recent election-season poll of registered voters on the state of the economy.',
    date: '2026-07-09',
    url: 'https://cdn.statcdn.com/Infographic/images/normal/28730.jpeg',
    link: 'https://www.statista.com/chart/28730/how-voters-rate-the-economy/' }] },
  apod: { updatedAt: 1783000000, photo: {
    url: 'https://apod.nasa.gov/apod/image/2607/M24_1088.jpg',
    title: 'Messier 24: Sagittarius Star Cloud',
    explanation: 'Unlike most entries in Charles Messier\'s famous catalog of deep sky objects, M24 is not a bright galaxy or star cluster but a rich star cloud toward the center of our Milky Way galaxy, a window into a spiral arm some 10,000 light-years away.',
    credit: 'Chuck Ayoub', date: '2026-07-11' } },
  services: {
    updatedAt: 1783000000,
    services: [
      { id: 'webex', label: 'Webex', state: 'ok', note: 'All systems operational', incidents: [] },
      { id: 'zoom', label: 'Zoom', state: 'ok', note: 'All systems operational', incidents: [] },
      { id: 'slack', label: 'Slack', state: 'ok', note: 'All systems operational', incidents: [] },
      // Degraded sample modeled on the real Cloudflare incident recorded 2026-07-11.
      { id: 'cloudflare', label: 'Cloudflare', state: 'minor', note: 'Minor Service Outage', incidents: [
        { title: 'Cloudflare Dashboard and API service issues', since: '2026-07-11T14:12:00.000Z',
          update: 'Cloudflare is investigating elevated error rates on the Dashboard and API. Cached content and traffic proxying are unaffected.' },
      ] },
      { id: 'm365', label: 'Microsoft 365', state: 'ok', note: "We're all good!", incidents: [] },
      { id: 'aws', label: 'AWS', state: 'unknown', note: 'Status unavailable', incidents: [] },
    ],
  },
};
