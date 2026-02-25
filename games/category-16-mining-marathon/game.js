import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const canvas = document.getElementById("track");
const ctx = canvas.getContext("2d");
const pointsEl = document.getElementById("points");
const sessionEarnedEl = document.getElementById("session-earned");
const speedLevelEl = document.getElementById("speed-level");
const nextCostEl = document.getElementById("next-cost");
const upgradeBtn = document.getElementById("upgrade-btn");
const lapEl = document.getElementById("lap");
const speedEl = document.getElementById("speed");
const syncStatusEl = document.getElementById("sync-status");
const eventLogEl = document.getElementById("event-log");
const runnersEl = document.getElementById("runners");

const TRACK_LAP_UNITS = 1200;
const TICK_MS = 100;
const SYNC_MS_ACTIVE = 20000;
const SYNC_MS_BG = 60000;
const POLL_MS_ACTIVE = 12000;
const POLL_MS_BG = 45000;
const STALE_MS = 95000;
const SPEED_LEVEL_COSTS = [0, 500, 1200, 2600, 5200, 9800];
const MAX_SPEED_LEVEL = SPEED_LEVEL_COSTS.length - 1;
const BASE_SPEED = 16;

let user = null;
let username = "";
let myPoints = 0;
let sessionStartPoints = null;
let distance = 0;
let lap = 0;
let lane = Math.floor(Math.random() * 3);
let baseSpeed = BASE_SPEED;
let speedLevel = 0;
let burstUntil = 0;
let nextBurstAt = performance.now() + 6000 + Math.random() * 6000;
let lastTick = performance.now();

let others = [];
let hidden = false;
let loopTimer = null;
let syncTimer = null;
let pollTimer = null;
let booted = false;
let earning = false;
let hiddenStartedAt = 0;
let rewardQueue = [];
let profileUnsub = null;
let upgrading = false;

function effectiveBaseSpeed() {
  return baseSpeed * (1 + speedLevel * 0.12);
}

function clampSpeedLevel(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SPEED_LEVEL, Math.floor(n)));
}

function updateUpgradeUI() {
  speedLevelEl.textContent = `Lv.${speedLevel}`;
  if (speedLevel >= MAX_SPEED_LEVEL) {
    nextCostEl.textContent = "MAX";
    upgradeBtn.disabled = true;
    upgradeBtn.textContent = "최대 단계";
    return;
  }
  const next = speedLevel + 1;
  const cost = SPEED_LEVEL_COSTS[next];
  nextCostEl.textContent = String(cost);
  upgradeBtn.disabled = upgrading;
  upgradeBtn.textContent = `속도 ${next}단계 업그레이드`;
}

function normalizeUsername(currentUser, rawName) {
  const byProfile = String(rawName || "").trim();
  if (byProfile) return byProfile;
  const byEmail = String(currentUser?.email || "").split("@")[0].trim();
  if (byEmail) return byEmail;
  const byUid = String(currentUser?.uid || "").slice(0, 6);
  return byUid ? `user_${byUid}` : "user";
}

function currentSpeed(now) {
  const base = effectiveBaseSpeed();
  if (now < burstUntil) return base * 1.28;
  return base;
}

function maybeTriggerBurst(now) {
  if (now < nextBurstAt) return;
  burstUntil = now + 1800 + Math.random() * 2200;
  nextBurstAt = now + 10000 + Math.random() * 14000;
}

function rewardForLap() {
  if (Math.random() < 0.001) {
    return { points: 10000, jackpot: true };
  }
  return { points: 20 + Math.floor(Math.random() * 121), jackpot: false };
}

function renderTrack() {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const rx = 310;
  const ry = 150;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#8ad8a4";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#4f9268";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  const drawRunner = (name, progress, laneIdx, color, mine) => {
    const laneOffset = laneIdx * 16;
    const rrx = rx - laneOffset;
    const rry = ry - laneOffset * 0.6;
    const theta = (progress * Math.PI * 2) - Math.PI / 2;
    const x = cx + Math.cos(theta) * rrx;
    const y = cy + Math.sin(theta) * rry;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, mine ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9ffe8";
    ctx.font = mine ? "bold 13px sans-serif" : "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name, x, y - 14);
  };

  others.forEach((o) => {
    drawRunner(o.username, Number(o.progress || 0), Number(o.lane || 0), "#98d6ff", false);
  });

  drawRunner(username || "ME", (distance % TRACK_LAP_UNITS) / TRACK_LAP_UNITS, lane, "#ffd987", true);
}

