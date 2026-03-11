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
  "042700": { name: "한미반도체", market: "KOSDAQ", sector: "반도체 장비" },
  "122630": { name: "KODEX 레버리지", market: "KOSPI", sector: "ETF 레버리지" },
  "114800": { name: "KODEX 인버스", market: "KOSPI", sector: "ETF 인버스" },
  "252670": { name: "KODEX 200선물인버스2X", market: "KOSPI", sector: "ETF 곱버스" },
  "489790": { name: "한화비전", market: "KOSPI", sector: "방산/비전솔루션" },
  "530036": { name: "삼성 인버스 2X WTI원유 선물 ETN", market: "KOSPI", sector: "ETN 원유 인버스" },
  "152550": { name: "한국ANKOR유전", market: "KOSPI", sector: "자원개발" },
  "233740": { name: "KODEX 코스닥150레버리지", market: "KOSPI", sector: "ETF 레버리지" },
  "251340": { name: "KODEX 코스닥150선물인버스", market: "KOSPI", sector: "ETF 인버스" },
  "279570": { name: "케이뱅크", market: "KOSPI", sector: "인터넷은행" },
  "462330": { name: "KODEX 2차전지산업레버리지", market: "KOSPI", sector: "ETF 레버리지" },
  "252710": { name: "TIGER 200선물인버스2X", market: "KOSPI", sector: "ETF 곱버스" },
  "550043": { name: "N2 인버스 레버리지 WTI원유 선물 ETN(H)", market: "KOSPI", sector: "ETN 원유 인버스" },
  "001510": { name: "SK증권", market: "KOSPI", sector: "증권" },
  "229200": { name: "KODEX 코스닥150", market: "KOSPI", sector: "ETF 코스닥" },
  "003280": { name: "흥아해운", market: "KOSPI", sector: "해운" },
  "015260": { name: "에이엔피", market: "KOSPI", sector: "전자부품" },
  "530107": { name: "삼성 인버스 2X 코스닥150 선물 ETN", market: "KOSPI", sector: "ETN 인버스" },
  "004410": { name: "서울식품", market: "KOSPI", sector: "식품" },
  "530031": { name: "삼성 레버리지 WTI원유 선물 ETN", market: "KOSPI", sector: "ETN 레버리지" },
  "396500": { name: "TIGER 반도체TOP10", market: "KOSPI", sector: "ETF 반도체" },
  "271050": { name: "KODEX WTI원유선물인버스(H)", market: "KOSPI", sector: "ETF 원유 인버스" },
  "069500": { name: "KODEX 200", market: "KOSPI", sector: "ETF 대형주" },
  "047040": { name: "대우건설", market: "KOSPI", sector: "건설" },
  "117580": { name: "대성에너지", market: "KOSPI", sector: "에너지" },
  "012690": { name: "모나리자", market: "KOSPI", sector: "생활용품" },
  "488080": { name: "TIGER 반도체TOP10레버리지", market: "KOSPI", sector: "ETF 레버리지" },
  "232080": { name: "TIGER 코스닥150", market: "KOSPI", sector: "ETF 코스닥" },
  "102110": { name: "TIGER 200", market: "KOSPI", sector: "ETF 대형주" },
  "005880": { name: "대한해운", market: "KOSPI", sector: "해운" },
  "004060": { name: "SG세계물산", market: "KOSPI", sector: "유통" },
  "034020": { name: "두산에너빌리티", market: "KOSPI", sector: "에너지/원전" },
  "379800": { name: "KODEX 미국S&P500", market: "KOSPI", sector: "ETF 해외지수" },
  "018880": { name: "한온시스템", market: "KOSPI", sector: "자동차부품" }
};

