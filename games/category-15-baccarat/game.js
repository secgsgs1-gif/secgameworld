import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";
import { formatCashbackPercent, getEquippedWeapon } from "../../shared/weapons.js?v=20260225c";

const countdownEl = document.getElementById("countdown");
const roundStatusEl = document.getElementById("round-status");
const pointsEl = document.getElementById("points");
const weaponBonusEl = document.getElementById("weapon-bonus");
const placeBetBtn = document.getElementById("place-bet");
const resultEl = document.getElementById("result");
const tableResultEl = document.getElementById("table-result");
const recentResultsEl = document.getElementById("recent-results");
const cardSlots = {
  player: [
    document.getElementById("player-card-1"),
    document.getElementById("player-card-2")
  ],
  banker: [
    document.getElementById("banker-card-1"),
    document.getElementById("banker-card-2")
  ]
};

const betInputs = {
  player: document.getElementById("bet-player"),
  banker: document.getElementById("bet-banker"),
  tie: document.getElementById("bet-tie")
};

const bettorsEls = {
  player: document.getElementById("bettors-player"),
  banker: document.getElementById("bettors-banker"),
  tie: document.getElementById("bettors-tie")
};
const tableBettorsEls = {
  player: document.getElementById("table-bettors-player"),
  banker: document.getElementById("table-bettors-banker"),
  tie: document.getElementById("table-bettors-tie")
};

const ROUND_INTERVAL_MS = 120000; // 2 min
const REVEAL_DURATION_MS = 9000; // 9 sec
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ROUNDS_PER_DAY = DAY_MS / ROUND_INTERVAL_MS;
const PAYOUT = { player: 2, banker: 2, tie: 9 };

let user = null;
let username = "";
let points = 0;
let lastSettledRound = "";
let observedBetRound = "";
let roundBetsUnsub = null;
let loopTimer = null;
let booted = false;
let lastRevealRound = "";
let dealTimer = null;
let settleBlockedUntil = 0;
let settleBackoffMs = 10000;
let betsPaused = false;

function withTitle(name, titleTag) {
  const base = String(name || "").trim();
  const tag = String(titleTag || "").trim();
  if (!base) return base;
  if (!tag) return base;
  if (base.startsWith(`${tag} `)) return base;
  return `${tag} ${base}`;
}

function isQuotaError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "resource-exhausted" || msg.includes("quota exceeded") || msg.includes("resource exhausted");
}

