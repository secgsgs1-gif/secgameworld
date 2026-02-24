const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const pickEl = document.getElementById("pick");
const betEl = document.getElementById("bet");
const spinBtn = document.getElementById("spin");
const pointsEl = document.getElementById("points");
const resultEl = document.getElementById("result");

const TAU = Math.PI * 2;
const POINTER_ANGLE = (3 * Math.PI) / 2;
const slots = [1, 3, 1, 5, 1, 10, 1, 3, 1, 5, 1, 20, 1, 3, 1, 5, 1, 10, 1, 3];

let wallet = null;
let points = 0;
let rotation = 0;
let spinning = false;

[1, 3, 5, 10, 20].forEach((v) => {
  const opt = document.createElement("option");
  opt.value = String(v);
  opt.textContent = `x${v}`;
  pickEl.appendChild(opt);
});

function bindWallet() {
  wallet = window.AccountWallet || null;
  if (!wallet) return;
  wallet.onChange((next) => {
    points = next;
    pointsEl.textContent = `포인트: ${points}`;
  });
}

function slotColor(v) {
  if (v >= 20) return "#b23a48";
  if (v >= 10) return "#c87a2d";
  if (v >= 5) return "#8a7f2d";
  if (v >= 3) return "#3b7a4f";
  return "#32557a";
}

function drawGearRing(cx, cy, r) {
  const teeth = 36;
  for (let i = 0; i < teeth; i += 1) {
    const a = (i / teeth) * TAU;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.fillStyle = i % 2 === 0 ? "#6e5241" : "#8a6a53";
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

function currentMultiplier() {
  const arc = TAU / slots.length;
  const normalizedRotation = ((rotation % TAU) + TAU) % TAU;
  const relative = ((POINTER_ANGLE - normalizedRotation) % TAU + TAU) % TAU;
  const idx = Math.floor(relative / arc) % slots.length;
  return slots[idx];
}

function animateTo(target, done) {
  const start = rotation;
  const diff = target - start;
  const duration = 2100;
  const t0 = performance.now();

  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    rotation = start + diff * ease;
    drawWheel();
    if (t < 1) requestAnimationFrame(step);
    else done();
  }

  requestAnimationFrame(step);
}

async function applyDelta(delta) {
  if (!wallet || delta === 0) return { ok: true };
  if (delta > 0) {
    await wallet.earn(delta, "roulette_v2_reward", { game: "category-13-roulette-v2" });
    return { ok: true };
  }
  return wallet.spend(-delta, "roulette_v2_loss", { game: "category-13-roulette-v2" });
}

function spin() {
  if (spinning || !wallet) return;
  const pick = Number(pickEl.value);
  const bet = Math.max(5, Math.min(200, Number(betEl.value) || 0));

  if (bet > points) {
    resultEl.textContent = "포인트가 부족합니다.";
    return;
  }

  spinning = true;
  resultEl.textContent = "회전 중...";

  const target = rotation + (8 + Math.random() * 4) * TAU + Math.random() * TAU;
  animateTo(target, async () => {
    const out = currentMultiplier();
    const delta = out === pick ? bet * out : -bet;

    const tx = await applyDelta(delta);
    if (!tx.ok) {
      resultEl.textContent = "포인트 처리 실패";
      spinning = false;
      return;
    }

    const sign = delta >= 0 ? "+" : "";
    resultEl.textContent = `결과 x${out} / ${sign}${delta} 포인트`;
    spinning = false;
  });
}

spinBtn.addEventListener("click", spin);
document.addEventListener("app:wallet-ready", bindWallet);
if (window.AccountWallet) bindWallet();
drawWheel();
