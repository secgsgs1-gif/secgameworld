const pointsEl = document.getElementById("points");
const streakEl = document.getElementById("streak");
const bestEl = document.getElementById("best");
const coinEl = document.getElementById("coin");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const cashoutBtn = document.getElementById("cashout");

let wallet = null;
let points = 0;
let streak = 0;
let best = 0;
let flipping = false;
let history = [];

function sync() {
  pointsEl.textContent = points;
  streakEl.textContent = streak;
  bestEl.textContent = best;
}

function pushHistory(text) {
  history.unshift(text);
  history = history.slice(0, 8);
  historyEl.textContent = `최근: ${history.join(" | ")}`;
}

async function applyDelta(delta, reason) {
  if (!wallet || delta === 0) return { ok: true };
  if (delta > 0) {
    await wallet.earn(delta, reason, { game: "category-5-coinflip" });
    return { ok: true };
  }
  return wallet.spend(-delta, reason, { game: "category-5-coinflip" });
}

function bindWallet() {
  wallet = window.AccountWallet || null;
  if (!wallet) return;
  wallet.onChange((next) => {
    points = next;
    sync();
  });
}

function flip(pick) {
  if (flipping || !wallet) return;
  flipping = true;

  coinEl.classList.remove("flipping");
  void coinEl.offsetWidth;
  coinEl.classList.add("flipping");
  resultEl.textContent = "코인 회전 중...";

  setTimeout(async () => {
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const resultText = result === "heads" ? "앞" : "뒤";
    coinEl.textContent = result === "heads" ? "앞" : "뒤";

    if (pick === result) {
      streak += 1;
      best = Math.max(best, streak);
      const gain = 10 + streak * 4;
      await applyDelta(gain, "coinflip_win");
      resultEl.textContent = `적중! ${resultText}, +${gain} 포인트`;
      pushHistory(`O ${resultText}`);
    } else {
      const loss = Math.min(12, points);
      const spend = await applyDelta(-loss, "coinflip_loss");
      if (!spend.ok) {
        resultEl.textContent = "포인트 부족";
      } else {
        resultEl.textContent = `실패! ${resultText}, -${loss} 포인트`;
        pushHistory(`X ${resultText}`);
      }
      streak = 0;
    }

    sync();
    flipping = false;
  }, 700);
}

cashoutBtn.addEventListener("click", async () => {
  if (streak === 0 || flipping || !wallet) return;
  const bonus = streak * 15;
  await applyDelta(bonus, "coinflip_cashout");
  resultEl.textContent = `연승 보너스 수령 +${bonus} 포인트`;
  pushHistory(`보너스 +${bonus}`);
  streak = 0;
  sync();
});

document.querySelectorAll("button[data-pick]").forEach((btn) => {
  btn.addEventListener("click", () => flip(btn.dataset.pick));
});

document.addEventListener("app:wallet-ready", bindWallet);
if (window.AccountWallet) bindWallet();
sync();
pushHistory("시작");