function hashRoundId(roundId) {
  let h = 2166136261 >>> 0;
  const s = String(roundId);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function outcomeForRound(roundId) {
  const cards = cardsForRound(roundId);
  if (cards.playerTotal > cards.bankerTotal) return "player";
  if (cards.bankerTotal > cards.playerTotal) return "banker";
  return "tie";
}

function outcomeLabel(key) {
  if (key === "player") return "Player";
  if (key === "banker") return "Banker";
  return "Tie";
}

function nextRand(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function cardFromSeed(seed) {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  const rank = ranks[seed % 13];
  const suit = suits[(seed >>> 4) % 4];
  const faceVal = rank === "A" ? 1 : Number(rank);
  const value = Number.isNaN(faceVal) ? 0 : faceVal;
  return {
    label: `${rank}${suit}`,
    value
  };
}

function cardsForRound(roundId) {
  let seed = hashRoundId(roundId);
  const draw = () => {
    seed = nextRand(seed);
    return cardFromSeed(seed);
  };
  const playerCards = [draw(), draw()];
  const bankerCards = [draw(), draw()];
  const playerTotal = (playerCards[0].value + playerCards[1].value) % 10;
  const bankerTotal = (bankerCards[0].value + bankerCards[1].value) % 10;
  return { playerCards, bankerCards, playerTotal, bankerTotal };
}

function resetCards() {
  ["player", "banker"].forEach((side) => {
    cardSlots[side].forEach((slot) => {
      slot.textContent = "?";
      slot.classList.remove("deal-in");
    });
  });
}

function fillCard(slot, card) {
  slot.classList.remove("deal-in");
  slot.textContent = card.label;
  // retrigger animation
  void slot.offsetWidth;
  slot.classList.add("deal-in");
}

function animateReveal(roundId) {
  if (dealTimer) clearInterval(dealTimer);
  resetCards();
  const cards = cardsForRound(roundId);
  const sequence = [
    { slot: cardSlots.player[0], card: cards.playerCards[0] },
    { slot: cardSlots.banker[0], card: cards.bankerCards[0] },
    { slot: cardSlots.player[1], card: cards.playerCards[1] },
    { slot: cardSlots.banker[1], card: cards.bankerCards[1] }
  ];
  let i = 0;
  dealTimer = setInterval(() => {
    const item = sequence[i];
    if (item) fillCard(item.slot, item.card);
    i += 1;
    if (i >= sequence.length) {
      clearInterval(dealTimer);
      dealTimer = null;
      tableResultEl.textContent = `${outcomeLabel(outcomeForRound(roundId))} 승 (P${cards.playerTotal} : B${cards.bankerTotal})`;
    }
  }, 430);
}

function currentClock(now = Date.now()) {
  const kstNow = now + KST_OFFSET_MS;
  const dayStartKst = Math.floor(kstNow / DAY_MS) * DAY_MS;
  const dayStartUtc = dayStartKst - KST_OFFSET_MS;
  const dayKey = new Date(dayStartUtc).toISOString().slice(0, 10);

  const elapsedInDay = kstNow - dayStartKst;
  const tickInDay = Math.floor(elapsedInDay / ROUND_INTERVAL_MS);
  const roundStartAt = dayStartUtc + tickInDay * ROUND_INTERVAL_MS;
  const nextRoundAt = roundStartAt + ROUND_INTERVAL_MS;
  const inReveal = now >= roundStartAt && now < roundStartAt + REVEAL_DURATION_MS;

  const revealRoundNo = tickInDay + 1;
  const bettingRoundNoRaw = revealRoundNo + 1;
  const bettingCrossDay = bettingRoundNoRaw > ROUNDS_PER_DAY;
  const bettingRoundNo = bettingCrossDay ? 1 : bettingRoundNoRaw;
  const bettingDayKey = bettingCrossDay
    ? new Date(dayStartUtc + DAY_MS).toISOString().slice(0, 10)
    : dayKey;
  const revealRoundId = `${dayKey}-R${revealRoundNo}`;
  const bettingRoundId = `${bettingDayKey}-R${bettingRoundNo}`;

  return {
    now,
    dayKey,
    inReveal,
    nextRoundAt,
    revealRoundNo,
    bettingRoundNo,
    revealRoundId,
    bettingRoundId
  };
}

function parseBets() {
  const amounts = {};
  let total = 0;
  ["player", "banker", "tie"].forEach((key) => {
    const v = Math.max(0, Math.floor(Number(betInputs[key].value) || 0));
    if (v > 0) {
      amounts[key] = v;
      total += v;
    }
  });
  return { amounts, total };
}

async function placeBet() {
  const c = currentClock();
  if (c.inReveal) {
    resultEl.textContent = "결과 공개 중에는 배팅할 수 없습니다.";
    return;
  }

  const { amounts, total } = parseBets();
  if (total <= 0) {
    resultEl.textContent = "배팅 금액을 입력하세요.";
    return;
  }
  const roundId = String(c.bettingRoundId);
  const betRef = doc(db, "baccarat_rounds", roundId, "bets", user.uid);
  const existing = await getDoc(betRef);
  if (existing.exists()) {
    resultEl.textContent = "이번 라운드 이미 배팅 완료";
    return;
  }

  const spend = await window.AccountWallet.spend(total, "baccarat_bet", {
    game: "category-15-baccarat",
    roundId,
    discountEligible: true
  });
  if (!spend.ok) {
    resultEl.textContent = "포인트 차감 실패";
    return;
  }

  await runTransaction(db, async (tx) => {
    tx.set(betRef, {
      uid: user.uid,
      username,
      amounts,
      total,
      settled: false,
      createdAt: serverTimestamp()
    });
  });

  const charged = Number(spend.chargedAmount || total);
  resultEl.textContent = charged < total
    ? `배팅 완료: 선택 ${total}, 칭호 할인 적용 결제 ${charged}`
    : `배팅 완료: 총 ${total}`;
}

async function settleMyBet(roundId) {
  if (!roundId || lastSettledRound === roundId) return;

  const resultKey = outcomeForRound(roundId);
  const payoutMultiplier = PAYOUT[resultKey] || 0;
  const betRef = doc(db, "baccarat_rounds", String(roundId), "bets", user.uid);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (tx) => {
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) return;
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;

    const bet = betSnap.data();
    if (bet.settled) return;
    const equippedWeapon = getEquippedWeapon(userSnap.data() || {});
    const cashbackRate = Number(equippedWeapon?.cashbackRate || 0);

    const hitAmount = Number(bet.amounts?.[resultKey] || 0);
    const payout = hitAmount > 0 ? hitAmount * payoutMultiplier : 0;
    const totalBet = Math.max(0, Number(bet.total || 0));
    const cashback = cashbackRate > 0 ? Math.floor(totalBet * cashbackRate) : 0;
    const totalCredit = payout + cashback;

    tx.update(betRef, {
      settled: true,
      settledAt: serverTimestamp(),
      resultKey,
      payout,
      cashback,
      cashbackRate,
      cashbackWeaponId: equippedWeapon?.id || null
    });

    if (totalCredit > 0) {
      tx.update(userRef, {
        points: increment(totalCredit),
        updatedAt: serverTimestamp()
      });
    }
  });

  lastSettledRound = roundId;
  tableResultEl.textContent = `${outcomeLabel(resultKey)} 승`;
  const mine = await getDoc(betRef);
  if (mine.exists()) {
    const d = mine.data();
    const cashback = Number(d.cashback || 0);
    if (d.payout > 0) {
      if (cashback > 0) {
        resultEl.textContent = `당첨! ${outcomeLabel(d.resultKey)} x${PAYOUT[d.resultKey]}, 배당 +${d.payout}, 캐시백 +${cashback}`;
      } else {
        resultEl.textContent = `당첨! ${outcomeLabel(d.resultKey)} x${PAYOUT[d.resultKey]} 지급 +${d.payout}`;
      }
    }
    else if (cashback > 0) {
      resultEl.textContent = `미당첨. 결과: ${outcomeLabel(resultKey)}, 무기 캐시백 +${cashback}`;
    }
    else {
      resultEl.textContent = `미당첨. 결과: ${outcomeLabel(resultKey)}`;
    }
  }
}