function renderRunners() {
  runnersEl.innerHTML = "";
  if (!others.length) {
    const li = document.createElement("li");
    li.textContent = "현재 표시할 다른 주자가 없습니다.";
    runnersEl.appendChild(li);
    return;
  }
  others.forEach((o) => {
    const li = document.createElement("li");
    li.textContent = `${o.username} · ${o.lap}바퀴 · 속도T${o.speedTier}`;
    runnersEl.appendChild(li);
  });
}

async function syncMine() {
  if (!user) return;
  const speed = currentSpeed(performance.now());
  try {
    await setDoc(doc(db, "miners", user.uid), {
      uid: user.uid,
      username,
      lap,
      progress: (distance % TRACK_LAP_UNITS) / TRACK_LAP_UNITS,
      lane,
      speedTier: speed >= 22 ? 3 : speed >= 18 ? 2 : 1,
      online: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    syncStatusEl.textContent = hidden ? "백그라운드 동기화" : "실시간 동기화";
  } catch (err) {
    syncStatusEl.textContent = `동기화 오류: ${err.message}`;
  }
}

async function pollOthers() {
  if (!user) return;
  try {
    const q = query(collection(db, "miners"), orderBy("updatedAt", "desc"), limit(20));
    const snap = await getDocs(q);
    const now = Date.now();
    others = snap.docs
      .map((d) => d.data())
      .filter((r) => r.uid && r.uid !== user.uid)
      .filter((r) => {
        const ms = r.updatedAt?.toDate ? r.updatedAt.toDate().getTime() : 0;
        return r.online && (now - ms < STALE_MS);
      });
    renderRunners();
  } catch (err) {
    syncStatusEl.textContent = `주자 조회 오류: ${err.message}`;
  }
}

function rescheduleNetworkLoops() {
  if (syncTimer) clearInterval(syncTimer);
  if (pollTimer) clearInterval(pollTimer);
  const syncMs = hidden ? SYNC_MS_BG : SYNC_MS_ACTIVE;
  const pollMs = hidden ? POLL_MS_BG : POLL_MS_ACTIVE;
  syncTimer = setInterval(() => {
    syncMine().catch(() => {});
  }, syncMs);
  pollTimer = setInterval(() => {
    pollOthers().catch(() => {});
  }, pollMs);
}

async function grantLapReward() {
  if (earning || !window.AccountWallet) return;
  if (!rewardQueue.length) return;
  earning = true;
  try {
    const targetLap = rewardQueue.shift();
    const reward = rewardForLap();
    await window.AccountWallet.earn(reward.points, "mining_lap_reward", {
      game: "category-16-mining-marathon",
      lap: targetLap,
      jackpot: reward.jackpot
    });
    if (reward.jackpot) {
      eventLogEl.textContent = `대박! ${targetLap}바퀴 보상으로 +10000 포인트 지급`;
    } else {
      eventLogEl.textContent = `${targetLap}바퀴 달성! +${reward.points} 포인트 지급`;
    }
  } catch (err) {
    eventLogEl.textContent = `보상 오류: ${err.message}`;
  } finally {
    earning = false;
    if (rewardQueue.length) {
      grantLapReward().catch(() => {});
    }
  }
}

async function upgradeSpeedLevel() {
  if (!user || upgrading) return;
  if (speedLevel >= MAX_SPEED_LEVEL) {
    syncStatusEl.textContent = "이미 최대 단계입니다.";
    return;
  }
  const next = speedLevel + 1;
  const cost = SPEED_LEVEL_COSTS[next];
  if (myPoints < cost) {
    syncStatusEl.textContent = `포인트 부족: ${cost} 필요`;
    return;
  }

  upgrading = true;
  updateUpgradeUI();
  const userRef = doc(db, "users", user.uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("유저 정보를 찾을 수 없습니다.");
      const data = snap.data();
      const currentLevel = clampSpeedLevel(data.miningSpeedLevel);
      const currentPoints = Number(data.points || 0);
      if (currentLevel >= MAX_SPEED_LEVEL) throw new Error("이미 최대 단계입니다.");
      const targetLevel = currentLevel + 1;
      const targetCost = SPEED_LEVEL_COSTS[targetLevel];
      if (currentPoints < targetCost) throw new Error("포인트가 부족합니다.");

      tx.update(userRef, {
        points: currentPoints - targetCost,
        miningSpeedLevel: targetLevel,
        updatedAt: serverTimestamp()
      });
    });

    await addDoc(collection(db, "users", user.uid, "transactions"), {
      type: "mining_upgrade",
      amount: -cost,
      reason: "mining_speed_upgrade",
      meta: {
        fromLevel: speedLevel,
        toLevel: speedLevel + 1,
        cost
      },
      createdAt: serverTimestamp()
    });
    syncStatusEl.textContent = `업그레이드 완료: Lv.${speedLevel + 1}`;
  } catch (err) {
    syncStatusEl.textContent = `업그레이드 실패: ${err.message}`;
  } finally {
    upgrading = false;
    updateUpgradeUI();
  }
}

