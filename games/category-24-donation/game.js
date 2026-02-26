import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SETTLE_MINUTES = 17 * 60;

const pointsEl = document.getElementById("points");
const dayKeyEl = document.getElementById("day-key");
const countdownEl = document.getElementById("countdown");
const amountEl = document.getElementById("donation-amount");
const donateBtn = document.getElementById("donate-btn");
const myDonationEl = document.getElementById("my-donation");
const statusEl = document.getElementById("status");
const rankListEl = document.getElementById("rank-list");

let user = null;
let username = "";
let dayRef = null;
let dayUnsub = null;
let currentState = null;
let busy = false;
let clockTimer = null;
let currentRoundKey = "";
let roundSyncBusy = false;

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function composeUserTitleTag(profile) {
  const tags = [];
  const donation = String(profile?.donationTitleTag || "").trim();
  const land = String(profile?.landTitleTag || "").trim();
  if (donation) tags.push(donation);
  if (land && !tags.includes(land)) tags.push(land);
  return tags.join(" ").trim();
}

function withTitle(name, titleTag) {
  const base = String(name || "").trim();
  const tag = String(titleTag || "").trim();
  if (!base) return base;
  if (!tag) return base;
  if (base.startsWith(`${tag} `)) return base;
  return `${tag} ${base}`;
}

function nowKstRoundContext(nowMs = Date.now()) {
  const kstDate = new Date(nowMs + KST_OFFSET_MS);
  const minutes = (kstDate.getUTCHours() * 60) + kstDate.getUTCMinutes();
  const settleDate = new Date(Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate(),
    0,
    0,
    0
  ));
  if (minutes >= SETTLE_MINUTES) settleDate.setUTCDate(settleDate.getUTCDate() + 1);
  const roundKey = settleDate.toISOString().slice(0, 10);
  const settleAtMs = Date.UTC(
    settleDate.getUTCFullYear(),
    settleDate.getUTCMonth(),
    settleDate.getUTCDate(),
    Math.floor(SETTLE_MINUTES / 60),
    SETTLE_MINUTES % 60,
    0,
    0
  ) - KST_OFFSET_MS;
  return {
    roundKey,
    settleAtMs
  };
}

function msToClockLabel(ms) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function rowsFromDonations(donations) {
  const raw = donations && typeof donations === "object" ? donations : {};
  return Object.values(raw)
    .filter((r) => r && r.uid)
    .map((r) => ({
      uid: String(r.uid),
      name: String(r.name || "Unknown"),
      amount: Math.max(0, Math.floor(Number(r.amount || 0)))
    }));
}

function sortRows(rows) {
  return [...rows].sort((a, b) => (b.amount - a.amount) || a.uid.localeCompare(b.uid));
}

async function ensureRoundDoc() {
  if (!dayRef) return;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(dayRef);
    if (snap.exists()) return;
    tx.set(dayRef, {
      dayKey: dayRef.id,
      donations: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

function renderRanking(state) {
  rankListEl.innerHTML = "";
  const rows = sortRows(rowsFromDonations(state?.donations));
  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "아직 기부자가 없습니다.";
    rankListEl.appendChild(li);
    return;
  }

  rows.forEach((r, i) => {
    const li = document.createElement("li");
    const amount = i === 0 ? "금액 비공개" : `${r.amount} pts`;
    const leaderClass = i === 0 ? "leader-name" : "";
    li.innerHTML = `${i + 1}. <span class="${leaderClass}">${esc(r.name)}</span> (${amount})`;
    rankListEl.appendChild(li);
  });
}

function renderMyDonation(state) {
  const donations = state?.donations && typeof state.donations === "object" ? state.donations : {};
  const mine = donations[user.uid];
  if (!mine) {
    myDonationEl.textContent = "내 현재 라운드 기부: 없음";
    return;
  }
  myDonationEl.textContent = `내 현재 라운드 기부: ${Math.max(0, Number(mine.amount || 0))} pts`;
}

function renderClock() {
  const c = nowKstRoundContext();
  countdownEl.textContent = msToClockLabel(Math.max(0, c.settleAtMs - Date.now()));
  donateBtn.disabled = busy;
}

async function donateOnce() {
  if (busy || !dayRef || !user) return;
  await syncRoundIfNeeded();

  const amount = Math.max(0, Math.floor(Number(amountEl.value) || 0));
  if (amount <= 0) {
    statusEl.textContent = "기부 금액을 1 이상 입력하세요.";
    return;
  }

  busy = true;
  donateBtn.disabled = true;

  try {
    const userRef = doc(db, "users", user.uid);
    const txCol = collection(db, "users", user.uid, "transactions");

    await runTransaction(db, async (tx) => {
      const daySnap = await tx.get(dayRef);
      if (!daySnap.exists()) throw new Error("오늘 기부 보드 준비 중");
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error("유저 정보 없음");

      const points = Math.max(0, Number(userSnap.data()?.points || 0));
      if (points < amount) throw new Error("포인트 부족");

      const data = daySnap.data() || {};
      const donations = data.donations && typeof data.donations === "object" ? { ...data.donations } : {};
      if (donations[user.uid]) throw new Error("오늘은 이미 기부 완료");

      donations[user.uid] = {
        uid: user.uid,
        name: username,
        amount,
        createdAtMs: Date.now()
      };

      tx.update(userRef, {
        points: points - amount,
        updatedAt: serverTimestamp()
      });
      tx.update(dayRef, {
        donations,
        updatedAt: serverTimestamp()
      });
    });

    await addDoc(txCol, {
      type: "donation_game",
      amount: -Math.abs(amount),
      reason: "donation_once",
      meta: { dayKey: dayRef.id },
      createdAt: serverTimestamp()
    });

    statusEl.textContent = `${amount} pts 기부 완료. 이번 라운드에서는 추가 기부 불가.`;
  } catch (err) {
    statusEl.textContent = `기부 실패: ${err.message}`;
  } finally {
    busy = false;
    renderClock();
  }
}

function startStreams() {
  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    const base = normalizeUsername(user, p.username);
    username = withTitle(base, composeUserTitleTag(p));
    pointsEl.textContent = String(Math.max(0, Number(p.points || 0)));
  });

  if (dayUnsub) dayUnsub();
  dayUnsub = onSnapshot(dayRef, (snap) => {
    if (!snap.exists()) return;
    currentState = snap.data();
    renderRanking(currentState);
    renderMyDonation(currentState);
  }, (err) => {
    statusEl.textContent = `보드 오류: ${err.message}`;
  });
}

async function init() {
  await syncRoundIfNeeded();

  donateBtn.addEventListener("click", () => {
    donateOnce().catch(() => {});
  });

  renderClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    syncRoundIfNeeded().catch((err) => {
      statusEl.textContent = `라운드 전환 실패: ${err.message}`;
    });
    renderClock();
  }, 1000);
}

async function syncRoundIfNeeded() {
  if (roundSyncBusy) return;
  const ctx = nowKstRoundContext();
  if (ctx.roundKey === currentRoundKey && dayRef) return;
  roundSyncBusy = true;
  try {
    currentRoundKey = ctx.roundKey;
    dayKeyEl.textContent = currentRoundKey;
    dayRef = doc(db, "donation_days", currentRoundKey);
    await ensureRoundDoc();
    startStreams();
  } finally {
    roundSyncBusy = false;
  }
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
