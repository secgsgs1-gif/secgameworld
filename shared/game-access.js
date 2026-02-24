import { addPoints, spendPoints, watchUserProfile } from "./points.js?v=20260224m";
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
import { db } from "./firebase-app.js?v=20260224m";

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function injectHud() {
  const hud = document.createElement("div");
  hud.id = "wallet-hud";
  hud.style.cssText = "position:fixed;right:10px;top:10px;z-index:9999;background:#0d1a2dd9;color:#e9f5ff;padding:8px 10px;border-radius:8px;border:1px solid #7eb5ff66;font:13px/1.4 sans-serif";
  hud.innerHTML = '포인트: <strong id="wallet-points">0</strong>';
  document.body.appendChild(hud);
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
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function rankLabel(rank) {
  if (!rank) return "";
  if (rank === 1) return "🥇1등";
  if (rank === 2) return "🥈2등";
  if (rank === 3) return "🥉3등";
  return `#${rank}`;
}

function injectSideChat() {
  if (location.pathname.includes("category-14-live-chat")) return null;

  const panel = document.createElement("aside");
  panel.id = "game-live-chat";
  panel.style.cssText = "position:fixed;right:10px;top:56px;bottom:10px;width:320px;z-index:9998;border:1px solid #7eb5ff66;border-radius:12px;background:#0c1b2fd9;color:#eaf6ff;padding:8px;display:grid;grid-template-rows:auto auto 1fr auto auto;gap:6px;font:12px/1.4 sans-serif";
  panel.innerHTML = `
    <h3 style="margin:0;font-size:14px;">Live Chat</h3>
    <ul id="game-chat-presence" style="list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:88px;overflow:auto"></ul>
    <div id="game-chat-messages" style="border:1px solid #7eb5ff44;border-radius:8px;padding:6px;overflow:auto;display:grid;gap:5px;align-content:start;background:#112641d9"></div>
    <form id="game-chat-form" style="display:grid;grid-template-columns:1fr auto;gap:6px;">
      <input id="game-chat-input" maxlength="240" required placeholder="채팅 입력" style="padding:7px;border-radius:8px;border:1px solid #7eb5ff66;background:#143153;color:#eaf6ff;" />
      <button type="submit" style="padding:7px 10px;border-radius:8px;border:1px solid #7eb5ff66;background:#19406a;color:#eaf6ff;">전송</button>
    </form>
    <p id="game-chat-status" style="margin:0;min-height:1.2em;color:#bce4ff"></p>
  `;
  document.body.appendChild(panel);
  return panel;
}

function setupGameChat(user) {
  const panel = injectSideChat();
  if (!panel) return;

  const presenceEl = document.getElementById("game-chat-presence");
  const messagesEl = document.getElementById("game-chat-messages");
  const form = document.getElementById("game-chat-form");
  const input = document.getElementById("game-chat-input");
  const statusEl = document.getElementById("game-chat-status");

  let username = normalizeUsername(user, "");
  let rankMap = new Map();

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = normalizeUsername(user, p.username);
  });

  const rankQ = query(collection(db, "users"), orderBy("points", "desc"), limit(500));
  onSnapshot(
    rankQ,
    (snap) => {
      rankMap = new Map();
      snap.docs.forEach((d, i) => rankMap.set(d.id, i + 1));
    },
    (err) => {
      statusEl.textContent = `랭킹 오류: ${err.message}`;
    }
  );

  const msgQ = query(collection(db, "live_chat_messages"), orderBy("createdAt", "asc"), limit(80));
  onSnapshot(
    msgQ,
    (snap) => {
      messagesEl.innerHTML = "";
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const mine = data.uid === user.uid;
        const rank = rankMap.get(data.uid);
        const shownName = normalizeUsername(user, data.username);
        const row = document.createElement("article");
        row.style.cssText = `border:1px solid #7eb5ff33;border-radius:8px;padding:5px 7px;background:${mine ? "#215447" : "#1a3b62"}`;
        row.innerHTML = `<span style="display:block;font-size:11px;opacity:.82">${rankLabel(rank)} ${esc(shownName)} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
        messagesEl.appendChild(row);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    },
    (err) => {
      statusEl.textContent = `메시지 오류: ${err.message}`;
    }
  );

  const presenceQ = query(collection(db, "presence"), orderBy("username", "asc"));
  onSnapshot(
    presenceQ,
    (snap) => {
      const now = Date.now();
      const rows = snap.docs.map((s) => s.data()).filter((p) => p?.uid).sort((a, b) => {
        const aName = normalizeUsername(user, a.username).toLowerCase();
        const bName = normalizeUsername(user, b.username).toLowerCase();
        return aName > bName ? 1 : -1;
      });
      presenceEl.innerHTML = "";
      let onlineCount = 0;
      rows.forEach((p) => {
        const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
        const online = p.online && now - lastSeen < 70000;
        if (!online) return;
        onlineCount += 1;
        const li = document.createElement("li");
        li.style.cssText = "border:1px solid #7eb5ff33;border-radius:7px;padding:4px 6px;background:#133154";
        const rank = rankMap.get(p.uid);
        li.textContent = `${rankLabel(rank)} ${normalizeUsername(user, p.username)} ●`.trim();
        presenceEl.appendChild(li);
      });
      if (onlineCount === 0) {
        const li = document.createElement("li");
        li.style.cssText = "border:1px solid #7eb5ff33;border-radius:7px;padding:4px 6px;background:#133154";
        li.textContent = "접속자 없음";
        presenceEl.appendChild(li);
      }
    },
    (err) => {
      statusEl.textContent = `접속자 오류: ${err.message}`;
    }
  );

  async function touchPresence(online) {
    const safeUsername = normalizeUsername(user, username);
    await setDoc(doc(db, "presence", user.uid), {
      uid: user.uid,
      username: safeUsername,
      online,
      lastSeen: serverTimestamp()
    }, { merge: true });
  }

  touchPresence(true).catch(() => {});
  const hb = setInterval(() => touchPresence(true).catch(() => {}), 30000);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const safeUsername = normalizeUsername(user, username);
    input.value = "";
    try {
      await addDoc(collection(db, "live_chat_messages"), {
        uid: user.uid,
        username: safeUsername,
        text,
        createdAt: serverTimestamp()
      });
      statusEl.textContent = "실시간 연결됨";
    } catch (err) {
      statusEl.textContent = `전송 실패: ${err.message}`;
    }
  });

  window.addEventListener("beforeunload", () => {
    clearInterval(hb);
    updateDoc(doc(db, "presence", user.uid), {
      online: false,
      lastSeen: serverTimestamp()
    }).catch(() => {});
  });

  statusEl.textContent = "실시간 연결됨";
}

async function run(user) {
  injectHud();
  const pointsEl = document.getElementById("wallet-points");
  let currentPoints = 0;
  const listeners = new Set();

  watchUserProfile(user.uid, (profile) => {
    currentPoints = profile?.points || 0;
    pointsEl.textContent = String(currentPoints);
    listeners.forEach((fn) => fn(currentPoints));
  });

  window.AccountWallet = {
    getPoints() {
      return currentPoints;
    },
    onChange(fn) {
      listeners.add(fn);
      fn(currentPoints);
      return () => listeners.delete(fn);
    },
    async spend(amount, reason = "game_spend", meta = {}) {
      return spendPoints(user.uid, amount, reason, meta);
    },
    async earn(amount, reason = "game_reward", meta = {}) {
      await addPoints(user.uid, amount, reason, meta);
      return { ok: true };
    }
  };

  setupGameChat(user);
  document.dispatchEvent(new CustomEvent("app:wallet-ready"));
}

document.addEventListener("app:user-ready", (e) => run(e.detail.user));
if (window.__AUTH_USER__) run(window.__AUTH_USER__);
