import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const BOARD_SIZE = 15;
const EMPTY_CELL = ".";
const EMPTY_BOARD = EMPTY_CELL.repeat(BOARD_SIZE * BOARD_SIZE);

const roomTitleEl = document.getElementById("room-title");
const gameTypeEl = document.getElementById("game-type");
const createRoomBtn = document.getElementById("create-room-btn");
const statusEl = document.getElementById("status");
const roomListEl = document.getElementById("room-list");

const roomNameEl = document.getElementById("room-name");
const roomMetaEl = document.getElementById("room-meta");
const joinBtn = document.getElementById("join-btn");
const watchBtn = document.getElementById("watch-btn");
const startBtn = document.getElementById("start-btn");
const surrenderBtn = document.getElementById("surrender-btn");
const leaveBtn = document.getElementById("leave-btn");

const canvas = document.getElementById("gomoku-board");
const ctx = canvas.getContext("2d");
const myModeEl = document.getElementById("my-mode");
const blackPlayerEl = document.getElementById("black-player");
const whitePlayerEl = document.getElementById("white-player");
const spectatorCountEl = document.getElementById("spectator-count");
const spectatorListEl = document.getElementById("spectator-list");
const turnLabelEl = document.getElementById("turn-label");
const resultLabelEl = document.getElementById("result-label");

let user = null;
let username = "";
let roomListUnsub = null;
let roomUnsub = null;
let currentRoomId = "";
let currentRoom = null;
let roomsCache = [];
let booted = false;
let presenceUnsub = null;
let presenceRows = [];
let enteredRoomId = "";
let enteredMode = "";

function normalizeUsername(currentUser, rawName, uid) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(uid || currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function roomStatusLabel(room) {
  if (!room) return "-";
  if (room.status === "waiting") return "Waiting";
  if (room.status === "playing") return "Playing";
  if (room.status === "finished") return "Finished";
  return String(room.status || "-");
}

function parseBoard(raw) {
  const s = String(raw || "");
  if (s.length !== BOARD_SIZE * BOARD_SIZE) return EMPTY_BOARD.split("");
  return s.split("");
}

function cellAt(boardArr, x, y) {
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return EMPTY_CELL;
  return boardArr[(y * BOARD_SIZE) + x] || EMPTY_CELL;
}

function setCell(boardArr, x, y, val) {
  boardArr[(y * BOARD_SIZE) + x] = val;
}

function hasFive(boardArr, x, y, stone) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    let count = 1;
    let nx = x + dx;
    let ny = y + dy;
    while (cellAt(boardArr, nx, ny) === stone) {
      count += 1;
      nx += dx;
      ny += dy;
    }
    nx = x - dx;
    ny = y - dy;
    while (cellAt(boardArr, nx, ny) === stone) {
      count += 1;
      nx -= dx;
      ny -= dy;
    }
    if (count >= 5) return true;
  }
  return false;
}

function myRole(room) {
  if (!room || !user) return "spectator";
  if (room.blackUid === user.uid) return "black";
  if (room.whiteUid === user.uid) return "white";
  return "spectator";
}

function isHost(room) {
  return Boolean(room && user && room.hostUid === user.uid);
}

function canWatchRoom(room) {
  if (!room) return false;
  const role = myRole(room);
  if (role === "black" || role === "white") return true;
  return enteredRoomId === room.id && enteredMode === "spectator";
}

function updateSpectatorUi(roomId) {
  spectatorListEl.innerHTML = "";
  if (!roomId) {
    spectatorCountEl.textContent = "0";
    return;
  }
  const rows = presenceRows
    .filter((p) => p.online && p.roomId === roomId && p.roomRole === "spectator")
    .sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
  spectatorCountEl.textContent = String(rows.length);
  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "No spectators";
    spectatorListEl.appendChild(li);
    return;
  }
  rows.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = normalizeUsername(user, p.username, p.uid);
    spectatorListEl.appendChild(li);
  });
}

async function setMyRoomPresence(roomId, roomRole) {
  await updateDoc(doc(db, "presence", user.uid), {
    roomId,
    roomRole,
    updatedAt: serverTimestamp()
  });
  enteredRoomId = roomId;
  enteredMode = roomRole;
}

async function clearMyRoomPresence() {
  await updateDoc(doc(db, "presence", user.uid), {
    roomId: deleteField(),
    roomRole: deleteField(),
    updatedAt: serverTimestamp()
  }).catch(() => {});
  enteredRoomId = "";
  enteredMode = "";
}

