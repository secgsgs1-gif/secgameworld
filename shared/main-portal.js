import { logOut } from "./auth.js?v=20260224m";
import { claimDailyCheckIn, watchUserProfile } from "./points.js?v=20260226a";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "./firebase-app.js?v=20260224m";

let unsub = null;
let presenceUnsub = null;

function normalizeName(raw) {
  const v = String(raw || "").trim();
  if (v) return v;
  return "user";
}

function parseGameIdFromHref(href) {
  const m = String(href || "").match(/\/games\/([^/]+)\//);
  return m?.[1] ? String(m[1]) : "";
}

function mountGamePresenceBoard() {
  const allowedSections = new Set(["games", "mining"]);
  const gameCards = Array.from(document.querySelectorAll(".catalog-section"))
    .flatMap((section) => {
      const title = String(section.querySelector(".section-title")?.textContent || "").trim().toLowerCase();
      if (!allowedSections.has(title)) return [];
      return Array.from(section.querySelectorAll(".cards .card.ready"))
        .map((card) => {
          const link = card.querySelector("a[href*=\"/games/\"]");
          const gameId = parseGameIdFromHref(link?.getAttribute("href"));
          if (!gameId) return null;
          return { card, gameId };
        })
        .filter(Boolean);
    });

  if (!gameCards.length) return;

  const map = new Map();
  gameCards.forEach(({ card, gameId }) => {
    map.set(gameId, card);
    let box = card.querySelector(".game-presence");
    if (!box) {
      box = document.createElement("div");
      box.className = "game-presence";
      box.innerHTML = `<span class="game-presence-title">접속중 0명</span><span class="game-presence-users">-</span>`;
      card.appendChild(box);
    }
  });

  if (presenceUnsub) presenceUnsub();
  const q = query(collection(db, "presence"), orderBy("username", "asc"), limit(160));
  presenceUnsub = onSnapshot(q, (snap) => {
    const now = Date.now();
    const usersByGame = new Map();
    snap.docs.forEach((docSnap) => {
      const p = docSnap.data() || {};
      const gameId = String(p.currentGame || "").trim();
      if (!gameId || !map.has(gameId)) return;
      const lastSeen = p.lastSeen?.toDate ? p.lastSeen.toDate().getTime() : 0;
      const online = Boolean(p.online) && (now - lastSeen < 70000);
      if (!online) return;
      const rows = usersByGame.get(gameId) || [];
      rows.push(normalizeName(p.username));
      usersByGame.set(gameId, rows);
    });

    map.forEach((card, gameId) => {
      const rows = usersByGame.get(gameId) || [];
      const titleEl = card.querySelector(".game-presence-title");
      const usersEl = card.querySelector(".game-presence-users");
      if (!titleEl || !usersEl) return;
      titleEl.textContent = `접속중 ${rows.length}명`;
      if (!rows.length) {
        usersEl.textContent = "-";
        return;
      }
      const preview = rows.slice(0, 3).join(", ");
      usersEl.textContent = rows.length > 3 ? `${preview} 외 ${rows.length - 3}명` : preview;
    });
  });
}

function mountUI(user) {
  const host = document.getElementById("account-bar");
  const emailEl = document.getElementById("account-email");
  const pointsEl = document.getElementById("account-points");
  const checkInBtn = document.getElementById("checkin-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const messageEl = document.getElementById("account-message");

  host.hidden = false;
  emailEl.textContent = "로딩 중...";

  if (unsub) unsub();
  unsub = watchUserProfile(user.uid, (profile) => {
    if (!profile) return;
    emailEl.textContent = profile.username || profile.email || user.email || "익명";
    pointsEl.textContent = String(profile.points || 0);
  });

  checkInBtn.onclick = async () => {
    checkInBtn.disabled = true;
    try {
      const result = await claimDailyCheckIn(user.uid, 2000);
      messageEl.textContent = result.granted ? "출석 완료: +2000 포인트" : "오늘은 이미 출석 완료";
    } catch (e) {
      messageEl.textContent = `출석 오류: ${e.message}`;
    } finally {
      checkInBtn.disabled = false;
    }
  };

  logoutBtn.onclick = async () => {
    await logOut();
    location.reload();
  };
}

document.addEventListener("app:user-ready", (e) => {
  mountUI(e.detail.user);
  mountGamePresenceBoard();
});

if (window.__AUTH_USER__) {
  mountUI(window.__AUTH_USER__);
  mountGamePresenceBoard();
}
