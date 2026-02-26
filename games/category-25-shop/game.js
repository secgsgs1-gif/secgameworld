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
const NICKNAME_COLOR_PRICE = 30000;
const COLOR_PRESETS = ["#5db2ff", "#33d1a3", "#ff7fa4", "#ffd36a", "#b08dff", "#ffffff"];

const pointsEl = document.getElementById("points");
const usernameEl = document.getElementById("username");
const buyNicknameBtn = document.getElementById("buy-nickname-btn");
const buyColorBtn = document.getElementById("buy-color-btn");
const statusEl = document.getElementById("status");

const nicknameModalEl = document.getElementById("nickname-modal");
const nicknameInputEl = document.getElementById("nickname-input");
const nicknameConfirmBtn = document.getElementById("nickname-confirm-btn");
const nicknameCancelBtn = document.getElementById("nickname-cancel-btn");
const nicknameModalStatusEl = document.getElementById("modal-status");

const colorModalEl = document.getElementById("color-modal");
const colorPresetsEl = document.getElementById("color-presets");
const colorInputEl = document.getElementById("color-input");
const colorConfirmBtn = document.getElementById("color-confirm-btn");
const colorCancelBtn = document.getElementById("color-cancel-btn");
const colorModalStatusEl = document.getElementById("color-modal-status");

let user = null;
let profile = null;
let busy = false;

function isValidNickname(name) {
  const v = String(name || "").trim();
  return /^[A-Za-z0-9_가-힣]{2,20}$/.test(v);
}

function safeNameColor(value) {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#5db2ff";
}

function render() {
  const points = Math.max(0, Number(profile?.points || 0));
  const username = String(profile?.username || user?.email?.split("@")[0] || "user").trim();
  const usernameColor = safeNameColor(profile?.usernameColor || "#ffffff");
  pointsEl.textContent = String(points);
  usernameEl.textContent = username;
  usernameEl.style.color = usernameColor;
  buyNicknameBtn.disabled = busy || points < NICKNAME_CHANGE_PRICE;
  buyColorBtn.disabled = busy || points < NICKNAME_COLOR_PRICE;
}

function openNicknameModal() {
  nicknameInputEl.value = "";
  nicknameModalStatusEl.textContent = "";
  nicknameModalEl.hidden = false;
  setTimeout(() => nicknameInputEl.focus(), 0);
}

function closeNicknameModal() {
  if (busy) return;
  nicknameModalEl.hidden = true;
}

function openColorModal() {
  colorInputEl.value = safeNameColor(profile?.usernameColor || "#5db2ff");
  colorModalStatusEl.textContent = "";
  colorModalEl.hidden = false;
}

function closeColorModal() {
  if (busy) return;
  colorModalEl.hidden = true;
}

async function purchaseAndChangeNickname() {
  if (!user || busy) return;
  const nextName = String(nicknameInputEl.value || "").trim();
  if (!isValidNickname(nextName)) {
    nicknameModalStatusEl.textContent = "닉네임은 2~20자, 한글/영문/숫자/_만 가능합니다.";
    return;
  }

  busy = true;
  buyNicknameBtn.disabled = true;
  nicknameConfirmBtn.disabled = true;
  nicknameCancelBtn.disabled = true;
  nicknameModalStatusEl.textContent = "처리 중...";

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
    nicknameModalEl.hidden = true;
  } catch (err) {
    nicknameModalStatusEl.textContent = `변경 실패: ${err.message}`;
  } finally {
    busy = false;
    nicknameConfirmBtn.disabled = false;
    nicknameCancelBtn.disabled = false;
    render();
  }
}

async function purchaseAndChangeColor() {
  if (!user || busy) return;
  const nextColor = safeNameColor(colorInputEl.value);

  busy = true;
  buyColorBtn.disabled = true;
  colorConfirmBtn.disabled = true;
  colorCancelBtn.disabled = true;
  colorModalStatusEl.textContent = "처리 중...";

  try {
    const userRef = doc(db, "users", user.uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("유저 정보가 없습니다.");
      const data = snap.data() || {};
      const points = Math.max(0, Number(data.points || 0));
      if (points < NICKNAME_COLOR_PRICE) throw new Error("포인트가 부족합니다.");

      tx.update(userRef, {
        points: points - NICKNAME_COLOR_PRICE,
        usernameColor: nextColor,
        updatedAt: serverTimestamp()
      });
    });

    await addDoc(collection(db, "users", user.uid, "transactions"), {
      type: "shop_purchase",
      amount: -Math.abs(NICKNAME_COLOR_PRICE),
      reason: "nickname_color_ticket",
      meta: { changedColor: nextColor },
      createdAt: serverTimestamp()
    });

    statusEl.textContent = `닉네임 색상 변경 완료: ${nextColor}`;
    colorModalEl.hidden = true;
  } catch (err) {
    colorModalStatusEl.textContent = `변경 실패: ${err.message}`;
  } finally {
    busy = false;
    colorConfirmBtn.disabled = false;
    colorCancelBtn.disabled = false;
    render();
  }
}

function initColorPresets() {
  colorPresetsEl.innerHTML = "";
  COLOR_PRESETS.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-preset";
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener("click", () => {
      colorInputEl.value = color;
    });
    colorPresetsEl.appendChild(btn);
  });
}

function init() {
  initColorPresets();

  buyNicknameBtn.addEventListener("click", () => {
    if (busy) return;
    if (Math.max(0, Number(profile?.points || 0)) < NICKNAME_CHANGE_PRICE) {
      statusEl.textContent = "포인트가 부족합니다.";
      return;
    }
    openNicknameModal();
  });

  buyColorBtn.addEventListener("click", () => {
    if (busy) return;
    if (Math.max(0, Number(profile?.points || 0)) < NICKNAME_COLOR_PRICE) {
      statusEl.textContent = "포인트가 부족합니다.";
      return;
    }
    openColorModal();
  });

  nicknameConfirmBtn.addEventListener("click", () => {
    purchaseAndChangeNickname().catch(() => {});
  });
  nicknameCancelBtn.addEventListener("click", closeNicknameModal);
  nicknameModalEl.addEventListener("click", (e) => {
    if (e.target === nicknameModalEl) closeNicknameModal();
  });

  colorConfirmBtn.addEventListener("click", () => {
    purchaseAndChangeColor().catch(() => {});
  });
  colorCancelBtn.addEventListener("click", closeColorModal);
  colorModalEl.addEventListener("click", (e) => {
    if (e.target === colorModalEl) closeColorModal();
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
