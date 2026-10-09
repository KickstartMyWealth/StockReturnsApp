// Fetches EOD data at market close and writes data.json for the app.
// Run by GitHub Actions (see .github/workflows/refresh-data.yml). Node 20+.
// v2: Yahoo chart API primary (Stooq blocks datacenter IPs), corrected screener endpoint.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const UNIQUE_TICKERS = [
  "EWJ","EWA","EWC","EWG","EWQ","EWI","EWL","EWN","EWO","EWK","EWD","EWP","EWU",
  "EIS","EWS","EWH","EDEN","EFNL","EIRL","ENOR","ENZL","EWY","EWZ","EWW","EWT",
  "EZA","INDA","MCHI","FXI","THD","TUR","EPOL","ECH","EPU","EIDO","EPHE","ICOL",
  "EWM","KSA","QAT","UAE",
  "XLK","XLF","XLE","XLV","XLY","XLP","XLI","XLU","XLB","XLRE","XLC","GLD","SLV",
  "SCHB","SCHX","SCHG","SCHV","SCHM","SCHA","SCHH","SCHF","SCHC","SCHE","SCHP","SCHO","SCHR",
  "VTI","VV","VUG","VTV","VO","VB","VNQ","VEA","VSS","VWO",
  "IWV","IVV","IVW","IVE","IJH","IJR","IYR","EFA","SCZ","EEM","TIP","SHY","IEI",
  "QQQ","TOPT","SCHD","VOO","VXUS",
  "SPY","IWM","DIA" // benchmarks for the Search section's comparison rows (QQQ already tracked above)
];

