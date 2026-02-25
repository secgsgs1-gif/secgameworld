import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const countdownEl = document.getElementById("countdown");
const roundStatusEl = document.getElementById("round-status");
const pointsEl = document.getElementById("points");
const placeBetBtn = document.getElementById("place-bet");
const resultEl = document.getElementById("result");
const recentResultsEl = document.getElementById("recent-results");

const betInputs = {
  1: document.getElementById("bet-1"),
  3: document.getElementById("bet-3"),
  5: document.getElementById("bet-5"),
  10: document.getElementById("bet-10"),
  20: document.getElementById("bet-20")
};

const bettorsEls = {
  1: document.getElementById("bettors-1"),
  3: document.getElementById("bettors-3"),
  5: document.getElementById("bettors-5"),
  10: document.getElementById("bettors-10"),
  20: document.getElementById("bettors-20")
};

const TAU = Math.PI * 2;
const POINTER_ANGLE = (3 * Math.PI) / 2;
const SPIN_INTERVAL_MS = 180000; // 3 min
const SPIN_DURATION_MS = 6300; // about 3x old duration
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ROUNDS_PER_DAY = DAY_MS / SPIN_INTERVAL_MS; // 480
const slots = [1, 3, 1, 5, 1, 10, 1, 3, 1, 5, 1, 20, 1, 3, 1, 5, 1, 10, 1, 3];

let user = null;
let username = "";
let points = 0;
let rotation = 0;
let lastSpinRound = "";
let lastSettledRound = "";
let observedBetRound = "";
let roundBetsUnsub = null;
let loopTimer = null;
let booted = false;
let settleBlockedUntil = 0;
let settleBackoffMs = 10000;
let betsPaused = false;

function isQuotaError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "resource-exhausted" || msg.includes("quota exceeded") || msg.includes("resource exhausted");
}

function slotColor(v) {
  if (v >= 20) return "#b23a48";
  if (v >= 10) return "#c87a2d";
  if (v >= 5) return "#8a7f2d";
  if (v >= 3) return "#3b7a4f";
  return "#32557a";
}

function drawGearRing(cx, cy, r) {
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * TAU;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.fillStyle = i % 2 ? "#8a6a53" : "#6e5241";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fill();
  }
}

function drawWheel() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 150;
  const arc = TAU / slots.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGearRing(cx, cy, 186);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let i = 0; i < slots.length; i += 1) {
    const s = i * arc;
    const e = s + arc;
    const val = slots[i];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, s, e);
    ctx.closePath();
    ctx.fillStyle = slotColor(val);
    ctx.fill();
    ctx.strokeStyle = "#2a1d16";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.rotate(s + arc / 2);
    ctx.fillStyle = "#f7ebdc";
    ctx.font = "bold 19px serif";
    ctx.textAlign = "center";
    ctx.fillText(String(val), r * 0.78, 7);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, TAU);
  ctx.fillStyle = "#9f7b61";
  ctx.fill();
  ctx.restore();

  const cx2 = canvas.width / 2;
  ctx.fillStyle = "#eac28d";
  ctx.beginPath();
  ctx.moveTo(cx2, 34);
  ctx.lineTo(cx2 - 14, 8);
  ctx.lineTo(cx2 + 14, 8);
  ctx.closePath();
  ctx.fill();
}

