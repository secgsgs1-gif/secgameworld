import { addPoints, spendPoints, watchUserProfile } from "./points.js?v=20260224m";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "./firebase-app.js?v=20260224m";

let appBooted = false;
const EMPEROR_TAG = "[Emperor]";
const DONATION_KING_TAG = "[기부왕]";
const LAND_TITLE_DISCOUNT_RATE = 0.05;
const DONATION_CASHBACK_RATE = 0.05;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LAND_SETTLE_NOON_MINUTES = 12 * 60;
const LAND_SETTLE_EVENING_MINUTES = 17 * 60;
const TAG_ALIASES = [
  { canonical: DONATION_KING_TAG, aliases: ["[DONATION KING]", "DONATION KING"] },
  { canonical: EMPEROR_TAG, aliases: ["Emperor", "[LAND KING]", "LAND KING"] }
];
let settlementOnceStarted = false;
let settlementOnceBusy = false;
const CURRENT_GAME_ID = (() => {
  const m = String(window.location.pathname || "").match(/\/games\/([^/]+)\//);
  return m?.[1] ? String(m[1]) : "unknown-game";
})();

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
  const chipClass = parsed.tag === DONATION_KING_TAG ? "game-chat-donation-king-chip" : "game-chat-land-king-chip";
  return `<span class="${chipClass}">${esc(parsed.tag)}</span> ${esc(parsed.name)}`;
}

function safeNameColor(value) {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "";
}

function decoratedNameHtmlWithColor(rawName, nameColor) {
  const parsed = splitDecoratedName(rawName);
  if (!parsed.tag) return esc(parsed.name);
  const chipClass = parsed.tag === DONATION_KING_TAG ? "game-chat-donation-king-chip" : "game-chat-land-king-chip";
  const color = safeNameColor(nameColor);
  const nameHtml = color
    ? `<span style="color:${color};font-weight:700">${esc(parsed.name)}</span>`
    : esc(parsed.name);
  return `<span class="${chipClass}">${esc(parsed.tag)}</span> ${nameHtml}`;
}

