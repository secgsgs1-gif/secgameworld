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
const resultEl = document.getElementById("result");
const recentResultsEl = document.getElementById("recent-results");
const placeBetBtn = document.getElementById("place-bet");
const ladderBoardEl = document.getElementById("ladder-board");
const nodeTopLeftEl = document.getElementById("node-top-left");
const nodeTopRightEl = document.getElementById("node-top-right");
const nodeBottomLeftEl = document.getElementById("node-bottom-left");
const nodeBottomRightEl = document.getElementById("node-bottom-right");
const drawFillEl = document.getElementById("draw-fill");
const drawTextEl = document.getElementById("draw-text");
const tracePathEl = document.getElementById("trace-path");
const tracePathGlowEl = document.getElementById("trace-path-glow");
const resultBallEl = document.getElementById("result-ball");

const BET_KEYS = ["line3", "line4", "left", "right", "odd", "even"];
const PAYOUT = {
  line3: 1.9,
  line4: 1.9,
  left: 1.9,
  right: 1.9,
  odd: 1.9,
  even: 1.9
};

const betInputs = {
  line3: document.getElementById("bet-line3"),
  line4: document.getElementById("bet-line4"),
  left: document.getElementById("bet-left"),
  right: document.getElementById("bet-right"),
  odd: document.getElementById("bet-odd"),
  even: document.getElementById("bet-even")
};

const bettorsEls = {
  line3: document.getElementById("bettors-line3"),
  line4: document.getElementById("bettors-line4"),
  left: document.getElementById("bettors-left"),
  right: document.getElementById("bettors-right"),
  odd: document.getElementById("bettors-odd"),
  even: document.getElementById("bettors-even")
};

const ROUND_INTERVAL_MS = 120000;
const REVEAL_DURATION_MS = 9000;
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ROUNDS_PER_DAY = DAY_MS / ROUND_INTERVAL_MS;

let user = null;
let username = "";
let lastSettledRound = "";
let observedBetRound = "";
let roundBetsUnsub = null;
let loopTimer = null;
let booted = false;
let lastRevealRound = "";
let recentRenderedRound = "";
const resultCache = new Map();

function withTitle(name, titleTag) {
  const base = String(name || "").trim();
  const tag = String(titleTag || "").trim();
  if (!base) return base;
  if (!tag) return base;
  if (base.startsWith(`${tag} `)) return base;
  return `${tag} ${base}`;
}

function composeUserTitleTag(profile) {
  const tags = [];
  const donation = String(profile?.donationTitleTag || "").trim();
  const land = String(profile?.landTitleTag || "").trim();
  if (donation) tags.push(donation);
  if (land && !tags.includes(land)) tags.push(land);
  return tags.join(" ").trim();
}

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function formatResult(result) {
  if (!result) return "대기중";
  const lineText = result.line === "line3" ? "줄3" : "줄4";
  const sideText = result.side === "left" ? "좌" : "우";
  const parityText = result.parity === "odd" ? "홀" : "짝";
  return `${lineText} · ${sideText} · ${parityText}`;
}

function sideBadge(result) {
  return result?.side === "left" ? "좌" : "우";
}

function lineBadge(result) {
  return result?.line === "line3" ? "3줄" : "4줄";
}

function parityBadge(result) {
  return result?.parity === "odd" ? "홀" : "짝";
}

function buildTracePoints(result) {
  const leftX = 25;
  const rightX = 75;
  const yStart = 8;
  const yEnd = 192;
  const isLine3 = result.line === "line3";
  const rungYs = isLine3 ? [45, 95, 145] : [35, 80, 125, 170];

  const startOnRight = result.side === "right";
  let currentRight = startOnRight;
  const points = [{ x: currentRight ? rightX : leftX, y: yStart }];

  rungYs.forEach((y, i) => {
    // descend to each rung level first
    points.push({ x: currentRight ? rightX : leftX, y });
    // every rung is traversed to produce clear 3-line/4-line ladder movement
    currentRight = !currentRight;
    points.push({ x: currentRight ? rightX : leftX, y });
  });

  points.push({ x: currentRight ? rightX : leftX, y: yEnd });
  return points;
}

