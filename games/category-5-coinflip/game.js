const pointsEl = document.getElementById("points");
const streakEl = document.getElementById("streak");
const bestEl = document.getElementById("best");
const coinEl = document.getElementById("coin");
const resultEl = document.getElementById("result");
const historyEl = document.getElementById("history");
const cashoutBtn = document.getElementById("cashout");

let points = 100;
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

function flip(pick) {
  if (flipping) return;
  flipping = true;

  coinEl.classList.remove("flipping");
  void coinEl.offsetWidth;
  coinEl.classList.add("flipping");
  resultEl.textContent = "코인 회전 중...";

  setTimeout(() => {
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const resultText = result === "heads" ? "앞" : "뒤";
    coinEl.textContent = result === "heads" ? "앞" : "뒤";

    if (pick === result) {
      streak += 1;
      best = Math.max(best, streak);
      const gain = 10 + streak * 4;
      points += gain;
      resultEl.textContent = `적중! ${resultText}, +${gain} 포인트`;
      pushHistory(`O ${resultText}`);
    } else {
      points = Math.max(0, points - 12);
      streak = 0;
      resultEl.textContent = `실패! ${resultText}, -12 포인트`;
      pushHistory(`X ${resultText}`);
    }

    sync();
    flipping = false;
  }, 700);
}

cashoutBtn.addEventListener("click", () => {
  if (streak === 0 || flipping) return;
  const bonus = streak * 15;
  points += bonus;
  resultEl.textContent = `연승 보너스 수령 +${bonus} 포인트`;
  pushHistory(`보너스 +${bonus}`);
  streak = 0;
  sync();
});

document.querySelectorAll("button[data-pick]").forEach((btn) => {
  btn.addEventListener("click", () => flip(btn.dataset.pick));
});

sync();
pushHistory("시작");
