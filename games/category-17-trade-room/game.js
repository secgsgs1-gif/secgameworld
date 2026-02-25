import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const pointsEl = document.getElementById("points");
const myNameEl = document.getElementById("my-name");
const statusEl = document.getElementById("status");
const presenceListEl = document.getElementById("presence-list");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");

const COMMAND_RE = /^\/give\s+([^\s]+)\s+(\d+)$/i;
const FEE_RATE = 0.05;
const MIN_GIVE = 20;
const MAX_GIVE = 100000;

let user = null;
let username = "";
let presenceBeat = null;
let msgUnsub = null;
let presenceUnsub = null;
let incomingUnsub = null;
let inited = false;
let receiveLocks = new Set();

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

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
    const d = snap.data();
    const mine = d.uid === user.uid;
    const row = document.createElement("article");
    row.className = `msg${mine ? " me" : ""}`;
    row.innerHTML = `<span class="meta">${esc(d.username || "user")} · ${timeLabel(d.createdAt)}</span>${esc(d.text || "")}`;
    messagesEl.appendChild(row);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPresence(docs) {
  const now = Date.now();
  const rows = docs
    .map((snap) => snap.data())
    .filter((p) => p?.uid)
    .filter((p) => {
      const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
      return p.online && (now - lastSeen < 90000);
    })
    .sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));

  presenceListEl.innerHTML = "";
  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "접속자 없음";
    presenceListEl.appendChild(li);
    return;
  }
  rows.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `${p.username || p.uid} ●`;
    presenceListEl.appendChild(li);
  });
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

async function pushSystemMessage(text) {
  await addDoc(collection(db, "trade_room_messages"), {
    uid: user.uid,
    username: "SYSTEM",
    text,
    createdAt: serverTimestamp()
  });
}

