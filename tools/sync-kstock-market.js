const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const KIS_BASE_URL = process.env.KIS_BASE_URL || "https://openapi.koreainvestment.com:9443";
const KIS_APP_KEY = process.env.KIS_APP_KEY || "";
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || "";
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.argv[2] || "";
const SYMBOLS = parseSymbols(process.env.KSTOCK_SYMBOLS);
const CANDLE_COUNT = clampInt(process.env.KSTOCK_CANDLE_COUNT, 132, 22, 200);
const MARKET_GROUP = process.env.KSTOCK_MARKET_GROUP || "J";

const STOCK_CATALOG = {
  "005930": { name: "삼성전자", market: "KOSPI", sector: "반도체" },
  "000660": { name: "SK하이닉스", market: "KOSPI", sector: "반도체" },
  "035420": { name: "NAVER", market: "KOSPI", sector: "인터넷" },
  "005380": { name: "현대차", market: "KOSPI", sector: "자동차" },
  "035720": { name: "카카오", market: "KOSPI", sector: "인터넷" },
  "051910": { name: "LG화학", market: "KOSPI", sector: "화학" },
  "068270": { name: "셀트리온", market: "KOSPI", sector: "바이오" },
  "105560": { name: "KB금융", market: "KOSPI", sector: "금융" },
  "207940": { name: "삼성바이오로직스", market: "KOSPI", sector: "바이오" },
  "042700": { name: "한미반도체", market: "KOSDAQ", sector: "반도체 장비" }
};

if (!SERVICE_ACCOUNT_PATH) {
  console.error("Missing service account path. Use FIREBASE_SERVICE_ACCOUNT_PATH or pass a JSON path as argv[2].");
  process.exit(1);
}

if (!KIS_APP_KEY || !KIS_APP_SECRET) {
  console.error("Missing KIS credentials. Set KIS_APP_KEY and KIS_APP_SECRET.");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(SERVICE_ACCOUNT_PATH), "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const accessToken = await issueKisAccessToken();
  const now = admin.firestore.FieldValue.serverTimestamp();
  let synced = 0;

  for (const symbol of SYMBOLS) {
    try {
      const [quote, candles] = await Promise.all([
        fetchCurrentQuote(accessToken, symbol),
        fetchDailyCandles(accessToken, symbol)
      ]);

      const catalog = STOCK_CATALOG[symbol] || {};
      const docData = {
        symbol,
        name: catalog.name || quote.name || symbol,
        market: catalog.market || quote.market || "KOSPI",
        sector: catalog.sector || "기타",
        currentPrice: quote.currentPrice,
        previousClose: quote.previousClose,
        change: quote.change,
        changeRate: quote.changeRate,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        candles,
        source: "KIS Open API",
        updatedAt: now
      };

      await db.collection("stock_market_cache").doc(symbol).set(docData, { merge: true });
      synced += 1;
      console.log(`synced ${symbol} ${docData.name} ${docData.currentPrice}`);
    } catch (error) {
      console.error(`failed ${symbol}: ${error.message}`);
    }
  }

  console.log(`done: synced ${synced}/${SYMBOLS.length} symbols`);
}

async function issueKisAccessToken() {
  const response = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET
    })
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`token issue failed: ${payload.msg1 || payload.error_description || response.status}`);
  }
  return payload.access_token;
}

async function fetchCurrentQuote(accessToken, symbol) {
  const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`);
  url.searchParams.set("fid_cond_mrkt_div_code", MARKET_GROUP);
  url.searchParams.set("fid_input_iscd", symbol);

  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: "FHKST01010100",
      custtype: "P"
    }
  });

  const payload = await response.json();
  assertSuccess(payload, response, symbol, "quote");
  const output = payload.output || payload.output1 || {};
  return {
    name: cleanText(output.hts_kor_isnm),
    market: inferMarket(output.mrkt_warn_cls_code, output.bstp_kor_isnm),
    currentPrice: toNumber(output.stck_prpr),
    previousClose: toNumber(output.stck_sdpr),
    change: signedByFlag(output.prdy_vrss_sign, output.prdy_vrss),
    changeRate: signedRate(output.prdy_vrss_sign, output.prdy_ctrt),
    open: toNumber(output.stck_oprc),
    high: toNumber(output.stck_hgpr),
    low: toNumber(output.stck_lwpr),
    volume: toNumber(output.acml_vol)
  };
}

async function fetchDailyCandles(accessToken, symbol) {
  const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-price`);
  url.searchParams.set("fid_cond_mrkt_div_code", MARKET_GROUP);
  url.searchParams.set("fid_input_iscd", symbol);
  url.searchParams.set("fid_org_adj_prc", "1");
  url.searchParams.set("fid_period_div_code", "D");

  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: "FHKST01010400",
      custtype: "P"
    }
  });

  const payload = await response.json();
  assertSuccess(payload, response, symbol, "daily");
  const rows = Array.isArray(payload.output) ? payload.output : [];
  return rows
    .slice(0, CANDLE_COUNT)
    .reverse()
    .map((item) => ({
      label: formatDateLabel(item.stck_bsop_date),
      open: toNumber(item.stck_oprc),
      high: toNumber(item.stck_hgpr),
      low: toNumber(item.stck_lwpr),
      close: toNumber(item.stck_clpr || item.stck_prpr),
      volume: toNumber(item.acml_vol)
    }));
}

function assertSuccess(payload, response, symbol, phase) {
  if (response.ok && String(payload.rt_cd) === "0") return;
  throw new Error(`${phase} ${symbol}: ${payload.msg1 || payload.msg_cd || response.status}`);
}

function toNumber(value) {
  const numeric = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function signedByFlag(flag, value) {
  const amount = toNumber(value);
  return flag === "5" || flag === "2" ? amount : flag === "4" || flag === "3" ? -amount : amount;
}

function signedRate(flag, value) {
  const amount = toNumber(value);
  return flag === "5" || flag === "2" ? amount : flag === "4" || flag === "3" ? -amount : amount;
}

function inferMarket(_, fallback) {
  const text = String(fallback || "");
  if (text.includes("코스닥")) return "KOSDAQ";
  return "KOSPI";
}

function cleanText(value) {
  return String(value || "").trim();
}

function formatDateLabel(raw) {
  const value = String(raw || "");
  if (value.length !== 8) return value;
  return `${value.slice(2, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`;
}

function clampInt(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseSymbols(raw) {
  if (!raw) return Object.keys(STOCK_CATALOG);
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
