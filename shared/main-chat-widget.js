import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  runTransaction,
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
let latestMessageDocs = [];
let latestPresenceDocs = [];
let initStarted = false;
let rankPoll = null;
let streamUnsubs = [];
let streamsActive = false;
let myTitleTag = "";
const EMPEROR_TAG = "[Emperor]";
const DONATION_KING_TAG = "[기부왕]";
const TAG_ALIASES = [
  { canonical: DONATION_KING_TAG, aliases: ["[DONATION KING]", "DONATION KING"] },
  { canonical: EMPEROR_TAG, aliases: ["Emperor", "[LAND KING]", "LAND KING"] }
];
const LAND_TITLE_DISCOUNT_RATE = 0.05;
const DONATION_CASHBACK_RATE = 0.05;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LAND_SETTLE_NOON_MINUTES = (15 * 60) + 5;
const LAND_SETTLE_EVENING_MINUTES = 17 * 60;
let settlementOnceStarted = false;
let settlementOnceBusy = false;

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function withTitle(name, titleTag) {
  const base = String(name || "").trim();
  const tag = String(titleTag || "").trim();
  if (!base) return base;
  if (!tag) return base;
  if (base.startsWith(`${tag} `)) return base;
  return `${tag} ${base}`;
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

function composeUserTitleTag(profile) {
  const tags = [];
  const donation = String(profile?.donationTitleTag || "").trim();
  const land = String(profile?.landTitleTag || "").trim();
  if (donation) tags.push(donation);
  if (land && !tags.includes(land)) tags.push(land);
  return tags.join(" ").trim();
}

function splitDecoratedName(rawName) {
  const value = String(rawName || "").trim();
  if (!value) return { tag: "", name: "" };
  if (value.startsWith(`${DONATION_KING_TAG} `)) {
    return { tag: DONATION_KING_TAG, name: value.slice(DONATION_KING_TAG.length).trim() };
  }
  if (value.startsWith(`${EMPEROR_TAG} `)) {
    return { tag: EMPEROR_TAG, name: value.slice(EMPEROR_TAG.length).trim() };
  }
  for (const item of TAG_ALIASES) {
    for (const alias of item.aliases) {
      if (value.startsWith(`${alias} `)) {
        return { tag: item.canonical, name: value.slice(alias.length).trim() };
      }
    }
  }
  return { tag: "", name: value };
}

function decoratedNameHtml(rawName) {
  const parsed = splitDecoratedName(rawName);
  if (!parsed.tag) return esc(parsed.name);
  return `<span class="land-king-chip">${esc(parsed.tag)}</span> ${esc(parsed.name)}`;
}

function kstNowContext(nowMs = Date.now()) {
  const kstDate = new Date(nowMs + KST_OFFSET_MS);
  const dayKey = kstDate.toISOString().slice(0, 10);
  const minutes = (kstDate.getUTCHours() * 60) + kstDate.getUTCMinutes();
  return { dayKey, minutes };
}

function createDefaultLandTiles() {
  return Array.from({ length: 10 }, (_, i) => ({
    idx: i,
    ownerUid: "",
    ownerName: "",
    price: 100,
    updatedAtMs: 0
  }));
}

function pickLandWinner(tiles) {
  const map = new Map();
  (Array.isArray(tiles) ? tiles : []).forEach((t) => {
    if (!t?.ownerUid) return;
    const row = map.get(t.ownerUid) || { uid: t.ownerUid, name: t.ownerName || "Unknown", count: 0 };
    row.count += 1;
    map.set(t.ownerUid, row);
  });
  const rows = [...map.values()].sort((a, b) => (b.count - a.count) || a.uid.localeCompare(b.uid));
  return rows[0] || null;
}

function pickDonationWinner(donations) {
  const rows = Object.values(donations && typeof donations === "object" ? donations : {})
    .filter((x) => x?.uid)
    .map((x) => ({
      uid: String(x.uid),
      name: String(x.name || "Unknown"),
      amount: Math.max(0, Math.floor(Number(x.amount || 0)))
    }))
    .sort((a, b) => (b.amount - a.amount) || a.uid.localeCompare(b.uid));
  return rows[0] || null;
}

function landSettlementContext(nowMs = Date.now()) {
  const c = kstNowContext(nowMs);
  if (c.minutes < LAND_SETTLE_NOON_MINUTES) return null;
  if (c.minutes < LAND_SETTLE_EVENING_MINUTES) {
    return {
      dayKey: c.dayKey,
      slotNo: 2,
      slotId: `${c.dayKey}-S2`,
      slotLabel: "15:05 KST"
    };
  }
  return {
    dayKey: c.dayKey,
    slotNo: 3,
    slotId: `${c.dayKey}-S3`,
    slotLabel: "17:00 KST"
  };
}

function donationSettlementContext(nowMs = Date.now()) {
  const c = kstNowContext(nowMs);
  if (c.minutes < LAND_SETTLE_EVENING_MINUTES) return null;
  return {
    dayKey: c.dayKey,
    slotId: `${c.dayKey}-1700`
  };
}

function nextDayKey(dayKey) {
  const base = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return dayKey;
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

async function settleLandGrabTitleBySchedule() {
  const slot = landSettlementContext();
  if (!slot) return;
  const dayRef = doc(db, "land_grab_days", slot.dayKey);
  const stateRef = doc(db, "land_grab_meta", "title_state");

  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const state = stateSnap.exists() ? stateSnap.data() : {};
    const daySnap = await tx.get(dayRef);
    const dayData = daySnap.exists() ? (daySnap.data() || {}) : {};
    const alreadyResetByDay = String(dayData.lastResetAtSlotId || "") === slot.slotId;
    if (state.lastSettledSlotId === slot.slotId || alreadyResetByDay) return;

    const winner = daySnap.exists() ? pickLandWinner(dayData.tiles) : null;
    const prevHolderUid = String(state.currentHolderUid || "");

    if (prevHolderUid && prevHolderUid !== (winner?.uid || "")) {
      const oldUserRef = doc(db, "users", prevHolderUid);
      const oldUserSnap = await tx.get(oldUserRef);
      if (oldUserSnap.exists()) {
        tx.update(oldUserRef, {
          landTitleTag: "",
          landDiscountRate: 0,
          updatedAt: serverTimestamp()
        });
      }
    }

    if (winner?.uid) {
      const winnerRef = doc(db, "users", winner.uid);
      const winnerSnap = await tx.get(winnerRef);
      if (winnerSnap.exists()) {
        tx.update(winnerRef, {
          landTitleTag: EMPEROR_TAG,
          landDiscountRate: LAND_TITLE_DISCOUNT_RATE,
          updatedAt: serverTimestamp()
        });
      }
    }

    tx.set(stateRef, {
      lastSettledDay: slot.dayKey,
      lastSettledSlotNo: slot.slotNo,
      lastSettledSlotId: slot.slotId,
      lastSettledSlotLabel: slot.slotLabel,
      currentHolderUid: winner?.uid || "",
      currentHolderName: winner?.name || "",
      titleTag: winner?.uid ? EMPEROR_TAG : "",
      discountRate: winner?.uid ? LAND_TITLE_DISCOUNT_RATE : 0,
      updatedAt: serverTimestamp()
    }, { merge: true });

    tx.set(dayRef, {
      dayKey: slot.dayKey,
      tiles: createDefaultLandTiles(),
      lastResetAtSlotId: slot.slotId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}

async function settleDonationTitleBySchedule() {
  const slot = donationSettlementContext();
  if (!slot) return;
  const dayRef = doc(db, "donation_days", slot.dayKey);
  const nextRoundKey = nextDayKey(slot.dayKey);
  const nextRoundRef = doc(db, "donation_days", nextRoundKey);
  const stateRef = doc(db, "donation_meta", "title_state");

  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const state = stateSnap.exists() ? stateSnap.data() : {};
    if (state.lastSettledSlotId === slot.slotId) return;

    const daySnap = await tx.get(dayRef);
    const winner = daySnap.exists() ? pickDonationWinner(daySnap.data()?.donations) : null;
    const prevHolderUid = String(state.currentHolderUid || "");

    if (prevHolderUid && prevHolderUid !== (winner?.uid || "")) {
      const oldUserRef = doc(db, "users", prevHolderUid);
      const oldUserSnap = await tx.get(oldUserRef);
      if (oldUserSnap.exists()) {
        tx.update(oldUserRef, {
          donationTitleTag: "",
          donationCashbackRate: 0,
          updatedAt: serverTimestamp()
        });
      }
    }

    if (winner?.uid) {
      const winnerRef = doc(db, "users", winner.uid);
      const winnerSnap = await tx.get(winnerRef);
      if (winnerSnap.exists()) {
        tx.update(winnerRef, {
          donationTitleTag: DONATION_KING_TAG,
          donationCashbackRate: DONATION_CASHBACK_RATE,
          updatedAt: serverTimestamp()
        });
      }
    }

    const nextRoundSnap = await tx.get(nextRoundRef);
    if (!nextRoundSnap.exists()) {
      tx.set(nextRoundRef, {
        dayKey: nextRoundKey,
        donations: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    tx.set(stateRef, {
      lastSettledDay: slot.dayKey,
      lastSettledSlotId: slot.slotId,
      currentHolderUid: winner?.uid || "",
      currentHolderName: winner?.name || "",
      titleTag: winner?.uid ? DONATION_KING_TAG : "",
      cashbackRate: winner?.uid ? DONATION_CASHBACK_RATE : 0,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}

async function runSettlementsOnceOnEntry() {
  if (settlementOnceStarted || settlementOnceBusy) return;
  settlementOnceStarted = true;
  settlementOnceBusy = true;
  try {
    await settleLandGrabTitleBySchedule();
    await settleDonationTitleBySchedule();
  } catch (err) {
    const msg = `정산 오류: ${err?.message || err}`;
    if (statusEl) statusEl.textContent = msg;
    console.error("[settlement] main widget", err);
  } finally {
    settlementOnceBusy = false;
  }
}

function renderPresence(docs) {
  const now = Date.now();
  const rows = docs.map((x) => x.data()).filter((p) => p?.uid).sort((a, b) => {
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
    const rank = rankMap.get(p.uid);
    const shownName = normalizeUsername(user, p.username);
    const li = document.createElement("li");
    li.innerHTML = `${esc(rankLabel(rank))} ${decoratedNameHtml(shownName)} ●`.trim();
    presenceEl.appendChild(li);
  });
  if (onlineCount === 0) {
    const li = document.createElement("li");
    li.textContent = "접속자 없음";
    presenceEl.appendChild(li);
  }
}

function renderMessages(docs) {
  messagesEl.innerHTML = "";
  docs.forEach((snap) => {
    const data = snap.data();
    const mine = data.uid === user.uid;
    const rank = rankMap.get(data.uid);
    const shownName = normalizeUsername(user, data.username);
    const row = document.createElement("article");
    row.className = `main-msg${mine ? " me" : ""}`;
    row.innerHTML = `<span class="main-meta">${esc(rankLabel(rank))} ${decoratedNameHtml(shownName)} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
    messagesEl.appendChild(row);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function touchPresence(online) {
  if (!user) return;
  const safeUsername = withTitle(normalizeUsername(user, username), myTitleTag);
  await setDoc(doc(db, "presence", user.uid), {
    uid: user.uid,
    username: safeUsername,
    online,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

async function init() {
  if (!presenceEl || !messagesEl || !form || !input || !statusEl) return;
  statusEl.textContent = "채팅 연결 중...";
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
      myTitleTag = composeUserTitleTag(p);
    }));

    refreshRank().catch(() => {});
    rankPoll = setInterval(() => {
      if (document.visibilityState === "visible") refreshRank().catch(() => {});
    }, 120000);

    const msgQ = query(collection(db, "live_chat_messages"), orderBy("createdAt", "desc"), limit(60));
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

    touchPresence(true).catch(() => {});
    heartbeat = setInterval(() => touchPresence(true).catch(() => {}), 45000);
    statusEl.textContent = "실시간 연결됨";
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      startStreams();
      touchPresence(true).catch(() => {});
      return;
    }
    stopStreams();
    updateDoc(doc(db, "presence", user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
    statusEl.textContent = "백그라운드 대기";
  }

  document.addEventListener("visibilitychange", onVisibility);
  startStreams();
  runSettlementsOnceOnEntry().catch(() => {});
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!user || !text) return;
  const safeUsername = withTitle(normalizeUsername(user, username), myTitleTag);
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
    if (statusEl) statusEl.textContent = `오류: ${err.message}`;
  });
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));

if (window.__AUTH_USER__) {
  boot(window.__AUTH_USER__);
}
