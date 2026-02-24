const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin");
const guessNumEl = document.getElementById("guess-number");
const guessColorEl = document.getElementById("guess-color");
const pointsEl = document.getElementById("points");
const resultEl = document.getElementById("result");

const numbers = Array.from({ length: 10 }, (_, i) => i);
const colorOf = (n) => (n === 0 ? "green" : n % 2 === 0 ? "black" : "red");
const TAU = Math.PI * 2;
const POINTER_ANGLE = Math.PI / 2; // bottom pointer (points upward)

let points = 200;
let spinning = false;
let rotation = 0;

numbers.forEach((n) => {
  const opt = document.createElement("option");
  opt.value = String(n);
  opt.textContent = String(n);
  guessNumEl.appendChild(opt);
});

function drawWheel() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = 145;
  const arc = TAU / numbers.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let i = 0; i < numbers.length; i += 1) {
    const s = i * arc;
    const e = s + arc;
    const num = numbers[i];
    const color = colorOf(num);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, s, e);
    ctx.closePath();
    ctx.fillStyle = color === "red" ? "#d33" : color === "black" ? "#111" : "#1f9d49";
    ctx.fill();

    ctx.save();
    ctx.rotate(s + arc / 2);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(num), r * 0.75, 6);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fillStyle = "#f4e6ef";
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffd3e6";
  ctx.beginPath();
  ctx.moveTo(cx, canvas.height - 8);
  ctx.lineTo(cx - 12, canvas.height - 30);
  ctx.lineTo(cx + 12, canvas.height - 30);
  ctx.closePath();
  ctx.fill();
}

function currentNumber() {
  const arc = TAU / numbers.length;
  const normalizedRotation = ((rotation % TAU) + TAU) % TAU;
  const relative = ((POINTER_ANGLE - normalizedRotation) % TAU + TAU) % TAU;
  const idx = Math.floor(relative / arc) % numbers.length;
  return numbers[idx];
}

function animateTo(target, done) {
  const start = rotation;
  const change = target - start;
  const dur = 1800;
  const st = performance.now();

  function step(now) {
    const t = Math.min(1, (now - st) / dur);
    const ease = 1 - Math.pow(1 - t, 3);
    rotation = start + change * ease;
    drawWheel();
    if (t < 1) requestAnimationFrame(step);
    else done();
  }

  requestAnimationFrame(step);
}

function spin() {
  if (spinning) return;
  spinning = true;
  resultEl.textContent = "회전 중...";

  const extraTurns = 8 + Math.random() * 3;
  const stopAngle = Math.random() * TAU;
  const target = rotation + extraTurns * TAU + stopAngle;

  animateTo(target, () => {
    const num = currentNumber();
    const color = colorOf(num);
    const pickNum = Number(guessNumEl.value);
    const pickColor = guessColorEl.value;

    let gain = -10;
    if (pickNum === num) gain += 90;
    if (pickColor !== "none" && pickColor === color) gain += 25;

    points = Math.max(0, points + gain);
    pointsEl.textContent = `포인트: ${points}`;

    const colorKo = color === "red" ? "빨강" : color === "black" ? "검정" : "초록";
    const sign = gain >= 0 ? "+" : "";
    resultEl.textContent = `결과 ${num}(${colorKo}) / ${sign}${gain} 포인트`;

    spinning = false;
  });
}

spinBtn.addEventListener("click", spin);

drawWheel();
