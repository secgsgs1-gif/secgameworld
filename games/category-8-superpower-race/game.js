const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("start");
const pickEl = document.getElementById("pick");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const pointsEl = document.getElementById("points");

const NAMES = ["루나","블레이즈","노바","팬텀"];
const COLORS = ["#7bdcff","#ff9f7a","#98ffb3","#e0a4ff"];
const FINISH = 620;
let runners = [];
let running = false;
let winner = -1;
let points = Number(localStorage.getItem("cat8_points") || 100);
pointsEl.textContent = points;

NAMES.forEach((name, i) => {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = `${i + 1}. ${name}`;
  pickEl.appendChild(opt);
});

function addLog(text) {
  const row = document.createElement("div");
  row.textContent = text;
  logEl.prepend(row);
  while (logEl.children.length > 16) logEl.removeChild(logEl.lastChild);
}

function randPowerTime(now) {
  return now + 1200 + Math.random() * 2600;
}

function resetRace() {
  const now = performance.now();
  runners = NAMES.map((n, i) => ({
    name: n,
    y: 55 + i * 62,
    x: 30,
    speed: 1.1 + Math.random() * 0.55,
    boostUntil: 0,
    slowUntil: 0,
    nextPowerAt: randPowerTime(now),
    blinkReadyAt: now + 2200 + Math.random() * 2200
  }));
  winner = -1;
  statusEl.textContent = "레이스 진행 중...";
  logEl.innerHTML = "";
  addLog("레이스 시작");
}

function usePower(i, now) {
  const me = runners[i];
  const roll = Math.random();
  if (roll < 0.4) {
    me.boostUntil = now + 1300;
    addLog(`${me.name} 가속 발동`);
  } else if (roll < 0.7) {
    me.x += 26 + Math.random() * 40;
    addLog(`${me.name} 순간이동 발동`);
  } else {
    const targets = runners.filter((_, idx) => idx !== i);
    const t = targets[Math.floor(Math.random() * targets.length)];
    t.slowUntil = now + 1100;
    addLog(`${me.name} 방해 발동 -> ${t.name} 감속`);
  }
  me.nextPowerAt = randPowerTime(now);
}

function update(now) {
  for (let i = 0; i < runners.length; i += 1) {
    const r = runners[i];
    let v = r.speed;
    if (now < r.boostUntil) v *= 1.9;
    if (now < r.slowUntil) v *= 0.45;
    r.x += v;

    if (now >= r.nextPowerAt) usePower(i, now);

    if (r.x >= FINISH && winner < 0) {
      winner = i;
      running = false;
      const pick = Number(pickEl.value);
      if (pick === winner) {
        points += 70;
        statusEl.textContent = `우승: ${r.name}. 적중 +70`;
      } else {
        points = Math.max(0, points - 25);
        statusEl.textContent = `우승: ${r.name}. 실패 -25`;
      }
      pointsEl.textContent = points;
      localStorage.setItem("cat8_points", String(points));
      addLog(statusEl.textContent);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#89d8ff66";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(FINISH, 20);
  ctx.lineTo(FINISH, 300);
  ctx.stroke();

  runners.forEach((r, i) => {
    ctx.fillStyle = COLORS[i];
    ctx.fillRect(r.x, r.y, 22, 14);
    ctx.fillStyle = "#dff6ff";
    ctx.font = "14px sans-serif";
    ctx.fillText(r.name, 8, r.y + 12);
  });
}

function loop(now) {
  if (running) update(now);
  draw();
  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", () => {
  resetRace();
  running = true;
});

resetRace();
draw();
requestAnimationFrame(loop);