function drawBoard(room) {
  const size = canvas.width;
  const pad = 28;
  const span = size - (pad * 2);
  const gap = span / (BOARD_SIZE - 1);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#d6ba7b";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#654f2d";
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    const p = pad + (gap * i);
    ctx.beginPath();
    ctx.moveTo(pad, p);
    ctx.lineTo(size - pad, p);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p, pad);
    ctx.lineTo(p, size - pad);
    ctx.stroke();
  }

  const star = [3, 7, 11];
  ctx.fillStyle = "#513d20";
  star.forEach((sx) => {
    star.forEach((sy) => {
      const cx = pad + (sx * gap);
      const cy = pad + (sy * gap);
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  if (!room) return;
  const board = parseBoard(room.board);
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const v = cellAt(board, x, y);
      if (v === EMPTY_CELL) continue;
      const cx = pad + (x * gap);
      const cy = pad + (y * gap);
      ctx.beginPath();
      ctx.arc(cx, cy, 12.5, 0, Math.PI * 2);
      if (v === "B") {
        ctx.fillStyle = "#101010";
        ctx.fill();
      } else {
        ctx.fillStyle = "#f6f7fa";
        ctx.fill();
        ctx.strokeStyle = "#606060";
        ctx.stroke();
      }
    }
  }

  const lx = Number(room.lastMove?.x);
  const ly = Number(room.lastMove?.y);
  if (Number.isInteger(lx) && Number.isInteger(ly) && lx >= 0 && ly >= 0) {
    const cx = pad + (lx * gap);
    const cy = pad + (ly * gap);
    ctx.strokeStyle = "#ff2f2f";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 7, cy - 7, 14, 14);
  }
}

function renderRoomList() {
  roomListEl.innerHTML = "";
  if (!roomsCache.length) {
    const li = document.createElement("li");
    li.textContent = "No rooms yet.";
    roomListEl.appendChild(li);
    return;
  }
  roomsCache.forEach((room) => {
    const li = document.createElement("li");
    const title = document.createElement("p");
    title.className = "room-title";
    title.textContent = room.title || "(Untitled)";
    const meta = document.createElement("p");
    meta.className = "room-meta";
    const bName = normalizeUsername(user, room.blackName, room.blackUid) || "-";
    const wName = room.whiteUid ? normalizeUsername(user, room.whiteName, room.whiteUid) : "-";
    meta.textContent = `${roomStatusLabel(room)} | ${room.gameType || "gomoku"} | B:${bName} / W:${wName}`;

    const buttons = document.createElement("div");
    buttons.className = "room-buttons";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => openRoom(room.id));
    buttons.appendChild(openBtn);

    const joinOrWatch = document.createElement("button");
    joinOrWatch.type = "button";
    const hasSlot = room.status === "waiting" && (!room.blackUid || !room.whiteUid || room.blackUid === user.uid || room.whiteUid === user.uid);
    joinOrWatch.textContent = hasSlot ? "Join" : "Watch";
    joinOrWatch.addEventListener("click", () => {
      if (hasSlot) joinAsPlayer(room.id).catch((err) => {
        statusEl.textContent = `Join failed: ${err.message}`;
      });
      else watchRoom(room.id).catch((err) => {
        statusEl.textContent = `Watch failed: ${err.message}`;
      });
    });
    buttons.appendChild(joinOrWatch);

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(buttons);
    roomListEl.appendChild(li);
  });
}

function applyRoomUi(room) {
  currentRoom = room;
  if (!room) {
    roomNameEl.textContent = "Select a room";
    roomMetaEl.textContent = "-";
    myModeEl.textContent = "-";
    blackPlayerEl.textContent = "-";
    whitePlayerEl.textContent = "-";
    spectatorCountEl.textContent = "0";
    spectatorListEl.innerHTML = "";
    turnLabelEl.textContent = "-";
    resultLabelEl.textContent = "-";
    [joinBtn, watchBtn, startBtn, surrenderBtn, leaveBtn].forEach((b) => {
      b.disabled = true;
    });
    drawBoard(null);
    return;
  }

  const role = myRole(room);
  const canWatch = canWatchRoom(room);
  roomNameEl.textContent = room.title || "(Untitled)";
  roomMetaEl.textContent = `${roomStatusLabel(room)} · ${room.gameType || "gomoku"} · Host: ${normalizeUsername(user, room.hostName, room.hostUid)}`;
  myModeEl.textContent = role;
  blackPlayerEl.textContent = room.blackUid ? normalizeUsername(user, room.blackName, room.blackUid) : "(empty)";
  whitePlayerEl.textContent = room.whiteUid ? normalizeUsername(user, room.whiteName, room.whiteUid) : "(empty)";
  turnLabelEl.textContent = canWatch ? (room.turn ? room.turn.toUpperCase() : "-") : "-";
  if (room.status === "finished") {
    const winnerName = room.winner === "black"
      ? normalizeUsername(user, room.blackName, room.blackUid)
      : room.winner === "white"
        ? normalizeUsername(user, room.whiteName, room.whiteUid)
        : "";
    if (room.winner === "black" || room.winner === "white") resultLabelEl.textContent = `${winnerName} win`;
    else resultLabelEl.textContent = "Draw";
  } else {
    resultLabelEl.textContent = "-";
  }
  updateSpectatorUi(room.id);

  const waitingHasSlot = room.status === "waiting" && (!room.blackUid || !room.whiteUid);
  const alreadyPlayer = role === "black" || role === "white";
  joinBtn.disabled = !(room.status === "waiting" && (waitingHasSlot || alreadyPlayer));
  watchBtn.disabled = role === "black" || role === "white" || (enteredRoomId === room.id && enteredMode === "spectator");
  startBtn.disabled = !(isHost(room) && room.status === "waiting" && room.blackUid && room.whiteUid);
  surrenderBtn.disabled = !(room.status === "playing" && (role === "black" || role === "white"));
  leaveBtn.disabled = false;

  if (canWatch) drawBoard(room);
  else drawBoard(null);
}

