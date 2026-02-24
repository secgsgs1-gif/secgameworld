const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

const keys = new Set();

const paddle = { width: 78, height: 10, x: 161, y: 276, speed: 4.6 };
const ball = { x: 200, y: 210, r: 7, vx: 2.4, vy: -2.4 };

const brickRows = 5;
const brickCols = 8;
const brickWidth = 42;
const brickHeight = 14;
const brickGap = 6;
const brickStartX = 11;
const brickStartY = 36;

let bricks = [];
let score = 0;
let lives = 3;
let running = false;
let ended = false;

function resetBricks() {
  bricks = [];
  for (let r = 0; r < brickRows; r += 1) {
    for (let c = 0; c < brickCols; c += 1) {
      bricks.push({
        x: brickStartX + c * (brickWidth + brickGap),
        y: brickStartY + r * (brickHeight + brickGap),
        alive: true
      });
    }
  }
}

function resetBall() {
  ball.x = canvas.width / 2;
  ball.y = 210;
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * 2.4;
  ball.vy = -2.4;
}

function resetGame() {
  paddle.x = (canvas.width - paddle.width) / 2;
  score = 0;
  lives = 3;
  ended = false;
  running = false;
  resetBricks();
  resetBall();
}

function startGame() {
  if (!running) {
    if (ended) resetGame();
    running = true;
  }
}

function updatePaddle() {
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");

  if (left) paddle.x -= paddle.speed;
  if (right) paddle.x += paddle.speed;

  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x - ball.r <= 0 || ball.x + ball.r >= canvas.width) ball.vx *= -1;
  if (ball.y - ball.r <= 0) ball.vy *= -1;

  const inPaddleX = ball.x >= paddle.x && ball.x <= paddle.x + paddle.width;
  const onPaddleY = ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.height;
  if (inPaddleX && onPaddleY && ball.vy > 0) {
    const hit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    ball.vx = hit * 3.1;
    ball.vy = -Math.abs(ball.vy);
  }

  for (const brick of bricks) {
    if (!brick.alive) continue;
    const hitX = ball.x + ball.r > brick.x && ball.x - ball.r < brick.x + brickWidth;
    const hitY = ball.y + ball.r > brick.y && ball.y - ball.r < brick.y + brickHeight;
    if (hitX && hitY) {
      brick.alive = false;
      score += 10;
      ball.vy *= -1;
      break;
    }
  }

  if (ball.y - ball.r > canvas.height) {
    lives -= 1;
    if (lives <= 0) {
      running = false;
      ended = true;
    } else {
      resetBall();
    }
  }

  const aliveCount = bricks.filter((b) => b.alive).length;
  if (aliveCount === 0) {
    running = false;
    ended = true;
  }
}

function drawText() {
  ctx.fillStyle = "#e9f0ff";
  ctx.font = "15px sans-serif";
  ctx.fillText(`Score: ${score}`, 12, 20);
  ctx.fillText(`Lives: ${lives}`, 320, 20);

  if (!running) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#e9f0ff";
    ctx.font = "18px sans-serif";
    if (ended) {
      const left = bricks.filter((b) => b.alive).length;
      const msg = left === 0 ? "Clear!" : "Game Over";
      ctx.fillText(msg, canvas.width / 2, canvas.height / 2 - 6);
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

  for (const brick of bricks) {
    if (!brick.alive) continue;
    ctx.fillStyle = "#8ad7ff";
    ctx.fillRect(brick.x, brick.y, brickWidth, brickHeight);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();

  drawText();
}

function loop() {
  if (running) {
    updatePaddle();
    updateBall();
  } else {
    updatePaddle();
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