function hashRoundId(roundId) {
  let h = 2166136261 >>> 0;
  const s = String(roundId);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function resultIndexForRound(roundId) {
  const idx = hashRoundId(roundId) % slots.length;
  return Number.isInteger(idx) && idx >= 0 && idx < slots.length ? idx : 0;
}

function targetRotationForIndex(index) {
  const arc = TAU / slots.length;
  const center = index * arc + arc / 2;
  return POINTER_ANGLE - center;
}

function animateTo(targetRotation, duration) {
  const start = rotation;
  const diff = targetRotation - start;
  const t0 = performance.now();

  return new Promise((resolve) => {
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      // Long easing tail for a more dramatic, less abrupt stop.
      const ease = 1 - Math.pow(1 - t, 5);
      const wobble = t > 0.78 ? Math.sin((t - 0.78) * 45) * (1 - t) * 0.012 : 0;
      rotation = start + diff * (ease + wobble);
      drawWheel();
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function currentClock(now = Date.now()) {
  const kstNow = now + KST_OFFSET_MS;
  const dayStartKst = Math.floor(kstNow / DAY_MS) * DAY_MS;
  const dayStartUtc = dayStartKst - KST_OFFSET_MS;
  const dayKey = new Date(dayStartUtc).toISOString().slice(0, 10);

  const elapsedInDay = kstNow - dayStartKst;
  const tickInDay = Math.floor(elapsedInDay / SPIN_INTERVAL_MS);
  const spinAt = dayStartUtc + tickInDay * SPIN_INTERVAL_MS;
  const nextSpinAt = spinAt + SPIN_INTERVAL_MS;
  const inSpin = now >= spinAt && now < spinAt + SPIN_DURATION_MS;
  const spinningRoundNo = tickInDay + 1;
  const bettingRoundNoRaw = spinningRoundNo + 1;
  const bettingCrossDay = bettingRoundNoRaw > ROUNDS_PER_DAY;
  const bettingRoundNo = bettingCrossDay ? 1 : bettingRoundNoRaw;
  const bettingDayKey = bettingCrossDay
    ? new Date(dayStartUtc + DAY_MS).toISOString().slice(0, 10)
    : dayKey;
  const spinningRoundId = `${dayKey}-R${spinningRoundNo}`;
  const bettingRoundId = `${bettingDayKey}-R${bettingRoundNo}`;

  return {
    now,
    dayKey,
    spinAt,
    nextSpinAt,
    inSpin,
    spinningRoundNo,
    bettingRoundNo,
    spinningRoundId,
    bettingRoundId
  };
}

function parseBets() {
  const amounts = {};
  let total = 0;
  Object.keys(betInputs).forEach((k) => {
    const v = Math.max(0, Math.floor(Number(betInputs[k].value) || 0));
    if (v > 0) {
      amounts[k] = v;
      total += v;
    }
  });
  return { amounts, total };
}

async function placeBet() {
  const c = currentClock();
  if (c.inSpin) {
    resultEl.textContent = "회전 중에는 배팅 불가";
    return;
  }

  const { amounts, total } = parseBets();
  if (total <= 0) {
    resultEl.textContent = "배팅 금액을 입력하세요.";
    return;
  }
  if (total > points) {
    resultEl.textContent = "포인트 부족";
    return;
  }

  const roundId = String(c.bettingRoundId);
  const betRef = doc(db, "roulette_v2_rounds", roundId, "bets", user.uid);

  const existing = await getDoc(betRef);
  if (existing.exists()) {
    resultEl.textContent = "이번 라운드 이미 배팅 완료";
    return;
  }

  const spend = await window.AccountWallet.spend(total, "roulette_v2_bet", {
    game: "category-13-roulette-v2",
    roundId
  });
  if (!spend.ok) {
    resultEl.textContent = "포인트 차감 실패";
    return;
  }

  await runTransaction(db, async (tx) => {
    tx.set(betRef, {
      uid: user.uid,
      username,
      amounts,
      total,
      settled: false,
      createdAt: serverTimestamp()
    });
  });

  resultEl.textContent = `배팅 완료: 총 ${total}`;
}

async function settleMyBet(roundId) {
  if (!roundId || lastSettledRound === roundId) return;

  const idx = resultIndexForRound(roundId);
  const resultMultiplier = slots[idx] ?? 1;
  const betRef = doc(db, "roulette_v2_rounds", String(roundId), "bets", user.uid);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (tx) => {
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) return;

    const bet = betSnap.data();
    if (bet.settled) return;

    const hitAmount = Number(bet.amounts?.[String(resultMultiplier)] || 0);
    const payoutMultiplier = resultMultiplier + 1;
    const payout = hitAmount > 0 ? hitAmount * payoutMultiplier : 0;

    tx.update(betRef, {
      settled: true,
      settledAt: serverTimestamp(),
      resultMultiplier,
      payout
    });

    if (payout > 0) {
      tx.update(userRef, {
        points: increment(payout),
        updatedAt: serverTimestamp()
      });
    }
  });

  lastSettledRound = roundId;
  const mine = await getDoc(betRef);
  if (mine.exists()) {
    const d = mine.data();
    if (d.payout > 0) {
      const shownMultiplier = `x${d.resultMultiplier}(원금포함 ${Number(d.resultMultiplier) + 1}배 지급)`;
      resultEl.textContent = `당첨! ${shownMultiplier}, 총 지급 +${d.payout}`;
    }
    else resultEl.textContent = `미당첨. 결과 x${d.resultMultiplier}`;
  }
}

function renderBettors(docs) {
  const map = { 1: [], 3: [], 5: [], 10: [], 20: [] };
  docs.forEach((snap) => {
    const b = snap.data();
    [1, 3, 5, 10, 20].forEach((m) => {
      const amt = Number(b.amounts?.[String(m)] || 0);
      if (amt > 0) map[m].push(`${b.username} (${amt})`);
    });
  });

  [1, 3, 5, 10, 20].forEach((m) => {
    bettorsEls[m].innerHTML = "";
    map[m].forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      bettorsEls[m].appendChild(li);
    });
  });
}

