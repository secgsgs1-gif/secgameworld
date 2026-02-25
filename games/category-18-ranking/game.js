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
const podiumCardsEl = document.getElementById("podium-cards");

let user = null;
let timer = null;
let alignTimer = null;
let booted = false;
let nextRefreshAt = 0;

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

function topOfHourLabel(ts = Date.now()) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  return `${hh}:00`;
}

function msUntilNextHour(now = Date.now()) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return Math.max(1000, d.getTime() - now);
}

function buildCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function renderTopPodium(rows) {
  podiumCardsEl.innerHTML = "";
  const labels = ["1st Place", "2nd Place", "3rd Place"];
  for (let i = 0; i < 3; i += 1) {
    const player = rows[i];
    const card = document.createElement("article");
    card.className = `podium-card rank-${i + 1}`;
    if (!player) {
      card.innerHTML = `<span class="rank-badge">${labels[i]}</span><p class="name">-</p><p class="points">No player</p>`;
      podiumCardsEl.appendChild(card);
      continue;
    }
    const uname = normalizeUsername(user, player.username, player.uid);
    const label = document.createElement("span");
    label.className = "rank-badge";
    label.textContent = labels[i];
    const name = document.createElement("p");
    name.className = "name";
    name.textContent = uname;
    const points = document.createElement("p");
    points.className = "points";
    points.textContent = `${player.points.toLocaleString()} pts`;
    const extra = document.createElement("p");
    extra.className = "extra";
    extra.textContent = `Mining Lv.${player.miningSpeedLevel}`;
    card.appendChild(label);
    card.appendChild(name);
    card.appendChild(points);
    card.appendChild(extra);
    podiumCardsEl.appendChild(card);
  }
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

  renderTopPodium(rows);
  rankBodyEl.innerHTML = "";
  let myRank = "-";
  let myPoints = 0;
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    if (idx < 3) tr.classList.add(`rank-${idx + 1}`);
    if (r.uid === user.uid) {
      tr.classList.add("me");
      myRank = String(idx + 1);
      myPoints = r.points;
    }
    tr.appendChild(buildCell(String(idx + 1)));
    tr.appendChild(buildCell(normalizeUsername(user, r.username, r.uid)));
    tr.appendChild(buildCell(r.points.toLocaleString()));
    tr.appendChild(buildCell(`Lv.${r.miningSpeedLevel}`));
    rankBodyEl.appendChild(tr);
  });

  myRankEl.textContent = myRank;
  myPointsEl.textContent = String(myPoints.toLocaleString());
  updatedAtEl.textContent = `${nowLabel()} (다음 ${topOfHourLabel(nextRefreshAt)})`;
}

function init() {
  const now = Date.now();
  nextRefreshAt = now + msUntilNextHour(now);
  refreshRank().catch((err) => {
    updatedAtEl.textContent = `오류: ${err.message}`;
  });
  alignTimer = setTimeout(() => {
    nextRefreshAt = Date.now() + 3600000;
    refreshRank().catch(() => {});
    timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      nextRefreshAt = Date.now() + 3600000;
      refreshRank().catch(() => {});
    }, 3600000);
  }, msUntilNextHour());

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() >= nextRefreshAt) {
      nextRefreshAt = Date.now() + msUntilNextHour();
      refreshRank().catch(() => {});
    }
  });

  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
    if (alignTimer) clearTimeout(alignTimer);
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
