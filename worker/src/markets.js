// Yahoo Finance chart payload -> compact index summary served to boards.

export function mapYahooChart(json, name) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || !Number.isFinite(meta.regularMarketPrice) || !Number.isFinite(meta.chartPreviousClose)) {
    throw new Error('malformed yahoo chart payload');
  }
  const price = meta.regularMarketPrice;
  // Split bars by exchange-local trading day (fetched with range=2d). The
  // daily-change baseline is the PRIOR session's last close taken from the
  // bars themselves: after a foreign market closes, Yahoo rolls the session
  // into chartPreviousClose (price === prev), which read as a 0.00 change for
  // LSE tickers every evening. chartPreviousClose stays as the fallback when
  // the payload only carries one session (or no timestamps).
  const off = Number.isFinite(meta.gmtoffset) ? meta.gmtoffset : 0;
  const stamps = result.timestamp ?? [];
  const rows = (result.indicators?.quote?.[0]?.close ?? [])
    .map((c, i) => [stamps[i], c])
    .filter(([t, c]) => Number.isFinite(t) && Number.isFinite(c));
  const dayOf = (t) => Math.floor((t + off) / 86400);
  const lastDay = rows.length ? dayOf(rows[rows.length - 1][0]) : null;
  const today = rows.filter(([t]) => dayOf(t) === lastDay).map(([, c]) => c);
  const prevRows = rows.filter(([t]) => dayOf(t) !== lastDay);
  const prev = prevRows.length ? prevRows[prevRows.length - 1][1] : meta.chartPreviousClose;
  return {
    symbol: meta.symbol,
    // longName is the humane one ("Close Brothers Group plc"); shortName for
    // LSE listings is the register entry ("CLOSE BROTHERS GROUP PLC ORD 25").
    // Curated INDEX_NAMES still win via the name argument.
    name: name ?? meta.longName ?? meta.shortName ?? meta.symbol,
    price,
    change: price - prev,
    changePct: ((price - prev) / prev) * 100,
    // The sparkline stays a one-day shape: last session's bars only.
    spark: today.length ? today : rows.map(([, c]) => c),
  };
}