function renderBettors(docs) {
  const map = { player: [], banker: [], tie: [] };
  docs.forEach((snap) => {
    const b = snap.data();
    ["player", "banker", "tie"].forEach((key) => {
      const amt = Number(b.amounts?.[key] || 0);
      if (amt > 0) map[key].push(`${b.username} (${amt})`);
    });
  });

  ["player", "banker", "tie"].forEach((key) => {
    bettorsEls[key].innerHTML = "";
    tableBettorsEls[key].innerHTML = "";
    map[key].forEach((name, idx) => {
      const li = document.createElement("li");
      li.textContent = name;
      bettorsEls[key].appendChild(li);
      if (idx < 8) {
        const chip = document.createElement("li");
        chip.textContent = name;
        tableBettorsEls[key].appendChild(chip);
      }
    });
  });
}

function attachBetList(roundId) {
  if (betsPaused) return;
  if (observedBetRound === roundId) return;
  observedBetRound = roundId;
  if (roundBetsUnsub) roundBetsUnsub();
  const q = query(
    collection(db, "baccarat_rounds", String(roundId), "bets"),
    orderBy("createdAt", "asc"),
    limit(30)
  );
  roundBetsUnsub = onSnapshot(
    q,
    (snap) => renderBettors(snap.docs),
    (err) => {
      resultEl.textContent = `권한 오류: ${err.message}`;
    }
  );
}

function renderRecentResults(dayKey, revealRoundNo) {
  recentResultsEl.innerHTML = "";
  for (let i = 0; i < 12; i += 1) {
    const r = revealRoundNo - i;
    if (r <= 0) break;
    const roundId = `${dayKey}-R${r}`;
    const key = outcomeForRound(roundId);
    const li = document.createElement("li");
    li.textContent = `R${r}: ${outcomeLabel(key)}`;
    recentResultsEl.appendChild(li);
  }
}

async function tickLoop() {
  const c = currentClock();
  const sec = Math.max(0, Math.floor((c.nextRoundAt - c.now) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  countdownEl.textContent = `${mm}:${ss}`;

  roundStatusEl.textContent = c.inReveal
    ? `결과 공개중 (Round ${c.revealRoundNo})`
    : `배팅중 (Round ${c.bettingRoundNo})`;

  if (!c.inReveal) {
    lastRevealRound = "";
    if (dealTimer) {
      clearInterval(dealTimer);
      dealTimer = null;
    }
    if (Date.now() >= settleBlockedUntil) {
      settleMyBet(c.revealRoundId).then(() => {
        settleBackoffMs = 10000;
      }).catch((err) => {
        if (isQuotaError(err)) {
          settleBlockedUntil = Date.now() + settleBackoffMs;
          settleBackoffMs = Math.min(settleBackoffMs * 2, 300000);
          resultEl.textContent = "정산 대기: Firestore 사용량 한도 도달(자동 재시도)";
          return;
        }
        resultEl.textContent = `정산 오류: ${err.message}`;
      });
    }
    attachBetList(c.bettingRoundId);
  }
  else {
    if (lastRevealRound !== c.revealRoundId) {
      lastRevealRound = c.revealRoundId;
      animateReveal(c.revealRoundId);
    }
  }

  renderRecentResults(c.dayKey, c.revealRoundNo);
}

function init() {
  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    const base = p.username || (user.email || "user").split("@")[0];
    username = withTitle(base, p.landTitleTag);
    points = p.points || 0;
    pointsEl.textContent = String(points);
    const equipped = getEquippedWeapon(p);
    weaponBonusEl.textContent = `${equipped.name} (${formatCashbackPercent(equipped.cashbackRate)})`;
  });

  placeBetBtn.addEventListener("click", () => {
    placeBet().catch((err) => {
      resultEl.textContent = `배팅 오류: ${err.message}`;
    });
  });

  tickLoop().catch(() => {});
  loopTimer = setInterval(() => {
    tickLoop().catch(() => {});
  }, 1000);

  document.addEventListener("visibilitychange", () => {
    betsPaused = document.visibilityState !== "visible";
    if (betsPaused) {
      if (roundBetsUnsub) {
        roundBetsUnsub();
        roundBetsUnsub = null;
      }
      observedBetRound = "";
      return;
    }
    const c = currentClock();
    if (!c.inReveal) attachBetList(c.bettingRoundId);
  });

  window.addEventListener("beforeunload", () => {
    if (loopTimer) clearInterval(loopTimer);
    if (roundBetsUnsub) roundBetsUnsub();
    if (dealTimer) clearInterval(dealTimer);
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
