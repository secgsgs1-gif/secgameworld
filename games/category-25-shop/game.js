import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";

const NICKNAME_CHANGE_PRICE = 50000;

const pointsEl = document.getElementById("points");
const usernameEl = document.getElementById("username");
const buyBtn = document.getElementById("buy-nickname-btn");
const statusEl = document.getElementById("status");

const modalEl = document.getElementById("nickname-modal");
const nicknameInputEl = document.getElementById("nickname-input");
const confirmBtn = document.getElementById("nickname-confirm-btn");
const cancelBtn = document.getElementById("nickname-cancel-btn");
const modalStatusEl = document.getElementById("modal-status");

let user = null;
let profile = null;
let busy = false;

function isValidNickname(name) {
  const v = String(name || "").trim();
  return /^[A-Za-z0-9_가-힣]{2,20}$/.test(v);
}

function render() {
  const points = Math.max(0, Number(profile?.points || 0));
  const username = String(profile?.username || user?.email?.split("@")[0] || "user").trim();
  pointsEl.textContent = String(points);
  usernameEl.textContent = username;
  buyBtn.disabled = busy || points < NICKNAME_CHANGE_PRICE;
}

function openModal() {
  nicknameInputEl.value = "";
  modalStatusEl.textContent = "";
  modalEl.hidden = false;
  setTimeout(() => nicknameInputEl.focus(), 0);
}

function closeModal() {
  if (busy) return;
  modalEl.hidden = true;
}

async function purchaseAndChangeNickname() {
  if (!user || busy) return;
  const nextName = String(nicknameInputEl.value || "").trim();
  if (!isValidNickname(nextName)) {
    modalStatusEl.textContent = "닉네임은 2~20자, 한글/영문/숫자/_만 가능합니다.";
    return;
  }

  busy = true;
  buyBtn.disabled = true;
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  modalStatusEl.textContent = "처리 중...";

  try {
    const userRef = doc(db, "users", user.uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("유저 정보가 없습니다.");
      const data = snap.data() || {};
      const points = Math.max(0, Number(data.points || 0));
      if (points < NICKNAME_CHANGE_PRICE) throw new Error("포인트가 부족합니다.");

      tx.update(userRef, {
        points: points - NICKNAME_CHANGE_PRICE,
        username: nextName,
        updatedAt: serverTimestamp()
      });
    });

    await addDoc(collection(db, "users", user.uid, "transactions"), {
      type: "shop_purchase",
      amount: -Math.abs(NICKNAME_CHANGE_PRICE),
      reason: "nickname_change_ticket",
      meta: { changedTo: nextName },
      createdAt: serverTimestamp()
    });

    statusEl.textContent = `닉네임 변경 완료: ${nextName}`;
    modalEl.hidden = true;
  } catch (err) {
    modalStatusEl.textContent = `변경 실패: ${err.message}`;
  } finally {
    busy = false;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    render();
  }
}

function init() {
  buyBtn.addEventListener("click", () => {
    if (busy) return;
    if (Math.max(0, Number(profile?.points || 0)) < NICKNAME_CHANGE_PRICE) {
      statusEl.textContent = "포인트가 부족합니다.";
      return;
    }
    openModal();
  });

  confirmBtn.addEventListener("click", () => {
    purchaseAndChangeNickname().catch(() => {});
  });

  cancelBtn.addEventListener("click", closeModal);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeModal();
  });

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    profile = snap.data() || {};
    render();
  }, (err) => {
    statusEl.textContent = `로딩 오류: ${err.message}`;
  });
}

function boot(nextUser) {
  if (user) return;
  user = nextUser;
  init();
}

document.addEventListener("app:user-ready", (e) => boot(e.detail.user));
if (window.__AUTH_USER__) boot(window.__AUTH_USER__);
