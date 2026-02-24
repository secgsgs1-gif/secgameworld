import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "./firebase-app.js?v=20260224m";

const presenceEl = document.getElementById("main-presence-list");
const messagesEl = document.getElementById("main-messages");
const form = document.getElementById("main-chat-form");
const input = document.getElementById("main-chat-input");
const statusEl = document.getElementById("main-chat-status");

let user = null;
let username = "";
let heartbeat = null;
let rankMap = new Map();

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

function renderPresence(docs) {
  const now = Date.now();
  const rows = docs.map((x) => x.data()).filter((p) => p?.username).sort((a, b) => (a.username > b.username ? 1 : -1));
  presenceEl.innerHTML = "";

  rows.forEach((p) => {
    const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    const online = p.online && now - lastSeen < 70000;
    const rank = rankMap.get(p.uid);
    const li = document.createElement("li");
    li.textContent = `${rank ? `#${rank} ` : ""}${p.username} ${online ? "●" : "○"}`;
    presenceEl.appendChild(li);
  });
}

function renderMessages(docs) {
  messagesEl.innerHTML = "";
  docs.forEach((snap) => {
    const data = snap.data();
    const mine = data.uid === user.uid;
    const rank = rankMap.get(data.uid);
    const row = document.createElement("article");
    row.className = `main-msg${mine ? " me" : ""}`;
    row.innerHTML = `<span class="main-meta">${rank ? `#${rank} ` : ""}${esc(data.username || "unknown")} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
    messagesEl.appendChild(row);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function touchPresence(online) {
  if (!user) return;
  await setDoc(doc(db, "presence", user.uid), {
    uid: user.uid,
    username,
    online,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

async function init() {
  if (!presenceEl || !messagesEl || !form || !input || !statusEl) return;
  statusEl.textContent = "채팅 연결 중...";

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = p.username || (user.email || "user").split("@")[0];
  });

  const rankQ = query(collection(db, "users"), orderBy("points", "desc"), limit(500));
  onSnapshot(rankQ, (snap) => {
    rankMap = new Map();
    snap.docs.forEach((d, i) => rankMap.set(d.id, i + 1));
  });

  const msgQ = query(collection(db, "live_chat_messages"), orderBy("createdAt", "asc"), limit(80));
  onSnapshot(msgQ, (snap) => renderMessages(snap.docs));

  const presenceQ = query(collection(db, "presence"), orderBy("username", "asc"));
  onSnapshot(presenceQ, (snap) => renderPresence(snap.docs));

  await touchPresence(true);
  heartbeat = setInterval(() => touchPresence(true).catch(() => {}), 30000);
  statusEl.textContent = "실시간 연결됨";
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!user || !text) return;
  input.value = "";
  await addDoc(collection(db, "live_chat_messages"), {
    uid: user.uid,
    username,
    text,
    createdAt: serverTimestamp()
  });
});

window.addEventListener("beforeunload", () => {
  if (heartbeat) clearInterval(heartbeat);
  if (user) {
    updateDoc(doc(db, "presence", user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  }
});

document.addEventListener("app:user-ready", (e) => {
  user = e.detail.user;
  init().catch((err) => {
    if (statusEl) statusEl.textContent = `오류: ${err.message}`;
  });
});

if (window.__AUTH_USER__) {
  user = window.__AUTH_USER__;
  init().catch((err) => {
    if (statusEl) statusEl.textContent = `오류: ${err.message}`;
  });
}
