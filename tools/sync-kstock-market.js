const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.argv[2] || "";
const SYMBOLS = parseSymbols(process.env.KSTOCK_SYMBOLS);
const CANDLE_COUNT = clampInt(process.env.KSTOCK_CANDLE_COUNT, 132, 22, 200);
const KRX_BASE_URL = process.env.KRX_BASE_URL || "http://data.krx.co.kr";
const KRX_REFERER = process.env.KRX_REFERER || "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020101";

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

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(SERVICE_ACCOUNT_PATH), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function main() {
  const tradeDate = await resolveLatestTradeDate();
  const marketRows = await fetchAllMarketRows(tradeDate);
  const marketIndex = new Map();

  for (const row of marketRows) {
    const shortCode = cleanCode(row["단축코드"] || row["종목코드"]);
    if (shortCode) {
      marketIndex.set(shortCode, row);
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  let synced = 0;

  for (const symbol of SYMBOLS) {
    try {
      const marketRow = marketIndex.get(symbol);
      if (!marketRow) throw new Error("KRX 전종목 시세에서 종목을 찾지 못했습니다.");

      const standardCode = cleanCode(marketRow["표준코드"] || marketRow["ISIN"] || marketRow["표준코드1"]);
      const candles = standardCode
        ? await fetchDailyCandles({ symbol, standardCode, tradeDate, marketRow })
        : [];

      const catalog = STOCK_CATALOG[symbol] || {};
      const docData = {
        symbol,
        name: catalog.name || marketRow["종목명"] || symbol,
        market: catalog.market || normalizeMarket(marketRow["시장구분"]),
        sector: catalog.sector || String(marketRow["소속부"] || marketRow["업종명"] || "기타"),
        currentPrice: toNumber(marketRow["종가"] || marketRow["현재가"]),
        previousClose: toNumber(marketRow["전일종가"]) || derivePreviousClose(marketRow),
        change: signedValue(marketRow["대비"]),
        changeRate: toNumber(marketRow["등락률"]),
        open: toNumber(marketRow["시가"]),
        high: toNumber(marketRow["고가"]),
        low: toNumber(marketRow["저가"]),
        volume: toNumber(marketRow["거래량"]),
        candles,
        source: "KRX Information Data System (20-minute delay)",
        tradeDate,
        updatedAt: now
      };

      await db.collection("stock_market_cache").doc(symbol).set(docData, { merge: true });
      synced += 1;
      console.log(`synced ${symbol} ${docData.name} ${docData.currentPrice}`);
    } catch (error) {
      console.error(`failed ${symbol}: ${error.message}`);
    }
  }

  console.log(`done: synced ${synced}/${SYMBOLS.length} symbols for ${tradeDate}`);
}

async function resolveLatestTradeDate() {
  for (let offset = 0; offset < 10; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const tradeDate = formatYmd(date);
    try {
      const rows = await fetchAllMarketRows(tradeDate);
      if (rows.length) return tradeDate;
    } catch (_) {
      continue;
    }
  }
  throw new Error("최근 영업일 KRX 시세를 찾지 못했습니다.");
}

async function fetchAllMarketRows(tradeDate) {
  const otp = await generateOtp({
    locale: "ko_KR",
    mktId: "ALL",
    trdDd: tradeDate,
    share: "1",
    money: "1",
    csvxls_isNo: "false",
    name: "fileDown",
    url: "dbms/MDC/STAT/standard/MDCSTAT01501"
  });

  const csv = await downloadCsv(otp);
  const rows = parseKrCsv(csv);
  if (!rows.length) {
    throw new Error(`전종목 시세 응답이 비어 있습니다: ${tradeDate}`);
  }
  return rows;
}

async function fetchDailyCandles({ symbol, standardCode, tradeDate, marketRow }) {
  const endDate = tradeDate;
  const startDate = shiftDate(tradeDate, -Math.max(CANDLE_COUNT * 2, 220));
  const payload = {
    bld: "dbms/MDC/STAT/standard/MDCSTAT01701",
    locale: "ko_KR",
    isuCd: standardCode,
    isuCd2: standardCode,
    codeNmisuCd_finder_stkisu0_0: String(marketRow["종목명"] || symbol),
    param1isuCd_finder_stkisu0_0: "ALL",
    strtDd: startDate,
    endDd: endDate,
    share: "1",
    money: "1",
    csvxls_isNo: "false"
  };

  const response = await fetch(`${KRX_BASE_URL}/comm/bldAttendant/getJsonData.cmd`, {
    method: "POST",
    headers: formHeaders(),
    body: new URLSearchParams(payload)
  });

  const json = await response.json();
  const rows = Array.isArray(json.output) ? json.output : [];
  return rows
    .slice(-CANDLE_COUNT)
    .map((item) => ({
      label: formatDateLabel(item.TRD_DD),
      open: toNumber(item.TDD_OPNPRC),
      high: toNumber(item.TDD_HGPRC),
      low: toNumber(item.TDD_LWPRC),
      close: toNumber(item.TDD_CLSPRC),
      volume: toNumber(item.ACC_TRDVOL)
    }))
    .filter((item) => item.close > 0);
}

async function generateOtp(params) {
  const response = await fetch(`${KRX_BASE_URL}/comm/fileDn/GenerateOTP/generate.cmd`, {
    method: "POST",
    headers: formHeaders(),
    body: new URLSearchParams(params)
  });
  const text = (await response.text()).trim();
  if (!response.ok || !text) {
    throw new Error(`OTP 발급 실패: ${response.status}`);
  }
  return text;
}

async function downloadCsv(otp) {
  const response = await fetch(`${KRX_BASE_URL}/comm/fileDn/download_csv/download.cmd`, {
    method: "POST",
    headers: formHeaders(),
    body: new URLSearchParams({ code: otp })
  });
  if (!response.ok) {
    throw new Error(`CSV 다운로드 실패: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return decodeKr(buffer);
}

function formHeaders() {
  return {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    referer: KRX_REFERER,
    "user-agent": "Mozilla/5.0"
  };
}

function parseKrCsv(text) {
  const rows = [];
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return rows;

  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (!cells.length) continue;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function decodeKr(buffer) {
  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch (_) {
    return buffer.toString("utf8");
  }
}

function cleanCode(value) {
  return String(value || "").replace(/[^A-Z0-9]/gi, "");
}

function toNumber(value) {
  const numeric = Number(String(value ?? "0").replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function signedValue(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (text.startsWith("-")) return -toNumber(text);
  if (text.startsWith("+")) return toNumber(text);
  return toNumber(text);
}

function derivePreviousClose(row) {
  return toNumber(row["종가"] || row["현재가"]) - signedValue(row["대비"]);
}

function normalizeMarket(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("KOSDAQ") || text.includes("코스닥")) return "KOSDAQ";
  if (text.includes("KONEX") || text.includes("코넥스")) return "KONEX";
  return "KOSPI";
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

function shiftDate(rawYmd, deltaDays) {
  const date = new Date(Number(rawYmd.slice(0, 4)), Number(rawYmd.slice(4, 6)) - 1, Number(rawYmd.slice(6, 8)));
  date.setDate(date.getDate() + deltaDays);
  return formatYmd(date);
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