function enqueueLapRewards(nextLap) {
  if (nextLap <= lap) return;
  for (let l = lap + 1; l <= nextLap; l += 1) {
    rewardQueue.push(l);
  }
  lap = nextLap;
  grantLapReward().catch(() => {});
}

function advanceBySeconds(sec, nowPerf, useBurst) {
  if (sec <= 0) return;
  if (useBurst) maybeTriggerBurst(nowPerf);
  const speed = useBurst ? currentSpeed(nowPerf) : baseSpeed;
  distance += speed * sec;
  const nextLap = Math.floor(distance / TRACK_LAP_UNITS);
  enqueueLapRewards(nextLap);
  speedEl.textContent = `${Math.round(speed)} m/s`;
}

function tick() {
  const now = performance.now();
  const dt = Math.min(0.5, (now - lastTick) / 1000);
  lastTick = now;

  if (!hidden) {
    advanceBySeconds(dt, now, true);
  }

  lapEl.textContent = String(lap);
  renderTrack();
}

function bindWallet() {
  if (!window.AccountWallet) return false;
  const first = Number(window.AccountWallet.getPoints() || 0);
  if (sessionStartPoints === null) sessionStartPoints = first;
  pointsEl.textContent = String(first);
  sessionEarnedEl.textContent = String(Math.max(0, first - sessionStartPoints));
  window.AccountWallet.onChange((p) => {
    myPoints = p || 0;
    pointsEl.textContent = String(myPoints);
    if (sessionStartPoints === null) sessionStartPoints = myPoints;
    sessionEarnedEl.textContent = String(Math.max(0, myPoints - sessionStartPoints));
  });
  return true;
}

function init() {
  username = normalizeUsername(user, "");
  updateUpgradeUI();
  renderTrack();
  renderRunners();
  if (!bindWallet()) {
    document.addEventListener("app:wallet-ready", bindWallet, { once: true });
  }

  profileUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
    const profile = snap.data() || {};
    speedLevel = clampSpeedLevel(profile.miningSpeedLevel);
    updateUpgradeUI();
  });

  upgradeBtn.addEventListener("click", () => {
    upgradeSpeedLevel().catch(() => {});
  });

  loopTimer = setInterval(tick, TICK_MS);
  syncMine().catch(() => {});
  pollOthers().catch(() => {});
  rescheduleNetworkLoops();

  document.addEventListener("visibilitychange", () => {
    hidden = document.visibilityState !== "visible";
    if (hidden) {
      hiddenStartedAt = Date.now();
      syncStatusEl.textContent = "백그라운드 채굴 대기";
    } else if (hiddenStartedAt > 0) {
      const elapsedSec = Math.max(0, (Date.now() - hiddenStartedAt) / 1000);
      hiddenStartedAt = 0;
      // Browsers throttle timers in background; compensate with elapsed wall time.
      advanceBySeconds(elapsedSec, performance.now(), false);
      lapEl.textContent = String(lap);
      renderTrack();
      syncStatusEl.textContent = `복귀 보정 완료 (${Math.floor(elapsedSec)}초)`;
    }
    rescheduleNetworkLoops();
    if (!hidden) {
      syncMine().catch(() => {});
      pollOthers().catch(() => {});
    }
  });

  window.addEventListener("beforeunload", () => {
    if (loopTimer) clearInterval(loopTimer);
    if (syncTimer) clearInterval(syncTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (profileUnsub) profileUnsub();
    updateDoc(doc(db, "miners", user.uid), {
      online: false,
      updatedAt: serverTimestamp()
    }).catch(() => {});
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
