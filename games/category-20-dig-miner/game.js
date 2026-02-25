const canvas = document.getElementById("mine");
const ctx = canvas.getContext("2d");
const pointsEl = document.getElementById("points");
const depthEl = document.getElementById("depth");
const pickaxeEl = document.getElementById("pickaxe");
const statusEl = document.getElementById("status");
const inventoryListEl = document.getElementById("inventory-list");
const sellBtn = document.getElementById("sell-btn");
const upgradeBtn = document.getElementById("upgrade-btn");
const rerollBtn = document.getElementById("reroll-btn");

const TILE = 24;
const COLS = 36;
const ROWS = 26;
const SKY_ROWS = 3;
const BASE_UPGRADE_COST = 300;
const UPGRADE_GROWTH = 1.9;

const BLOCKS = {
  dirt: { hp: 1, color: "#7a573d", value: 1, speck: "#63452f" },
  stone: { hp: 2, color: "#6f7a85", value: 2, speck: "#56606a" },
  coal: { hp: 2, color: "#313841", value: 8, speck: "#1f242b" },
  iron: { hp: 3, color: "#7f705f", value: 16, speck: "#b49c86" },
  gold: { hp: 3, color: "#c7a641", value: 35, speck: "#f2d16b" },
  diamond: { hp: 4, color: "#4ec8dc", value: 95, speck: "#9ff5ff" }
};

const INVENTORY_KEYS = ["dirt", "stone", "coal", "iron", "gold", "diamond"];

let player = { x: Math.floor(COLS / 2), y: SKY_ROWS - 1 };
let pickaxeLevel = 1;
let myPoints = 0;
let user = null;
let world = [];
let breakProgress = {};
let worldSeed = Math.floor(Math.random() * 1000000000);
let inventory = {
  dirt: 0,
  stone: 0,
  coal: 0,
  iron: 0,
  gold: 0,
  diamond: 0
};

function rngSeed(x, y) {
  let n = (((x + 1) * 73856093) ^ ((y + 1) * 19349663) ^ worldSeed) >>> 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return (n ^ (n >>> 16)) >>> 0;
}

function blockForDepth(y, seed) {
  if (y < SKY_ROWS) return null;
  const depth = y - SKY_ROWS;
  const r = seed % 1000;
  if (depth > 20 && r < 15) return "diamond";
  if (depth > 14 && r < 55) return "gold";
  if (depth > 9 && r < 130) return "iron";
  if (depth > 4 && r < 260) return "coal";
  if (r < 620) return "stone";
  return "dirt";
}

function buildWorld() {
  world = [];
  breakProgress = {};
  for (let y = 0; y < ROWS; y += 1) {
    const row = [];
    for (let x = 0; x < COLS; x += 1) {
      const seed = rngSeed(x, y);
      row.push(blockForDepth(y, seed));
    }
    world.push(row);
  }
  world[player.y][player.x] = null;
}

function rerollMine() {
  worldSeed = Math.floor(Math.random() * 1000000000);
  player = { x: Math.floor(COLS / 2), y: SKY_ROWS - 1 };
  breakProgress = {};
  buildWorld();
  statusEl.textContent = `New mine generated (seed ${worldSeed}).`;
  draw();
  renderHud();
}

function tileAt(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return "wall";
  return world[y][x];
}

function setTile(x, y, v) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
  world[y][x] = v;
}

function upgradeCost(level = pickaxeLevel) {
  return Math.floor(BASE_UPGRADE_COST * Math.pow(UPGRADE_GROWTH, level - 1));
}

function breakPower() {
  return 1 + Math.floor((pickaxeLevel - 1) * 0.55);
}

function noiseVal(x, y, salt = 0) {
  const n = rngSeed(x + (salt * 19), y + (salt * 73));
  return n % 1000;
}

function drawSkyTile(px, py, x, y) {
  const n = noiseVal(x, y, 7);
  const c = 96 + Math.floor((n / 1000) * 28);
  ctx.fillStyle = `rgb(${Math.floor(c * 0.45)}, ${Math.floor(c * 0.7)}, ${c})`;
  ctx.fillRect(px, py, TILE, TILE);
}

function drawBlockTile(block, px, py, x, y) {
  const base = BLOCKS[block];
  ctx.fillStyle = base.color;
  ctx.fillRect(px, py, TILE, TILE);
  for (let i = 0; i < 6; i += 1) {
    const nx = noiseVal(x + i, y + i, i + 1);
    const sx = nx % TILE;
    const sy = Math.floor(nx / TILE) % TILE;
    const size = (nx % 3) + 1;
    ctx.fillStyle = base.speck;
    ctx.fillRect(px + sx, py + sy, size, size);
  }
  ctx.strokeStyle = "#0000002f";
  ctx.strokeRect(px, py, TILE, TILE);
}

function drawPlayerSprite() {
  const px = player.x * TILE;
  const py = player.y * TILE;
  ctx.fillStyle = "#4ea7ff";
  ctx.fillRect(px + 8, py + 3, 8, 7);
  ctx.fillStyle = "#ffd3a3";
  ctx.fillRect(px + 8, py + 10, 8, 5);
  ctx.fillStyle = "#3d2f24";
  ctx.fillRect(px + 8, py + 15, 8, 5);
  ctx.fillStyle = "#24344e";
  ctx.fillRect(px + 7, py + 20, 4, 4);
  ctx.fillRect(px + 13, py + 20, 4, 4);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const block = tileAt(x, y);
      const px = x * TILE;
      const py = y * TILE;
      if (!block || block === "wall") {
        if (y < SKY_ROWS) {
          drawSkyTile(px, py, x, y);
        } else {
          ctx.fillStyle = "#102130";
          ctx.fillRect(px, py, TILE, TILE);
        }
        continue;
      }
      drawBlockTile(block, px, py, x, y);

      const key = `${x},${y}`;
      const dmg = Number(breakProgress[key] || 0);
      if (dmg > 0) {
        const maxHp = BLOCKS[block].hp;
        const ratio = Math.min(1, dmg / maxHp);
        ctx.fillStyle = "#ffffff88";
        ctx.fillRect(px, py + TILE - 3, Math.floor(TILE * ratio), 2);
      }
    }
  }

  drawPlayerSprite();
}