async function resolveRecipientByUsername(targetName) {
  const q = query(collection(db, "presence"), where("username", "==", targetName), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return d?.uid ? { uid: d.uid, username: d.username || targetName } : null;
}

async function claimIncomingTransfers() {
  const q = query(
    collection(db, "trade_transfers"),
    where("toUid", "==", user.uid),
    where("status", "==", "pending"),
    limit(20)
  );
  incomingUnsub = onSnapshot(q, (snap) => {
    snap.docs.forEach((transferSnap) => {
      const id = transferSnap.id;
      if (receiveLocks.has(id)) return;
      receiveLocks.add(id);
      runTransaction(db, async (tx) => {
        const transferRef = doc(db, "trade_transfers", id);
        const myRef = doc(db, "users", user.uid);
        const t = await tx.get(transferRef);
        if (!t.exists()) return;
        const d = t.data();
        if (d.status !== "pending" || d.toUid !== user.uid) return;
        tx.update(transferRef, { status: "claimed", claimedAt: serverTimestamp() });
        tx.update(myRef, { points: increment(Number(d.net || 0)), updatedAt: serverTimestamp() });
      }).then(async () => {
        const d = transferSnap.data();
        await addDoc(collection(db, "users", user.uid, "transactions"), {
          type: "trade_receive",
          amount: Number(d.net || 0),
          reason: "trade_receive",
          meta: {
            fromUid: d.fromUid,
            fromUsername: d.fromUsername,
            gross: Number(d.gross || 0),
            fee: Number(d.fee || 0),
            net: Number(d.net || 0),
            transferId: id
          },
          createdAt: serverTimestamp()
        });
      }).catch(() => {}).finally(() => {
        receiveLocks.delete(id);
      });
    });
  });
}

async function handleGiveCommand(targetName, grossAmount) {
  const gross = Math.floor(Number(grossAmount));
  if (!Number.isFinite(gross) || gross < MIN_GIVE || gross > MAX_GIVE) {
    statusEl.textContent = `송금 금액은 ${MIN_GIVE}~${MAX_GIVE} 범위여야 합니다.`;
    return;
  }
  if (!targetName || targetName === username) {
    statusEl.textContent = "자기 자신에게는 송금할 수 없습니다.";
    return;
  }

  const recipient = await resolveRecipientByUsername(targetName);
  if (!recipient) {
    statusEl.textContent = `대상 유저 '${targetName}'를 찾을 수 없습니다.`;
    return;
  }
  if (recipient.uid === user.uid) {
    statusEl.textContent = "자기 자신에게는 송금할 수 없습니다.";
    return;
  }

  const fee = Math.floor(gross * FEE_RATE);
  const net = gross - fee;
  const myRef = doc(db, "users", user.uid);
  const transferRef = doc(collection(db, "trade_transfers"));

  await runTransaction(db, async (tx) => {
    const me = await tx.get(myRef);
    if (!me.exists()) throw new Error("내 프로필을 찾을 수 없습니다.");
    const points = Number(me.data()?.points || 0);
    if (points < gross) throw new Error("포인트가 부족합니다.");

    tx.update(myRef, {
      points: points - gross,
      updatedAt: serverTimestamp()
    });
    tx.set(transferRef, {
      fromUid: user.uid,
      fromUsername: username,
      toUid: recipient.uid,
      toUsername: recipient.username,
      amount: gross,
      gross,
      fee,
      net,
      status: "pending",
      createdAt: serverTimestamp()
    });
  });

  await addDoc(collection(db, "users", user.uid, "transactions"), {
    type: "trade_send",
    amount: -gross,
    reason: "trade_send",
    meta: {
      toUid: recipient.uid,
      toUsername: recipient.username,
      gross,
      fee,
      net,
      transferId: transferRef.id
    },
    createdAt: serverTimestamp()
  });

  await pushSystemMessage(`${username} -> ${recipient.username} : ${gross} 전송 (수수료 ${fee}, 수령 ${net})`);
  statusEl.textContent = `전송 완료: ${gross} (수수료 ${fee}, 상대 수령 ${net})`;
}

async function sendChat(text) {
  await addDoc(collection(db, "trade_room_messages"), {
    uid: user.uid,
    username,
    text,
    createdAt: serverTimestamp()
  });
}

function initStreams() {
  const msgQ = query(collection(db, "trade_room_messages"), orderBy("createdAt", "desc"), limit(80));
  msgUnsub = onSnapshot(msgQ, (snap) => {
    renderMessages([...snap.docs].reverse());
  }, (err) => {
    statusEl.textContent = `메시지 오류: ${err.message}`;
  });

  const presenceQ = query(collection(db, "presence"), orderBy("username", "asc"), limit(40));
  presenceUnsub = onSnapshot(presenceQ, (snap) => {
    renderPresence(snap.docs);
  }, (err) => {
    statusEl.textContent = `접속자 오류: ${err.message}`;
  });

  claimIncomingTransfers().catch(() => {});
}

function init() {
  if (inited) return;
  inited = true;

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = normalizeUsername(user, p.username);
    myNameEl.textContent = username;
    pointsEl.textContent = String(Number(p.points || 0));
  });

  initStreams();
  touchPresence(true).catch(() => {});
  presenceBeat = setInterval(() => touchPresence(true).catch(() => {}), 45000);
  statusEl.textContent = "거래소 연결됨";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      const cmd = text.match(COMMAND_RE);
      if (cmd) {
        await handleGiveCommand(cmd[1], cmd[2]);
      } else {
        await sendChat(text);
      }
    } catch (err) {
      statusEl.textContent = `전송 실패: ${err.message}`;
    }
  });

  window.addEventListener("beforeunload", () => {
    if (presenceBeat) clearInterval(presenceBeat);
    if (msgUnsub) msgUnsub();
    if (presenceUnsub) presenceUnsub();
    if (incomingUnsub) incomingUnsub();
    updateDoc(doc(db, "presence", user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  });
}

function boot(nextUser) {
  if (user) return;
  user = nextUser;
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