function ensureGameChatStyle() {
  if (document.getElementById("game-chat-land-king-style")) return;
  const style = document.createElement("style");
  style.id = "game-chat-land-king-style";
  style.textContent = `
    .game-chat-land-king-chip {
      display:inline-block;
      color:#ff2038;
      font-weight:800;
      letter-spacing:.02em;
      text-shadow:0 0 6px #ff485acc,0 0 16px #ff1c35cc,0 0 32px #ff0c26aa;
      animation:gameChatLandKingSpark 1.1s ease-in-out infinite;
    }
    .game-chat-donation-king-chip {
      display:inline-block;
      color:#27f2a4;
      font-weight:800;
      letter-spacing:.02em;
      text-shadow:0 0 6px #2ef0aecc,0 0 16px #1dcf95cc,0 0 32px #12a87aaa;
      animation:gameChatDonationKingSpark 1.1s ease-in-out infinite;
    }
    @keyframes gameChatLandKingSpark {
      0% { color:#ff7280; text-shadow:0 0 4px #ff5f6daa,0 0 11px #ff3f52bb,0 0 22px #ff1f35aa; }
      50% { color:#ff0d29; text-shadow:0 0 8px #ff1027ee,0 0 20px #ff0c23ee,0 0 42px #ff071cd9; }
      100% { color:#ffd4d9; text-shadow:0 0 10px #ffd9dfee,0 0 22px #ff8f9bdd,0 0 38px #ff4258cc; }
    }
    @keyframes gameChatDonationKingSpark {
      0% { color:#90ffd7; text-shadow:0 0 4px #7dffd3aa,0 0 11px #46f0babb,0 0 22px #2ad3a0aa; }
      50% { color:#14e69b; text-shadow:0 0 8px #1ff0a8ee,0 0 20px #12d08fee,0 0 42px #0fa976d9; }
      100% { color:#dbfff1; text-shadow:0 0 10px #d7fff0ee,0 0 22px #85f0c9dd,0 0 38px #3edbaacc; }
    }
  `;
  document.head.appendChild(style);
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

function tileOwnerUid(tile) {
  return String(tile?.ownerUid || tile?.uid || "").trim();
}

function tileOwnerName(tile) {
  return String(tile?.ownerName || tile?.ownername || "Unknown").trim() || "Unknown";
}

function pickLandWinner(tiles) {
  const map = new Map();
  (Array.isArray(tiles) ? tiles : []).forEach((t) => {
    const uid = tileOwnerUid(t);
    if (!uid) return;
    const row = map.get(uid) || { uid, name: tileOwnerName(t), count: 0 };
    row.count += 1;
    map.set(uid, row);
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
      slotNo: 1,
      slotId: `${c.dayKey}-S1`,
      slotLabel: "12:00 KST"
    };
  }
  return {
    dayKey: c.dayKey,
    slotNo: 2,
    slotId: `${c.dayKey}-S2`,
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
    const lastResetAtSlotId = String(dayData.lastResetAtSlotId || "");
    const alreadyResetByDay = String(dayData.lastResetAtSlotId || "") === slot.slotId;
    const alreadyDidAfternoonReset = slot.slotLabel !== "17:00 KST" && !!lastResetAtSlotId;
    const winner = daySnap.exists() ? pickLandWinner(dayData.tiles) : null;
    const prevHolderUid = String(state.currentHolderUid || "");
    const winnerUid = String(winner?.uid || "");
    const oldUserRef = prevHolderUid ? doc(db, "users", prevHolderUid) : null;
    const winnerRef = winnerUid ? doc(db, "users", winnerUid) : null;
    const oldUserSnap = oldUserRef ? await tx.get(oldUserRef) : null;
    const winnerSnap = winnerRef ? await tx.get(winnerRef) : null;

    // Heal day/meta mismatch: if board already marked as settled for this slot,
    // but meta is stale, re-sync title holder and meta without resetting board again.
    if (alreadyResetByDay && state.lastSettledSlotId !== slot.slotId) {
      if (prevHolderUid && prevHolderUid !== winnerUid) {
        if (oldUserRef && oldUserSnap?.exists()) {
          tx.update(oldUserRef, {
            landTitleTag: "",
            landDiscountRate: 0,
            updatedAt: serverTimestamp()
          });
        }
      }
      if (winnerUid) {
        if (winnerRef && winnerSnap?.exists()) {
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
      return;
    }

    if (state.lastSettledSlotId === slot.slotId || alreadyDidAfternoonReset) return;

    if (prevHolderUid && prevHolderUid !== winnerUid) {
      if (oldUserRef && oldUserSnap?.exists()) {
        tx.update(oldUserRef, {
          landTitleTag: "",
          landDiscountRate: 0,
          updatedAt: serverTimestamp()
        });
      }
    }

    if (winnerUid) {
      if (winnerRef && winnerSnap?.exists()) {
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
    const winnerUid = String(winner?.uid || "");
    const oldUserRef = prevHolderUid ? doc(db, "users", prevHolderUid) : null;
    const winnerRef = winnerUid ? doc(db, "users", winnerUid) : null;
    const oldUserSnap = oldUserRef ? await tx.get(oldUserRef) : null;
    const winnerSnap = winnerRef ? await tx.get(winnerRef) : null;
    const nextRoundSnap = await tx.get(nextRoundRef);

    if (prevHolderUid && prevHolderUid !== winnerUid) {
      if (oldUserRef && oldUserSnap?.exists()) {
        tx.update(oldUserRef, {
          donationTitleTag: "",
          donationCashbackRate: 0,
          updatedAt: serverTimestamp()
        });
      }
    }

    if (winnerUid) {
      if (winnerRef && winnerSnap?.exists()) {
        tx.update(winnerRef, {
          donationTitleTag: DONATION_KING_TAG,
          donationCashbackRate: DONATION_CASHBACK_RATE,
          updatedAt: serverTimestamp()
        });
      }
    }

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
    const prev = document.getElementById("settlement-error-banner");
    if (prev) prev.remove();
    const box = document.createElement("div");
    box.id = "settlement-error-banner";
    box.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:10001;background:#3a0e13;color:#ffdbe0;border:1px solid #ff7d8d;border-radius:8px;padding:8px 10px;font:12px/1.4 sans-serif;max-width:min(90vw,460px)";
    box.textContent = msg;
    document.body.appendChild(box);
    console.error("[settlement] game access", err);
  } finally {
    settlementOnceBusy = false;
  }
}

function injectSideChat() {
  ensureGameChatStyle();
  const panel = document.createElement("aside");
  panel.id = "game-live-chat";
  panel.style.cssText = "position:fixed;right:10px;top:56px;bottom:10px;width:320px;z-index:9998;border:1px solid #7eb5ff66;border-radius:12px;background:#0c1b2fd9;color:#eaf6ff;padding:8px;display:grid;grid-template-rows:auto 1fr;gap:6px;font:12px/1.4 sans-serif";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <h3 style="margin:0;font-size:14px;">Live Chat</h3>
      <button id="game-chat-toggle" type="button" style="padding:4px 8px;border-radius:8px;border:1px solid #7eb5ff66;background:#19406a;color:#eaf6ff;cursor:pointer;">접기</button>
    </div>
    <div id="game-chat-body" style="display:grid;grid-template-rows:auto 1fr auto auto;gap:6px;min-height:0;">
      <ul id="game-chat-presence" style="list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:88px;overflow:auto"></ul>
      <div id="game-chat-messages" style="border:1px solid #7eb5ff44;border-radius:8px;padding:6px;overflow:auto;display:grid;gap:5px;align-content:start;background:#112641d9"></div>
      <form id="game-chat-form" style="display:grid;grid-template-columns:1fr auto;gap:6px;">
        <input id="game-chat-input" maxlength="240" required placeholder="채팅 입력" style="padding:7px;border-radius:8px;border:1px solid #7eb5ff66;background:#143153;color:#eaf6ff;" />
        <button type="submit" style="padding:7px 10px;border-radius:8px;border:1px solid #7eb5ff66;background:#19406a;color:#eaf6ff;">전송</button>
      </form>
      <p id="game-chat-status" style="margin:0;min-height:1.2em;color:#bce4ff"></p>
    </div>
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
  const bodyEl = document.getElementById("game-chat-body");
  const toggleBtn = document.getElementById("game-chat-toggle");

  let username = normalizeUsername(user, "");
  let rankMap = new Map();
  let latestMessageDocs = [];
  let latestPresenceDocs = [];
  let rankPoll = null;
  let hb = null;
  let streamUnsubs = [];
  let streamsActive = false;
  let collapsed = false;
  let myTitleTag = "";
  let myUsernameColor = "";

  function applyCollapsed(next) {
    collapsed = next;
    if (collapsed) {
      bodyEl.style.display = "none";
      panel.style.top = "auto";
      panel.style.bottom = "10px";
      panel.style.width = "126px";
      panel.style.padding = "6px";
      toggleBtn.textContent = "열기";
      stopStreams();
      return;
    }
    bodyEl.style.display = "grid";
    panel.style.top = "56px";
    panel.style.bottom = "10px";
    panel.style.width = "320px";
    panel.style.padding = "8px";
    toggleBtn.textContent = "접기";
    if (document.visibilityState === "visible") startStreams();
  }

  const rankQ = query(collection(db, "users"), orderBy("points", "desc"), limit(100));
  async function refreshRank() {
    try {
      const snap = await getDocs(rankQ);
      const rows = snap.docs.map((d) => ({ id: d.id, points: Number(d.data()?.points || 0) }))
        .sort((a, b) => (b.points - a.points) || a.id.localeCompare(b.id));
      rankMap = new Map();
      rows.forEach((r, i) => rankMap.set(r.id, i + 1));
      if (latestMessageDocs.length) {
        const fakeSnap = { docs: latestMessageDocs };
        // keep message rank labels in sync whenever ranking changes
        (function rerenderMessages(s) {
          messagesEl.innerHTML = "";
          s.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const mine = data.uid === user.uid;
            const rank = rankMap.get(data.uid);
            const shownName = normalizeUsername(user, data.username);
            const row = document.createElement("article");
            row.style.cssText = `border:1px solid #7eb5ff33;border-radius:8px;padding:5px 7px;background:${mine ? "#215447" : "#1a3b62"}`;
            row.innerHTML = `<span style="display:block;font-size:11px;opacity:.82">${esc(rankLabel(rank))} ${decoratedNameHtmlWithColor(shownName, data.usernameColor)} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
            messagesEl.appendChild(row);
          });
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }(fakeSnap));
      }
      if (latestPresenceDocs.length) {
        const now = Date.now();
        const rows2 = latestPresenceDocs.map((s) => s.data()).filter((p) => p?.uid).sort((a, b) => {
          const aName = normalizeUsername(user, a.username).toLowerCase();
          const bName = normalizeUsername(user, b.username).toLowerCase();
          return aName > bName ? 1 : -1;
        });
        presenceEl.innerHTML = "";
        let onlineCount = 0;
        rows2.forEach((p) => {
          const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
          const online = p.online && now - lastSeen < 70000;
          if (!online) return;
          onlineCount += 1;
          const li = document.createElement("li");
          li.style.cssText = "border:1px solid #7eb5ff33;border-radius:7px;padding:4px 6px;background:#133154";
          const rank = rankMap.get(p.uid);
          const shownName = normalizeUsername(user, p.username);
          li.innerHTML = `${esc(rankLabel(rank))} ${decoratedNameHtmlWithColor(shownName, p.usernameColor)} ●`.trim();
          presenceEl.appendChild(li);
        });
        if (onlineCount === 0) {
          const li = document.createElement("li");
          li.style.cssText = "border:1px solid #7eb5ff33;border-radius:7px;padding:4px 6px;background:#133154";
          li.textContent = "접속자 없음";
          presenceEl.appendChild(li);
        }
      }
    } catch (err) {
      statusEl.textContent = `랭킹 오류: ${err.message}`;
    }
  }

  async function touchPresence(online) {
    const safeUsername = withTitle(normalizeUsername(user, username), myTitleTag);
    await setDoc(doc(db, "presence", user.uid), {
      uid: user.uid,
      username: safeUsername,
      usernameColor: myUsernameColor,
      currentGame: CURRENT_GAME_ID,
      currentPath: window.location.pathname || "",
      online,
      lastSeen: serverTimestamp()
    }, { merge: true });
  }

  function stopStreams() {
    streamUnsubs.forEach((fn) => fn());
    streamUnsubs = [];
    streamsActive = false;
    if (rankPoll) {
      clearInterval(rankPoll);
      rankPoll = null;
    }
    if (hb) {
      clearInterval(hb);
      hb = null;
    }
  }

  function startStreams() {
    if (streamsActive) return;
    streamsActive = true;
    streamUnsubs.push(onSnapshot(doc(db, "users", user.uid), (snap) => {
      const p = snap.data() || {};
      username = normalizeUsername(user, p.username);
      myTitleTag = composeUserTitleTag(p);
      myUsernameColor = safeNameColor(p.usernameColor);
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
        messagesEl.innerHTML = "";
        latestMessageDocs.forEach((docSnap) => {
          const data = docSnap.data();
          const mine = data.uid === user.uid;
          const rank = rankMap.get(data.uid);
          const shownName = normalizeUsername(user, data.username);
          const row = document.createElement("article");
          row.style.cssText = `border:1px solid #7eb5ff33;border-radius:8px;padding:5px 7px;background:${mine ? "#215447" : "#1a3b62"}`;
          row.innerHTML = `<span style="display:block;font-size:11px;opacity:.82">${esc(rankLabel(rank))} ${decoratedNameHtmlWithColor(shownName, data.usernameColor)} · ${timeLabel(data.createdAt)}</span>${esc(data.text || "")}`;
          messagesEl.appendChild(row);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
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
          const shownName = normalizeUsername(user, p.username);
          li.innerHTML = `${esc(rankLabel(rank))} ${decoratedNameHtmlWithColor(shownName, p.usernameColor)} ●`.trim();
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
    ));

    touchPresence(true).catch(() => {});
    hb = setInterval(() => touchPresence(true).catch(() => {}), 45000);
    statusEl.textContent = "실시간 연결됨";
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      if (!collapsed) {
        startStreams();
        touchPresence(true).catch(() => {});
      }
      return;
    }
    stopStreams();
    updateDoc(doc(db, "presence", user.uid), {
      online: false,
      lastSeen: serverTimestamp()
    }).catch(() => {});
    statusEl.textContent = "백그라운드 대기";
  }

  toggleBtn.addEventListener("click", () => {
    applyCollapsed(!collapsed);
  });

  const mobile = window.matchMedia("(max-width: 900px)").matches;
  applyCollapsed(mobile);
  document.addEventListener("visibilitychange", onVisibility);
  if (!mobile) startStreams();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const safeUsername = withTitle(normalizeUsername(user, username), myTitleTag);
    input.value = "";
    try {
      await addDoc(collection(db, "live_chat_messages"), {
        uid: user.uid,
        username: safeUsername,
        usernameColor: myUsernameColor,
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
    if (hb) clearInterval(hb);
    streamUnsubs.forEach((fn) => fn());
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
  let currentTitleTag = "";
  let currentDiscountRate = 0;
  const listeners = new Set();

  watchUserProfile(user.uid, (profile) => {
    currentPoints = profile?.points || 0;
    currentTitleTag = String(profile?.landTitleTag || "");
    const dr = Number(profile?.landDiscountRate || 0);
    currentDiscountRate = Number.isFinite(dr) && dr > 0 ? dr : 0;
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
      const baseAmount = Math.max(0, Math.floor(Number(amount) || 0));
      if (baseAmount <= 0) return { ok: true, points: currentPoints, chargedAmount: 0, baseAmount: 0, discountApplied: 0 };
      const discountEligible = Boolean(meta?.discountEligible);
      const cappedRate = Math.min(0.5, Math.max(0, Number(currentDiscountRate || 0)));
      const chargedAmount = discountEligible ? Math.max(0, Math.floor(baseAmount * (1 - cappedRate))) : baseAmount;
      const payload = {
        ...meta,
        baseAmount,
        chargedAmount,
        discountEligible,
        discountRate: discountEligible ? cappedRate : 0,
        discountTag: discountEligible ? currentTitleTag : ""
      };
      const res = await spendPoints(user.uid, chargedAmount, reason, payload);
      return {
        ...res,
        chargedAmount,
        baseAmount,
        discountApplied: Math.max(0, baseAmount - chargedAmount)
      };
    },
    async earn(amount, reason = "game_reward", meta = {}) {
      await addPoints(user.uid, amount, reason, meta);
      return { ok: true };
    }
  };

  setupGameChat(user);
  runSettlementsOnceOnEntry().catch(() => {});
  document.dispatchEvent(new CustomEvent("app:wallet-ready"));
}

function boot(nextUser) {
  if (appBooted) return;
  appBooted = true;
  run(nextUser).catch(() => {
    appBooted = false;
  });
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