function renderHud() {
  depthEl.textContent = String(Math.max(0, player.y - SKY_ROWS + 1));
  pickaxeEl.textContent = `Lv.${pickaxeLevel}`;
  upgradeBtn.textContent = `Upgrade Pickaxe (${upgradeCost().toLocaleString()})`;
  pointsEl.textContent = String(Math.floor(myPoints).toLocaleString());
  renderInventory();
}

function renderInventory() {
  inventoryListEl.innerHTML = "";
  INVENTORY_KEYS.forEach((k) => {
    const li = document.createElement("li");
    const qty = Number(inventory[k] || 0);
    const each = BLOCKS[k].value;
    li.textContent = `${k.toUpperCase()}: ${qty} (value ${each})`;
    inventoryListEl.appendChild(li);
  });
}

function canMoveTo(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
  return !tileAt(x, y);
}

function move(dx, dy) {
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (!canMoveTo(nx, ny)) return;
  player.x = nx;
  player.y = ny;
  draw();
  renderHud();
}

function mineTile(tx, ty) {
  const block = tileAt(tx, ty);
  if (!block || block === "wall") return;
  const dx = Math.abs(tx - player.x);
  const dy = Math.abs(ty - player.y);
  if (dx + dy !== 1) {
    statusEl.textContent = "Mine only adjacent blocks.";
    return;
  }

  const key = `${tx},${ty}`;
  breakProgress[key] = Number(breakProgress[key] || 0) + breakPower();
  const hp = BLOCKS[block].hp;
  if (breakProgress[key] >= hp) {
    setTile(tx, ty, null);
    delete breakProgress[key];
    inventory[block] += 1;
    statusEl.textContent = `Mined ${block}.`;
  } else {
    statusEl.textContent = `Mining ${block}...`;
  }

  draw();
  renderHud();
}

function sellInventory() {
  let total = 0;
  INVENTORY_KEYS.forEach((k) => {
    const qty = Number(inventory[k] || 0);
    if (qty > 0) total += qty * BLOCKS[k].value;
  });
  if (total <= 0) {
    statusEl.textContent = "No items to sell.";
    return;
  }

  if (!window.AccountWallet) {
    statusEl.textContent = "Wallet is not ready.";
    return;
  }

  window.AccountWallet.earn(total, "dig_miner_sell", {
    game: "category-20-dig-miner",
    soldAt: Date.now()
  }).then(() => {
    INVENTORY_KEYS.forEach((k) => {
      inventory[k] = 0;
    });
    statusEl.textContent = `Sold inventory for +${total.toLocaleString()} points.`;
    renderHud();
  }).catch((err) => {
    statusEl.textContent = `Sell failed: ${err.message}`;
  });
}

function upgradePickaxe() {
  const cost = upgradeCost();
  if (!window.AccountWallet) {
    statusEl.textContent = "Wallet is not ready.";
    return;
  }
  if (myPoints < cost) {
    statusEl.textContent = `Need ${cost.toLocaleString()} points.`;
    return;
  }

  window.AccountWallet.spend(cost, "dig_miner_pickaxe_upgrade", {
    game: "category-20-dig-miner",
    toLevel: pickaxeLevel + 1
  }).then((res) => {
    if (!res.ok) {
      statusEl.textContent = "Upgrade failed.";
      return;
    }
    pickaxeLevel += 1;
    statusEl.textContent = `Pickaxe upgraded to Lv.${pickaxeLevel}.`;
    renderHud();
  }).catch((err) => {
    statusEl.textContent = `Upgrade failed: ${err.message}`;
  });
}

function onCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const tx = Math.floor(sx / TILE);
  const ty = Math.floor(sy / TILE);
  mineTile(tx, ty);
}

function onKey(e) {
  const k = String(e.key || "").toLowerCase();
  if (k === "arrowleft" || k === "a") move(-1, 0);
  else if (k === "arrowright" || k === "d") move(1, 0);
  else if (k === "arrowup" || k === "w") move(0, -1);
  else if (k === "arrowdown" || k === "s") move(0, 1);
}

function init() {
  buildWorld();
  canvas.addEventListener("click", onCanvasClick);
  window.addEventListener("keydown", onKey);
  sellBtn.addEventListener("click", sellInventory);
  upgradeBtn.addEventListener("click", upgradePickaxe);
  rerollBtn.addEventListener("click", rerollMine);

  if (window.AccountWallet) {
    myPoints = Number(window.AccountWallet.getPoints() || 0);
    window.AccountWallet.onChange((p) => {
      myPoints = Number(p || 0);
      renderHud();
    });
  } else {
    document.addEventListener("app:wallet-ready", () => {
      myPoints = Number(window.AccountWallet.getPoints() || 0);
      window.AccountWallet.onChange((p) => {
        myPoints = Number(p || 0);
        renderHud();
      });
      renderHud();
    }, { once: true });
  }

  draw();
  renderHud();
}

function boot(nextUser) {
  if (user) return;
  user = nextUser;
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