function pointsToPath(points) {
  if (!points.length) return "M25 8 L25 192";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

function animateBallOnPath(pathEl, ballEl, durationMs = 4200) {
  if (!pathEl || !ballEl) return;
  const total = pathEl.getTotalLength();
  if (!total || !Number.isFinite(total)) return;

  pathEl.style.strokeDasharray = String(total);
  pathEl.style.strokeDashoffset = String(total);
  if (tracePathGlowEl) {
    tracePathGlowEl.style.strokeDasharray = String(total);
    tracePathGlowEl.style.strokeDashoffset = String(total);
  }

  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    const drawLen = total * (1 - eased);
    pathEl.style.strokeDashoffset = String(drawLen);
    if (tracePathGlowEl) tracePathGlowEl.style.strokeDashoffset = String(drawLen);

    const pt = pathEl.getPointAtLength(total * eased);
    ballEl.style.left = `${pt.x}%`;
    ballEl.style.top = `${(pt.y / 200) * 100}%`;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderLadderVisual(result) {
  if (!tracePathEl || !resultBallEl || !ladderBoardEl) return;
  if (!result) {
    const d = "M25 8 L25 192";
    tracePathEl.setAttribute("d", d);
    if (tracePathGlowEl) tracePathGlowEl.setAttribute("d", d);
    resultBallEl.classList.remove("right");
    resultBallEl.style.left = "25%";
    resultBallEl.style.top = "8%";
    ladderBoardEl.classList.remove("mode-3", "mode-4");
    ladderBoardEl.classList.add("mode-3");
    if (nodeTopLeftEl) nodeTopLeftEl.classList.remove("active");
    if (nodeTopRightEl) nodeTopRightEl.classList.remove("active");
    if (nodeBottomLeftEl) nodeBottomLeftEl.classList.remove("active");
    if (nodeBottomRightEl) nodeBottomRightEl.classList.remove("active");
    return;
  }

  const isLine3 = result.line === "line3";
  ladderBoardEl.classList.toggle("mode-3", isLine3);
  ladderBoardEl.classList.toggle("mode-4", !isLine3);
  if (nodeTopLeftEl) nodeTopLeftEl.classList.toggle("active", result.side === "left");
  if (nodeTopRightEl) nodeTopRightEl.classList.toggle("active", result.side === "right");
  if (nodeBottomLeftEl) nodeBottomLeftEl.classList.toggle("active", result.parity === "odd");
  if (nodeBottomRightEl) nodeBottomRightEl.classList.toggle("active", result.parity === "even");

  const right = result.side === "right";
  resultBallEl.classList.toggle("right", right);
  const points = buildTracePoints(result);
  const d = pointsToPath(points);
  tracePathEl.setAttribute("d", d);
  if (tracePathGlowEl) tracePathGlowEl.setAttribute("d", d);
  animateBallOnPath(tracePathEl, resultBallEl);
}

function winnersForResult(result) {
  return {
    line3: result?.line === "line3",
    line4: result?.line === "line4",
    left: result?.side === "left",
    right: result?.side === "right",
    odd: result?.parity === "odd",
    even: result?.parity === "even"
  };
}

function currentClock(now = Date.now()) {
  const kstNow = now + KST_OFFSET_MS;
  const dayStartKst = Math.floor(kstNow / DAY_MS) * DAY_MS;
  const dayStartUtc = dayStartKst - KST_OFFSET_MS;
  const dayKey = new Date(dayStartUtc).toISOString().slice(0, 10);

  const elapsedInDay = kstNow - dayStartKst;
  const tickInDay = Math.floor(elapsedInDay / ROUND_INTERVAL_MS);
  const revealAt = dayStartUtc + tickInDay * ROUND_INTERVAL_MS;
  const nextRoundAt = revealAt + ROUND_INTERVAL_MS;
  const inReveal = now >= revealAt && now < revealAt + REVEAL_DURATION_MS;

  const revealRoundNo = tickInDay + 1;
  const bettingRoundNoRaw = revealRoundNo + 1;
  const bettingCrossDay = bettingRoundNoRaw > ROUNDS_PER_DAY;
  const bettingRoundNo = bettingCrossDay ? 1 : bettingRoundNoRaw;
  const bettingDayKey = bettingCrossDay
    ? new Date(dayStartUtc + DAY_MS).toISOString().slice(0, 10)
    : dayKey;

  return {
    now,
    dayKey,
    inReveal,
    nextRoundAt,
    revealRoundNo,
    bettingRoundNo,
    revealRoundId: `${dayKey}-R${revealRoundNo}`,
    bettingRoundId: `${bettingDayKey}-R${bettingRoundNo}`
  };
}

async function getRoundResult(roundId, createIfMissing = true) {
  const key = String(roundId || "");
  if (!key) return null;
  if (resultCache.has(key)) return resultCache.get(key);

  const roundRef = doc(db, "power_ladder_rounds", key);

  if (!createIfMissing) {
    const snap = await getDoc(roundRef);
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    const result = {
      roll: Number(d.roll || 0),
      line: String(d.line || "line3"),
      side: String(d.side || "left"),
      parity: String(d.parity || "odd")
    };
    resultCache.set(key, result);
    return result;
  }

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(roundRef);
    if (snap.exists()) {
      const d = snap.data() || {};
      return {
        roll: Number(d.roll || 0),
        line: String(d.line || "line3"),
        side: String(d.side || "left"),
        parity: String(d.parity || "odd")
      };
    }

    const roll = Math.floor(Math.random() * 100);
    const line = roll < 50 ? "line3" : "line4";
    const side = roll % 2 === 0 ? "left" : "right";
    const parity = Math.floor(roll / 2) % 2 === 0 ? "even" : "odd";

    tx.set(roundRef, {
      roll,
      line,
      side,
      parity,
      generatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    return { roll, line, side, parity };
  });

  resultCache.set(key, result);
  return result;
}

function parseBets() {
  const amounts = {};
  let total = 0;
  BET_KEYS.forEach((key) => {
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
  const betRef = doc(db, "power_ladder_rounds", roundId, "bets", user.uid);
  const existing = await getDoc(betRef);
  if (existing.exists()) {
    resultEl.textContent = "이번 라운드 이미 배팅 완료";
    return;
  }

  const spend = await window.AccountWallet.spend(total, "power_ladder_bet", {
    game: "category-26-power-ladder",
    roundId,
    discountEligible: true
  });

  if (!spend?.ok) {
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

  const result = await getRoundResult(roundId, true);
  const winMap = winnersForResult(result);
  const betRef = doc(db, "power_ladder_rounds", String(roundId), "bets", user.uid);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (tx) => {
    const betSnap = await tx.get(betRef);
    if (!betSnap.exists()) return;
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;

    const bet = betSnap.data() || {};
    if (bet.settled) return;

    const profile = userSnap.data() || {};
    const equippedWeapon = getEquippedWeapon(profile);
    const cashbackRate = Number(equippedWeapon?.cashbackRate || 0);
    const donationCashbackRate = Math.max(0, Number(profile.donationCashbackRate || 0));
    const totalCashbackRate = cashbackRate + donationCashbackRate;

    let payout = 0;
    BET_KEYS.forEach((key) => {
      const amt = Math.max(0, Number(bet.amounts?.[key] || 0));
      if (amt <= 0) return;
      if (!winMap[key]) return;
      payout += Math.floor(amt * Number(PAYOUT[key] || 0));
    });

    const totalBet = Math.max(0, Number(bet.total || 0));
    const cashback = totalCashbackRate > 0 ? Math.floor(totalBet * totalCashbackRate) : 0;
    const totalCredit = payout + cashback;

    tx.update(betRef, {
      settled: true,
      settledAt: serverTimestamp(),
      result,
      payout,
      cashback,
      cashbackRate: totalCashbackRate,
      cashbackWeaponRate: cashbackRate,
      cashbackDonationRate: donationCashbackRate,
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
  renderLadderVisual(result);

  const mine = await getDoc(betRef);
  if (mine.exists()) {
    const d = mine.data() || {};
    const cashback = Number(d.cashback || 0);
    if (Number(d.payout || 0) > 0) {
      resultEl.classList.add("win");
      if (cashback > 0) {
        resultEl.textContent = `당첨! 배당 +${d.payout}, 캐시백 +${cashback}`;
      } else {
        resultEl.textContent = `당첨! 배당 +${d.payout}`;
      }
    } else {
      resultEl.classList.remove("win");
      if (cashback > 0) {
        resultEl.textContent = `미당첨. 페이백 +${cashback}`;
      } else {
        resultEl.textContent = "미당첨.";
      }
    }
  }
}

function renderBettors(docs) {
  const map = {
    line3: [],
    line4: [],
    left: [],
    right: [],
    odd: [],
    even: []
  };

  docs.forEach((snap) => {
    const b = snap.data() || {};
    BET_KEYS.forEach((key) => {
      const amt = Number(b.amounts?.[key] || 0);
      if (amt > 0) map[key].push(`${b.username || "user"} (${amt})`);
    });
  });

  BET_KEYS.forEach((key) => {
    bettorsEls[key].innerHTML = "";
    map[key].forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      bettorsEls[key].appendChild(li);
    });
  });
}

function attachBetList(roundId) {
  if (observedBetRound === roundId) return;
  observedBetRound = roundId;
  if (roundBetsUnsub) roundBetsUnsub();

  const q = query(
    collection(db, "power_ladder_rounds", String(roundId), "bets"),
    orderBy("createdAt", "asc"),
    limit(40)
  );

  roundBetsUnsub = onSnapshot(
    q,
    (snap) => renderBettors(snap.docs),
    (err) => {
      resultEl.textContent = `권한 오류: ${err.message}`;
    }
  );
}

async function renderRecentResults(dayKey, revealRoundNo) {
  recentResultsEl.innerHTML = "";
  for (let i = 0; i < 10; i += 1) {
    const r = revealRoundNo - i;
    if (r <= 0) break;
    const roundId = `${dayKey}-R${r}`;
    const result = await getRoundResult(roundId, true);
    const li = document.createElement("li");
    li.className = "result-row";
    if (result) {
      const sideTone = result.side === "left" ? "blue" : "red";
      const lineTone = result.line === "line3" ? "blue" : "red";
      const parityTone = result.parity === "odd" ? "blue" : "red";
      li.innerHTML = `
        <div class="result-meta">${r}회 · ${roundId}</div>
        <div class="result-badges">
          <span class="badge ${sideTone}">${sideBadge(result)}</span>
          <span class="badge ${lineTone}">${lineBadge(result)}</span>
          <span class="badge ${parityTone}">${parityBadge(result)}</span>
        </div>
      `;
    } else {
      li.innerHTML = `<div class="result-meta">${r}회 · 결과 대기</div>`;
    }
    recentResultsEl.appendChild(li);
  }
}

async function tickLoop() {
  const c = currentClock();
  const sec = Math.max(0, Math.floor((c.nextRoundAt - c.now) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  countdownEl.textContent = `${mm}:${ss}`;
  if (drawFillEl && drawTextEl) {
    const remainMs = Math.max(0, c.nextRoundAt - c.now);
    const pct = Math.max(0, Math.min(100, Math.floor((remainMs / ROUND_INTERVAL_MS) * 100)));
    drawFillEl.style.width = `${pct}%`;
    drawTextEl.textContent = `${sec}초 후 ${c.revealRoundNo + 1}회차 추첨`;
  }
  roundStatusEl.textContent = c.inReveal
    ? `결과 공개중 (Round ${c.revealRoundNo})`
    : `배팅중 (Round ${c.bettingRoundNo})`;

  if (c.inReveal && lastRevealRound !== c.revealRoundId) {
    lastRevealRound = c.revealRoundId;
    const result = await getRoundResult(c.revealRoundId, true);
    renderLadderVisual(result);
  }

  if (!c.inReveal) {
    attachBetList(c.bettingRoundId);
    settleMyBet(c.revealRoundId).catch((err) => {
      resultEl.textContent = `정산 오류: ${err.message}`;
    });
  }

  if (recentRenderedRound !== c.revealRoundId) {
    recentRenderedRound = c.revealRoundId;
    renderRecentResults(c.dayKey, c.revealRoundNo).catch(() => {});
  }
}

function init() {
  renderLadderVisual(null);

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const p = snap.data() || {};
    username = withTitle(normalizeUsername(user, p.username), composeUserTitleTag(p));
    pointsEl.textContent = String(Math.floor(Number(p.points || 0)));

    const equipped = getEquippedWeapon(p);
    const donationRate = Math.max(0, Number(p.donationCashbackRate || 0));
    const totalRate = Number(equipped.cashbackRate || 0) + donationRate;
    weaponBonusEl.textContent = `${equipped.name} ${formatCashbackPercent(equipped.cashbackRate)} + 기부왕 ${formatCashbackPercent(donationRate)} = ${formatCashbackPercent(totalRate)}`;
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

  window.addEventListener("beforeunload", () => {
    if (loopTimer) clearInterval(loopTimer);
    if (roundBetsUnsub) roundBetsUnsub();
  });
}

function boot(nextUser) {
  if (booted) return;
  booted = true;
  user = nextUser;
  username = normalizeUsername(user, "");
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
