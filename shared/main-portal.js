import { logOut } from "./auth.js?v=20260224m";
import { claimDailyCheckIn, watchUserProfile } from "./points.js?v=20260225b";

let unsub = null;

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
      const result = await claimDailyCheckIn(user.uid, 500);
      messageEl.textContent = result.granted ? "출석 완료: +500 포인트" : "오늘은 이미 출석 완료";
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
});

if (window.__AUTH_USER__) {
  mountUI(window.__AUTH_USER__);
}
