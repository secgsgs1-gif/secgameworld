import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, db, isFirebaseConfigured } from "../../shared/firebase-app.js?v=20260224m";

const INITIAL_CASH = 100_000_000;

const els = {
  cashValue: document.getElementById("cash-value"),
  equityValue: document.getElementById("equity-value"),
  pnlValue: document.getElementById("pnl-value"),
  returnValue: document.getElementById("return-value"),
  positionsValue: document.getElementById("positions-value"),
  marketUpdatedValue: document.getElementById("market-updated-value"),
  marketSourcePill: document.getElementById("market-source-pill"),
  marketSyncNotice: document.getElementById("market-sync-notice"),
  searchInput: document.getElementById("search-input"),
  marketList: document.getElementById("market-list"),
  detailName: document.getElementById("detail-name"),
  detailMeta: document.getElementById("detail-meta"),
  detailPrice: document.getElementById("detail-price"),
  detailChange: document.getElementById("detail-change"),
  detailVolume: document.getElementById("detail-volume"),
  detailOhlc: document.getElementById("detail-ohlc"),
  chartCanvas: document.getElementById("chart-canvas"),
  chartCaption: document.getElementById("chart-caption"),
  orderStatus: document.getElementById("order-status"),
  qtyInput: document.getElementById("qty-input"),
  buyMaxBtn: document.getElementById("buy-max-btn"),
  sellAllBtn: document.getElementById("sell-all-btn"),
  estimatePrice: document.getElementById("estimate-price"),
  estimateTotal: document.getElementById("estimate-total"),
  buyBtn: document.getElementById("buy-btn"),
  sellBtn: document.getElementById("sell-btn"),
  positionSummary: document.getElementById("position-summary"),
  portfolioList: document.getElementById("portfolio-list"),
  historyList: document.getElementById("history-list"),
  leaderboardList: document.getElementById("leaderboard-list")
};

const state = {
  user: null,
  username: "",
  profile: null,
  positions: [],
  trades: [],
  rankings: [],
  rankingPositions: new Map(),
  rankingPositionUnsubs: new Map(),
  marketMap: new Map(),
  filteredSymbols: [],
  selectedSymbol: null,
  timeframe: "1D",
  marketReady: false,
  valuationSync: "",
  chartHover: null
};
const timeframeButtons = [...document.querySelectorAll(".timeframe-btn")];

bindEvents();
boot();

function boot() {
  if (!isFirebaseConfigured() || !auth || !db) {
    els.orderStatus.textContent = "Firebase 설정 필요";
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    state.user = user;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    state.username = String(userSnap.data()?.username || user.email?.split("@")[0] || "player");
    await ensureGameProfile();
    wireStreams();
  });
}

function bindEvents() {
  els.searchInput.addEventListener("input", renderMarketList);
  els.buyMaxBtn.addEventListener("click", fillMaxBuyQty);
  els.sellAllBtn.addEventListener("click", fillSellAllQty);
  els.buyBtn.addEventListener("click", () => submitOrder("buy"));
  els.sellBtn.addEventListener("click", () => submitOrder("sell"));
  els.qtyInput.addEventListener("input", renderOrderEstimate);
  timeframeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.timeframe = button.dataset.range;
      timeframeButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderSelectedStock();
    });
  });
  window.addEventListener("resize", () => drawChart(getSelectedStock()));
  els.chartCanvas.addEventListener("mousemove", handleChartPointerMove);
  els.chartCanvas.addEventListener("mouseleave", () => {
    state.chartHover = null;
    drawChart(getSelectedStock());
  });
}

async function ensureGameProfile() {
  const ref = doc(db, "stock_game_profiles", state.user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    uid: state.user.uid,
    username: state.username,
    cash: INITIAL_CASH,
    seedCapital: INITIAL_CASH,
    totalValue: INITIAL_CASH,
    totalPnL: 0,
    totalReturnRate: 0,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });
}

