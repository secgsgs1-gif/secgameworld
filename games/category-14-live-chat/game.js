import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224f";

const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const statusEl = document.getElementById("status");
const presenceListEl = document.getElementById("presence-list");

let user = null;
let username = "";
let profileUnsub = null;
let messageUnsub = null;
let presenceUnsub = null;
let heartbeat = null;

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeLabel(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function renderMessages(docs) {
  messagesEl.innerHTML = "";
  docs.forEach((snap) => {
    const data = snap.data();
    const mine = data.uid === user.uid;

    const item = document.createElement("article");
    item.className = `msg${mine ? " me" : ""}`;
    item.innerHTML = `<span class="meta">${esc(data.username || "unknown")} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
    messagesEl.appendChild(item);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPresence(docs) {
  const now = Date.now();
  const rows = docs
    .map((snap) => snap.data())
    .filter((p) => p?.username)
    .sort((a, b) => (a.username > b.username ? 1 : -1));

  presenceListEl.innerHTML = "";
  rows.forEach((p) => {
    const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
    const online = p.online && now - lastSeen < 70000;
    const li = document.createElement("li");
    li.textContent = `${p.username} ${online ? "●" : "○"}`;
    presenceListEl.appendChild(li);
  });
}

async function updatePresence(online) {
  if (!user) return;
  const ref = doc(db, "presence", user.uid);
  await setDoc(ref, {
    uid: user.uid,
    username,
    online,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

async function init() {
  statusEl.textContent = "초기화 중...";

  profileUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = p.username || (user.email || "user").split("@")[0];
  });

  const msgQ = query(collection(db, "live_chat_messages"), orderBy("createdAt", "asc"), limit(120));
  messageUnsub = onSnapshot(msgQ, (snap) => {
    renderMessages(snap.docs);
  });

  const presenceQ = query(collection(db, "presence"), orderBy("username", "asc"));
  presenceUnsub = onSnapshot(presenceQ, (snap) => {
    renderPresence(snap.docs);
  });

  await updatePresence(true);
  heartbeat = setInterval(() => {
    updatePresence(true).catch(() => {});
  }, 30000);

  statusEl.textContent = "실시간 채팅 연결됨";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !user) return;

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
    const ref = doc(db, "presence", user.uid);
    updateDoc(ref, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  }
});

document.addEventListener("app:user-ready", (e) => {
  user = e.detail.user;
  init().catch((err) => {
    statusEl.textContent = `오류: ${err.message}`;
  });
});

if (window.__AUTH_USER__) {
  user = window.__AUTH_USER__;
  init().catch((err) => {
    statusEl.textContent = `오류: ${err.message}`;
  });
}
