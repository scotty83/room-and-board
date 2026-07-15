// Curated Statista "Chart of the Day" topic allowlist [label, slug]. Open
// vocabulary — Statista has no master topic list, so this is hand-picked and
// each slug was verified to load live charts. Mirrors CHART_TOPICS in the
// worker (worker/src/chart.js); keep the two in sync. Some slugs carry spaces
// (URL-encoded on the wire). Standalone data module so config.js / setup can
// validate the topic without pulling the chart widget's viewer deps.
export const CHART_TOPICS = [
  ['Artificial Intelligence', 'artificial intelligence'],
  ['Business', 'business'],
  ['Consumer Goods', 'consumer goods'],
  ['E-Commerce', 'e-commerce'],
  ['Economy', 'economy'],
  ['Energy', 'energy'],
  ['Entertainment', 'entertainment'],
  ['Environment', 'environment'],
  ['Finance', 'finance'],
  ['Health', 'health'],
  ['Internet', 'internet'],
  ['Media', 'media'],
  ['Retail', 'retail'],
  ['Science', 'science'],
  ['Society', 'society'],
  ['Sports', 'sports'],
  ['Technology', 'technology'],
  ['Transportation', 'transportation'],
  ['Travel', 'travel'],
];

export const CHART_TOPIC_SLUGS = new Set(CHART_TOPICS.map(([, slug]) => slug));
