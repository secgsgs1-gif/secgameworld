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
const commandTypeEl = document.getElementById("command-type");
const targetUidEl = document.getElementById("target-uid");
const targetAmountEl = document.getElementById("target-amount");
const runCommandBtn = document.getElementById("run-command");
const historyListEl = document.getElementById("history-list");

let user = null;
let booted = false;
let historyUnsub = null;

const PAGE_SIZE = 300;

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
  let updatedUsers = 0;
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
      batch.update(row.ref, {
        points: 0,
        updatedAt: serverTimestamp()
      });
      updatedUsers += 1;
    });
    await batch.commit();
    batchCount += 1;

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return { updatedUsers, batchCount };
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

async function executeCommand(payload) {
  const command = payload.command;
  const uid = String(payload.args?.uid || "");
  const amount = parseInteger(payload.args?.amount);

  if (command === "reset_points_all") return resetPointsAll();
  if (command === "reset_points_user") return resetPointsUser(uid);
  if (command === "set_points_user") return setPointsUser(uid, amount);
  if (command === "add_points_user") return addPointsUser(uid, amount);
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
  setMessage("관리자 명령을 실행할 수 있습니다.");

  runCommandBtn.addEventListener("click", () => {
    runCommand().catch((err) => {
      setMessage(`명령 실행 오류: ${err.message}`, true);
      runCommandBtn.disabled = false;
    });
  });

  mountHistory();
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
