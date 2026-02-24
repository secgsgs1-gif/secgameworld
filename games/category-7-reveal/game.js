const sceneCanvas = document.getElementById("scene");
const maskCanvas = document.getElementById("mask");
const sctx = sceneCanvas.getContext("2d");
const mctx = maskCanvas.getContext("2d");

const timeEl = document.getElementById("time");
const revealEl = document.getElementById("reveal");
const scoreEl = document.getElementById("score");
const msgEl = document.getElementById("msg");
const nextBtn = document.getElementById("next");
const choiceButtons = Array.from(document.querySelectorAll(".choice"));

const W = sceneCanvas.width;
const H = sceneCanvas.height;
const brush = 18;
const cell = 8;
const cols = Math.ceil(W / cell);
const rows = Math.ceil(H / cell);

let themes = [];
let current = null;
let drawing = false;
let revealed = new Set();
let roundActive = false;
let timerId = null;
let timeLeft = 30;
let score = 0;

function themeBeach() {
  sctx.clearRect(0, 0, W, H);
  const sky = sctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#87cfff");
  sky.addColorStop(0.55, "#bde7ff");
  sky.addColorStop(0.56, "#2e8fc9");
  sky.addColorStop(1, "#f3d59d");
  sctx.fillStyle = sky;
  sctx.fillRect(0, 0, W, H);

  sctx.fillStyle = "#ffd66b";
  sctx.beginPath();
  sctx.arc(360, 55, 34, 0, Math.PI * 2);
  sctx.fill();

  sctx.fillStyle = "#fff";
  sctx.fillRect(80, 70, 130, 12);
  sctx.fillRect(240, 90, 110, 10);

  sctx.fillStyle = "#34b36a";
  sctx.fillRect(42, 165, 10, 80);
  sctx.beginPath();
  sctx.moveTo(47, 120);
  sctx.lineTo(15, 180);
  sctx.lineTo(47, 168);
  sctx.lineTo(79, 180);
  sctx.closePath();
  sctx.fill();
}

function themeCity() {
  sctx.clearRect(0, 0, W, H);
  const bg = sctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#89a8ff");
  bg.addColorStop(1, "#2b335a");
  sctx.fillStyle = bg;
  sctx.fillRect(0, 0, W, H);

  sctx.fillStyle = "#1b1f3d";
  const blocks = [
    [25, 95, 62, 185], [96, 65, 72, 215], [178, 115, 58, 165],
    [246, 48, 88, 232], [342, 84, 70, 196]
  ];
  blocks.forEach(([x, y, w, h]) => sctx.fillRect(x, y, w, h));

  sctx.fillStyle = "#ffe58c";
  blocks.forEach(([x, y, w, h]) => {
    for (let cx = x + 8; cx < x + w - 5; cx += 14) {
      for (let cy = y + 10; cy < y + h - 5; cy += 16) {
        if (Math.random() < 0.55) sctx.fillRect(cx, cy, 7, 9);
      }
    }
  });

  sctx.fillStyle = "#3f4659";
  sctx.fillRect(0, 250, W, 30);
}

function themeForest() {
  sctx.clearRect(0, 0, W, H);
  const g = sctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#b5ecff");
  g.addColorStop(0.6, "#7ecf95");
  g.addColorStop(1, "#4a8d54");
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 8; i += 1) {
    const x = 20 + i * 54 + Math.random() * 12;
    const h = 90 + Math.random() * 70;
    const w = 14 + Math.random() * 8;

    sctx.fillStyle = "#744728";
    sctx.fillRect(x, 280 - h, w, h);

    sctx.fillStyle = "#2e9b56";
    sctx.beginPath();
    sctx.arc(x + w / 2, 280 - h - 12, 26 + Math.random() * 8, 0, Math.PI * 2);
    sctx.fill();
  }
}

themes = [
  { name: "해변", draw: themeBeach },
  { name: "도시", draw: themeCity },
  { name: "숲", draw: themeForest }
];

function fillMask() {
  mctx.globalCompositeOperation = "source-over";
  mctx.clearRect(0, 0, W, H);
  mctx.fillStyle = "#111c";
  mctx.fillRect(0, 0, W, H);

  mctx.fillStyle = "#d4d9ff";
  mctx.font = "bold 28px sans-serif";
  mctx.textAlign = "center";
  mctx.fillText("벗겨서 정답 맞히기", W / 2, H / 2);
}

function markReveal(x, y) {
  const minC = Math.max(0, Math.floor((x - brush) / cell));
  const maxC = Math.min(cols - 1, Math.ceil((x + brush) / cell));
  const minR = Math.max(0, Math.floor((y - brush) / cell));
  const maxR = Math.min(rows - 1, Math.ceil((y + brush) / cell));

  for (let c = minC; c <= maxC; c += 1) {
    for (let r = minR; r <= maxR; r += 1) {
      const cx = c * cell + cell / 2;
      const cy = r * cell + cell / 2;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= brush ** 2) {
        revealed.add(`${c},${r}`);
      }
    }
  }

  const percent = Math.floor((revealed.size / (cols * rows)) * 100);
  revealEl.textContent = String(percent);
}

function eraseAt(clientX, clientY) {
  if (!roundActive) return;
  const rect = maskCanvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * W;
  const y = ((clientY - rect.top) / rect.height) * H;

  mctx.globalCompositeOperation = "destination-out";
  mctx.beginPath();
  mctx.arc(x, y, brush, 0, Math.PI * 2);
  mctx.fill();
  markReveal(x, y);
}

function setChoices() {
  const names = themes.map((t) => t.name);
  const shuffled = [...names].sort(() => Math.random() - 0.5);
  choiceButtons.forEach((btn, i) => {
    btn.textContent = shuffled[i];
    btn.dataset.choice = shuffled[i];
    btn.disabled = false;
  });
}

function endRound(success, reason) {
  roundActive = false;
  clearInterval(timerId);
  choiceButtons.forEach((b) => { b.disabled = true; });

  if (success) {
    const bonus = 60 + timeLeft * 2;
    score += bonus;
    scoreEl.textContent = String(score);
    msgEl.textContent = `정답! +${bonus}점 (${current.name})`;
  } else {
    msgEl.textContent = `${reason} 정답은 ${current.name}`;
  }
}

function startRound() {
  current = themes[Math.floor(Math.random() * themes.length)];
  current.draw();
  fillMask();
  setChoices();

  revealed = new Set();
  revealEl.textContent = "0";
  timeLeft = 30;
  timeEl.textContent = String(timeLeft);
  msgEl.textContent = "드래그해서 벗긴 뒤 아래 보기에서 선택하세요.";
  roundActive = true;

  clearInterval(timerId);
  timerId = setInterval(() => {
    if (!roundActive) return;
    timeLeft -= 1;
    timeEl.textContent = String(Math.max(0, timeLeft));
    if (timeLeft <= 0) endRound(false, "시간 종료.");
  }, 1000);
}

choiceButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!roundActive) return;
    const picked = btn.dataset.choice;
    if (picked === current.name) endRound(true, "");
    else endRound(false, "오답.");
  });
});

maskCanvas.addEventListener("pointerdown", (e) => {
  drawing = true;
  eraseAt(e.clientX, e.clientY);
});
maskCanvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  eraseAt(e.clientX, e.clientY);
});
window.addEventListener("pointerup", () => { drawing = false; });

nextBtn.addEventListener("click", startRound);

startRound();
