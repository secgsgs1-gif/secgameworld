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

const wheelCanvas = document.getElementById("wheel");
const ctx = wheelCanvas.getContext("2d");
const pointsEl = document.getElementById("points");
const lastNumberEl = document.getElementById("last-number");
const countdownEl = document.getElementById("countdown");
const roundStatusEl = document.getElementById("round-status");
const roundIdEl = document.getElementById("round-id");
const betTypeEl = document.getElementById("bet-type");
const numberRowEl = document.getElementById("number-row");
const betNumberEl = document.getElementById("bet-number");
const betAmountEl = document.getElementById("bet-amount");
const spinBtn = document.getElementById("spin");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const betUsersEl = document.getElementById("bet-users");
const historyEl = document.getElementById("history");
const die1El = document.getElementById("die-1");
const die2El = document.getElementById("die-2");
const wheelWrapEl = document.getElementById("wheel-wrap");
const toggleWheelBtn = document.getElementById("toggle-wheel");

const TAU = Math.PI * 2;
const POINTER_ANGLE = (3 * Math.PI) / 2;
const MIN_BET = 10;
const MAX_BET = 100000;
const SPIN_INTERVAL_MS = 180000;
const SPIN_DURATION_MS = 6500;
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ROUNDS_PER_DAY = DAY_MS / SPIN_INTERVAL_MS;

const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

let user = null;
let username = "";
let points = 0;
let rotation = 0;
let spinning = false;
let loopTimer = null;
let booted = false;
let roundBetsUnsub = null;
let observedBetRound = "";
let lastSpinRound = "";
let lastSettledRound = "";
let recentRenderedRound = "";
const roundResultCache = new Map();

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function pocketColor(n) {
  if (n === 0) return "green";
  return RED_SET.has(n) ? "red" : "black";
}

function drawWheel() {
  const cx = wheelCanvas.width / 2;
  const cy = wheelCanvas.height / 2;
  const outer = 210;
  const inner = 120;
  const arc = TAU / WHEEL_NUMBERS.length;

  ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  ctx.beginPath();
  ctx.arc(0, 0, outer + 16, 0, TAU);
  ctx.fillStyle = "#6e4920";
  ctx.fill();

  WHEEL_NUMBERS.forEach((num, i) => {
    const a0 = i * arc;
    const a1 = a0 + arc;
    const col = pocketColor(num);
    const fill = col === "green" ? "#168650" : col === "red" ? "#c33737" : "#161821";

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outer, a0, a1);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#e8e8e8";
    ctx.stroke();

    ctx.save();
    ctx.rotate(a0 + arc / 2);
    ctx.fillStyle = "#f6f0db";
    ctx.font = "bold 16px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(String(num), outer - 28, 5);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, TAU);
  ctx.fillStyle = "#9f6f3a";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, inner - 34, 0, TAU);
  ctx.fillStyle = "#b88953";
  ctx.fill();

  ctx.restore();
}

function setDiceFromNumber(n) {
  const a = (n % 6) + 1;
  const b = (Math.floor(n / 6) % 6) + 1;
  die1El.textContent = String(a);
  die2El.textContent = String(b);
}

function animateDice() {
  let t = 0;
  return new Promise((resolve) => {
    const id = setInterval(() => {
      t += 1;
      die1El.textContent = String(1 + Math.floor(Math.random() * 6));
      die2El.textContent = String(1 + Math.floor(Math.random() * 6));
      if (t >= 18) {
        clearInterval(id);
        resolve();
      }
    }, 80);
  });
}

function indexFromNumber(n) {
  return WHEEL_NUMBERS.indexOf(n);
}

function targetRotationForNumber(n) {
  const idx = indexFromNumber(n);
  const arc = TAU / WHEEL_NUMBERS.length;
  const pocketCenter = idx * arc + arc / 2;
  return POINTER_ANGLE - pocketCenter;
}