const SYMBOLS = parseSymbols(process.env.KSTOCK_SYMBOLS);
const CANDLE_COUNT = clampInt(process.env.KSTOCK_CANDLE_COUNT, 132, 22, 200);
const NAVER_BASE_URL = process.env.NAVER_FINANCE_BASE_URL || "https://finance.naver.com";
const YAHOO_CHART_BASE_URL = process.env.YAHOO_CHART_BASE_URL || "https://query1.finance.yahoo.com/v8/finance/chart";

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
      const [summary, candles, charts] = await Promise.all([
        fetchSummary(symbol),
        fetchDailyCandles(symbol),
        fetchYahooCharts(symbol, catalog)
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
        charts,
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

  const valuationUpdates = await recomputeAllProfileValuations(now);

  console.log(`done: synced ${synced}/${SYMBOLS.length} symbols`);
  console.log(`done: recomputed ${valuationUpdates} stock game profiles`);
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

async function fetchYahooCharts(symbol, catalog) {
  const yahooSymbol = toYahooSymbol(symbol, catalog);
  const [intraday1d5m, intraday5d60m, history6mo1d] = await Promise.all([
    fetchYahooChartSeries(yahooSymbol, "5m", "1d"),
    fetchYahooChartSeries(yahooSymbol, "60m", "5d"),
    fetchYahooChartSeries(yahooSymbol, "1d", "6mo")
  ]);
  return {
    intraday1d5m,
    intraday5d60m,
    history6mo1d
  };
}

async function fetchYahooChartSeries(yahooSymbol, interval, range) {
  const response = await fetch(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`, {
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: "https://finance.yahoo.com/"
    }
  });
  if (!response.ok) throw new Error(`yahoo chart fetch failed: ${response.status}`);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const opens = Array.isArray(quote?.open) ? quote.open : [];
  const highs = Array.isArray(quote?.high) ? quote.high : [];
  const lows = Array.isArray(quote?.low) ? quote.low : [];
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];

  return timestamps.map((ts, index) => ({
    ts: Number(ts || 0) * 1000,
    label: formatChartTimestamp(Number(ts || 0) * 1000, interval),
    open: sanitizePrice(opens[index]),
    high: sanitizePrice(highs[index]),
    low: sanitizePrice(lows[index]),
    close: sanitizePrice(closes[index]),
    volume: toNumber(volumes[index])
  })).filter((item) => item.close > 0);
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

async function recomputeAllProfileValuations(now) {
  const [profileSnap, marketSnap, positionSnap] = await Promise.all([
    db.collection("stock_game_profiles").get(),
    db.collection("stock_market_cache").get(),
    db.collectionGroup("positions").get()
  ]);

  if (profileSnap.empty) return 0;

  const marketPriceMap = new Map(
    marketSnap.docs.map((docSnap) => [docSnap.id, toNumber(docSnap.data()?.currentPrice)])
  );
  const holdingsByUid = new Map();

  for (const docSnap of positionSnap.docs) {
    const parentDoc = docSnap.ref.parent.parent;
    if (!parentDoc || parentDoc.parent?.id !== "stock_game_profiles") continue;

    const uid = parentDoc.id;
    const data = docSnap.data() || {};
    const qty = toNumber(data.qty);
    const currentPrice = marketPriceMap.get(docSnap.id) || toNumber(data.lastPrice);
    const currentValue = qty * currentPrice;
    if (!currentValue) continue;

    holdingsByUid.set(uid, (holdingsByUid.get(uid) || 0) + currentValue);
  }

  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const profileDoc of profileSnap.docs) {
    const data = profileDoc.data() || {};
    const seedCapital = toNumber(data.seedCapital);
    const cash = toNumber(data.cash);
    const holdingsValue = holdingsByUid.get(profileDoc.id) || 0;
    const totalValue = cash + holdingsValue;
    const totalPnL = totalValue - seedCapital;
    const totalReturnRate = seedCapital ? (totalPnL / seedCapital) * 100 : 0;

    batch.set(profileDoc.ref, {
      totalValue,
      totalPnL,
      totalReturnRate,
      updatedAt: now
    }, { merge: true });
    batchCount += 1;
    updated += 1;

    if (batchCount === 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return updated;
}

function toYahooSymbol(symbol, catalog) {
  const market = String(catalog?.market || "").toUpperCase();
  return `${symbol}.${market === "KOSDAQ" ? "KQ" : "KS"}`;
}

function sanitizePrice(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function toNumber(value) {
  const numeric = Number(String(value ?? "0").replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatChartTimestamp(ms, interval) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  if (interval === "1d") {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