async function createRoom() {
  const title = String(roomTitleEl.value || "").trim() || `${username}'s room`;
  const gameType = String(gameTypeEl.value || "gomoku");
  const created = await addDoc(collection(db, "mp_rooms"), {
    title,
    gameType,
    status: "waiting",
    hostUid: user.uid,
    hostName: username,
    blackUid: user.uid,
    blackName: username,
    whiteUid: "",
    whiteName: "",
    board: EMPTY_BOARD,
    turn: "black",
    winner: "",
    moveCount: 0,
    lastMove: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  statusEl.textContent = "Room created.";
  roomTitleEl.value = "";
  await setMyRoomPresence(created.id, "player");
  await openRoom(created.id);
}

async function watchRoom(roomId) {
  const snap = await getDoc(doc(db, "mp_rooms", roomId));
  if (!snap.exists()) throw new Error("Room not found");
  await setMyRoomPresence(roomId, "spectator");
  await openRoom(roomId);
  statusEl.textContent = "Entered as spectator.";
}

async function joinAsPlayer(roomId) {
  const ref = doc(db, "mp_rooms", roomId);
  let joined = false;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");
    const room = snap.data();
    if (room.status !== "waiting") return;
    if (room.blackUid === user.uid || room.whiteUid === user.uid) {
      joined = true;
      return;
    }
    if (!room.blackUid) {
      tx.update(ref, { blackUid: user.uid, blackName: username, updatedAt: serverTimestamp() });
      joined = true;
      return;
    }
    if (!room.whiteUid) {
      tx.update(ref, { whiteUid: user.uid, whiteName: username, updatedAt: serverTimestamp() });
      joined = true;
      return;
    }
  });
  if (joined) {
    await setMyRoomPresence(roomId, "player");
    statusEl.textContent = "Joined as player.";
  }
  await openRoom(roomId);
}

async function openRoom(roomId) {
  currentRoomId = roomId;
  if (roomUnsub) roomUnsub();
  roomUnsub = onSnapshot(doc(db, "mp_rooms", roomId), (snap) => {
    if (!snap.exists()) {
      applyRoomUi(null);
      if (enteredRoomId === roomId) clearMyRoomPresence();
      statusEl.textContent = "Room deleted.";
      return;
    }
    applyRoomUi({ id: snap.id, ...snap.data() });
  }, (err) => {
    statusEl.textContent = `Room stream error: ${err.message}`;
  });
}