function animateSpin(target, durationMs) {
  const start = rotation;
  const diff = target - start;
  const t0 = performance.now();
  return new Promise((resolve) => {
    function tick(now) {
      const p = Math.min(1, (now - t0) / durationMs);
      const ease = 1 - Math.pow(1 - p, 4);
      rotation = start + diff * ease;
      drawWheel();
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

function parseBet() {
  const type = String(betTypeEl.value || "red");
  const amount = Math.floor(Number(betAmountEl.value) || 0);
  const number = Math.floor(Number(betNumberEl.value) || 0);
  return { type, amount, number };
}

function payoutMultiplier(type) {
  if (type === "number") return 36;
  if (type.startsWith("dozen")) return 3;
  return 2;
}

function isWinningBet(bet, n) {
  if (bet.type === "number") return n === bet.number;
  if (bet.type === "red") return RED_SET.has(n);
  if (bet.type === "black") return n !== 0 && !RED_SET.has(n);
  if (bet.type === "odd") return n !== 0 && n % 2 === 1;
  if (bet.type === "even") return n !== 0 && n % 2 === 0;
  if (bet.type === "low") return n >= 1 && n <= 18;
  if (bet.type === "high") return n >= 19 && n <= 36;
  if (bet.type === "dozen1") return n >= 1 && n <= 12;
  if (bet.type === "dozen2") return n >= 13 && n <= 24;
  if (bet.type === "dozen3") return n >= 25 && n <= 36;
  return false;
}

function betTypeLabel(type, number) {
  if (type === "number") return `Number ${number}`;
  if (type === "red") return "Red";
  if (type === "black") return "Black";
  if (type === "odd") return "Odd";
  if (type === "even") return "Even";
  if (type === "low") return "Low 1-18";
  if (type === "high") return "High 19-36";
  if (type === "dozen1") return "Dozen1";
  if (type === "dozen2") return "Dozen2";
  if (type === "dozen3") return "Dozen3";
  return type;
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

  return {
    now,
    dayKey,
    spinAt,
    nextSpinAt,
    inSpin,
    spinningRoundNo,
    bettingRoundNo,
    spinningRoundId: `${dayKey}-R${spinningRoundNo}`,
    bettingRoundId: `${bettingDayKey}-R${bettingRoundNo}`
  };
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function syncPoints(nextPoints) {
  points = Number(nextPoints || 0);
  pointsEl.textContent = String(points);
}

async function getRoundResultNumber(roundId, createIfMissing = true) {
  const key = String(roundId || "");
  if (!key) return 0;
  if (roundResultCache.has(key)) return roundResultCache.get(key);

  const roundRef = doc(db, "dice_roulette_rounds", key);
  if (!createIfMissing) {
    const snap = await getDoc(roundRef);
    const n = Number(snap.data()?.resultNumber);
    if (Number.isInteger(n) && n >= 0 && n <= 36) {
      roundResultCache.set(key, n);
      return n;
    }
    return null;
  }

  const n = await runTransaction(db, async (tx) => {
    const snap = await tx.get(roundRef);
    const existing = Number(snap.data()?.resultNumber);
    if (Number.isInteger(existing) && existing >= 0 && existing <= 36) return existing;

    const next = Math.floor(Math.random() * 37);
    tx.set(roundRef, {
      resultNumber: next,
      generatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return next;
  });

  const safe = (Number.isInteger(n) && n >= 0 && n <= 36) ? n : 0;
  roundResultCache.set(key, safe);
  return safe;
}

async function placeBet() {
  const wallet = window.AccountWallet;
  if (!wallet) {
    updateStatus("Wallet not ready.");
    return;
  }

  const c = currentClock();
  if (c.inSpin) {
    updateStatus("Spinning now. Wait for next betting round.");
    return;
  }

  const bet = parseBet();
  if (!Number.isFinite(bet.amount) || bet.amount < MIN_BET || bet.amount > MAX_BET) {
    updateStatus(`Bet must be ${MIN_BET}~${MAX_BET}.`);
    return;
  }
  if (bet.type === "number" && (bet.number < 0 || bet.number > 36)) {
    updateStatus("Number bet must be 0~36.");
    return;
  }
  if (points < bet.amount) {
    updateStatus("Not enough points.");
    return;
  }

  const roundId = String(c.bettingRoundId);
  const betRef = doc(db, "dice_roulette_rounds", roundId, "bets", user.uid);
  const existing = await getDoc(betRef);
  if (existing.exists()) {
    updateStatus("Already bet in this round.");
    return;
  }

  const spent = await wallet.spend(bet.amount, "dice_roulette_bet", {
    game: "category-22-dice-roulette",
    roundId,
    type: bet.type,
    number: bet.type === "number" ? bet.number : null
  });
  if (!spent?.ok) {
    updateStatus("Point spend failed.");
    return;
  }

  await runTransaction(db, async (tx) => {
    tx.set(betRef, {
      uid: user.uid,
      username,
      type: bet.type,
      number: bet.type === "number" ? bet.number : null,
      amount: bet.amount,
      settled: false,
      createdAt: serverTimestamp()
    });
  });

  updateStatus(`Bet placed: ${betTypeLabel(bet.type, bet.number)} (${bet.amount})`);
}

async function settleMyBet(roundId) {
  if (!roundId || lastSettledRound === roundId) return;

  const resultNumber = await getRoundResultNumber(roundId, true);
  const betRef = doc(db, "dice_roulette_rounds", String(roundId), "bets", user.uid);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (tx) => {
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) return;
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;

    const bet = betSnap.data();
    if (bet.settled) return;

    const pick = {
      type: String(bet.type || ""),
      number: Number(bet.number ?? -1)
    };
    const amount = Math.max(0, Number(bet.amount || 0));
    const mult = payoutMultiplier(pick.type);
    const win = isWinningBet(pick, resultNumber);
    const payout = win ? amount * mult : 0;

    tx.update(betRef, {
      settled: true,
      settledAt: serverTimestamp(),
      resultNumber,
      win,
      payout,
      multiplier: win ? mult : 0
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
  if (!mine.exists()) return;
  const d = mine.data();
  const net = Number(d.payout || 0) - Number(d.amount || 0);
  const tone = net >= 0 ? "+" : "";
  if (d.win) {
    resultEl.textContent = `Round ${roundId} · ${d.resultNumber} (${pocketColor(d.resultNumber).toUpperCase()}) · WIN · Net ${tone}${net}`;
  } else {
    resultEl.textContent = `Round ${roundId} · ${d.resultNumber} (${pocketColor(d.resultNumber).toUpperCase()}) · LOSE · Net ${net}`;
  }
}

function renderBetUsers(docs) {
  betUsersEl.innerHTML = "";
  if (!docs.length) {
    const li = document.createElement("li");
    li.textContent = "No bets yet.";
    betUsersEl.appendChild(li);
    return;
  }

  docs.forEach((snap) => {
    const b = snap.data();
    const li = document.createElement("li");
    const amount = Math.max(0, Number(b.amount || 0));
    li.textContent = `${b.username || "user"}: ${betTypeLabel(b.type, b.number)} (${amount})`;
    betUsersEl.appendChild(li);
  });
}

function attachBetList(roundId) {
  if (observedBetRound === roundId) return;
  observedBetRound = roundId;
  if (roundBetsUnsub) roundBetsUnsub();

  const q = query(
    collection(db, "dice_roulette_rounds", String(roundId), "bets"),
    orderBy("createdAt", "asc"),
    limit(60)
  );

  roundBetsUnsub = onSnapshot(q, (snap) => {
    renderBetUsers(snap.docs);
  }, (err) => {
    updateStatus(`Bet list error: ${err.message}`);
  });
}

async function renderRecentResults(dayKey, lastCompletedRoundNo) {
  historyEl.innerHTML = "";
  for (let i = 0; i < 10; i += 1) {
    const r = lastCompletedRoundNo - i;
    if (r <= 0) break;
    const rid = `${dayKey}-R${r}`;
    const n = await getRoundResultNumber(rid, false);
    const chip = document.createElement("span");
    const cls = n == null ? "black" : pocketColor(n);
    chip.className = `chip ${cls}`;
    chip.textContent = n == null ? `R${r}: ?` : `R${r}: ${n}`;
    historyEl.appendChild(chip);
  }
}

async function tickLoop() {
  const c = currentClock();

  const sec = Math.max(0, Math.floor((c.nextSpinAt - c.now) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  countdownEl.textContent = `${mm}:${ss}`;
  roundStatusEl.textContent = c.inSpin
    ? `Spinning (R${c.spinningRoundNo})`
    : `Betting (R${c.bettingRoundNo})`;
  roundIdEl.textContent = c.bettingRoundId;

  spinBtn.disabled = c.inSpin;

  if (c.inSpin && lastSpinRound !== c.spinningRoundId) {
    lastSpinRound = c.spinningRoundId;
    spinning = true;
    const resultNumber = await getRoundResultNumber(c.spinningRoundId, true);
    const base = targetRotationForNumber(resultNumber);
    const normalized = ((rotation % TAU) + TAU) % TAU;
    const target = rotation + (10 * TAU) + (base - normalized);
    const remain = Math.max(900, (c.spinAt + SPIN_DURATION_MS) - c.now);
    await Promise.all([
      animateSpin(target, remain),
      animateDice()
    ]);
    setDiceFromNumber(resultNumber);
    lastNumberEl.textContent = String(resultNumber);
    spinning = false;
  }

  if (!c.inSpin) {
    attachBetList(c.bettingRoundId);
    settleMyBet(c.spinningRoundId).catch((err) => {
      updateStatus(`Settle error: ${err.message}`);
    });
  }

  if (recentRenderedRound !== c.spinningRoundId) {
    recentRenderedRound = c.spinningRoundId;
    renderRecentResults(c.dayKey, c.spinningRoundNo).catch(() => {});
  }
}

function setupUi() {
  drawWheel();

  const syncNumberInputVisibility = () => {
    const isSingle = betTypeEl.value === "number";
    numberRowEl.hidden = !isSingle;
    betNumberEl.disabled = !isSingle;
  };
  syncNumberInputVisibility();
  betTypeEl.addEventListener("change", syncNumberInputVisibility);

  document.querySelectorAll(".quick-row button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const add = Number(btn.getAttribute("data-amt") || 0);
      const base = Math.floor(Number(betAmountEl.value) || 0);
      betAmountEl.value = String(Math.max(0, base + add));
    });
  });

  toggleWheelBtn.addEventListener("click", () => {
    const hidden = wheelWrapEl.style.display === "none";
    wheelWrapEl.style.display = hidden ? "block" : "none";
    toggleWheelBtn.textContent = hidden ? "Hide Wheel" : "Show Wheel";
  });

  spinBtn.addEventListener("click", () => {
    placeBet().catch((err) => {
      updateStatus(`Bet failed: ${err.message}`);
    });
  });
}

function init() {
  setupUi();

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = normalizeUsername(user, p.username);
    syncPoints(p.points || 0);
  });

  tickLoop().catch(() => {});
  loopTimer = setInterval(() => {
    tickLoop().catch(() => {});
  }, 1000);

  window.addEventListener("beforeunload", () => {
    if (loopTimer) clearInterval(loopTimer);
    if (roundBetsUnsub) roundBetsUnsub();
  });
}

function boot(nextUser) {
  if (booted) return;
  booted = true;
  user = nextUser;
  username = normalizeUsername(user, "");
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