function wireStreams() {
  onSnapshot(doc(db, "stock_game_profiles", state.user.uid), (snap) => {
    state.profile = snap.data() || null;
    renderSummary();
    renderOrderEstimate();
  });

  onSnapshot(collection(db, "stock_game_profiles", state.user.uid, "positions"), (snap) => {
    state.positions = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderPortfolio();
    renderSelectedStock();
    syncProfileValuation();
  });

  onSnapshot(query(collection(db, "stock_game_profiles", state.user.uid, "trades"), orderBy("executedAt", "desc"), limit(20)), (snap) => {
    state.trades = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderHistory();
  });

  onSnapshot(query(collection(db, "stock_game_profiles"), orderBy("totalValue", "desc")), (snap) => {
    state.rankings = snap.docs.map((item) => ({ uid: item.id, ...item.data() }));
    syncLeaderboardPositionStreams();
    renderLeaderboard();
  });

  onSnapshot(collection(db, "stock_market_cache"), (snap) => {
    state.marketReady = !snap.empty;
    state.marketMap = !snap.empty
      ? new Map(snap.docs.map((item) => [item.id, normalizeMarketDoc(item.id, item.data())]))
      : new Map();
    hydrateSelection();
    renderAllMarketViews();
    syncProfileValuation();
  }, async () => {
    state.marketReady = false;
    state.marketMap = new Map();
    hydrateSelection();
    renderAllMarketViews();
  });
}

function hydrateSelection() {
  if (!state.selectedSymbol || !state.marketMap.has(state.selectedSymbol)) {
    state.selectedSymbol = [...state.marketMap.keys()][0] || null;
  }
}

function renderAllMarketViews() {
  els.marketSourcePill.textContent = state.marketReady ? "Firestore market_cache 시세" : "시세 동기화 필요";
  els.marketSyncNotice.hidden = state.marketReady;
  const latestUpdatedAt = [...state.marketMap.values()]
    .map((item) => item.updatedAtLabel || "")
    .filter(Boolean)
    .sort()
    .at(-1);
  els.marketUpdatedValue.textContent = latestUpdatedAt || "동기화 전";
  renderMarketList();
  renderSelectedStock();
  renderLeaderboard();
  setTradingEnabled(state.marketReady);
}