function attachBetList(roundId) {
  if (betsPaused) return;
  if (observedBetRound === roundId) return;
  observedBetRound = roundId;
  if (roundBetsUnsub) roundBetsUnsub();
  const q = query(
    collection(db, "roulette_v2_rounds", String(roundId), "bets"),
    orderBy("createdAt", "asc"),
    limit(30)
  );
  roundBetsUnsub = onSnapshot(
    q,
    (snap) => renderBettors(snap.docs),
    (err) => {
      resultEl.textContent = `권한 오류: ${err.message}`;
    }
  );
}

function renderRecentResults(dayKey, lastCompletedRoundNo) {
  if (!recentResultsEl) return;
  recentResultsEl.innerHTML = "";
  for (let i = 0; i < 10; i += 1) {
    const r = lastCompletedRoundNo - i;
    if (r <= 0) break;
    const rid = `${dayKey}-R${r}`;
    const idx = resultIndexForRound(rid);
    const mult = slots[idx] ?? 1;
    const li = document.createElement("li");
    li.textContent = `R${r}: x${mult}`;
    recentResultsEl.appendChild(li);
  }
}

async function tickLoop() {
  const c = currentClock();

  const sec = Math.max(0, Math.floor((c.nextSpinAt - c.now) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  countdownEl.textContent = `${mm}:${ss}`;

  roundStatusEl.textContent = c.inSpin
    ? `회전중 (Round ${c.spinningRoundNo})`
    : `배팅중 (Round ${c.bettingRoundNo})`;

  if (c.inSpin && lastSpinRound !== c.spinningRoundId) {
    lastSpinRound = c.spinningRoundId;
    const idx = resultIndexForRound(c.spinningRoundId);
    const base = targetRotationForIndex(idx);
    const normalized = ((rotation % TAU) + TAU) % TAU;
    const target = rotation + (12 * TAU) + (base - normalized);
    const remain = Math.max(900, c.spinAt + SPIN_DURATION_MS - c.now);
    await animateTo(target, remain);
  }

  if (!c.inSpin) {
    if (Date.now() >= settleBlockedUntil) {
      settleMyBet(c.spinningRoundId).then(() => {
        settleBackoffMs = 10000;
      }).catch((err) => {
        if (isQuotaError(err)) {
          settleBlockedUntil = Date.now() + settleBackoffMs;
          settleBackoffMs = Math.min(settleBackoffMs * 2, 300000);
          resultEl.textContent = "정산 대기: Firestore 사용량 한도 도달(자동 재시도)";
          return;
        }
        resultEl.textContent = `정산 오류: ${err.message}`;
      });
    }
    attachBetList(c.bettingRoundId);
  }

  renderRecentResults(c.dayKey, c.spinningRoundNo);
}

function init() {
  drawWheel();

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = p.username || (user.email || "user").split("@")[0];
    points = p.points || 0;
    pointsEl.textContent = String(points);
  });

  placeBetBtn.addEventListener("click", () => {
    placeBet().catch((err) => {
      resultEl.textContent = `배팅 오류: ${err.message}`;
    });
  });

  tickLoop().catch(() => {});
  loopTimer = setInterval(() => {
    tickLoop().catch(() => {});
  }, 1000);

  document.addEventListener("visibilitychange", () => {
    betsPaused = document.visibilityState !== "visible";
    if (betsPaused) {
      if (roundBetsUnsub) {
        roundBetsUnsub();
        roundBetsUnsub = null;
      }
      observedBetRound = "";
      return;
    }
    const c = currentClock();
    if (!c.inSpin) attachBetList(c.bettingRoundId);
  });

  window.addEventListener("beforeunload", () => {
    if (loopTimer) clearInterval(loopTimer);
    if (roundBetsUnsub) roundBetsUnsub();
  });
}

function boot(nextUser) {
  if (booted) return;
  booted = true;
  user = nextUser;
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
