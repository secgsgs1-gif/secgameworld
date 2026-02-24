import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224j";

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const countdownEl = document.getElementById("countdown");
const roundStatusEl = document.getElementById("round-status");
const pointsEl = document.getElementById("points");
const placeBetBtn = document.getElementById("place-bet");
const resultEl = document.getElementById("result");

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
const SPIN_INTERVAL_MS = 180000;
const SPIN_DURATION_MS = 6300;
const RESULT_HOLD_MS = 5000;

const slots = [1, 3, 1, 5, 1, 10, 1, 3, 1, 5, 1, 20, 1, 3, 1, 5, 1, 10, 1, 3];

let user = null;
let username = "";
let points = 0;
let rotation = 0;
let state = null;
let currentRoundBetsUnsub = null;
let countdownTimer = null;
let animatedRound = -1;

const stateRef = doc(db, "roulette_v2_state", "global");

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
      const ease = 1 - Math.pow(1 - t, 3);
      rotation = start + diff * ease;
      drawWheel();
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function updateCountdown() {
  if (!state) return;
  const now = Date.now();

  if (state.status === "betting") {
    const ms = Math.max(0, (state.spinAtMs || 0) - now);
    const m = String(Math.floor(ms / 60000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    countdownEl.textContent = `${m}:${s}`;
  } else if (state.status === "spinning") {
    countdownEl.textContent = "회전 중";
  } else {
    countdownEl.textContent = "결과 표시";
  }
}

async function ensureState() {
  const snap = await getDoc(stateRef);
  if (snap.exists()) return;

  const now = Date.now();
  await setDoc(stateRef, {
    roundId: 1,
    status: "betting",
    spinAtMs: now + SPIN_INTERVAL_MS,
    spinningEndMs: 0,
    resultIdx: -1,
    resultMultiplier: 0,
    updatedAt: serverTimestamp()
  });
}

async function maybeStartSpin() {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    if (!snap.exists()) return;
    const s = snap.data();
    const now = Date.now();
    if (s.status !== "betting" || now < s.spinAtMs) return;

    const idx = Math.floor(Math.random() * slots.length);
    tx.update(stateRef, {
      status: "spinning",
      resultIdx: idx,
      resultMultiplier: slots[idx],
      spinningEndMs: now + SPIN_DURATION_MS,
      updatedAt: serverTimestamp()
    });
  });
}

async function maybeFinishSpin() {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    if (!snap.exists()) return;
    const s = snap.data();
    const now = Date.now();
    if (s.status !== "spinning" || now < (s.spinningEndMs || 0)) return;

    tx.update(stateRef, {
      status: "done",
      updatedAt: serverTimestamp()
    });
  });
}

async function maybeStartNextRound() {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stateRef);
    if (!snap.exists()) return;
    const s = snap.data();
    const now = Date.now();
    if (s.status !== "done" || now < (s.spinningEndMs || 0) + RESULT_HOLD_MS) return;

    const nextRound = (s.roundId || 1) + 1;
    tx.set(doc(db, "roulette_v2_rounds", String(nextRound)), { createdAt: serverTimestamp() }, { merge: true });
    tx.update(stateRef, {
      roundId: nextRound,
      status: "betting",
      spinAtMs: now + SPIN_INTERVAL_MS,
      spinningEndMs: 0,
      resultIdx: -1,
      resultMultiplier: 0,
      updatedAt: serverTimestamp()
    });
  });
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
  if (!state || state.status !== "betting") {
    resultEl.textContent = "배팅 시간 아님";
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

  const roundId = String(state.roundId || 1);
  const betRef = doc(db, "roulette_v2_rounds", roundId, "bets", user.uid);
  const existing = await getDoc(betRef);
  if (existing.exists()) {
    resultEl.textContent = "이번 라운드는 이미 배팅 완료";
    return;
  }

  const spend = await window.AccountWallet.spend(total, "roulette_v2_bet", { game: "category-13-roulette-v2", roundId });
  if (!spend.ok) {
    resultEl.textContent = "포인트 차감 실패";
    return;
  }

  await setDoc(betRef, {
    uid: user.uid,
    username,
    amounts,
    total,
    settled: false,
    createdAt: serverTimestamp()
  });

  resultEl.textContent = `배팅 완료: 총 ${total}`;
}

async function settleMyBet(roundId, resultMultiplier) {
  const betRef = doc(db, "roulette_v2_rounds", String(roundId), "bets", user.uid);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (tx) => {
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) return;

    const bet = betSnap.data();
    if (bet.settled) return;

    const hitAmount = Number(bet.amounts?.[String(resultMultiplier)] || 0);
    const payout = hitAmount > 0 ? hitAmount * resultMultiplier : 0;

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

  const myBet = await getDoc(betRef);
  if (myBet.exists()) {
    const d = myBet.data();
    if (d.payout > 0) resultEl.textContent = `당첨! x${resultMultiplier}, +${d.payout}`;
    else resultEl.textContent = `미당첨. 결과 x${resultMultiplier}`;
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
    const ul = bettorsEls[m];
    ul.innerHTML = "";
    map[m].forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      ul.appendChild(li);
    });
  });
}

async function animateForSpin(roundId, idx) {
  if (animatedRound === roundId) return;
  animatedRound = roundId;

  const base = targetRotationForIndex(idx);
  const target = rotation + (12 * TAU) + (base - (rotation % TAU));
  await animateTo(target, SPIN_DURATION_MS);
}

function attachRoundBets(roundId) {
  if (currentRoundBetsUnsub) currentRoundBetsUnsub();
  const q = query(collection(db, "roulette_v2_rounds", String(roundId), "bets"), orderBy("createdAt", "asc"));
  currentRoundBetsUnsub = onSnapshot(q, (snap) => {
    renderBettors(snap.docs);
  });
}

async function init() {
  await ensureState();

  const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = p.username || (user.email || "user").split("@")[0];
    points = p.points || 0;
    pointsEl.textContent = String(points);
  });

  onSnapshot(stateRef, async (snap) => {
    if (!snap.exists()) return;
    state = snap.data();

    roundStatusEl.textContent = state.status;
    attachRoundBets(state.roundId || 1);

    if (state.status === "spinning" && state.resultIdx >= 0) {
      await animateForSpin(state.roundId || 1, state.resultIdx);
    }

    if (state.status === "done" && state.resultMultiplier) {
      settleMyBet(state.roundId || 1, state.resultMultiplier).catch(() => {});
    }
  });

  placeBetBtn.addEventListener("click", () => {
    placeBet().catch((e) => {
      resultEl.textContent = `오류: ${e.message}`;
    });
  });

  drawWheel();

  countdownTimer = setInterval(() => {
    updateCountdown();
    maybeStartSpin().catch(() => {});
    maybeFinishSpin().catch(() => {});
    maybeStartNextRound().catch(() => {});
  }, 1000);

  window.addEventListener("beforeunload", () => {
    if (countdownTimer) clearInterval(countdownTimer);
    unsubProfile?.();
    currentRoundBetsUnsub?.();
  });
}

document.addEventListener("app:user-ready", (e) => {
  user = e.detail.user;
  init().catch((err) => {
    resultEl.textContent = `오류: ${err.message}`;
  });
});

if (window.__AUTH_USER__) {
  user = window.__AUTH_USER__;
  init().catch((err) => {
    resultEl.textContent = `오류: ${err.message}`;
  });
}
