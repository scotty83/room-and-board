// Quote of the day from the bundled curated list — zero API dependency.

export const meta = { id: 'quote', title: 'Quote of the Day', refreshMs: 24 * 60 * 60 * 1000 };

export function quoteOfDay(quotes, date) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const index = (date.getFullYear() * 366 + dayOfYear) % quotes.length;
  return quotes[index];
}

export async function fetchData(cfg, net) {
  const quotes = await net.fetchJSON('data/quotes.json');
  return quoteOfDay(quotes, new Date());
}
