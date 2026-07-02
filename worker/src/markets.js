// Yahoo Finance chart payload -> compact index summary served to boards.

export function mapYahooChart(json, name) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || !Number.isFinite(meta.regularMarketPrice) || !Number.isFinite(meta.chartPreviousClose)) {
    throw new Error('malformed yahoo chart payload');
  }
  const price = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose;
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter((n) => Number.isFinite(n));
  return {
    symbol: meta.symbol,
    name,
    price,
    change: price - prev,
    changePct: ((price - prev) / prev) * 100,
    spark: closes,
  };
}
