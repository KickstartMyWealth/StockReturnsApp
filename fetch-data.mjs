// Fetches EOD data at market close and writes data.json for the app.
// Run by GitHub Actions (see .github/workflows/refresh-data.yml). Node 20+.
// v2: Yahoo chart API primary (Stooq blocks datacenter IPs), corrected screener endpoint.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const UNIQUE_TICKERS = [
  "EWJ","EWA","EWC","EWG","EWQ","EWI","EWL","EWN","EWO","EWK","EWD","EWP","EWU",
  "EIS","EWS","EWH","EDEN","EFNL","EIRL","ENOR","ENZL","EWY","EWZ","EWW","EWT",
  "EZA","INDA","MCHI","FXI","THD","TUR","EPOL","ECH","EPU","EIDO","EPHE","ICOL",
  "EWM","KSA","QAT","UAE",
  "XLK","XLF","XLE","XLV","XLY","XLP","XLI","XLU","XLB","XLRE",
  "SCHB","SCHX","SCHG","SCHV","SCHM","SCHA","SCHH","SCHF","SCHC","SCHE","SCHP","SCHO","SCHR",
  "VTI","VV","VUG","VTV","VO","VB","VNQ","VEA","VSS","VWO",
  "IWV","IVV","IVW","IVE","IJH","IJR","IYR","EFA","SCZ","EEM","TIP","SHY","IEI"
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const YAHOO = t => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1y&interval=1d`;
const STOOQ = t => `https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=d`;
const SCREEN_URL = "https://stockanalysis.com/_api/endpoints/screener/data-points?type=s&ids=chYTD+price+high52";

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ---- Price history: Yahoo primary, Stooq fallback ----
async function historyYahoo(t) {
  const j = await fetchJSON(YAHOO(t));
  const r = j?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const closes = r?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) {
      out.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c });
    }
  }
  return out;
}
function parseStooqCSV(csv) {
  const lines = csv.trim().split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    const close = parseFloat(p[4]);
    if (p[0] && Number.isFinite(close)) out.push({ d: p[0], c: close });
  }
  return out;
}
async function history(t) {
  try { const h = await historyYahoo(t); if (h.length > 20) return h; } catch {}
  try { const h = parseStooqCSV(await fetchText(STOOQ(t))); if (h.length > 20) return h; } catch {}
  return null;
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
    price: +last.c.toFixed(2),
    "1M": pct(closeOnOrBefore(minusMonths(1))),
    "2M": pct(closeOnOrBefore(minusMonths(2))),
    "3M": pct(closeOnOrBefore(minusMonths(3))),
    YTD: pct(closeOnOrBefore(jan1)),
    "1Y": pct(closeOnOrBefore(yearAgo)),
  };
}

async function main() {
  const returns = {};
  let failed = 0;

  const queue = [...UNIQUE_TICKERS];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const t = queue.shift();
      const h = await history(t);
      const r = h ? computeReturns(h) : null;
      if (r) returns[t] = r; else { failed++; console.warn("no data for", t); }
      await new Promise(res => setTimeout(res, 150)); // be polite
    }
  }));

  // ---- Whole-market screen: 100%+ Club and Star Gainers in one call ----
  let club = null, clubSource = null, starGainers = null, starsState = null;
  try {
    const j = await fetchJSON(SCREEN_URL);
    const map = j?.data?.data || {};

    // 100%+ Club: YTD > 100%, price >= $1
    const rows = Object.entries(map)
      .map(([t, v]) => ({ t, n: "", price: Number(v.price), ytd: Number(v.chYTD) }))
      .filter(r => Number.isFinite(r.price) && Number.isFinite(r.ytd) && r.price >= 1 && r.ytd > 100)
      .sort((a, b) => b.ytd - a.ytd)
      .slice(0, 50)
      .map(r => ({ ...r, price: +r.price.toFixed(2), ytd: +r.ytd.toFixed(2) }));
    if (rows.length) { club = rows; clubSource = "screen"; }

    // ---- Star Gainers: consecutive days of new 1-year highs ----
    // A new high = today's 52-week high rose above the last stored value.
    // First run seeds with stocks closing within 0.3% of their 52w high.
    // Stars = consecutive new-high days, capped at 5. Streak resets on a miss.
    let prev = { stars: {}, highs: {}, since: {}, day: null };
    try {
      if (existsSync("data.json")) {
        const p = JSON.parse(readFileSync("data.json", "utf8"));
        if (p.starsState) prev = { since: {}, ...p.starsState };
      }
    } catch {}
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const sameDay = prev.day === todayET; // rerun guard: don't double-increment
    const newStars = {}, newHighs = {}, newSince = {};
    for (const [t, v] of Object.entries(map)) {
      const price = Number(v.price), high = Number(v.high52);
      if (!Number.isFinite(price) || !Number.isFinite(high) || price < 1 || high <= 0) continue;
      newHighs[t] = high;
      const prevHigh = prev.highs[t];
      const madeHigh = prevHigh != null ? high > prevHigh * 1.0001 : price >= high * 0.997;
      if (sameDay) {
        if (prev.stars[t]) { newStars[t] = prev.stars[t]; newSince[t] = prev.since[t] || prev.day || todayET; }
      } else if (madeHigh) {
        newStars[t] = Math.min((prev.stars[t] || 0) + 1, 5);
        newSince[t] = prev.stars[t] ? (prev.since[t] || todayET) : todayET; // streak start date
      }
      // streak broken: omitted -> resets to 0
    }
    starsState = { day: sameDay ? prev.day : todayET, stars: newStars, highs: newHighs, since: newSince };
    starGainers = Object.entries(newStars)
      .map(([t, stars]) => ({ t, stars, since: newSince[t] || null, price: +Number(map[t].price).toFixed(2),
        ytd: Number.isFinite(Number(map[t].chYTD)) ? +Number(map[t].chYTD).toFixed(2) : null }))
      .sort((a, b) => b.stars - a.stars || (b.ytd ?? -1e9) - (a.ytd ?? -1e9))
      .slice(0, 50);
  } catch (e) {
    console.warn("Market screen failed:", e.message);
  }

  const dates = Object.values(returns).map(r => r.asOf).sort();
  const payload = {
    generatedAt: new Date().toISOString(),
    dataAsOf: dates[dates.length - 1] ?? null,
    partial: failed,
    returns,
    club,
    clubSource,
    starGainers,
    starsState,
  };
  writeFileSync("data.json", JSON.stringify(payload));
  console.log(`Wrote data.json — ${Object.keys(returns).length} tickers ok, ${failed} failed, club: ${club ? club.length : "unavailable"}, stars: ${starGainers ? starGainers.length : "unavailable"}`);
  if (Object.keys(returns).length < 10) process.exit(1); // don't commit a broken file
}

main();
