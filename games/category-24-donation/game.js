import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const DONATION_TITLE_TAG = "[기부왕]";
const DONATION_CASHBACK_RATE = 0.05;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const SETTLE_MINUTES = 17 * 60;
const SETTLE_WINDOW_START_OFFSET_MIN = -2; // 16:58
const SETTLE_WINDOW_END_OFFSET_MIN = 3; // 17:03

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
let settlePoll = null;
let clockTimer = null;

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

function nowKstContext(nowMs = Date.now()) {
  const kstNow = nowMs + KST_OFFSET_MS;
  const dayStartKst = Math.floor(kstNow / DAY_MS) * DAY_MS;
  const dayStartUtc = dayStartKst - KST_OFFSET_MS;
  const dayKey = new Date(dayStartUtc).toISOString().slice(0, 10);
  const minutes = Math.floor((kstNow - dayStartKst) / 60000);
  const settleAtKst = dayStartKst + (SETTLE_MINUTES * 60000);
  return {
    dayKey,
    minutes,
    canDonate: minutes < SETTLE_MINUTES,
    settleAtMs: settleAtKst - KST_OFFSET_MS,
    slotId: `${dayKey}-1700`
  };
}

function shouldAttemptSettlement(nowMs = Date.now()) {
  const c = nowKstContext(nowMs);
  const start = SETTLE_MINUTES + SETTLE_WINDOW_START_OFFSET_MIN;
  const end = SETTLE_MINUTES + SETTLE_WINDOW_END_OFFSET_MIN;
  return c.minutes >= start && c.minutes <= end;
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

function pickWinner(rows) {
  const sorted = sortRows(rows);
  return sorted[0] || null;
}

async function ensureTodayDoc() {
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

async function settleDonationTitle() {
  if (!shouldAttemptSettlement()) return;
  const c = nowKstContext();
  if (c.canDonate) return;

  const dayRefForSettle = doc(db, "donation_days", c.dayKey);
  const stateRef = doc(db, "donation_meta", "title_state");

  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const state = stateSnap.exists() ? stateSnap.data() : {};
    if (state.lastSettledSlotId === c.slotId) return;

    const daySnap = await tx.get(dayRefForSettle);
    const rows = daySnap.exists() ? rowsFromDonations(daySnap.data()?.donations) : [];
    const winner = pickWinner(rows);
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
          donationTitleTag: DONATION_TITLE_TAG,
          donationCashbackRate: DONATION_CASHBACK_RATE,
          updatedAt: serverTimestamp()
        });
      }
    }

    tx.set(stateRef, {
      lastSettledDay: c.dayKey,
      lastSettledSlotId: c.slotId,
      currentHolderUid: winner?.uid || "",
      currentHolderName: winner?.name || "",
      titleTag: winner?.uid ? DONATION_TITLE_TAG : "",
      cashbackRate: winner?.uid ? DONATION_CASHBACK_RATE : 0,
      updatedAt: serverTimestamp()
    }, { merge: true });
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
    myDonationEl.textContent = "내 오늘 기부: 없음";
    return;
  }
  myDonationEl.textContent = `내 오늘 기부: ${Math.max(0, Number(mine.amount || 0))} pts`;
}

function renderClock() {
  const c = nowKstContext();
  const now = Date.now();
  const remainMs = c.canDonate
    ? Math.max(0, c.settleAtMs - now)
    : Math.max(0, (c.settleAtMs + DAY_MS) - now);

  countdownEl.textContent = msToClockLabel(remainMs);
  donateBtn.disabled = busy || !c.canDonate;
  if (!c.canDonate && !busy) {
    statusEl.textContent = "정산 완료 시간대입니다. 다음 날 00:00(KST)부터 다시 기부 가능.";
  }
}

async function donateOnce() {
  if (busy || !dayRef || !user) return;
  const c = nowKstContext();
  if (!c.canDonate) {
    statusEl.textContent = "17:00 정산 이후에는 오늘 추가 기부가 불가합니다.";
    return;
  }

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

    statusEl.textContent = `${amount} pts 기부 완료. 오늘은 추가 기부 불가.`;
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
  const ctx = nowKstContext();
  dayKeyEl.textContent = ctx.dayKey;
  dayRef = doc(db, "donation_days", ctx.dayKey);

  await ensureTodayDoc();
  await settleDonationTitle().catch(() => {});
  startStreams();

  donateBtn.addEventListener("click", () => {
    donateOnce().catch(() => {});
  });

  renderClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    renderClock();
  }, 1000);

  if (settlePoll) clearInterval(settlePoll);
  settlePoll = setInterval(() => {
    if (document.visibilityState === "visible") settleDonationTitle().catch(() => {});
  }, 45000);
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
