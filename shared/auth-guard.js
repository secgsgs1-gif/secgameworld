import { auth, isFirebaseConfigured } from "./firebase-app.js?v=20260224d";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { ensureUserProfile } from "./auth.js?v=20260224d";

function showConfigMessage() {
  const msg = document.createElement("div");
  msg.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;background:#000c;color:#fff;z-index:9999;padding:20px;text-align:center;font-family:sans-serif";
  msg.innerHTML = "<div><h2>Firebase 설정 필요</h2><p>shared/firebase-config.js에 Firebase 값을 입력하세요.</p></div>";
  document.body.appendChild(msg);
}

if (!isFirebaseConfigured()) {
  showConfigMessage();
} else {
  onAuthStateChanged(auth, async (user) => {
    const isAuthPage = location.pathname.includes("/auth/");

    if (!user && !isAuthPage) {
      const root = window.APP_ROOT || "./";
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.href = `${root}auth/index.html?redirect=${redirect}`;
      return;
    }

    if (user) {
      await ensureUserProfile(user);
      window.__AUTH_USER__ = user;
      document.dispatchEvent(new CustomEvent("app:user-ready", { detail: { user } }));

      if (isAuthPage) {
        const q = new URLSearchParams(location.search);
        const redirect = q.get("redirect");
        location.href = redirect || `${window.APP_ROOT || "../"}index.html`;
      }
    }
  });
}
