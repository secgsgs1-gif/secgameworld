const wheelCanvas = document.getElementById("wheel");
const ctx = wheelCanvas.getContext("2d");
const pointsEl = document.getElementById("points");
const lastNumberEl = document.getElementById("last-number");
const betTypeEl = document.getElementById("bet-type");
const numberRowEl = document.getElementById("number-row");
const betNumberEl = document.getElementById("bet-number");
const betAmountEl = document.getElementById("bet-amount");
const spinBtn = document.getElementById("spin");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const die1El = document.getElementById("die-1");
const die2El = document.getElementById("die-2");
const wheelWrapEl = document.getElementById("wheel-wrap");
const toggleWheelBtn = document.getElementById("toggle-wheel");

const TAU = Math.PI * 2;
const POINTER_ANGLE = (3 * Math.PI) / 2;
const MIN_BET = 10;
const MAX_BET = 100000;

const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

let points = 0;
let rotation = 0;
let spinning = false;
const history = [];

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

function renderHistory() {
  historyEl.innerHTML = "";
  history.forEach((n) => {
    const chip = document.createElement("span");
    const col = pocketColor(n);
    chip.className = `chip ${col}`;
    chip.textContent = String(n);
    historyEl.appendChild(chip);
  });
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

function updateStatus(text) {
  statusEl.textContent = text;
}

function syncPoints(nextPoints) {
  points = Number(nextPoints || 0);
  pointsEl.textContent = String(points);
}

async function spinOnce() {
  if (spinning) return;
  const wallet = window.AccountWallet;
  if (!wallet) {
    updateStatus("Wallet not ready.");
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

  spinning = true;
  spinBtn.disabled = true;
  updateStatus("Spinning...");
  resultEl.textContent = "Wheel is rolling...";

  const spent = await wallet.spend(bet.amount, "dice_roulette_bet", {
    type: bet.type,
    number: bet.type === "number" ? bet.number : null
  });
  if (!spent?.ok) {
    spinning = false;
    spinBtn.disabled = false;
    updateStatus("Spend failed.");
    return;
  }

  const resultNumber = Math.floor(Math.random() * 37);
  const finalRotation = rotation + (8 * TAU) + (targetRotationForNumber(resultNumber) - (rotation % TAU));

  await Promise.all([
    animateSpin(finalRotation, 4700),
    animateDice()
  ]);

  setDiceFromNumber(resultNumber);
  lastNumberEl.textContent = String(resultNumber);
  history.unshift(resultNumber);
  if (history.length > 14) history.length = 14;
  renderHistory();

  const multiplier = payoutMultiplier(bet.type);
  const win = isWinningBet(bet, resultNumber);
  let payout = 0;

  if (win) {
    payout = bet.amount * multiplier;
    await wallet.earn(payout, "dice_roulette_win", {
      type: bet.type,
      number: bet.type === "number" ? bet.number : null,
      resultNumber,
      multiplier
    });
  }

  const net = payout - bet.amount;
  const tone = net >= 0 ? "+" : "";
  resultEl.textContent = `Result ${resultNumber} (${pocketColor(resultNumber).toUpperCase()}) · ${win ? "WIN" : "LOSE"} · Net ${tone}${net}`;
  updateStatus("Ready");
  spinning = false;
  spinBtn.disabled = false;
}

function setupUi() {
  drawWheel();
  renderHistory();

  betTypeEl.addEventListener("change", () => {
    numberRowEl.hidden = betTypeEl.value !== "number";
  });

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
    spinOnce().catch((err) => {
      updateStatus(`Spin failed: ${err.message}`);
      spinning = false;
      spinBtn.disabled = false;
    });
  });
}

function bootWallet() {
  const wallet = window.AccountWallet;
  if (!wallet) return false;
  syncPoints(wallet.getPoints());
  wallet.onChange((p) => syncPoints(p));
  return true;
}

setupUi();

if (!bootWallet()) {
  document.addEventListener("app:wallet-ready", () => {
    bootWallet();
  }, { once: true });
}