async function startMatch() {
  if (!currentRoomId) return;
  const ref = doc(db, "mp_rooms", currentRoomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");
    const room = snap.data();
    if (room.hostUid !== user.uid) throw new Error("Only host can start");
    if (!room.blackUid || !room.whiteUid) throw new Error("Need 2 players");
    tx.update(ref, {
      status: "playing",
      board: EMPTY_BOARD,
      turn: "black",
      winner: "",
      moveCount: 0,
      lastMove: null,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  statusEl.textContent = "Match started.";
}

async function leaveRoom() {
  if (!currentRoomId) return;
  const ref = doc(db, "mp_rooms", currentRoomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    applyRoomUi(null);
    return;
  }
  const room = snap.data();
  const role = myRole(room);
  if (room.hostUid === user.uid) {
    await deleteDoc(ref);
    await clearMyRoomPresence();
    applyRoomUi(null);
    statusEl.textContent = "Room deleted by host.";
    return;
  }

  if (room.status === "waiting" && role === "black") {
    await updateDoc(ref, { blackUid: "", blackName: "", updatedAt: serverTimestamp() });
  } else if (room.status === "waiting" && role === "white") {
    await updateDoc(ref, { whiteUid: "", whiteName: "", updatedAt: serverTimestamp() });
  }

  await clearMyRoomPresence();
  applyRoomUi(null);
  statusEl.textContent = "Left room.";
}

async function surrender() {
  if (!currentRoomId || !currentRoom) return;
  const role = myRole(currentRoom);
  if (!(role === "black" || role === "white")) return;
  const winner = role === "black" ? "white" : "black";
  await updateDoc(doc(db, "mp_rooms", currentRoomId), {
    status: "finished",
    winner,
    turn: "",
    updatedAt: serverTimestamp()
  });
  statusEl.textContent = "Surrendered.";
}

async function placeStone(x, y) {
  if (!currentRoomId || !currentRoom) return;
  if (currentRoom.gameType !== "gomoku") return;

  const ref = doc(db, "mp_rooms", currentRoomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Room not found");
    const room = snap.data();
    if (room.status !== "playing") return;

    const role = room.blackUid === user.uid ? "black" : room.whiteUid === user.uid ? "white" : "spectator";
    if (role === "spectator") throw new Error("Spectator cannot place stones");
    if (room.turn !== role) throw new Error("Not your turn");

    const board = parseBoard(room.board);
    if (cellAt(board, x, y) !== EMPTY_CELL) return;
    const stone = role === "black" ? "B" : "W";
    setCell(board, x, y, stone);

    const won = hasFive(board, x, y, stone);
    const moveCount = Number(room.moveCount || 0) + 1;
    const full = moveCount >= BOARD_SIZE * BOARD_SIZE;
    const nextTurn = role === "black" ? "white" : "black";

    const nextData = {
      board: board.join(""),
      moveCount,
      lastMove: { x, y, color: role },
      updatedAt: serverTimestamp()
    };
    if (won) {
      nextData.status = "finished";
      nextData.winner = role;
      nextData.turn = "";
    } else if (full) {
      nextData.status = "finished";
      nextData.winner = "draw";
      nextData.turn = "";
    } else {
      nextData.turn = nextTurn;
    }
    tx.update(ref, nextData);
  });
}

function onBoardClick(e) {
  if (!currentRoom || currentRoom.gameType !== "gomoku") return;
  if (!canWatchRoom(currentRoom)) {
    statusEl.textContent = "Press Watch to enter spectator mode first.";
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const pad = 28;
  const span = canvas.width - (pad * 2);
  const gap = span / (BOARD_SIZE - 1);
  const x = Math.round((px - pad) / gap);
  const y = Math.round((py - pad) / gap);
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return;
  placeStone(x, y).catch((err) => {
    statusEl.textContent = `Move failed: ${err.message}`;
  });
}

function bindLobbyStream() {
  const q = query(collection(db, "mp_rooms"), orderBy("updatedAt", "desc"), limit(50));
  roomListUnsub = onSnapshot(q, (snap) => {
    roomsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderRoomList();
  }, (err) => {
    statusEl.textContent = `Room list error: ${err.message}`;
  });
}

function init() {
  bindLobbyStream();
  const pq = query(collection(db, "presence"), orderBy("username", "asc"), limit(200));
  presenceUnsub = onSnapshot(pq, (snap) => {
    presenceRows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    if (currentRoom) updateSpectatorUi(currentRoom.id);
  }, () => {});
  drawBoard(null);

  createRoomBtn.addEventListener("click", () => {
    createRoom().catch((err) => {
      statusEl.textContent = `Create failed: ${err.message}`;
    });
  });
  joinBtn.addEventListener("click", () => {
    if (!currentRoomId) return;
    joinAsPlayer(currentRoomId).catch((err) => {
      statusEl.textContent = `Join failed: ${err.message}`;
    });
  });
  watchBtn.addEventListener("click", () => {
    if (!currentRoomId) return;
    watchRoom(currentRoomId).catch((err) => {
      statusEl.textContent = `Watch failed: ${err.message}`;
    });
  });
  startBtn.addEventListener("click", () => {
    startMatch().catch((err) => {
      statusEl.textContent = `Start failed: ${err.message}`;
    });
  });
  leaveBtn.addEventListener("click", () => {
    leaveRoom().catch((err) => {
      statusEl.textContent = `Leave failed: ${err.message}`;
    });
  });
  surrenderBtn.addEventListener("click", () => {
    surrender().catch((err) => {
      statusEl.textContent = `Surrender failed: ${err.message}`;
    });
  });
  canvas.addEventListener("click", onBoardClick);

  window.addEventListener("beforeunload", () => {
    if (roomListUnsub) roomListUnsub();
    if (roomUnsub) roomUnsub();
    if (presenceUnsub) presenceUnsub();
    clearMyRoomPresence().catch(() => {});
  });
}

function boot(nextUser) {
  if (booted) return;
  booted = true;
  user = nextUser;
  username = normalizeUsername(user, "", user.uid);
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
