const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

const gridSize = 20;
const cellCount = canvas.width / gridSize;

let snake = [];
let food = null;
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let score = 0;
let best = Number(localStorage.getItem("snake_best") || 0);
let running = false;
let gameOver = false;
let tickMs = 130;
let lastTick = 0;

bestEl.textContent = best;

function resetGame() {
  const c = Math.floor(cellCount / 2);
  snake = [
    { x: c, y: c },
    { x: c - 1, y: c },
    { x: c - 2, y: c }
  ];

  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  tickMs = 130;
  gameOver = false;
  scoreEl.textContent = score;
  placeFood();
}

function placeFood() {
  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * cellCount),
      y: Math.floor(Math.random() * cellCount)
    };

    if (!snake.some((p) => p.x === candidate.x && p.y === candidate.y)) {
      food = candidate;
      return;
    }
  }
}

function setDirection(dir) {
  const opposite = direction.x + dir.x === 0 && direction.y + dir.y === 0;
  if (!opposite) nextDirection = dir;
}

function update() {
  direction = nextDirection;
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y
  };

  const hitWall = newHead.x < 0 || newHead.x >= cellCount || newHead.y < 0 || newHead.y >= cellCount;
  const hitSelf = snake.some((p) => p.x === newHead.x && p.y === newHead.y);

  if (hitWall || hitSelf) {
    running = false;
    gameOver = true;
    overlayTitle.textContent = "Game Over";
    overlayText.textContent = "Press Space to restart";
    overlay.classList.remove("hidden");
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === food.x && newHead.y === food.y) {
    score += 10;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem("snake_best", String(best));
    }
    tickMs = Math.max(70, tickMs - 2);
    placeFood();
  } else {
    snake.pop();
  }
}

function drawGrid() {
  ctx.strokeStyle = "rgba(120,200,240,0.08)";
  ctx.lineWidth = 1;

  for (let i = 1; i < cellCount; i += 1) {
    const p = i * gridSize;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(canvas.width, p);
    ctx.stroke();
  }
}

function drawCell(x, y, color, radius = 4) {
  const px = x * gridSize;
  const py = y * gridSize;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px + 1, py + 1, gridSize - 2, gridSize - 2, radius);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  drawCell(food.x, food.y, "#ff7d7d", 8);

  snake.forEach((part, idx) => {
    const color = idx === 0 ? "#66ffcc" : "#2fd19a";
    drawCell(part.x, part.y, color, idx === 0 ? 6 : 4);
  });
}

function loop(ts) {
  if (running && ts - lastTick >= tickMs) {
    lastTick = ts;
    update();
  }

  render();
  requestAnimationFrame(loop);
}

function start() {
  if (!running) {
    if (gameOver) resetGame();
    running = true;
    overlay.classList.add("hidden");
  }
}

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  if (key === " " || key === "enter") {
    start();
    return;
  }

  if (key === "arrowup" || key === "w") setDirection({ x: 0, y: -1 });
  if (key === "arrowdown" || key === "s") setDirection({ x: 0, y: 1 });
  if (key === "arrowleft" || key === "a") setDirection({ x: -1, y: 0 });
  if (key === "arrowright" || key === "d") setDirection({ x: 1, y: 0 });
});

document.querySelectorAll(".controls button").forEach((btn) => {
  btn.addEventListener("click", () => {
    start();
    const d = btn.dataset.dir;
    if (d === "up") setDirection({ x: 0, y: -1 });
    if (d === "down") setDirection({ x: 0, y: 1 });
    if (d === "left") setDirection({ x: -1, y: 0 });
    if (d === "right") setDirection({ x: 1, y: 0 });
  });
});

resetGame();
render();
requestAnimationFrame(loop);
