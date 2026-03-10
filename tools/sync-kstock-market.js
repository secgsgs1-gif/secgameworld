const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.argv[2] || "";

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

const SYMBOLS = parseSymbols(process.env.KSTOCK_SYMBOLS);
const CANDLE_COUNT = clampInt(process.env.KSTOCK_CANDLE_COUNT, 132, 22, 200);
const NAVER_BASE_URL = process.env.NAVER_FINANCE_BASE_URL || "https://finance.naver.com";

if (!SERVICE_ACCOUNT_PATH) {
  console.error("Missing service account path. Use FIREBASE_SERVICE_ACCOUNT_PATH or pass a JSON path as argv[2].");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(SERVICE_ACCOUNT_PATH), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function main() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  let synced = 0;

  for (const symbol of SYMBOLS) {
    try {
      const catalog = STOCK_CATALOG[symbol] || {};
      const [summary, candles] = await Promise.all([
        fetchSummary(symbol),
        fetchDailyCandles(symbol)
      ]);

      if (!summary || !candles.length) {
        throw new Error("시세 또는 일봉 데이터를 수집하지 못했습니다.");
      }

      const docData = {
        symbol,
        name: summary.name || catalog.name || symbol,
        market: catalog.market || summary.market || "KOSPI",
        sector: catalog.sector || "기타",
        currentPrice: summary.currentPrice,
        previousClose: summary.previousClose,
        change: summary.change,
        changeRate: summary.changeRate,
        open: summary.open,
        high: summary.high,
        low: summary.low,
        volume: summary.volume,
        candles,
        source: "Naver Finance scrape",
        tradeDate: summary.tradeDate,
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

async function fetchSummary(symbol) {
  const response = await fetch(`${NAVER_BASE_URL}/item/main.naver?code=${symbol}`, {
    headers: htmlHeaders()
  });
  const html = await response.text();
  if (!response.ok || !html) throw new Error(`summary fetch failed: ${response.status}`);

  const name = matchFirst(html, /<title>\s*([^:<]+)\s*:/i);
  const blindBlock = matchFirst(html, /<dl class="blind">([\s\S]*?)<\/dl>/i);
  const flat = squeezeHtml(blindBlock);
  const summaryMatch = flat.match(/현재가\s*([\d,]+)\s*전일대비\s*(상승|하락|보합)\s*([\d,]+)\s*(?:플러스|마이너스)?\s*([\d.,]+)\s*퍼센트.*?전일가\s*([\d,]+).*?시가\s*([\d,]+).*?고가\s*([\d,]+).*?저가\s*([\d,]+).*?거래량\s*([\d,]+)/i);
  if (!summaryMatch) {
    throw new Error("summary parse failed");
  }
  const tradeDateText = flat.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일/);

  const direction = summaryMatch[2];
  const changeAbs = toNumber(summaryMatch[3]);
  const rateAbs = toNumber(summaryMatch[4]);
  return {
    name: decodeEntities(name),
    currentPrice: toNumber(summaryMatch[1]),
    change: direction === "하락" ? -changeAbs : direction === "보합" ? 0 : changeAbs,
    changeRate: direction === "하락" ? -rateAbs : direction === "보합" ? 0 : rateAbs,
    previousClose: toNumber(summaryMatch[5]),
    open: toNumber(summaryMatch[6]),
    high: toNumber(summaryMatch[7]),
    low: toNumber(summaryMatch[8]),
    volume: toNumber(summaryMatch[9]),
    tradeDate: tradeDateText ? `${tradeDateText[1]}${tradeDateText[2]}${tradeDateText[3]}` : formatYmd(new Date())
  };
}

async function fetchDailyCandles(symbol) {
  const rows = [];
  const pageCount = Math.ceil(CANDLE_COUNT / 10) + 2;
  for (let page = 1; page <= pageCount; page += 1) {
    const response = await fetch(`${NAVER_BASE_URL}/item/sise_day.naver?code=${symbol}&page=${page}`, {
      headers: htmlHeaders()
    });
    if (!response.ok) throw new Error(`candle fetch failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const html = new TextDecoder("euc-kr").decode(buffer);
    rows.push(...parseDailyRows(html));
    if (rows.length >= CANDLE_COUNT) break;
  }
  return rows.slice(0, CANDLE_COUNT).reverse();
}

function parseDailyRows(html) {
  const matches = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*<span class="tah p10 gray03">([\d.]+)<\/span><\/td>\s*<td class="num"><span class="tah p11">([\d,]+)<\/span><\/td>\s*<td class="num">\s*(?:<em[^>]*><span class="blind">(상승|하락|보합)<\/span><\/em>)?\s*<span class="tah p11(?: red02| nv01)?">\s*([\d,]*)\s*<\/span>\s*<\/td>\s*<td class="num"><span class="tah p11">([\d,]+)<\/span><\/td>\s*<td class="num"><span class="tah p11">([\d,]+)<\/span><\/td>\s*<td class="num"><span class="tah p11">([\d,]+)<\/span><\/td>\s*<td class="num"><span class="tah p11">([\d,]+)<\/span><\/td>/g)];
  return matches.map((match) => ({
    label: formatDateLabel(match[1].replace(/\./g, "")),
    open: toNumber(match[5]),
    high: toNumber(match[6]),
    low: toNumber(match[7]),
    close: toNumber(match[2]),
    volume: toNumber(match[8])
  })).filter((row) => row.close > 0);
}

function htmlHeaders() {
  return {
    "user-agent": "Mozilla/5.0",
    referer: "https://finance.naver.com/"
  };
}

function squeezeHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(text, regex) {
  const match = String(text || "").match(regex);
  return match ? match[1] : "";
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"");
}

function toNumber(value) {
  const numeric = Number(String(value ?? "0").replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateLabel(raw) {
  const value = String(raw || "");
  if (value.length !== 8) return value;
  return `${value.slice(2, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function clampInt(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseSymbols(raw) {
  if (!raw) return Object.keys(STOCK_CATALOG);
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
