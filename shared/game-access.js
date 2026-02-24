import { addPoints, spendPoints, watchUserProfile } from "./points.js?v=20260224f";

function gameCodeFromPath() {
  const parts = location.pathname.split("/");
  const idx = parts.findIndex((p) => p === "games");
  return idx >= 0 ? parts[idx + 1] || "unknown-game" : "unknown-game";
}

function injectHud() {
  const hud = document.createElement("div");
  hud.id = "wallet-hud";
  hud.style.cssText = "position:fixed;right:10px;top:10px;z-index:9999;background:#0d1a2dd9;color:#e9f5ff;padding:8px 10px;border-radius:8px;border:1px solid #7eb5ff66;font:13px/1.4 sans-serif";
  hud.innerHTML = '포인트: <strong id="wallet-points">0</strong>';
  document.body.appendChild(hud);
}

async function run(user) {
  injectHud();
  const pointsEl = document.getElementById("wallet-points");
  let currentPoints = 0;
  const listeners = new Set();
  watchUserProfile(user.uid, (profile) => {
    currentPoints = profile?.points || 0;
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
      const result = await spendPoints(user.uid, amount, reason, meta);
      return result;
    },
    async earn(amount, reason = "game_reward", meta = {}) {
      await addPoints(user.uid, amount, reason, meta);
      return { ok: true };
    }
  };

  document.dispatchEvent(new CustomEvent("app:wallet-ready"));
}

document.addEventListener("app:user-ready", (e) => {
  run(e.detail.user);
});

if (window.__AUTH_USER__) {
  run(window.__AUTH_USER__);
}
