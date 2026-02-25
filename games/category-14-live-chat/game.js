import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const statusEl = document.getElementById("status");
const presenceListEl = document.getElementById("presence-list");

let user = null;
let username = "";
let rankMap = new Map();
let heartbeat = null;
let latestMessageDocs = [];
let latestPresenceDocs = [];
let initStarted = false;
let rankPoll = null;
let streamUnsubs = [];
let streamsActive = false;

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function rankLabel(rank) {
  if (!rank) return "";
  if (rank === 1) return "🥇1등";
  if (rank === 2) return "🥈2등";
  if (rank === 3) return "🥉3등";
  return `#${rank}`;
}

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeLabel(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderMessages(docs) {
  messagesEl.innerHTML = "";
  docs.forEach((snap) => {
    const data = snap.data();
    const mine = data.uid === user.uid;
    const rank = rankMap.get(data.uid);
    const shownName = normalizeUsername(user, data.username);

    const item = document.createElement("article");
    item.className = `msg${mine ? " me" : ""}`;
    item.innerHTML = `<span class="meta">${rankLabel(rank)} ${esc(shownName)} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
    messagesEl.appendChild(item);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPresence(docs) {
  const now = Date.now();
  const rows = docs.map((snap) => snap.data()).filter((p) => p?.uid).sort((a, b) => {
    const aName = normalizeUsername(user, a.username).toLowerCase();
    const bName = normalizeUsername(user, b.username).toLowerCase();
    return aName > bName ? 1 : -1;
  });

  presenceListEl.innerHTML = "";
  let onlineCount = 0;
  rows.forEach((p) => {
    const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    const online = p.online && now - lastSeen < 70000;
    if (!online) return;
    onlineCount += 1;
    const li = document.createElement("li");
    const rank = rankMap.get(p.uid);
    li.textContent = `${rankLabel(rank)} ${normalizeUsername(user, p.username)} ●`.trim();
    presenceListEl.appendChild(li);
  });
  if (onlineCount === 0) {
    const li = document.createElement("li");
    li.textContent = "접속자 없음";
    presenceListEl.appendChild(li);
  }
}

async function updatePresence(online) {
  if (!user) return;
  const safeUsername = normalizeUsername(user, username);
  await setDoc(doc(db, "presence", user.uid), {
    uid: user.uid,
    username: safeUsername,
    online,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

async function init() {
  statusEl.textContent = "초기화 중...";
  username = normalizeUsername(user, "");

  const rankQ = query(collection(db, "users"), orderBy("points", "desc"), limit(100));
  async function refreshRank() {
    try {
      const snap = await getDocs(rankQ);
      const rows = snap.docs.map((d) => ({ id: d.id, points: Number(d.data()?.points || 0) }))
        .sort((a, b) => (b.points - a.points) || a.id.localeCompare(b.id));
      rankMap = new Map();
      rows.forEach((r, i) => rankMap.set(r.id, i + 1));
      renderMessages(latestMessageDocs);
      renderPresence(latestPresenceDocs);
    } catch (err) {
      statusEl.textContent = `랭킹 오류: ${err.message}`;
    }
  }

  function stopStreams() {
    streamUnsubs.forEach((fn) => fn());
    streamUnsubs = [];
    streamsActive = false;
    if (rankPoll) {
      clearInterval(rankPoll);
      rankPoll = null;
    }
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function startStreams() {
    if (streamsActive) return;
    streamsActive = true;
    streamUnsubs.push(onSnapshot(doc(db, "users", user.uid), (snap) => {
      const p = snap.data() || {};
      username = normalizeUsername(user, p.username);
    }));

    refreshRank().catch(() => {});
    rankPoll = setInterval(() => {
      if (document.visibilityState === "visible") refreshRank().catch(() => {});
    }, 120000);

    const msgQ = query(collection(db, "live_chat_messages"), orderBy("createdAt", "desc"), limit(80));
    streamUnsubs.push(onSnapshot(
      msgQ,
      (snap) => {
        latestMessageDocs = [...snap.docs].reverse();
        renderMessages(latestMessageDocs);
      },
      (err) => {
        statusEl.textContent = `메시지 오류: ${err.message}`;
      }
    ));

    const presenceQ = query(collection(db, "presence"), orderBy("username", "asc"), limit(40));
    streamUnsubs.push(onSnapshot(
      presenceQ,
      (snap) => {
        latestPresenceDocs = snap.docs;
        renderPresence(latestPresenceDocs);
      },
      (err) => {
        statusEl.textContent = `접속자 오류: ${err.message}`;
      }
    ));

    updatePresence(true).catch(() => {});
    heartbeat = setInterval(() => updatePresence(true).catch(() => {}), 45000);
    statusEl.textContent = "실시간 채팅 연결됨";
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      startStreams();
      updatePresence(true).catch(() => {});
      return;
    }
    stopStreams();
    updateDoc(doc(db, "presence", user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    statusEl.textContent = "백그라운드 대기";
  }

  document.addEventListener("visibilitychange", onVisibility);
  startStreams();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !user) return;
  const safeUsername = normalizeUsername(user, username);

  input.value = "";
  try {
    await addDoc(collection(db, "live_chat_messages"), {
      uid: user.uid,
      username: safeUsername,
      text,
      createdAt: serverTimestamp()
    });
    statusEl.textContent = "실시간 채팅 연결됨";
  } catch (err) {
    statusEl.textContent = `전송 실패: ${err.message}`;
  }
});

window.addEventListener("beforeunload", () => {
  if (rankPoll) clearInterval(rankPoll);
  streamUnsubs.forEach((fn) => fn());
  if (user) {
    updateDoc(doc(db, "presence", user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  }
});

function boot(nextUser) {
  if (initStarted) return;
  initStarted = true;
  user = nextUser;
  init().catch((err) => {
    initStarted = false;
    statusEl.textContent = `오류: ${err.message}`;
  });
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));

if (window.__AUTH_USER__) {
  boot(window.__AUTH_USER__);
}
