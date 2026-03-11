import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";
import { resolveAdminAccess } from "../../shared/admin-role.js?v=20260304a";

const adminUserEl = document.getElementById("admin-user");
const adminStatusEl = document.getElementById("admin-status");
const adminMessageEl = document.getElementById("admin-message");
const commandPanelEl = document.getElementById("command-panel");
const historyPanelEl = document.getElementById("history-panel");
const stockPanelEl = document.getElementById("stock-panel");
const commandTypeEl = document.getElementById("command-type");
const targetUidEl = document.getElementById("target-uid");
const targetAmountEl = document.getElementById("target-amount");
const runCommandBtn = document.getElementById("run-command");
const historyListEl = document.getElementById("history-list");
const stockListEl = document.getElementById("stock-list");
const stockUpdatedAtEl = document.getElementById("stock-updated-at");

let user = null;
let booted = false;
let historyUnsub = null;
let stockUnsub = null;

const PAGE_SIZE = 300;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function esc(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTs(ts) {
  try {
    if (ts?.toDate) return ts.toDate().toLocaleString();
  } catch (_) {}
  return "-";
}

function parseInteger(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatKRW(v) {
  return `${Math.round(Number(v || 0)).toLocaleString("ko-KR")} KRW`;
}

function formatPercent(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "0.00%";
  return `${n > 0 ? "+" : n < 0 ? "" : ""}${n.toFixed(2)}%`;
}

function rateClass(v) {
  const n = Number(v || 0);
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "neutral";
}

function setMessage(text, isError = false) {
  adminMessageEl.textContent = text;
  adminMessageEl.classList.toggle("status-error", isError);
  adminMessageEl.classList.toggle("status-success", !isError && Boolean(text));
}

function requiredArgsFor(command) {
  if (command === "reset_points_all") return { needUid: false, needAmount: false };
  if (command === "reset_points_user") return { needUid: true, needAmount: false };
  if (command === "set_points_user") return { needUid: true, needAmount: true };
  if (command === "add_points_user") return { needUid: true, needAmount: true };
  return { needUid: false, needAmount: false };
}

function readCommandPayload() {
  const command = String(commandTypeEl.value || "").trim();
  const uid = String(targetUidEl.value || "").trim();
  const amount = parseInteger(targetAmountEl.value);
  const req = requiredArgsFor(command);

  if (!command) throw new Error("명령어를 선택하세요.");
  if (req.needUid && !uid) throw new Error("Target UID를 입력하세요.");
  if (req.needAmount && amount === null) throw new Error("Amount는 정수로 입력하세요.");

  return {
    command,
    args: {
      uid,
      amount
    }
  };
}

async function resetPointsAll() {
  return batchUpdateUsers((row) => ({
    points: 0,
    updatedAt: serverTimestamp()
  }), "updatedUsers");
}

async function batchUpdateUsers(buildPatch, resultKey = "updatedUsers") {
  let touched = 0;
  let batchCount = 0;
  let last = null;

  while (true) {
    const constraints = [orderBy("__name__"), limit(PAGE_SIZE)];
    if (last) constraints.push(startAfter(last));
    const q = query(collection(db, "users"), ...constraints);
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((row) => {
      batch.update(row.ref, buildPatch(row));
      touched += 1;
    });
    await batch.commit();
    batchCount += 1;

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return { [resultKey]: touched, batchCount };
}

async function requireUser(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("대상 UID 유저가 없습니다.");
  return ref;
}

async function resetPointsUser(uid) {
  const ref = await requireUser(uid);
  await updateDoc(ref, {
    points: 0,
    updatedAt: serverTimestamp()
  });
  return { uid, points: 0 };
}

async function setPointsUser(uid, amount) {
  if (amount < 0) throw new Error("Amount는 0 이상이어야 합니다.");
  const ref = await requireUser(uid);
  await updateDoc(ref, {
    points: amount,
    updatedAt: serverTimestamp()
  });
  return { uid, points: amount };
}

async function addPointsUser(uid, amount) {
  const ref = await requireUser(uid);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("대상 UID 유저가 없습니다.");
    const current = Math.floor(Number(snap.data()?.points || 0));
    const total = current + amount;
    if (total < 0) throw new Error("적용 후 포인트가 0 미만입니다.");
    tx.update(ref, { points: total, updatedAt: serverTimestamp() });
    return total;
  });
  return { uid, points: next, delta: amount };
}

function endOfTodayKstDate(nowMs = Date.now()) {
  const kstNow = new Date(nowMs + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const tomorrowStartUtcMs = Date.UTC(y, m, d + 1, 0, 0, 0, 0) - KST_OFFSET_MS;
  return new Date(tomorrowStartUtcMs - 1);
}

function formatKstEnd(dateObj) {
  const ms = Number(dateObj?.getTime?.() || 0);
  if (!ms) return "";
  const kst = new Date(ms + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:59 KST`;
}

async function setMiningX2Today() {
  const endsAt = endOfTodayKstDate();
  await setDoc(doc(db, "runtime_events", "mining"), {
    enabled: true,
    multiplier: 2,
    label: "관리자: 오늘 채굴 2배 이벤트",
    startsAt: new Date(),
    endsAt,
    updatedByUid: user?.uid || "",
    updatedByEmail: user?.email || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
  return { enabled: true, multiplier: 2, endsAtKst: formatKstEnd(endsAt) };
}

async function clearMiningBoost() {
  await setDoc(doc(db, "runtime_events", "mining"), {
    enabled: false,
    multiplier: 1,
    label: "",
    updatedByUid: user?.uid || "",
    updatedByEmail: user?.email || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
  return { enabled: false, multiplier: 1 };
}

async function resetMiningLevelsAll() {
  return batchUpdateUsers(() => ({
    miningSpeedLevel: 0,
    updatedAt: serverTimestamp()
  }), "resetUsers");
}

async function grantNicknameChangeTicketAll() {
  return batchUpdateUsers((row) => {
    const data = row.data() || {};
    const current = Math.max(0, Math.floor(Number(data.nicknameChangeTickets || 0)));
    return {
      nicknameChangeTickets: current + 1,
      forceNicknameChangeOnLogin: true,
      updatedAt: serverTimestamp()
    };
  }, "grantedUsers");
}

async function clearAllUsernameColors() {
  return batchUpdateUsers(() => ({
    usernameColor: "",
    updatedAt: serverTimestamp()
  }), "clearedUsers");
}

async function resetTitlesAll() {
  return batchUpdateUsers(() => ({
    donationTitleTag: "",
    landTitleTag: "",
    donationCashbackRate: 0,
    landDiscountRate: 0,
    updatedAt: serverTimestamp()
  }), "resetUsers");
}

async function resetWeaponUpgradesAll() {
  return batchUpdateUsers(() => ({
    equippedWeaponId: "starter_blaster",
    ownedWeapons: {
      starter_blaster: true
    },
    neonKatanaLevel: 0,
    updatedAt: serverTimestamp()
  }), "resetUsers");
}

async function executeCommand(payload) {
  const command = payload.command;
  const uid = String(payload.args?.uid || "");
  const amount = parseInteger(payload.args?.amount);

  if (command === "reset_points_all") return resetPointsAll();
  if (command === "reset_points_user") return resetPointsUser(uid);
  if (command === "set_points_user") return setPointsUser(uid, amount);
  if (command === "add_points_user") return addPointsUser(uid, amount);
  if (command === "set_mining_x2_today") return setMiningX2Today();
  if (command === "clear_mining_boost") return clearMiningBoost();
  if (command === "reset_mining_levels_all") return resetMiningLevelsAll();
  if (command === "grant_nickname_change_ticket_all") return grantNicknameChangeTicketAll();
  if (command === "clear_all_username_colors") return clearAllUsernameColors();
  if (command === "reset_titles_all") return resetTitlesAll();
  if (command === "reset_weapon_upgrades_all") return resetWeaponUpgradesAll();
  throw new Error("지원하지 않는 명령어입니다.");
}

async function runCommand() {
  if (!user) return;

  let payload;
  try {
    payload = readCommandPayload();
  } catch (err) {
    setMessage(err.message, true);
    return;
  }

  runCommandBtn.disabled = true;
  setMessage("명령 실행 중...");

  const rowRef = await addDoc(collection(db, "admin_commands"), {
    command: payload.command,
    args: payload.args,
    status: "queued",
    requestedByUid: user.uid,
    requestedByEmail: user.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  try {
    await updateDoc(rowRef, {
      status: "running",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const result = await executeCommand(payload);

    await updateDoc(rowRef, {
      status: "success",
      result,
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage("명령 실행 완료");
  } catch (err) {
    await updateDoc(rowRef, {
      status: "error",
      error: String(err?.message || err || "unknown error"),
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage(`실행 실패: ${err.message}`, true);
  } finally {
    runCommandBtn.disabled = false;
  }
}

function renderHistory(docs) {
  historyListEl.innerHTML = "";
  if (!docs.length) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.textContent = "로그가 없습니다.";
    historyListEl.appendChild(li);
    return;
  }

  docs.forEach((row) => {
    const d = row.data() || {};
    const status = String(d.status || "-");
    const args = esc(JSON.stringify(d.args || {}));
    const result = d.result ? esc(JSON.stringify(d.result)) : "";
    const error = d.error ? esc(String(d.error)) : "";

    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <p><strong>${esc(d.command)}</strong> · <span class="${status === "error" ? "status-error" : "status-success"}">${esc(status)}</span></p>
      <p>요청자: ${esc(d.requestedByEmail || d.requestedByUid || "-")}</p>
      <p>Args: <code>${args}</code></p>
      <p>생성: ${esc(formatTs(d.createdAt))}</p>
      ${result ? `<p>Result: <code>${result}</code></p>` : ""}
      ${error ? `<p class="status-error">Error: ${error}</p>` : ""}
    `;
    historyListEl.appendChild(li);
  });
}

function mountHistory() {
  if (historyUnsub) historyUnsub();
  const q = query(collection(db, "admin_commands"), orderBy("createdAt", "desc"), limit(40));
  historyUnsub = onSnapshot(q, (snap) => {
    renderHistory(snap.docs);
  }, (err) => {
    setMessage(`로그 조회 실패: ${err.message}`, true);
  });
}

function renderStockSnapshot(rows) {
  stockListEl.innerHTML = "";
  if (!rows.length) {
    stockListEl.innerHTML = `<div class="history-item">시세 캐시가 없습니다.</div>`;
    stockUpdatedAtEl.textContent = "-";
    return;
  }

  const latestUpdatedAt = rows
    .map((row) => row.data()?.updatedAt)
    .filter((ts) => ts?.toDate)
    .sort((a, b) => b.toDate() - a.toDate())[0];
  stockUpdatedAtEl.textContent = formatTs(latestUpdatedAt);

  [...rows]
    .sort((a, b) => {
      const aRate = Number(a.data()?.changeRate || 0);
      const bRate = Number(b.data()?.changeRate || 0);
      if (bRate !== aRate) return bRate - aRate;
      return String(a.data()?.name || a.id).localeCompare(String(b.data()?.name || b.id), "ko");
    })
    .forEach((row) => {
    const d = row.data() || {};
    const item = document.createElement("div");
    item.className = "stock-row";
    item.innerHTML = `
      <div class="left">
        <strong>${esc(d.name || row.id)}</strong>
        <p class="stock-sub">${esc(row.id)} · ${esc(d.market || "-")} · 기준일 ${esc(d.tradeDate || "-")}</p>
      </div>
      <div class="right">
        <strong>${esc(formatKRW(d.currentPrice || 0))}</strong>
        <p class="${rateClass(d.changeRate || 0)}">${esc(formatPercent(d.changeRate || 0))}</p>
      </div>
    `;
    stockListEl.appendChild(item);
    });
}

function mountStockSnapshot() {
  if (stockUnsub) stockUnsub();
  const q = query(collection(db, "stock_market_cache"), orderBy("name"));
  stockUnsub = onSnapshot(q, (snap) => {
    renderStockSnapshot(snap.docs);
  }, (err) => {
    stockUpdatedAtEl.textContent = "오류";
    stockListEl.innerHTML = `<div class="history-item status-error">시세 조회 실패: ${esc(err.message)}</div>`;
  });
}

async function boot(nextUser) {
  if (booted) return;
  booted = true;
  user = nextUser;
  adminUserEl.textContent = user.email || user.uid;

  const access = await resolveAdminAccess(user);
  if (!access.isAdmin) {
    adminStatusEl.textContent = "접근 거부";
    setMessage("관리자 권한이 없습니다. (custom claim admin=true 또는 users/{uid}.isAdmin=true 필요)", true);
    return;
  }

  adminStatusEl.textContent = `승인됨 (${access.via})`;
  commandPanelEl.hidden = false;
  historyPanelEl.hidden = false;
  stockPanelEl.hidden = false;
  setMessage("관리자 명령을 실행할 수 있습니다.");

  runCommandBtn.addEventListener("click", () => {
    runCommand().catch((err) => {
      setMessage(`명령 실행 오류: ${err.message}`, true);
      runCommandBtn.disabled = false;
    });
  });

  mountHistory();
  mountStockSnapshot();
}

document.addEventListener("app:user-ready", (e) => {
  boot(e.detail.user).catch((err) => {
    adminStatusEl.textContent = "오류";
    setMessage(err.message, true);
  });
});

if (window.__AUTH_USER__) {
  boot(window.__AUTH_USER__).catch((err) => {
    adminStatusEl.textContent = "오류";
    setMessage(err.message, true);
  });
}
