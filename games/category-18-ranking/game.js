import {
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const myRankEl = document.getElementById("my-rank");
const myPointsEl = document.getElementById("my-points");
const updatedAtEl = document.getElementById("updated-at");
const rankBodyEl = document.getElementById("rank-body");

let user = null;
let timer = null;
let booted = false;

function normalizeUsername(currentUser, rawName, uid) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(uid || currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function nowLabel() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function refreshRank() {
  const q = query(collection(db, "users"), orderBy("points", "desc"), limit(100));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({
    uid: d.id,
    username: d.data()?.username || "",
    points: Number(d.data()?.points || 0),
    miningSpeedLevel: Number(d.data()?.miningSpeedLevel || 0)
  })).sort((a, b) => (b.points - a.points) || a.uid.localeCompare(b.uid));

  rankBodyEl.innerHTML = "";
  let myRank = "-";
  let myPoints = 0;
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    if (r.uid === user.uid) {
      tr.className = "me";
      myRank = String(idx + 1);
      myPoints = r.points;
    }
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${normalizeUsername(user, r.username, r.uid)}</td>
      <td>${r.points.toLocaleString()}</td>
      <td>Lv.${r.miningSpeedLevel}</td>
    `;
    rankBodyEl.appendChild(tr);
  });

  myRankEl.textContent = myRank;
  myPointsEl.textContent = String(myPoints.toLocaleString());
  updatedAtEl.textContent = nowLabel();
}

function init() {
  refreshRank().catch((err) => {
    updatedAtEl.textContent = `오류: ${err.message}`;
  });
  timer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    refreshRank().catch(() => {});
  }, 60000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshRank().catch(() => {});
    }
  });

  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
  });
}

function boot(nextUser) {
  if (booted) return;
  booted = true;
  user = nextUser;
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
