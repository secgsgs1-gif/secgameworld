import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const TILE_COUNT = 10;
const BASE_PRICE = 100;
const TITLE_TAG = "[Emperor]";
const LEGACY_TITLE_TAGS = ["Emperor", "[LAND KING]", "LAND KING"];

const pointsEl = document.getElementById("points");
const dayKeyEl = document.getElementById("day-key");
const boardEl = document.getElementById("board");
const selIndexEl = document.getElementById("sel-index");
const selOwnerEl = document.getElementById("sel-owner");
const selPriceEl = document.getElementById("sel-price");
const selCostEl = document.getElementById("sel-cost");
const buyBtn = document.getElementById("buy-btn");
const statusEl = document.getElementById("status");
const rankListEl = document.getElementById("rank-list");

let user = null;
let username = "";
let dayRef = null;
let dayUnsub = null;
let currentState = null;
let selectedTile = 0;
let busy = false;

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function todayKeyKst() {
  const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
  return now.toISOString().slice(0, 10);
}

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function createDefaultTiles() {
  return Array.from({ length: TILE_COUNT }, (_, i) => ({
    idx: i,
    ownerUid: "",
    ownerName: "",
    price: BASE_PRICE,
    updatedAtMs: 0
  }));
}

async function ensureTodayDoc() {
  if (!dayRef) return;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(dayRef);
    if (snap.exists()) return;
    tx.set(dayRef, {
      dayKey: dayRef.id,
      tiles: createDefaultTiles(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}


function captureCost(tile) {
  if (!tile?.ownerUid) return BASE_PRICE;
  const p = Math.max(BASE_PRICE, Number(tile.price || BASE_PRICE));
  return Math.ceil(p * 1.5);
}

function ownerLabel(tile) {
  if (!tile?.ownerUid) return "Unowned";
  return tile.ownerName || "Unknown";
}

function isLandKingName(name) {
  const raw = String(name || "");
  if (raw.includes(TITLE_TAG)) return true;
  return LEGACY_TITLE_TAGS.some((tag) => raw.includes(tag));
}

function ownerLabelHtml(tile) {
  const owner = ownerLabel(tile);
  const cls = isLandKingName(owner) ? "owner owner-land-king" : "owner";
  return `<div class="${cls}">${esc(owner)}</div>`;
}

function renderBoard(state) {
  boardEl.innerHTML = "";
  const tiles = Array.isArray(state?.tiles) ? state.tiles : createDefaultTiles();

  tiles.forEach((tile, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const mine = tile.ownerUid && tile.ownerUid === user.uid;
    const enemy = tile.ownerUid && tile.ownerUid !== user.uid;
    btn.className = `tile${mine ? " mine" : ""}${enemy ? " enemy" : ""}${selectedTile === i ? " selected" : ""}`;
    btn.innerHTML = `
      <div class="idx">LAND ${i + 1}</div>
      ${ownerLabelHtml(tile)}
      <div class="price">Current: ${Math.max(BASE_PRICE, Number(tile.price || BASE_PRICE))}</div>
      <div class="cost">Capture: ${captureCost(tile)}</div>
      ${mine ? '<span class="my-badge">MY LAND</span>' : ""}
    `;
    btn.addEventListener("click", () => {
      selectedTile = i;
      renderBoard(currentState);
      renderSelected();
    });
    boardEl.appendChild(btn);
  });
}

function renderRanking(state) {
  rankListEl.innerHTML = "";
  const tiles = Array.isArray(state?.tiles) ? state.tiles : [];
  const map = new Map();
  tiles.forEach((t) => {
    if (!t.ownerUid) return;
    const row = map.get(t.ownerUid) || { name: t.ownerName || "Unknown", count: 0 };
    row.count += 1;
    map.set(t.ownerUid, row);
  });

  const rows = [...map.entries()]
    .map(([uid, r]) => ({ uid, ...r }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "No owners yet.";
    rankListEl.appendChild(li);
    return;
  }

  rows.forEach((r, i) => {
    const li = document.createElement("li");
    const ownerClass = isLandKingName(r.name) ? "rank-owner land-king-tag" : "rank-owner";
    li.innerHTML = `${i + 1}. <span class="${ownerClass}">${esc(r.name)}</span> (${r.count} lands)`;
    rankListEl.appendChild(li);
  });
}

function renderSelected() {
  const tiles = Array.isArray(currentState?.tiles) ? currentState.tiles : createDefaultTiles();
  const tile = tiles[selectedTile] || tiles[0];
  const cost = captureCost(tile);
  const owner = ownerLabel(tile);
  selIndexEl.textContent = String((tile?.idx ?? selectedTile) + 1);
  selOwnerEl.textContent = owner;
  selOwnerEl.classList.toggle("land-king-tag", isLandKingName(owner));
  selPriceEl.textContent = String(Math.max(BASE_PRICE, Number(tile?.price || BASE_PRICE)));
  selCostEl.textContent = String(cost);
  buyBtn.disabled = busy;
}

async function buySelectedTile() {
  if (busy || !dayRef || !user) return;
  busy = true;
  buyBtn.disabled = true;

  try {
    const userRef = doc(db, "users", user.uid);
    const txCol = collection(db, "users", user.uid, "transactions");
    const txResult = await runTransaction(db, async (tx) => {
      const daySnap = await tx.get(dayRef);
      if (!daySnap.exists()) throw new Error("Day board not ready");
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error("User profile missing");

      const data = daySnap.data() || {};
      const tiles = Array.isArray(data.tiles) ? data.tiles.map((t) => ({ ...t })) : createDefaultTiles();
      const idx = Math.min(Math.max(0, selectedTile), TILE_COUNT - 1);
      const tile = tiles[idx] || { idx, ownerUid: "", ownerName: "", price: BASE_PRICE };
      const cost = captureCost(tile);
      const points = Math.max(0, Number(userSnap.data()?.points || 0));
      if (points < cost) throw new Error("Not enough points");

      tiles[idx] = {
        idx,
        ownerUid: user.uid,
        ownerName: username,
        price: cost,
        updatedAtMs: Date.now()
      };

      tx.update(userRef, {
        points: points - cost,
        updatedAt: serverTimestamp()
      });
      tx.update(dayRef, {
        tiles,
        updatedAt: serverTimestamp()
      });
      return { idx, cost };
    });

    await addDoc(txCol, {
      type: "land_grab_buy",
      amount: -Math.abs(Number(txResult.cost || 0)),
      reason: "land_grab_capture",
      meta: {
        dayKey: dayRef.id,
        tile: Number(txResult.idx) + 1
      },
      createdAt: serverTimestamp()
    });

    statusEl.textContent = `Captured LAND ${Number(txResult.idx) + 1} for ${txResult.cost} points.`;
  } catch (err) {
    statusEl.textContent = `Capture failed: ${err.message}`;
  } finally {
    busy = false;
    buyBtn.disabled = false;
    renderSelected();
  }
}

function startStreams() {
  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    const base = normalizeUsername(user, p.username);
    const tag = String(p.landTitleTag || "").trim();
    username = tag ? `${tag} ${base}` : base;
    pointsEl.textContent = String(Math.max(0, Number(p.points || 0)));
  });

  if (dayUnsub) dayUnsub();
  dayUnsub = onSnapshot(dayRef, (snap) => {
    if (!snap.exists()) return;
    currentState = snap.data();
    renderBoard(currentState);
    renderSelected();
    renderRanking(currentState);
  }, (err) => {
    statusEl.textContent = `Board error: ${err.message}`;
  });
}

async function init() {
  const key = todayKeyKst();
  dayKeyEl.textContent = key;
  dayRef = doc(db, "land_grab_days", key);
  await ensureTodayDoc();
  startStreams();

  buyBtn.addEventListener("click", () => {
    buySelectedTile().catch(() => {});
  });
}

function boot(nextUser) {
  user = nextUser;
  username = normalizeUsername(user, "");
  init().catch((err) => {
    statusEl.textContent = `Init failed: ${err.message}`;
  });
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