function renderMarketList() {
  if (!state.marketReady) {
    els.marketList.innerHTML = `<div class="table-row"><div><strong>실데이터 없음</strong><p>시세 동기화 스크립트로 stock_market_cache를 채운 뒤 다시 확인하세요.</p></div></div>`;
    return;
  }
  const keyword = String(els.searchInput.value || "").trim().toLowerCase();
  const rows = [...state.marketMap.values()]
    .filter((item) => !keyword || item.name.toLowerCase().includes(keyword) || item.symbol.includes(keyword))
    .sort(compareMarketRows);

  state.filteredSymbols = rows.map((item) => item.symbol);
  els.marketList.innerHTML = "";

  rows.forEach((item) => {
    const row = document.createElement("article");
    row.className = `market-item${item.symbol === state.selectedSymbol ? " active" : ""}`;
    row.innerHTML = `
      <div class="market-head">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${item.symbol} · ${escapeHtml(item.market)}</p>
        </div>
        <strong class="${rateClass(item.changeRate)}">${formatPercent(item.changeRate)}</strong>
      </div>
      <div class="market-sub">
        <span>${formatKRW(item.currentPrice)}</span>
        <span>거래량 ${formatCompact(item.volume)}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      state.selectedSymbol = item.symbol;
      renderAllMarketViews();
      renderOrderEstimate();
    });
    els.marketList.appendChild(row);
  });

  if (!rows.length) {
    els.marketList.innerHTML = `<div class="table-row"><div><strong>검색 결과 없음</strong><p>다른 종목명 또는 코드로 검색하세요.</p></div></div>`;
  }
}

function renderSelectedStock() {
  const stock = getSelectedStock();
  if (!stock) {
    resetDetailPanel();
    return;
  }
  const position = findPosition(stock.symbol);
  els.detailName.textContent = stock.name;
  els.detailMeta.textContent = `${stock.symbol} · ${stock.market} · ${stock.sector}`;
  els.detailPrice.textContent = formatKRW(stock.currentPrice);
  els.detailChange.textContent = `${signedNumber(stock.change)} (${formatPercent(stock.changeRate)})`;
  els.detailChange.className = rateClass(stock.changeRate);
  els.detailVolume.textContent = `${formatCompact(stock.volume)}주`;
  els.detailOhlc.textContent = `${formatKRW(stock.open)} / ${formatKRW(stock.high)} / ${formatKRW(stock.low)}`;

  if (!position) {
    els.positionSummary.innerHTML = "현재 이 종목의 보유 수량이 없습니다.";
  } else {
    const currentValue = Number(position.qty || 0) * Number(stock.currentPrice || 0);
    const basis = Number(position.qty || 0) * Number(position.avgCost || 0);
    const pnl = currentValue - basis;
    els.positionSummary.innerHTML = `
      <div><strong>${escapeHtml(stock.name)}</strong> ${position.qty}주 보유</div>
      <div>평균단가 <strong>${formatKRW(position.avgCost)}</strong></div>
      <div>평가금액 <strong>${formatKRW(currentValue)}</strong></div>
      <div>평가손익 <strong class="${rateClass(pnl)}">${signedKRW(pnl)}</strong></div>
    `;
  }

  renderOrderEstimate();
  drawChart(stock);
  const candles = getCandlesForRange(stock, state.timeframe);
  if (candles.length) {
    const first = candles[0].close;
    const last = candles.at(-1).close;
    const delta = first ? ((last - first) / first) * 100 : 0;
    els.chartCaption.textContent = `${state.timeframe} 기준 ${candles.length}개 봉, 기간 수익률 ${formatPercent(delta)}.`;
  }
}

function renderSummary() {
  const profile = state.profile;
  if (!profile) return;
  els.cashValue.textContent = formatKRW(profile.cash || 0);
  els.equityValue.textContent = formatKRW(profile.totalValue || profile.cash || 0);
  els.pnlValue.textContent = signedKRW(profile.totalPnL || 0);
  els.pnlValue.className = rateClass(profile.totalPnL || 0);
  els.returnValue.textContent = formatPercent(profile.totalReturnRate || 0);
  els.returnValue.className = rateClass(profile.totalReturnRate || 0);
  els.positionsValue.textContent = String(state.positions.filter((item) => Number(item.qty || 0) > 0).length);
}

function renderPortfolio() {
  els.portfolioList.innerHTML = "";
  const rows = state.positions
    .filter((item) => Number(item.qty || 0) > 0)
    .sort((a, b) => {
      const av = (state.marketMap.get(a.symbol)?.currentPrice || 0) * Number(a.qty || 0);
      const bv = (state.marketMap.get(b.symbol)?.currentPrice || 0) * Number(b.qty || 0);
      return bv - av;
    });

  if (!rows.length) {
    els.portfolioList.innerHTML = `<div class="table-row"><div><strong>보유 종목 없음</strong><p>상단 종목을 선택하고 첫 매수를 진행하세요.</p></div></div>`;
    return;
  }

  rows.forEach((item) => {
    const stock = state.marketMap.get(item.symbol);
    const currentPrice = Number(stock?.currentPrice || item.lastPrice || 0);
    const value = currentPrice * Number(item.qty || 0);
    const cost = Number(item.avgCost || 0) * Number(item.qty || 0);
    const pnl = value - cost;
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.name || item.symbol)}</strong>
        <p>${item.symbol} · ${item.qty}주 · 평균 ${formatKRW(item.avgCost || 0)}</p>
      </div>
      <div class="right">
        <strong>${formatKRW(value)}</strong>
        <p class="${rateClass(pnl)}">${signedKRW(pnl)}</p>
      </div>
    `;
    row.addEventListener("click", () => {
      state.selectedSymbol = item.symbol;
      renderAllMarketViews();
    });
    els.portfolioList.appendChild(row);
  });
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!state.trades.length) {
    els.historyList.innerHTML = `<div class="table-row"><div><strong>체결 내역 없음</strong><p>첫 거래가 실행되면 여기에 표시됩니다.</p></div></div>`;
    return;
  }
  state.trades.forEach((trade) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div>
        <strong class="${trade.side === "buy" ? "positive" : "negative"}">${trade.side === "buy" ? "매수" : "매도"}</strong>
        <p>${escapeHtml(trade.name || trade.symbol)} · ${trade.qty}주 · ${formatDateTime(trade.executedAt)}</p>
      </div>
      <div class="right">
        <strong>${formatKRW(trade.price)}</strong>
        <p>${formatKRW((trade.price || 0) * (trade.qty || 0))}</p>
      </div>
    `;
    els.historyList.appendChild(row);
  });
}

function renderLeaderboard() {
  els.leaderboardList.innerHTML = "";
  if (!state.rankings.length) {
    els.leaderboardList.innerHTML = `<div class="leaderboard-row"><div><strong>랭킹 준비중</strong><p>참가자가 생기면 집계됩니다.</p></div></div>`;
    return;
  }
  state.rankings.forEach((entry, index) => {
    const positions = summarizeRankingPositions(entry.uid);
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `
      <div class="leaderboard-main">
        <strong>#${index + 1} ${escapeHtml(entry.username || "player")}</strong>
        ${positions.length
          ? `<div class="leaderboard-holdings">${positions.map((item) => `
              <div class="holding-pill">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${formatKRW(item.value)}</span>
                <span class="${rateClass(item.returnRate)}">${formatPercent(item.returnRate)}</span>
              </div>
            `).join("")}</div>`
          : `<p class="leaderboard-empty">보유 종목 없음</p>`}
      </div>
      <div class="right leaderboard-metrics">
        <div class="leaderboard-total-line">
          <strong>${formatKRW(entry.totalValue || 0)}</strong>
          <span class="leaderboard-return ${rateClass(entry.totalReturnRate || 0)}">${formatPercent(entry.totalReturnRate || 0)}</span>
        </div>
        <p>${signedKRW(entry.totalPnL || 0)}</p>
      </div>
    `;
    els.leaderboardList.appendChild(row);
  });
}

function syncLeaderboardPositionStreams() {
  const activeUids = new Set(state.rankings.map((entry) => entry.uid).filter(Boolean));

  for (const [uid, unsubscribe] of state.rankingPositionUnsubs.entries()) {
    if (activeUids.has(uid)) continue;
    unsubscribe();
    state.rankingPositionUnsubs.delete(uid);
    state.rankingPositions.delete(uid);
  }

  activeUids.forEach((uid) => {
    if (state.rankingPositionUnsubs.has(uid)) return;
    const unsubscribe = onSnapshot(collection(db, "stock_game_profiles", uid, "positions"), (snap) => {
      state.rankingPositions.set(uid, snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      renderLeaderboard();
    });
    state.rankingPositionUnsubs.set(uid, unsubscribe);
  });
}

function summarizeRankingPositions(uid) {
  const positions = (state.rankingPositions.get(uid) || [])
    .filter((item) => Number(item.qty || 0) > 0)
    .map((item) => {
      const stock = state.marketMap.get(item.symbol);
      const currentPrice = Number(stock?.currentPrice || item.lastPrice || 0);
      const value = currentPrice * Number(item.qty || 0);
      const basis = Number(item.avgCost || 0) * Number(item.qty || 0);
      const returnRate = basis > 0 ? ((value - basis) / basis) * 100 : 0;
      return {
        symbol: item.symbol,
        name: item.name || stock?.name || item.symbol,
        value,
        returnRate
      };
    })
    .sort((a, b) => b.value - a.value);

  return positions.slice(0, 4);
}

function renderOrderEstimate() {
  const stock = getSelectedStock();
  const qty = sanitizeQty(els.qtyInput.value);
  if (!stock) {
    els.estimatePrice.textContent = "-";
    els.estimateTotal.textContent = "-";
    return;
  }
  els.estimatePrice.textContent = formatKRW(stock.currentPrice);
  els.estimateTotal.textContent = formatKRW(stock.currentPrice * qty);
}

function fillMaxBuyQty() {
  const stock = getSelectedStock();
  const cash = Number(state.profile?.cash || 0);
  if (!stock || !stock.currentPrice) return;
  const maxQty = Math.floor(cash / stock.currentPrice);
  if (maxQty < 1) {
    setStatus("현재 게임 캐시로는 1주도 매수할 수 없습니다.");
    return;
  }
  els.qtyInput.value = String(maxQty);
  renderOrderEstimate();
}

function fillSellAllQty() {
  const stock = getSelectedStock();
  const qty = Number(findPosition(stock?.symbol)?.qty || 0);
  if (qty < 1) {
    setStatus("현재 종목 보유 수량이 없습니다.");
    return;
  }
  els.qtyInput.value = String(qty);
  renderOrderEstimate();
}

async function submitOrder(side) {
  const stock = getSelectedStock();
  const qty = sanitizeQty(els.qtyInput.value);
  if (!state.marketReady || !stock) {
    setStatus("실데이터 동기화 후에만 거래할 수 있습니다.");
    return;
  }
  if (qty < 1) {
    setStatus("수량은 1주 이상이어야 합니다.");
    return;
  }

  const profileRef = doc(db, "stock_game_profiles", state.user.uid);
  const positionRef = doc(db, "stock_game_profiles", state.user.uid, "positions", stock.symbol);
  const tradeRef = doc(collection(db, "stock_game_profiles", state.user.uid, "trades"));

  try {
    await runTransaction(db, async (tx) => {
      const [profileSnap, positionSnap] = await Promise.all([tx.get(profileRef), tx.get(positionRef)]);
      if (!profileSnap.exists()) throw new Error("게임 프로필을 찾을 수 없습니다.");

      const profile = profileSnap.data();
      const currentCash = Number(profile.cash || 0);
      const currentPrice = Number(stock.currentPrice || 0);
      const orderValue = currentPrice * qty;
      const currentPosition = positionSnap.exists() ? positionSnap.data() : null;
      const currentQty = Number(currentPosition?.qty || 0);
      const currentAvg = Number(currentPosition?.avgCost || 0);

      if (side === "buy") {
        if (currentCash < orderValue) throw new Error("게임 캐시가 부족합니다.");
        const nextQty = currentQty + qty;
        const nextAvg = nextQty > 0 ? ((currentQty * currentAvg) + orderValue) / nextQty : 0;
        tx.set(positionRef, {
          symbol: stock.symbol,
          name: stock.name,
          market: stock.market,
          qty: nextQty,
          avgCost: nextAvg,
          lastPrice: currentPrice,
          updatedAt: serverTimestamp()
        }, { merge: true });
        tx.set(profileRef, {
          username: state.username,
          cash: currentCash - orderValue,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        if (currentQty < qty) throw new Error("보유 수량이 부족합니다.");
        const nextQty = currentQty - qty;
        if (nextQty > 0) {
          tx.set(positionRef, {
            symbol: stock.symbol,
            name: stock.name,
            market: stock.market,
            qty: nextQty,
            avgCost: currentAvg,
            lastPrice: currentPrice,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else {
          tx.delete(positionRef);
        }
        tx.set(profileRef, {
          username: state.username,
          cash: currentCash + orderValue,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      tx.set(tradeRef, {
        side,
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        qty,
        price: currentPrice,
        executedAt: serverTimestamp()
      });
    });

    setStatus(`${stock.name} ${qty}주 ${side === "buy" ? "매수" : "매도"} 완료`);
    els.qtyInput.value = "1";
    renderOrderEstimate();
  } catch (error) {
    setStatus(error.message || "주문 실패");
  }
}

async function syncProfileValuation() {
  if (!state.profile || !state.user) return;
  const holdingsValue = state.positions.reduce((sum, item) => {
    const market = state.marketMap.get(item.symbol);
    return sum + Number(item.qty || 0) * Number(market?.currentPrice || item.lastPrice || 0);
  }, 0);
  const seedCapital = Number(state.profile.seedCapital || INITIAL_CASH);
  const cash = Number(state.profile.cash || 0);
  const totalValue = cash + holdingsValue;
  const totalPnL = totalValue - seedCapital;
  const totalReturnRate = seedCapital ? (totalPnL / seedCapital) * 100 : 0;
  const nextSignature = [Math.round(totalValue), Math.round(totalPnL), totalReturnRate.toFixed(4), state.positions.length].join(":");
  if (state.valuationSync === nextSignature) return;
  state.valuationSync = nextSignature;

  await setDoc(doc(db, "stock_game_profiles", state.user.uid), {
    username: state.username,
    totalValue,
    totalPnL,
    totalReturnRate,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function getSelectedStock() {
  return state.marketMap.get(state.selectedSymbol) || null;
}

function findPosition(symbol) {
  return state.positions.find((item) => item.symbol === symbol) || null;
}

function setStatus(message) {
  els.orderStatus.textContent = message;
}

function setTradingEnabled(enabled) {
  els.qtyInput.disabled = !enabled;
  els.buyMaxBtn.disabled = !enabled;
  els.sellAllBtn.disabled = !enabled;
  els.buyBtn.disabled = !enabled;
  els.sellBtn.disabled = !enabled;
  if (!enabled) {
    els.orderStatus.textContent = "실데이터 동기화 후 거래 가능";
  }
}

function resetDetailPanel() {
  els.detailName.textContent = "실데이터 대기중";
  els.detailMeta.textContent = "stock_market_cache 동기화 필요";
  els.detailPrice.textContent = "-";
  els.detailChange.textContent = "-";
  els.detailChange.className = "";
  els.detailVolume.textContent = "-";
  els.detailOhlc.textContent = "-";
  els.positionSummary.innerHTML = "실데이터가 준비되면 선택 종목 보유 정보가 표시됩니다.";
  els.chartCaption.textContent = "시세 동기화 전에는 차트를 표시하지 않습니다.";
  drawChart(null);
  renderOrderEstimate();
}

function drawChart(stock) {
  const canvas = els.chartCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor((rect.width * 0.42) * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.width * 0.42;
  ctx.clearRect(0, 0, width, height);

  if (!stock) return;
  const candles = getCandlesForRange(stock, state.timeframe);
  if (!candles.length) return;

  const chartTop = 24;
  const chartBottom = height - 68;
  const left = 18;
  const right = width - 84;
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const yFor = (value) => chartTop + ((maxPrice - value) / Math.max(1, maxPrice - minPrice)) * (chartBottom - chartTop);
  const step = (right - left) / Math.max(1, candles.length - 1);

  ctx.strokeStyle = "rgba(151, 197, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = chartTop + ((chartBottom - chartTop) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    const ratio = i / 3;
    const price = maxPrice - (maxPrice - minPrice) * ratio;
    drawAxisLabel(ctx, formatKRW(price), right + 8, y + 4, "left");
  }

  const gradient = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
  gradient.addColorStop(0, "rgba(90, 184, 255, 0.38)");
  gradient.addColorStop(1, "rgba(90, 184, 255, 0)");

  ctx.beginPath();
  candles.forEach((item, index) => {
    const x = left + step * index;
    const y = yFor(item.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(right, chartBottom);
  ctx.lineTo(left, chartBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  candles.forEach((item, index) => {
    const x = left + step * index;
    const y = yFor(item.close);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = Number(stock.changeRate || 0) >= 0 ? "rgba(255, 133, 146, 0.95)" : "rgba(114, 220, 255, 0.95)";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  const volumeMax = Math.max(...candles.map((item) => Number(item.volume || 0)));
  candles.forEach((item, index) => {
    const x = left + step * index;
    const barHeight = volumeMax ? (Number(item.volume || 0) / volumeMax) * 36 : 0;
    ctx.fillStyle = item.close >= item.open ? "rgba(255, 127, 141, 0.34)" : "rgba(111, 215, 255, 0.34)";
    ctx.fillRect(x - 2, height - 18 - barHeight, 4, barHeight);
  });

  ctx.fillStyle = "rgba(229, 241, 255, 0.9)";
  ctx.font = '12px "JetBrains Mono"';
  ctx.fillText(candles[0].label || "", left, height - 6);
  ctx.fillText(candles.at(-1).label || "", right - 48, height - 6);

  drawHoverOverlay(ctx, candles, { left, right, chartTop, chartBottom, height, step, yFor, maxPrice, minPrice });
}

function drawHoverOverlay(ctx, candles, layout) {
  if (!state.chartHover) return;
  const index = Math.max(0, Math.min(candles.length - 1, state.chartHover.index));
  const candle = candles[index];
  if (!candle) return;

  const x = layout.left + layout.step * index;
  const y = layout.yFor(candle.close);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x, layout.chartTop);
  ctx.lineTo(x, layout.chartBottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(layout.left, y);
  ctx.lineTo(layout.right, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(123, 223, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  drawTag(ctx, formatKRW(candle.close), layout.right + 8, y, { align: "left" });
  drawTag(ctx, candle.label || "", x, layout.height - 22, { align: "center" });
}

function drawAxisLabel(ctx, text, x, y, align = "left") {
  ctx.save();
  ctx.fillStyle = "rgba(185, 210, 240, 0.82)";
  ctx.font = '11px "JetBrains Mono"';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawTag(ctx, text, x, y, { align = "left" } = {}) {
  ctx.save();
  ctx.font = '11px "JetBrains Mono"';
  const paddingX = 8;
  const paddingY = 6;
  const metrics = ctx.measureText(text);
  const width = metrics.width + paddingX * 2;
  const height = 24;
  let left = x;
  if (align === "center") left = x - width / 2;
  if (align === "right") left = x - width;
  const top = y - height / 2;

  ctx.fillStyle = "rgba(7, 18, 31, 0.92)";
  ctx.strokeStyle = "rgba(131, 190, 255, 0.5)";
  ctx.lineWidth = 1;
  roundRect(ctx, left, top, width, height, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(236, 246, 255, 0.96)";
  ctx.textAlign = "left";
  ctx.fillText(text, left + paddingX, top + height - paddingY - 1);
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function handleChartPointerMove(event) {
  const stock = getSelectedStock();
  if (!stock) return;
  const candles = getCandlesForRange(stock, state.timeframe);
  if (!candles.length) return;
  const rect = els.chartCanvas.getBoundingClientRect();
  const left = 18;
  const right = rect.width - 84;
  const relativeX = Math.max(left, Math.min(right, event.clientX - rect.left));
  const step = (right - left) / Math.max(1, candles.length - 1);
  state.chartHover = {
    index: Math.round((relativeX - left) / Math.max(step, 1))
  };
  drawChart(stock);
}

function getCandlesForRange(stock, range) {
  const charts = stock?.charts || {};
  const daily = Array.isArray(charts.history6mo1d) && charts.history6mo1d.length
    ? charts.history6mo1d
    : Array.isArray(stock?.candles) ? stock.candles : [];

  if (range === "10m") {
    return aggregateCandles(Array.isArray(charts.intraday1d5m) ? charts.intraday1d5m : [], 2).slice(-39);
  }
  if (range === "1H") {
    return Array.isArray(charts.intraday5d60m) ? charts.intraday5d60m.slice(-35) : [];
  }
  if (range === "1D") {
    return Array.isArray(charts.intraday1d5m) ? charts.intraday1d5m : [];
  }
  if (range === "1M") return daily.slice(-22);
  if (range === "3M") return daily.slice(-66);
  return daily.slice(-132);
}

function normalizeMarketDoc(id, data) {
  return {
    symbol: String(data.symbol || id),
    name: String(data.name || id),
    market: String(data.market || "KOSPI"),
    sector: String(data.sector || "기타"),
    currentPrice: Number(data.currentPrice || 0),
    previousClose: Number(data.previousClose || data.currentPrice || 0),
    change: Number(data.change ?? (Number(data.currentPrice || 0) - Number(data.previousClose || 0))),
    changeRate: Number(data.changeRate ?? calcRate(data.currentPrice, data.previousClose)),
    open: Number(data.open || data.currentPrice || 0),
    high: Number(data.high || data.currentPrice || 0),
    low: Number(data.low || data.currentPrice || 0),
    volume: Number(data.volume || 0),
    updatedAtLabel: formatDateTime(data.updatedAt),
    candles: normalizeCandles(data.candles, Number(data.currentPrice || 0)),
    charts: normalizeCharts(data.charts, data.candles, Number(data.currentPrice || 0))
  };
}

function normalizeCharts(charts, fallbackCandles, latestPrice) {
  const fallbackDaily = normalizeCandles(fallbackCandles, latestPrice);
  return {
    intraday1d5m: normalizeChartRows(charts?.intraday1d5m),
    intraday5d60m: normalizeChartRows(charts?.intraday5d60m),
    history6mo1d: normalizeChartRows(charts?.history6mo1d).length
      ? normalizeChartRows(charts?.history6mo1d)
      : fallbackDaily
  };
}

function normalizeChartRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((item, index) => ({
    ts: Number(item.ts || 0),
    label: String(item.label || index + 1),
    open: Number(item.open || item.close || 0),
    high: Number(item.high || item.close || 0),
    low: Number(item.low || item.close || 0),
    close: Number(item.close || 0),
    volume: Number(item.volume || 0)
  })).filter((item) => item.close > 0);
}

function normalizeCandles(candles, latestPrice) {
  if (!Array.isArray(candles) || !candles.length) return [];
  return candles.map((item, index) => ({
    label: item.label || String(index + 1),
    open: Number(item.open || item.close || latestPrice || 0),
    high: Number(item.high || item.close || latestPrice || 0),
    low: Number(item.low || item.close || latestPrice || 0),
    close: Number(item.close || latestPrice || 0),
    volume: Number(item.volume || 0)
  }));
}

function aggregateCandles(candles, size) {
  if (!Array.isArray(candles) || !candles.length || size <= 1) return Array.isArray(candles) ? candles : [];
  const rows = [];
  for (let index = 0; index < candles.length; index += size) {
    const chunk = candles.slice(index, index + size);
    if (!chunk.length) continue;
    rows.push({
      ts: Number(chunk[0].ts || 0),
      label: chunk.at(-1).label || chunk[0].label,
      open: Number(chunk[0].open || chunk[0].close || 0),
      high: Math.max(...chunk.map((item) => Number(item.high || item.close || 0))),
      low: Math.min(...chunk.map((item) => Number(item.low || item.close || 0))),
      close: Number(chunk.at(-1).close || 0),
      volume: chunk.reduce((sum, item) => sum + Number(item.volume || 0), 0)
    });
  }
  return rows.filter((item) => item.close > 0);
}

function sanitizeQty(value) {
  return Math.max(1, Math.floor(Number(value || 1)));
}

function calcRate(current, previous) {
  const base = Number(previous || 0);
  return base ? ((Number(current || 0) - base) / base) * 100 : 0;
}

function formatKRW(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")} KRW`;
}

function signedKRW(value) {
  const num = Math.round(Number(value || 0));
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toLocaleString("ko-KR")} KRW`;
}

function signedNumber(value) {
  const num = Math.round(Number(value || 0));
  return `${num > 0 ? "+" : ""}${num.toLocaleString("ko-KR")}원`;
}

function formatPercent(value) {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function formatCompact(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(ts) {
  if (!ts) return "-";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function rateClass(value) {
  const num = Number(value || 0);
  if (num > 0) return "positive";
  if (num < 0) return "negative";
  return "flat";
}

function compareMarketRows(a, b) {
  const ar = Number(a.changeRate || 0);
  const br = Number(b.changeRate || 0);
  const as = ar > 0 ? 1 : ar < 0 ? -1 : 0;
  const bs = br > 0 ? 1 : br < 0 ? -1 : 0;

  if (as !== bs) return bs - as;
  if (as === 1) return br - ar;
  if (as === -1) return br - ar;

  const av = Number(a.volume || 0);
  const bv = Number(b.volume || 0);
  if (bv !== av) return bv - av;
  return String(a.name || "").localeCompare(String(b.name || ""), "ko");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
