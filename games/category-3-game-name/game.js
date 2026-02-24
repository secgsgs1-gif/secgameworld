const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

const keys = new Set();

const player = { x: 186, y: 264, w: 28, h: 20, speed: 4.4 };
let obstacles = [];
let score = 0;
let spawnTimer = 0;
let spawnGap = 42;
let running = false;
let ended = false;

function resetGame() {
  player.x = 186;
  obstacles = [];
  score = 0;
  spawnTimer = 0;
  spawnGap = 42;
  running = false;
  ended = false;
}

function startGame() {
  if (!running) {
    if (ended) resetGame();
    running = true;
  }
}

function spawnObstacle() {
  const w = 24 + Math.random() * 24;
  const h = 14 + Math.random() * 18;
  obstacles.push({
    x: Math.random() * (canvas.width - w),
    y: -h,
    w,
    h,
    vy: 2 + Math.random() * 1.6
  });
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function update() {
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  if (left) player.x -= player.speed;
  if (right) player.x += player.speed;
  player.x = Math.max(0, Math.min(canvas.width - player.w, player.x));

  spawnTimer += 1;
  if (spawnTimer >= spawnGap) {
    spawnTimer = 0;
    spawnObstacle();
  }

  obstacles.forEach((o) => {
    o.y += o.vy;
  });
  obstacles = obstacles.filter((o) => o.y < canvas.height + o.h);

  for (const o of obstacles) {
    if (intersects(player, o)) {
      running = false;
      ended = true;
      break;
    }
  }

  score += 1;
  if (score % 220 === 0) {
    spawnGap = Math.max(18, spawnGap - 2);
    obstacles.forEach((o) => {
      o.vy = Math.min(5.2, o.vy + 0.15);
    });
  }
}

function drawText() {
  ctx.fillStyle = "#f5ebff";
  ctx.font = "15px sans-serif";
  ctx.fillText(`Score: ${score}`, 12, 20);

  if (!running) {
    ctx.textAlign = "center";
    ctx.font = "18px sans-serif";
    if (ended) {
      ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 6);
      ctx.font = "14px sans-serif";
      ctx.fillText("Press Space to restart", canvas.width / 2, canvas.height / 2 + 18);
    } else {
      ctx.fillText("Press Space to start", canvas.width / 2, canvas.height / 2);
    }
    ctx.textAlign = "left";
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#f0b8ff";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = "#ff8585";
  obstacles.forEach((o) => {
    ctx.fillRect(o.x, o.y, o.w, o.h);
  });

  drawText();
}

function loop() {
  if (running) update();
  else {
    const left = keys.has("arrowleft") || keys.has("a");
    const right = keys.has("arrowright") || keys.has("d");
    if (left) player.x -= player.speed;
    if (right) player.x += player.speed;
    player.x = Math.max(0, Math.min(canvas.width - player.w, player.x));
  }
  render();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys.add(key);
  if (key === " ") startGame();
});

document.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

resetGame();
loop();