// ---- Hot Plays: hand-picked ticker groups for section 05. Edit these lists to add/remove names;
// the daily run looks each one up in the whole-market screens and writes data.json keys aiPlays/miningPlays/oilPlays/defensePlay.
// Hot Plays only lists names with a 1-year return of at least this many percent (checked on every run).
const HOT_MIN_Y1 = 30;
const HOT_PLAYS = {
  aiPlays: ["AAOI", "AAPL", "ACLS", "ACMR", "ADI", "AEHR", "AEIS", "AIP", "AIQ", "ALAB", "ALGM", "ALMU", "AMAT", "AMBQ", "AMD", "AMKR", "AMZ", "AMZN", "ANET", "AOSL", "APLD", "ARKQ", "ARM", "ASMH", "ASML", "ASX", "ASYS", "ATOM", "AVGO", "AXTI", "BIDU", "BNAI", "BOTZ", "CAMT", "CHAT", "CHIP", "CHPS", "CIEN", "CLS", "COHR", "COHU", "CORZ", "CRDO", "CRWV", "CSCO", "CVV", "DELL", "DRAM", "DTCR", "FN", "FTXL", "GCTS", "GFS", "GLW", "GOOG", "GOOGL", "GTOP", "HPE", "IBM", "ICHR", "IGPT", "IMOS", "INOD", "INTC", "INTT", "IREN", "IYW", "JBL", "KLAC", "KOPN", "LFUS", "LITE", "LRCX", "LSCC", "LUMN", "LWLG", "MCHP", "META", "MKSI", "MOD", "MOVE", "MRAM", "MRVL", "MTSI", "MTZ", "MU", "MX", "MXL", "MYRG", "NBIS", "NOK", "NVDA", "NVMI", "NVTS", "NXPI", "ON", "ONTO", "OSS", "PDFS", "PENG", "PLXS", "POWI", "PSI", "QCOM", "QQQ", "QQQM", "QRVO", "QUIK", "RMBS", "SANM", "SEDG", "SHOC", "SIMO", "SITM", "SKYT", "SMCI", "SMH", "SMTC", "SNDK", "SOXX", "STM", "STX", "SYNA", "TASK", "TE", "TER", "TOYO", "TRT", "TSEM", "TSLA", "TSM", "TSMC", "TTMI", "TXN", "UCTT", "UMC", "VECO", "VGT", "VICR", "VRT", "WDC", "WOLF", "FLEX", "PLAB"],
  miningPlays: ["AEM", "AG", "ALM", "ALTO", "AP", "ASM", "AU", "B", "CC", "CENX", "CIFR", "COPX", "CSTM", "DC", "DEMRF", "DRD", "EGO", "ELVR", "EMAT", "EMBJ", "ENLT", "EQX", "ERO", "EXK", "FCX", "FNV", "FURY", "GAU", "GFI", "GLD", "GOLD", "HBM", "HCC", "HMY", "HYMC", "IAG", "IVPAF", "KGC", "LAR", "MAKO", "METC", "MP", "MT", "MTA", "MTRN", "MUX", "NEM", "NEXA", "NG", "NIOBW", "NUE", "PPTA", "REMX", "RIO", "SCCO", "SGML", "SPX", "STLD", "SVM", "THM", "TX", "USGO", "VALE"],
  oilPlays: ["AM", "APA", "AR", "AROC", "BKR", "BNO", "BORR", "BP", "BTE", "BWLP", "CHRD", "CLMT", "CNQ", "CNR", "COP", "CRC", "CRGY", "CTRA", "CVE", "CVX", "DEC", "DINO", "DK", "DLNG", "DTM", "DVN", "DWSN", "E", "EC", "ECO", "EFXT", "EGY", "ENB", "EOG", "EPD", "EQNR", "EQT", "ESOA", "ET", "FANG", "FET", "FLNG", "FRO", "FTI", "GASS", "GEL", "GFR", "GLNG", "GPRE", "GPRK", "GTE", "HAFN", "HAL", "IMO", "INSW", "KGS", "KMI", "KOS", "LBRT", "LNG", "MGY", "MPC", "MTDR", "MUR", "NAT", "NBR", "NCSM", "NE", "NFG", "NGL", "OBE", "OII", "OVV", "OXY", "PARR", "PBF", "PBR", "PBT", "PDS", "PR", "PSX", "PTEN", "PUMP", "REI", "REPX", "RES", "REX", "RIG", "RRC", "SDRL", "SHEL", "SKYQ", "SM", "SND", "SOBO", "SSL", "SU", "SUN", "SUNC", "TALO", "TBN", "TDW", "TK", "TNK", "TS", "TTE", "TTI", "UGP", "USAC", "VAL", "VET", "VIST", "VLO", "WDS", "WMB", "WTI", "WTTR", "YPF", "XOM"],
  defensePlay: ["AIRO", "ARXS", "ASTS", "ATI", "ATRO", "AVAV", "AXON", "BA", "BAESF", "BAH", "BKSY", "BWXT", "CACI", "CDRE", "CRS", "CW", "DCO", "DFNS", "DRS", "EADSF", "ECVT", "ESLT", "FLY", "GD", "GE", "GHM", "HAWK", "HII", "HWM", "HXL", "IBOT", "ISSC", "ITA", "KAMN", "KRMN", "KTOS", "LHX", "LMT", "LUNR", "MDA", "MRCY", "NASA", "NOC", "NSKFF", "ONDS", "ORBX", "PKE", "PL", "RCAT", "RDW", "RKLB", "RNMBF", "RNMBY", "RTX", "SATL", "SIF", "SPCE", "SPCX", "SWMR", "TATT", "THLLY", "UFO", "UMAC", "VOYG", "VSAT", "VVX", "WARP"],
  cryptoPlays: ["BLSH", "COIN", "CRCL", "HOOD", "HUT", "IBIT", "MSTR", "PYPL", "RIOT", "WULF"],
  nuclearPlays: ["AGX", "AMPX", "ARLP", "ATO", "BE", "BEP", "BLDP", "BTU", "BW", "CCJ", "CEG", "CWEN", "DNN", "ECG", "EMA", "EME", "ENS", "ETN", "ETR", "FCEL", "FE", "FIX", "FLNC", "GEV", "GNRC", "GRID", "IESC", "LEU", "LTBR", "NC", "NLR", "NNE", "NRG", "NRGV", "NUKZ", "NVT", "NWN", "NXE", "OKLO", "PDN", "PLPC", "POWL", "PWR", "SMR", "SUNE", "TIGO", "TLN", "UEC", "URA", "URNJ", "URNM", "UROY", "UTES", "VST", "WLDN"],
  quantumPlays: ["QBTS", "IONQ", "RGTI", "QUBT", "QNTM", "QANT", "DWAVE", "QTUM", "CQTM", "WQTM", "QPUX", "ARQQ", "LAES", "HOLO"],
  saasPlays: ["NOW", "ADBE", "CRM", "SNOW", "DDOG", "MDB", "ZS", "FTNT", "CRWD", "PANW", "TWLO", "SHOP", "DOCN", "DT", "MANH", "RNG", "ALIT", "BLKB", "ACIW", "BB", "BAND", "WDAY", "INTU", "TEAM", "HUBS", "NET", "OKTA", "ADSK", "VEEV", "DOCU", "ZM", "ESTC", "GTLB", "MNDY", "BILL", "AI", "APP", "PATH", "PLTR", "SOUN", "BBAI", "ZETA", "ORCL", "MSFT", "IDAI"],
  miscPlays: ["CJPX", "ARTY", "FISV", "PALL", "NWPX", "HYLN", "MPWR", "FTAI", "WATT", "C", "KEN", "WWD", "CF", "CTVA", "AGRO", "WLK", "CE", "QTEX", "ONEG", "LGN", "CDNL", "MAIR", "CNTA", "IWU", "NVRI", "ADIT", "OKRA", "GHXI", "GMO", "KWC", "BUTT", "TGHL", "AIBZ", "BUUU", "ETS", "RACC", "TRAX", "ZTG", "KORE", "LPRO", "MGRT", "ERAS", "ANL", "FBRX", "QTTB", "CLYM", "CHRN", "ORKA", "SLS", "ALMS", "SYRE", "BBGI", "RLAY", "ANTX", "DNTH", "PRLD", "MAAS", "RVMD", "EVC", "LVLU", "MBX", "FOCL", "LQDA", "VSXY", "DFTX", "ATEX", "OPTX", "TNGX", "BLZE", "DRTS", "PACS", "RXT", "ELA", "MTC", "VPG", "CDNA", "IPSC", "GH", "ARTV", "FSLY", "COGT", "RLYB", "GSAT", "ZNTL", "APGE", "TXG", "WYY", "DSGN", "INNV", "IMMX", "TWST", "TLPH", "OCC", "ETON", "STRO", "ELVN", "BTSG", "NEO", "BDSX", "CRNX", "NVCT", "XMTR", "MNPR", "FTRE", "PYXS", "MRVI", "IBRX", "AMLX", "NDLS", "BODI", "ROMA", "BWAY", "AVR", "NRXS", "ROLR", "ECPG", "LIND", "ENVA", "ALOT", "PLSE", "SHIP", "SILC", "AVAH", "XNCR", "CVGI", "DYN", "VSTS", "FEIM", "MGNX", "MYE", "CTRN", "TLYS", "VSH", "FTH", "CALY", "EDSA", "GTX", "DGII", "AMRX", "FATE", "NHC", "ADPT", "AAMI", "CELC", "HLIO", "KNSA", "AVNS", "PODC", "AVTX", "TSAT", "BOLD", "EZPW", "TENX", "OSCR", "ANDE", "TEVA", "TDAY", "TH", "JAZZ", "LXRX", "CBL", "KEYS", "DDD", "AGL", "MD", "OUST", "GHRS", "PRM", "TOP", "HLP", "MG", "ARCB", "IRDM", "RCKY", "ICR", "STRL", "KN", "LCUT", "SVCO", "AXSM", "JBHT", "ROG", "DAR", "CMPR", "SNX", "DAO", "AMN", "LINC", "YOU", "COCO", "NNBR", "ROST", "STRZ", "CTOS", "KVHI", "SLN", "APEI", "ROKU", "UNFI", "CMTV", "DRH", "CMI", "ODC", "ATEN", "WT", "INDV", "RTB", "IX", "DAN", "DLX", "UNH", "RLJ", "STT", "CODI", "DVA", "MEC", "RFIL", "CAKE", "GEF.B", "ESE", "CVS", "CHMG", "ESI", "KFRC", "KRNY", "BWA", "ALRS", "TERN", "PACK", "CM", "AMPG", "AKAM", "XHR", "RY", "FLYW", "CORT", "FIVE", "CFFN", "WAB", "KOP", "DY", "DHX", "CGEN", "BNY", "BNS", "CFG", "ILPT", "NPO", "NPKI", "SKM", "RELY", "SCSC", "KRT", "DXPE", "WKC", "IMUX", "CVLG", "GSL", "VATE", "PAY", "PK", "AMWL", "ADM", "FFBC", "BMY", "HUM", "CODA", "TPR", "IART", "TRV", "TFSL", "ACHC", "CPSH", "AGEN", "FBP", "NTRS", "RXO", "CNXN", "APLE", "ENTX", "DBD", "PIII", "FIRY", "EAT", "PGNY", "SPIR", "KYCCF", "BWB", "KODK", "CYCN", "WELL", "IBKR", "MAN", "ZION", "MTB", "PNC", "ASTC", "FCBC", "SMCAY", "UNP", "GL", "NVS", "LXU", "CNET", "PBA", "PAG", "UI", "DOC", "LAD", "UHAL.B", "TJX", "WEST", "HR", "HURN", "CUE", "DSGR", "EBAY", "BFRI", "SEZL", "FATN", "STAK", "NXTC", "WMT", "LGCY", "EPC", "VIV", "XWEL", "UTZ", "IPI", "ELDN", "CURV", "FIEE", "ADTN", "KOOYF", "QXL", "COST", "OTLY", "NIO", "VSTM", "CBRL", "KC", "CBZ", "HURA", "ARKA", "ENGS", "ADVB", "GME", "AIRS", "UBER", "AZIO", "GSHD", "CLBK", "PMN", "ISRG", "SNAL", "CPHI", "LVWR", "UPST", "CJMB", "BIRD", "WLDS", "ZYBT", "ILLR", "GVH", "STKH", "SPRC", "VEEE", "PN", "TDTH", "LHSW", "LGCL", "SATS", "DGNX", "BIYA", "VO", "RRX", "BRK.B", "APH", "APD", "LIN", "TGT", "VTV", "SCHG", "BK", "GS", "JPM", "NDAQ", "MELI", "V", "PAYS", "TALK", "SPYI", "DIV", "KBWD", "BMRA", "RDDT", "DHI", "IETC", "JOBY", "VKTX", "SMMT", "JEPI", "SMIN", "BND", "VONG", "VYM", "TQQQ", "XLV", "ACHR", "DE", "IRBT", "VOO", "RSP", "SCHD", "VIGI", "VTI", "WHR", "WWW", "JEPQ", "SOFI", "DOW", "HBI", "LYB", "NWL", "PM", "VZ", "WDIV", "WPC", "ALLY", "SYF", "MS", "SLM", "COF", "FITB", "UBS", "AZO", "DLTR", "MCD", "CMG", "AXP", "RL", "WSM", "JNJ", "LLY", "TMUS", "RCL", "EXPE", "CAT", "SCHW", "CB", "APO", "INCY", "MRNA", "ILMN", "CMC", "LMND", "NU", "URBN", "CMCSA", "FREHF", "FLUT", "MSGS", "SLG", "DIS"],
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const YAHOO = t => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1y&interval=1d`;
const STOOQ = t => `https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=d`;
const SCREEN_URL = "https://stockanalysis.com/_api/endpoints/screener/data-points?type=s&ids=chYTD+price+high52+ch1w+ch1m+ch3m+ch6m+ch1y+change+volume+sector";
const ETF_SCREEN_URL = "https://stockanalysis.com/_api/endpoints/screener/data-points?type=e&ids=chYTD+price+high52+ch1w+ch1m+ch3m+ch6m+ch1y+change+volume+name";
const MIN_VOLUME = 10000; // shares/day floor; below this, real-world tradability is unreliable (thin books, wide spreads, broker restrictions on newly-listed micro-caps)

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
  // Prefer the dividend/split-adjusted close so returns reflect total
  // return the same way Yahoo Finance's own site computes its trailing
  // return figures (verified against a live discrepancy: using raw close
  // understated/overstated returns vs. Yahoo's displayed numbers for a
  // dividend-paying ETF). Falls back to raw close if adjclose is absent.
  const adjCloses = r?.indicators?.adjclose?.[0]?.adjclose || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = (adjCloses[i] != null && Number.isFinite(adjCloses[i])) ? adjCloses[i] : closes[i];
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
  const minusDays = d0 => { const d = new Date(lastDate); d.setDate(d.getDate() - d0); return d; };
  const minusMonths = m => { const d = new Date(lastDate); d.setMonth(d.getMonth() - m); return d; };
  const jan1 = new Date(lastDate.getFullYear(), 0, 1);
  const yearAgo = new Date(lastDate); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const pct = base => (base > 0 ? +(((last.c / base) - 1) * 100).toFixed(2) : null);
  const prevClose = hist.length >= 2 ? hist[hist.length - 2].c : null;
  return {
    asOf: last.d,
    price: +last.c.toFixed(2),
    "1D": pct(prevClose), // actual prior-close-to-last-close daily change
    "5D": pct(closeOnOrBefore(minusDays(7))), // ~1 trading week back
    "1M": pct(closeOnOrBefore(minusMonths(1))),
    "2M": pct(closeOnOrBefore(minusMonths(2))),
    "3M": pct(closeOnOrBefore(minusMonths(3))),
    "6M": pct(closeOnOrBefore(minusMonths(6))),
    "9M": pct(closeOnOrBefore(minusMonths(9))),
    YTD: pct(closeOnOrBefore(jan1)),
    "1Y": pct(closeOnOrBefore(yearAgo)),
  };
}

// ---- 2-Month and 9-Month Returns for screener-derived lists ----
// stockanalysis.com's screener API (used for the Stars/Green/Red/Month1/
// ETF1Y/ReturnSelector lists) doesn't serve 2-month or 9-month fields —
// confirmed live: requesting "ch2m" is accepted without error but returns
// null for every ticker, and there's no 9-month field at all. So both are
// computed the same way as the main UNIQUE_TICKERS loop above (full Yahoo
// daily history), from the same single history fetch per ticker, but only
// for the much smaller set of tickers that actually made each list —
// fetching full history for the whole market just for these two fields
// isn't practical.
async function attachExtraReturns(lists) {
  const tickers = [...new Set(lists.flatMap(rows => (rows || []).map(r => r.t)))];
  const twoMonth = {}, nineMonth = {};
  const queue = [...tickers];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const t = queue.shift();
      try {
        const h = await history(t);
        const r = h ? computeReturns(h) : null;
        if (r) { twoMonth[t] = r["2M"]; nineMonth[t] = r["9M"]; }
      } catch {}
      await new Promise(res => setTimeout(res, 150)); // be polite
    }
  }));

  for (const rows of lists) {
    if (!rows) continue;
    for (const row of rows) { row.m2 = twoMonth[row.t] ?? null; row.m9 = nineMonth[row.t] ?? null; }
  }
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
  let stockMap = {};
  let club = null, clubSource = null, starGainers = null, starsState = null, allGreen = null, allRed = null, oneMonthGainers = null, multiListed = null, stockReturnSelector = null;
  try {
    const j = await fetchJSON(SCREEN_URL);
    const map = j?.data?.data || {};
    stockMap = map;

    // 100% Club: YTD >= 100% OR 1-year return >= 100%, price >= $1. Each
    // metric has its own sanity cap to exclude reverse-split-style data
    // artifacts (e.g. a stock erroneously showing +1,000,000% YTD) rather
    // than genuine outsized winners.
    const YTD_SANITY_CAP = 2000; // percent
    const CLUB_Y1_SANITY_CAP = 5000; // percent — same order of magnitude as the ETF 1Y screen below
    const RW = x => { const n = Number(x); return Number.isFinite(n) ? +n.toFixed(1) : null; };
    const rows = Object.entries(map)
      .map(([t, v]) => ({ t, n: "", sector: v.sector || null, price: Number(v.price), ytd: Number(v.chYTD), day: Number(v.change),
        w: RW(v.ch1w), m1: RW(v.ch1m), m3: RW(v.ch3m), m6: RW(v.ch6m), y1: RW(v.ch1y), volume: Number(v.volume) }))
      .filter(r => Number.isFinite(r.price) && r.price >= 1
        && ((Number.isFinite(r.ytd) && r.ytd >= 100 && r.ytd <= YTD_SANITY_CAP) || (Number.isFinite(r.y1) && r.y1 >= 100 && r.y1 <= CLUB_Y1_SANITY_CAP))
        && Number.isFinite(r.volume) && r.volume >= MIN_VOLUME)
      .sort((a, b) => {
        const bestOf = r => Math.max(Number.isFinite(r.ytd) ? r.ytd : -Infinity, Number.isFinite(r.y1) ? r.y1 : -Infinity);
        return bestOf(b) - bestOf(a);
      })
      // No top-N cap here: every stock over 100% YTD or 1Y (below the sanity caps) is included.
      .map(({ volume, ...r }) => ({ ...r, price: +r.price.toFixed(2), ytd: +r.ytd.toFixed(2), day: Number.isFinite(r.day) ? +r.day.toFixed(2) : null }));
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
    // Cumulative, never resets: a star is added on any day a stock sets a new
    // 52-week high, up to 7 total. Missed days simply don't add a star; they

    // don't remove one. "since" tracks the most recent date a star was added.

    const newStars = {}, newHighs = {}, newSince = {};
    for (const [t, v] of Object.entries(map)) {
      const price = Number(v.price), high = Number(v.high52), volume = Number(v.volume);
      if (!Number.isFinite(price) || !Number.isFinite(high) || price < 1 || high <= 0) continue;
      if (!Number.isFinite(volume) || volume < MIN_VOLUME) continue;
      newHighs[t] = high;
      const prevHigh = prev.highs[t];
      const prevStars = prev.stars[t] || 0;
      const madeHigh = prevHigh != null ? high > prevHigh * 1.0001 : price >= high * 0.997;
      if (sameDay) {
        // Rerun guard: carry forward unchanged, don't double-count today.
        if (prevStars) { newStars[t] = prevStars; newSince[t] = prev.since[t] || prev.day || todayET; }
      } else if (madeHigh) {
        newStars[t] = Math.min(prevStars + 1, 7);
        newSince[t] = todayET; // date this star was added
      } else if (prevStars) {
        newStars[t] = prevStars;          // carry forward, no new star today
        newSince[t] = prev.since[t] || null; // keep prior "last star added" date
      }
    }
    starsState = { day: sameDay ? prev.day : todayET, stars: newStars, highs: newHighs, since: newSince };
    const RW2 = x => { const n = Number(x); return Number.isFinite(n) ? +n.toFixed(1) : null; };
    starGainers = Object.entries(newStars)
      .map(([t, stars]) => ({ t, stars, since: newSince[t] || null, sector: map[t]?.sector || null, price: +Number(map[t].price).toFixed(2),
        ytd: Number.isFinite(Number(map[t].chYTD)) ? +Number(map[t].chYTD).toFixed(2) : null,
        day: Number.isFinite(Number(map[t].change)) ? +Number(map[t].change).toFixed(2) : null,
        w: RW2(map[t].ch1w), m1: RW2(map[t].ch1m), m3: RW2(map[t].ch3m), m6: RW2(map[t].ch6m), y1: RW2(map[t].ch1y) }))
      .sort((a, b) => b.stars - a.stars || (b.ytd ?? -1e9) - (a.ytd ?? -1e9))
      .slice(0, 50);

    // ---- All Green All Year: positive across 5D, 1M, 3M, 6M, YTD, 1Y ----
    const P = x => { const n = Number(x); return Number.isFinite(n) ? n : null; };
    allGreen = Object.entries(map)
      .map(([t, v]) => ({ t, sector: v.sector || null, price: P(v.price), w: P(v.ch1w), m1: P(v.ch1m), m3: P(v.ch3m), m6: P(v.ch6m), ytd: P(v.chYTD), y1: P(v.ch1y), day: P(v.change), volume: Number(v.volume) }))
      .filter(r => r.price >= 1 && r.y1 != null && r.ytd != null && r.ytd <= YTD_SANITY_CAP
        && Number.isFinite(r.volume) && r.volume >= MIN_VOLUME
        && [r.w, r.m1, r.m3, r.m6, r.ytd, r.y1].every(x => x != null && x > 0))
      .sort((a, b) => b.y1 - a.y1) // top 50 by 1Y
      .slice(0, 50)
      .map(({ volume, ...r }) => ({ ...r, price: +r.price.toFixed(2), w: +r.w.toFixed(1), m1: +r.m1.toFixed(1), m3: +r.m3.toFixed(1), m6: +r.m6.toFixed(1), ytd: +r.ytd.toFixed(1), y1: +r.y1.toFixed(1), day: r.day != null ? +r.day.toFixed(1) : null }));
    if (!allGreen.length) allGreen = null;

    // ---- Shorts - All Red: consistently negative across 5D, 1M, 2M, 3M, 6M, 9M ----
    // YTD and 1Y are deliberately NOT part of the test — a name can be
    // weak across every recent window regardless of where it sits year-to-
    // date or over a full year (and recent IPOs have neither). They're still
    // shown when available. 2M and 9M need a history fetch, so they're
    // checked in the second pass after attachExtraReturns below. No top-N
    // cap: the section is meant to hold any ticker that qualifies. Values are
    // tested as displayed (1 decimal), so a -0.03% reading that shows as 0.0%
    // doesn't sneak into a list that claims to be all red.
    allRed = Object.entries(map)
      .map(([t, v]) => ({ t, sector: v.sector || null, price: P(v.price), w: P(v.ch1w), m1: P(v.ch1m), m3: P(v.ch3m), m6: P(v.ch6m), ytd: P(v.chYTD), y1: P(v.ch1y), day: P(v.change), volume: Number(v.volume) }))
      .filter(r => r.price >= 1
        && Number.isFinite(r.volume) && r.volume >= MIN_VOLUME
        && [r.w, r.m1, r.m3, r.m6].every(x => x != null && +x.toFixed(1) < 0))
      .sort((a, b) => a.m6 - b.m6) // worst 6M first (order is cosmetic; the client re-sorts)
      .map(({ volume, ...r }) => ({ ...r, price: +r.price.toFixed(2), w: +r.w.toFixed(1), m1: +r.m1.toFixed(1), m3: +r.m3.toFixed(1), m6: +r.m6.toFixed(1), ytd: r.ytd != null ? +r.ytd.toFixed(1) : null, y1: r.y1 != null ? +r.y1.toFixed(1) : null, day: r.day != null ? +r.day.toFixed(1) : null }));
    if (!allRed.length) allRed = null;

    // ---- 1 Month Gainers: 1M return > 10%, sorted by 1M descending ----
    oneMonthGainers = Object.entries(map)
      .map(([t, v]) => ({ t, sector: v.sector || null, price: P(v.price), w: P(v.ch1w), m1: P(v.ch1m), m3: P(v.ch3m), m6: P(v.ch6m), ytd: P(v.chYTD), y1: P(v.ch1y), day: P(v.change), volume: Number(v.volume) }))
      .filter(r => r.price >= 1 && r.m1 != null && r.m1 > 0
        && Number.isFinite(r.volume) && r.volume >= MIN_VOLUME)
      .sort((a, b) => b.m1 - a.m1) // top 50 by 1M gain
      .slice(0, 50)
      .map(({ volume, ...r }) => ({
        ...r, price: +r.price.toFixed(2),
        w: r.w != null ? +r.w.toFixed(1) : null, m1: +r.m1.toFixed(1),
        m3: r.m3 != null ? +r.m3.toFixed(1) : null, m6: r.m6 != null ? +r.m6.toFixed(1) : null,
        ytd: r.ytd != null ? +r.ytd.toFixed(1) : null, y1: r.y1 != null ? +r.y1.toFixed(1) : null,
        day: r.day != null ? +r.day.toFixed(1) : null,
      }));
    if (!oneMonthGainers.length) oneMonthGainers = null;

    // ---- Stock Return Selector: full-market stock screen, 1Y >= 30%, for
    // section 03's 30-50/50-75/75-100/100%+ button filters. Entry and every
    // bucket are based on 1-year return only (not YTD) — consistent across
    // the whole section. No top-N cap: every qualifying stock is included,
    // same as the Club/Green/Red lists.
    stockReturnSelector = Object.entries(map)
      .map(([t, v]) => ({ t, sector: v.sector || null, price: P(v.price), w: P(v.ch1w), m1: P(v.ch1m), m3: P(v.ch3m), m6: P(v.ch6m), ytd: P(v.chYTD), y1: P(v.ch1y), day: P(v.change), volume: Number(v.volume) }))
      .filter(r => r.price >= 1 && r.y1 != null && r.y1 >= 30 && r.y1 <= CLUB_Y1_SANITY_CAP
        && Number.isFinite(r.volume) && r.volume >= MIN_VOLUME)
      .sort((a, b) => b.y1 - a.y1)
      .map(({ volume, ...r }) => ({
        ...r, price: +r.price.toFixed(2),
        w: r.w != null ? +r.w.toFixed(1) : null, m1: r.m1 != null ? +r.m1.toFixed(1) : null,
        m3: r.m3 != null ? +r.m3.toFixed(1) : null, m6: r.m6 != null ? +r.m6.toFixed(1) : null,
        ytd: r.ytd != null ? +r.ytd.toFixed(1) : null, y1: +r.y1.toFixed(1),
        day: r.day != null ? +r.day.toFixed(1) : null,
      }));
    if (!stockReturnSelector.length) stockReturnSelector = null;

    // Attach real 2-month returns before building multiListed, so its
    // spread-copied rows (below) inherit m2 along with everything else.
    await attachExtraReturns([club, starGainers, allGreen, allRed, oneMonthGainers, stockReturnSelector]);

    // "All Green" is meant to be green across every window, but 2M and 9M
    // aren't available until the attach step above (they need their own
    // per-ticker history fetch, unlike the other 6 fields which come free
    // from the initial screener call) — so a stock can pass the original
    // 6-window filter and still turn out negative on 2M or 9M once those
    // are attached. This second pass removes any such row, so the final
    // list is genuinely green across all eight windows: 5D, 1M, 2M, 3M,
    // 6M, 9M, YTD, 1Y.
    if (allGreen) {
      allGreen = allGreen.filter(r => r.m2 != null && r.m2 > 0 && r.m9 != null && r.m9 > 0);
      if (!allGreen.length) allGreen = null;
    }
    // Same idea, mirrored: "Shorts - All Red" must be red on 2M and 9M too,
    // for the identical reason above (final list: 5D, 1M, 2M, 3M, 6M, 9M).
    if (allRed) {
      allRed = allRed.filter(r => r.m2 != null && r.m2 < 0 && r.m9 != null && r.m9 < 0);
      if (!allRed.length) allRed = null;
    }

    // ---- Tickers Listed Above Multiple Times: appears in 2+ of the four
    // bullish lists (Club, Star Gainers, All Green, 1 Month Gainers).
    // Shorts/All Red is intentionally excluded — it's a bearish list, not
    // a buy signal. Overlap across bullish screens is a stronger signal
    // than any single list on its own.
    const CATS = { club: club || [], stars: starGainers || [], green: allGreen || [], month1: oneMonthGainers || [] };
    const CAT_LABEL = { club: "100%", stars: "Stars", green: "Green", month1: "1M" };
    const tickerCats = {}, tickerData = {};
    for (const [cat, rows] of Object.entries(CATS)) {
      for (const r of rows) {
        if (!tickerCats[r.t]) tickerCats[r.t] = new Set();
        tickerCats[r.t].add(cat);
        if (!tickerData[r.t]) tickerData[r.t] = r;
      }
    }
    multiListed = Object.entries(tickerCats)
      .filter(([t, cats]) => cats.size >= 2)
      .map(([t, cats]) => ({
        ...tickerData[t],
        t,
        count: cats.size,
        inLists: [...cats].map(c => CAT_LABEL[c]).join(", "),
      }))
      .sort((a, b) => b.count - a.count || (b.y1 ?? -1e9) - (a.y1 ?? -1e9))
      .slice(0, 50);
    if (!multiListed.length) multiListed = null;
  } catch (e) {
    console.warn("Market screen failed:", e.message);
  }

  // ---- ETF screen for section 03's return selector: whole-ETF-market
  // screen, separate from the stock screen above (funds live under a
  // different "type" on this API and don’t carry a "sector", so they get
  // their own name-based table). 1Y >= 30%, matching the stock-side floor
  // in stockReturnSelector above — not just "100%+" funds, so an ETF like
  // SLV or XBI with a solid but sub-100% 1-year return still shows up. ----
  let etf1YClub = null;
  let etfMap = {};
  try {
    const j = await fetchJSON(ETF_SCREEN_URL);
    const map = j?.data?.data || {};
    etfMap = map;
    // Leveraged/inverse ETFs can legitimately post very large 1-year moves
    // (verified live: 2x/3x sector and single-stock ETFs over 1000%), so
    // this cap is only a defensive guard against outright data errors.
    const Y1_SANITY_CAP = 5000; // percent
    const RWe = x => { const n = Number(x); return Number.isFinite(n) ? +n.toFixed(1) : null; };
    const rows = Object.entries(map)
      .map(([t, v]) => ({ t, n: v.name || t, price: Number(v.price), y1: Number(v.ch1y), day: Number(v.change),
        w: RWe(v.ch1w), m1: RWe(v.ch1m), m3: RWe(v.ch3m), m6: RWe(v.ch6m), ytd: RWe(v.chYTD), volume: Number(v.volume) }))
      .filter(r => Number.isFinite(r.price) && Number.isFinite(r.y1) && r.price >= 1 && r.y1 >= 30 && r.y1 <= Y1_SANITY_CAP
        && Number.isFinite(r.volume) && r.volume >= MIN_VOLUME)
      .sort((a, b) => b.y1 - a.y1)
      .map(({ volume, ...r }) => ({ ...r, price: +r.price.toFixed(2), y1: +r.y1.toFixed(2), day: Number.isFinite(r.day) ? +r.day.toFixed(2) : null }));
    if (rows.length) etf1YClub = rows;
    if (etf1YClub) await attachExtraReturns([etf1YClub]);
  } catch (e) {
    console.warn("ETF market screen failed:", e.message);
  }

  // ---- Hot Plays (section 05): look each hand-picked ticker up in the stock
  // screen, falling back to the ETF screen. Tickers missing from both are skipped.
  const hotPlays = {};
  try {
    const RH = x => { const n = Number(x); return Number.isFinite(n) ? +n.toFixed(1) : null; };
    for (const [key, tickers] of Object.entries(HOT_PLAYS)) {
      const rows = [];
      for (const t of tickers) {
        const v = stockMap[t] || etfMap[t];
        if (!v || !Number.isFinite(Number(v.price))) continue;
        const y1raw = Number(v.ch1y);
        if (Number.isFinite(y1raw) && y1raw < HOT_MIN_Y1) continue; // below the 1Y floor; names with no 1Y figure (new listings) are kept
        rows.push({ t, sector: v.sector || null, price: +Number(v.price).toFixed(2),
          day: RH(v.change), w: RH(v.ch1w), m1: RH(v.ch1m), m3: RH(v.ch3m), m6: RH(v.ch6m), ytd: RH(v.chYTD), y1: RH(v.ch1y) });
      }
      hotPlays[key] = rows.length ? rows : null;
    }
    await attachExtraReturns(Object.values(hotPlays));
  } catch (e) {
    console.warn("Hot Plays failed:", e.message);
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
    allGreen,
    allRed,
    oneMonthGainers,
    multiListed,
    etf1YClub,
    stockReturnSelector,
    ...hotPlays,
  };
  writeFileSync("data.json", JSON.stringify(payload));
  console.log(`Wrote data.json — ${Object.keys(returns).length} tickers ok, ${failed} failed, club: ${club ? club.length : "unavailable"}, stars: ${starGainers ? starGainers.length : "unavailable"}, green: ${allGreen ? allGreen.length : "unavailable"}, red: ${allRed ? allRed.length : "unavailable"}, oneMonth: ${oneMonthGainers ? oneMonthGainers.length : "unavailable"}, multiListed: ${multiListed ? multiListed.length : "unavailable"}, etf1YClub: ${etf1YClub ? etf1YClub.length : "unavailable"}, stockReturnSelector: ${stockReturnSelector ? stockReturnSelector.length : "unavailable"}`);
  if (Object.keys(returns).length < 10) process.exit(1); // don't commit a broken file
}

main();
