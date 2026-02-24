const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const lineCountEl = document.getElementById("line-count");
const startLineEl = document.getElementById("start-line");
const regenBtn = document.getElementById("regen");
const playBtn = document.getElementById("play");
const statusEl = document.getElementById("status");

let lineCount = Number(lineCountEl.value);
let lanes = [];
let rungs = [];
let path = [];
let pathLengths = [];
let totalLen = 0;
let progress = 0;
let running = false;
let activeStartLane = 0;
let topY = 50;
let bottomY = 410;

function setupStartOptions() {
  startLineEl.innerHTML = "";
  for (let i = 0; i < lineCount; i += 1) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${i + 1}번`;
    startLineEl.appendChild(opt);
  }
}

function laneX(index) {
  const left = 50;
  const right = canvas.width - 50;
  return left + (index * (right - left)) / (lineCount - 1);
}

function generateLadder() {
  lanes = Array.from({ length: lineCount }, (_, i) => ({ index: i, x: laneX(i) }));
  rungs = [];

  for (let from = 0; from < lineCount - 1; from += 1) {
    let y = 85;
    while (y < bottomY - 30) {
      if (Math.random() < 0.35) {
        const close = rungs.some((r) => Math.abs(r.y - y) < 22 && (r.from === from || r.from + 1 === from || r.from === from + 1));
        if (!close) rungs.push({ from, y });
      }
      y += 22 + Math.random() * 18;
    }
  }

  rungs.sort((a, b) => a.y - b.y);
}

function buildPath(startLane) {
  const pts = [];
  let current = startLane;
  let currentY = topY;
  pts.push({ x: laneX(current), y: currentY });

  for (const rung of rungs) {
    const touches = rung.from === current || rung.from + 1 === current;
    if (!touches) continue;

    pts.push({ x: laneX(current), y: rung.y });
    current = rung.from === current ? current + 1 : current - 1;
    pts.push({ x: laneX(current), y: rung.y });
    currentY = rung.y;
  }

  pts.push({ x: laneX(current), y: bottomY });
  return { points: pts, endLane: current };
}

function preparePath(points) {
  path = points;
  pathLengths = [];
  totalLen = 0;

  for (let i = 1; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const d = Math.hypot(dx, dy);
    totalLen += d;
    pathLengths.push(totalLen);
  }
}

function pointOnPath(dist) {
  if (path.length < 2) return { x: laneX(0), y: topY };
  if (dist <= 0) return path[0];
  if (dist >= totalLen) return path[path.length - 1];

  for (let i = 0; i < pathLengths.length; i += 1) {
    if (dist <= pathLengths[i]) {
      const prevTotal = i === 0 ? 0 : pathLengths[i - 1];
      const segLen = pathLengths[i] - prevTotal;
      const t = (dist - prevTotal) / segLen;
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        y: path[i].y + (path[i + 1].y - path[i].y) * t
      };
    }
  }

  return path[path.length - 1];
}

function drawLadder() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#caf4ff";
  ctx.lineWidth = 3;
  lanes.forEach((lane, idx) => {
    ctx.beginPath();
    ctx.moveTo(lane.x, topY);
    ctx.lineTo(lane.x, bottomY);
    ctx.stroke();

    ctx.fillStyle = "#d9f8ff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(idx + 1), lane.x, 28);
    ctx.fillText(String(idx + 1), lane.x, 438);
  });

  ctx.strokeStyle = "#66ffbf";
  ctx.lineWidth = 4;
  rungs.forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(laneX(r.from), r.y);
    ctx.lineTo(laneX(r.from + 1), r.y);
    ctx.stroke();
  });

  if (path.length > 0) {
    ctx.strokeStyle = "#ffd37a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    const token = pointOnPath(progress);
    ctx.fillStyle = "#ff8a8a";
    ctx.beginPath();
    ctx.arc(token.x, token.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tick() {
  if (running) {
    progress += 3.2;
    if (progress >= totalLen) {
      progress = totalLen;
      running = false;
      const result = buildPath(activeStartLane).endLane;
      statusEl.textContent = `결과: ${activeStartLane + 1}번 -> ${result + 1}번`;
    }
  }

  drawLadder();
  requestAnimationFrame(tick);
}

function regen() {
  lineCount = Number(lineCountEl.value);
  setupStartOptions();
  generateLadder();
  path = [];
  progress = 0;
  running = false;
  statusEl.textContent = "라인을 고르고 시작을 누르세요.";
}

playBtn.addEventListener("click", () => {
  if (running) return;
  const start = Number(startLineEl.value);
  activeStartLane = start;
  const result = buildPath(start);
  preparePath(result.points);
  progress = 0;
  running = true;
  statusEl.textContent = "사다리 진행 중...";
});

regenBtn.addEventListener("click", regen);
lineCountEl.addEventListener("change", regen);

regen();
tick();
