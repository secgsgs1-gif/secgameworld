const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const pick = document.getElementById("pick");
const start = document.getElementById("start");
const statusEl = document.getElementById("status");
const ptEl = document.getElementById("pt");

const names = ["Astra", "Bolt", "Crow", "Dune"];
const colors = ["#7be0ff", "#ffd28d", "#97ffb2", "#f9a2ff"];
const finish = 620;

let racers = [];
let run = false;
let settling = false;
let points = 0;
let wallet = null;

function bindWallet() {
  wallet = window.AccountWallet || null;
  if (!wallet) return;
  wallet.onChange((next) => {
    points = next;
    ptEl.textContent = points;
  });
}

names.forEach((n, i) => {
  const o = document.createElement("option");
  o.value = i;
  o.textContent = `${i + 1}. ${n}`;
  pick.appendChild(o);
});

function reset() {
  racers = names.map((n, i) => ({ n, x: 26, y: 50 + i * 58, s: 1 + Math.random() * 0.8 }));
  run = true;
  settling = false;
  statusEl.textContent = "진행 중";
}

async function settle(winnerIndex) {
  const ok = Number(pick.value) === winnerIndex;
  if (!wallet) return;

  if (ok) {
    await wallet.earn(55, "ai_bet_win", { game: "category-10-ai-betting" });
    statusEl.textContent = `우승 ${racers[winnerIndex].n} / 적중 +55`;
  } else {
    const loss = Math.min(20, points);
    const spent = await wallet.spend(loss, "ai_bet_loss", { game: "category-10-ai-betting" });
    statusEl.textContent = spent.ok
      ? `우승 ${racers[winnerIndex].n} / 실패 -${loss}`
      : `우승 ${racers[winnerIndex].n} / 포인트 부족`;
  }

  settling = false;
}

function step() {
  racers.forEach((r) => {
    r.s += (Math.random() - 0.48) * 0.08;
    r.s = Math.max(0.75, Math.min(2.3, r.s));
    if (Math.random() < 0.03) r.s *= 1.22;
    r.x += r.s;
  });

  const w = racers.findIndex((r) => r.x >= finish);
  if (w >= 0) {
    run = false;
    settling = true;
    settle(w);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#9ac4ff66";
  ctx.beginPath();
  ctx.moveTo(finish, 16);
  ctx.lineTo(finish, 270);
  ctx.stroke();
  racers.forEach((r, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(r.x, r.y, 24, 14);
    ctx.fillStyle = "#eaf4ff";
    ctx.fillText(r.n, 8, r.y + 12);
  });
}

function loop() {
  if (run && !settling) step();
  draw();
  requestAnimationFrame(loop);
}

start.addEventListener("click", () => {
  if (settling) return;
  reset();
});

document.addEventListener("app:wallet-ready", bindWallet);
if (window.AccountWallet) bindWallet();
reset();
loop();
