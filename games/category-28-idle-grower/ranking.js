import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db, isFirebaseConfigured } from "../../shared/firebase-app.js?v=20260224m";

const myRankEl = document.getElementById("stage-rank-my-rank");
const myBestEl = document.getElementById("stage-rank-my-best");
const updatedEl = document.getElementById("stage-rank-updated");
const listEl = document.getElementById("stage-rank-list");

let me = null;
let meName = "";
let unsub = null;
let bestSubmitted = 0;
let lastWriteAt = 0;

if (!isFirebaseConfigured() || !db) {
  updatedEl.textContent = "Firebase 미설정";
} else {
  document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
  if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
  window.addEventListener("idle:stage-progress", (e) => {
    if (!me) return;
    const d = e.detail || {};
    pushProgress(d).catch(() => {});
  });
}

async function boot(user) {
  if (!user) return;
  me = user;
  meName = await resolveName(user);

  if (unsub) unsub();
  const q = query(collection(db, "idle_stage_rankings"), orderBy("bestStage", "desc"), limit(50));
  unsub = onSnapshot(q, (snap) => {
    const rows = snap.docs.map((s) => ({ id: s.id, ...s.data() }));
    renderRows(rows);
  }, (err) => {
    updatedEl.textContent = `랭킹 로드 오류: ${err.message}`;
  });
}

async function resolveName(user) {
  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile = profileSnap.data() || {};
    const byProfile = String(profile.username || "").trim();
    if (byProfile) return byProfile;
  } catch (_) {
    // ignore profile lookup failures
  }

  const byMail = String(user.email || "").split("@")[0].trim();
  if (byMail) return byMail;
  return `user_${String(user.uid || "").slice(0, 6)}`;
}

async function pushProgress(detail) {
  const stage = Math.max(1, Number(detail.stage || 1));
  const wave = Math.max(1, Number(detail.wave || 1));
  const bestStage = Math.max(stage, Number(detail.bestStage || stage));
  const kills = Math.max(0, Number(detail.kills || 0));
  const power = Math.max(0, Number(detail.power || 0));
  const force = Boolean(detail.force);

  if (!force && bestStage <= bestSubmitted && Date.now() - lastWriteAt < 20000) {
    return;
  }

  await setDoc(doc(db, "idle_stage_rankings", me.uid), {
    uid: me.uid,
    username: meName,
    bestStage,
    currentStage: stage,
    currentWave: wave,
    kills,
    power,
    updatedAt: serverTimestamp()
  }, { merge: true });

  bestSubmitted = Math.max(bestSubmitted, bestStage);
  lastWriteAt = Date.now();
}

function renderRows(rows) {
  listEl.innerHTML = "";

  if (!rows.length) {
    listEl.innerHTML = "<li>아직 데이터 없음</li>";
    myRankEl.textContent = "-";
    myBestEl.textContent = "-";
    updatedEl.textContent = nowLabel();
    return;
  }

  rows.forEach((row, i) => {
    const li = document.createElement("li");
    const stage = Number(row.bestStage || 0);
    const current = Number(row.currentStage || 0);
    const wave = Number(row.currentWave || 0);
    const name = String(row.username || row.uid || "user");
    li.textContent = `${i + 1}. ${name} | 최고 ${stage} 스테이지 | 현재 ${current}-${wave}`;
    if (row.uid === me?.uid) {
      li.style.borderColor = "rgba(123, 239, 190, 0.72)";
      myRankEl.textContent = String(i + 1);
      myBestEl.textContent = String(stage);
      bestSubmitted = Math.max(bestSubmitted, stage);
    }
    listEl.appendChild(li);
  });

  if (myRankEl.textContent === "-") {
    const mine = rows.find((r) => r.uid === me?.uid);
    if (mine) {
      myBestEl.textContent = String(Number(mine.bestStage || 0));
    }
  }

  updatedEl.textContent = nowLabel();
}

function nowLabel() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `업데이트 ${hh}:${mm}:${ss}`;
}
