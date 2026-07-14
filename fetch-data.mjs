// Fetches EOD data at market close and writes data.json for the app.
// Run by GitHub Actions (see .github/workflows/refresh-data.yml). Node 20+.

import { writeFileSync } from "node:fs";

const UNIQUE_TICKERS = [
  // Country ETFs
  "EWJ","EWA","EWC","EWG","EWQ","EWI","EWL","EWN","EWO","EWK","EWD","EWP","EWU",
  "EIS","EWS","EWH","EDEN","EFNL","EIRL","ENOR","ENZL","EWY","EWZ","EWW","EWT",
  "EZA","INDA","MCHI","FXI","THD","TUR","EPOL","ECH","EPU","EIDO","EPHE","ICOL",
  "EWM","KSA","QAT","UAE",
  // Sector ETFs
  "XLK","XLF","XLE","XLV","XLY","XLP","XLI","XLU","XLB","XLRE",
  // Foundation families
  "SCHB","SCHX","SCHG","SCHV","SCHM","SCHA","SCHH","SCHF","SCHC","SCHE","SCHP","SCHO","SCHR",
  "VTI","VV","VUG","VTV","VO","VB","VNQ","VEA","VSS","VWO",
  "IWV","IVV","IVW","IVE","IJH","IJR","IYR","EFA","SCZ","EEM","TIP","SHY","IEI"
];

const STOOQ = t => `https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=d`;
const CLUB_URL = "https://stockanalysis.com/api/screener/s/f?m=chYTD&s=desc&c=s,n,price,chYTD&cn=500";

function parseHistory(csv) {
  const lines = csv.trim().split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    const close = parseFloat(p[4]);
    if (p[0] && Number.isFinite(close)) out.push({ d: p[0], c: close });
  }
  return out;
}

function computeReturns(hist) {
  if (!hist || hist.length < 2) return null;
  const last = hist[hist.length - 1];
  const lastDate = new Date(last.d + "T00:00:00");
  const closeOnOrBefore = target => {
    for (let i = hist.length - 1; i >= 0; i--)
      if (new Date(hist[i].d + "T00:00:00") <= target) return hist[i].c;
    return hist[0].c;
  };
  const minusMonths = m => { const d = new Date(lastDate); d.setMonth(d.getMonth() - m); return d; };
  const jan1 = new Date(lastDate.getFullYear(), 0, 1);
  const yearAgo = new Date(lastDate); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const pct = base => (base > 0 ? +(((last.c / base) - 1) * 100).toFixed(2) : null);
  return {
    asOf: last.d,
    price: last.c,
    "1M": pct(closeOnOrBefore(minusMonths(1))),
    "2M": pct(closeOnOrBefore(minusMonths(2))),
    "3M": pct(closeOnOrBefore(minusMonths(3))),
    YTD: pct(closeOnOrBefore(jan1)),
    "1Y": pct(closeOnOrBefore(yearAgo)),
  };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "fund-ledger-refresh/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main() {
  const returns = {};
  let failed = 0;

  // Modest concurrency to be polite to Stooq.
  const queue = [...UNIQUE_TICKERS];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const t = queue.shift();
      try {
        const r = computeReturns(parseHistory(await fetchText(STOOQ(t))));
        if (r) returns[t] = r; else failed++;
      } catch { failed++; }
    }
  }));

  let club = null, clubSource = null;
  try {
    const j = JSON.parse(await fetchText(CLUB_URL));
    const rows = (j?.data?.data ?? j?.data?.rows ?? [])
      .map(r => ({
        t: String(r.s ?? r.symbol ?? (Array.isArray(r) ? r[0] : "")).toUpperCase(),
        n: String(r.n ?? r.name ?? (Array.isArray(r) ? r[1] : "")),
        price: Number(r.price ?? (Array.isArray(r) ? r[2] : NaN)),
        ytd: Number(r.chYTD ?? r.chYtd ?? (Array.isArray(r) ? r[3] : NaN)),
      }))
      .filter(r => r.t && Number.isFinite(r.price) && Number.isFinite(r.ytd) && r.price >= 1 && r.ytd > 100)
      .sort((a, b) => b.ytd - a.ytd);
    if (rows.length) { club = rows; clubSource = "screen"; }
  } catch (e) {
    console.warn("Club screen failed:", e.message);
  }

  const dates = Object.values(returns).map(r => r.asOf).sort();
  const payload = {
    generatedAt: new Date().toISOString(),
    dataAsOf: dates[dates.length - 1] ?? null,
    partial: failed,
    returns,
    club,
    clubSource,
  };
  writeFileSync("data.json", JSON.stringify(payload));
  console.log(`Wrote data.json — ${Object.keys(returns).length} tickers ok, ${failed} failed, club: ${club ? club.length : "unavailable"}`);
  if (Object.keys(returns).length < 10) process.exit(1); // don't commit a broken file
}

main();

