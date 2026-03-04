import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where
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
let forceNicknameMode = false;
let forceNicknameByQueryPending = new URLSearchParams(window.location.search).get("forceNicknameChange") === "1";

function composeUserTitleTag(data) {
  const tags = [];
  const donation = String(data?.donationTitleTag || "").trim();
  const land = String(data?.landTitleTag || "").trim();
  if (donation) tags.push(donation);
  if (land && !tags.includes(land)) tags.push(land);
  return tags.join(" ").trim();
}

function withTitle(name, titleTag) {
  const base = String(name || "").trim();
  const tag = String(titleTag || "").trim();
  if (!base) return base;
  if (!tag) return base;
  if (base.startsWith(`${tag} `)) return base;
  return `${tag} ${base}`;
}

function isValidNickname(name) {
  const v = String(name || "").trim();
  return /^[A-Za-z0-9_가-힣]{2,20}$/.test(v);
}

function nicknameKey(name) {
  return encodeURIComponent(String(name || "").trim().toLowerCase());
}

function safeNameColor(value) {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#5db2ff";
}

async function isDuplicateNickname(nextName) {
  const q = query(collection(db, "users"), where("username", "==", nextName), limit(3));
  const snap = await getDocs(q);
  return snap.docs.some((d) => d.id !== user.uid);
}

function render() {
  const points = Math.max(0, Number(profile?.points || 0));
  const username = String(profile?.username || user?.email?.split("@")[0] || "user").trim();
  const nicknameTickets = Math.max(0, Math.floor(Number(profile?.nicknameChangeTickets || 0)));
  const usernameColor = safeNameColor(profile?.usernameColor || "#ffffff");
  pointsEl.textContent = String(points);
  usernameEl.textContent = username;
  usernameEl.style.color = usernameColor;
  buyNicknameBtn.disabled = busy || (points < NICKNAME_CHANGE_PRICE && nicknameTickets <= 0);
  buyColorBtn.disabled = busy || points < NICKNAME_COLOR_PRICE;
}

function openNicknameModal() {
  nicknameInputEl.value = "";
  nicknameModalStatusEl.textContent = "";
  nicknameModalEl.hidden = false;
  setTimeout(() => nicknameInputEl.focus(), 0);
}

function closeNicknameModal() {
  if (busy || forceNicknameMode) return;
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
  const currentName = String(profile?.username || "").trim();

  if (!isValidNickname(nextName)) {
    nicknameModalStatusEl.textContent = "닉네임은 2~20자, 한글/영문/숫자/_만 가능합니다.";
    return;
  }
  if (nextName === currentName) {
    nicknameModalStatusEl.textContent = "현재 닉네임과 같습니다.";
    return;
  }

  try {
    if (await isDuplicateNickname(nextName)) {
      nicknameModalStatusEl.textContent = "중복된 닉네임 입니다.";
      return;
    }
  } catch (err) {
    nicknameModalStatusEl.textContent = `중복 확인 실패: ${err.message}`;
    return;
  }

  busy = true;
  buyNicknameBtn.disabled = true;
  nicknameConfirmBtn.disabled = true;
  nicknameCancelBtn.disabled = true;
  nicknameModalStatusEl.textContent = "처리 중...";

  try {
    const userRef = doc(db, "users", user.uid);
    const presenceRef = doc(db, "presence", user.uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("유저 정보가 없습니다.");
      const data = snap.data() || {};
      const points = Math.max(0, Number(data.points || 0));
      const tickets = Math.max(0, Math.floor(Number(data.nicknameChangeTickets || 0)));
      const useTicket = tickets > 0;
      if (!useTicket && points < NICKNAME_CHANGE_PRICE) throw new Error("포인트가 부족합니다.");

      const txCurrentName = String(data.username || "").trim();
      const txCurrentKey = txCurrentName ? nicknameKey(txCurrentName) : "";
      const txNextKey = nicknameKey(nextName);
      const nextClaimRef = doc(db, "username_claims", txNextKey);
      const nextClaimSnap = await tx.get(nextClaimRef);
      if (nextClaimSnap.exists() && String(nextClaimSnap.data()?.uid || "") !== user.uid) {
        throw new Error("DUPLICATE_NICKNAME");
      }

      let currentClaimRef = null;
      let currentClaimSnap = null;
      if (txCurrentKey && txCurrentKey !== txNextKey) {
        currentClaimRef = doc(db, "username_claims", txCurrentKey);
        currentClaimSnap = await tx.get(currentClaimRef);
      }

      const updatePayload = {
        username: nextName,
        updatedAt: serverTimestamp()
      };
      if (useTicket) {
        updatePayload.nicknameChangeTickets = Math.max(0, tickets - 1);
        updatePayload.forceNicknameChangeOnLogin = false;
      } else {
        updatePayload.points = points - NICKNAME_CHANGE_PRICE;
      }
      tx.update(userRef, updatePayload);

      const titleTag = composeUserTitleTag(data);
      const usernameColor = safeNameColor(data.usernameColor || "");
      tx.set(presenceRef, {
        uid: user.uid,
        username: withTitle(nextName, titleTag),
        usernameColor,
        online: true,
        lastSeen: serverTimestamp()
      }, { merge: true });

      tx.set(nextClaimRef, {
        uid: user.uid,
        username: nextName,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (currentClaimRef && currentClaimSnap?.exists() && String(currentClaimSnap.data()?.uid || "") === user.uid) {
        tx.delete(currentClaimRef);
      }
    });

    const usedTicket = Math.max(0, Math.floor(Number(profile?.nicknameChangeTickets || 0))) > 0;
    if (usedTicket) {
      await addDoc(collection(db, "users", user.uid, "transactions"), {
        type: "earn",
        amount: 0,
        reason: "nickname_change_ticket_used",
        meta: {
          changedFrom: currentName,
          changedTo: nextName
        },
        createdAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "users", user.uid, "transactions"), {
        type: "shop_purchase",
        amount: -Math.abs(NICKNAME_CHANGE_PRICE),
        reason: "nickname_change_ticket",
        meta: {
          changedFrom: currentName,
          changedTo: nextName
        },
        createdAt: serverTimestamp()
      });
    }

    statusEl.textContent = `닉네임 변경 완료: ${nextName}`;
    forceNicknameMode = false;
    nicknameModalEl.hidden = true;
  } catch (err) {
    if (String(err?.message || "") === "DUPLICATE_NICKNAME") {
      nicknameModalStatusEl.textContent = "중복된 닉네임 입니다.";
    } else {
      nicknameModalStatusEl.textContent = `변경 실패: ${err.message}`;
    }
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
    const presenceRef = doc(db, "presence", user.uid);
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

      tx.set(presenceRef, {
        uid: user.uid,
        usernameColor: nextColor,
        online: true,
        lastSeen: serverTimestamp()
      }, { merge: true });
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
    const points = Math.max(0, Number(profile?.points || 0));
    const tickets = Math.max(0, Math.floor(Number(profile?.nicknameChangeTickets || 0)));
    if (points < NICKNAME_CHANGE_PRICE && tickets <= 0) {
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
    if (!nicknameModalEl.hidden && profile.forceNicknameChangeOnLogin !== true) {
      forceNicknameMode = false;
    }
    if ((profile.forceNicknameChangeOnLogin === true || forceNicknameByQueryPending) && !busy && nicknameModalEl.hidden) {
      forceNicknameMode = true;
      openNicknameModal();
      nicknameModalStatusEl.textContent = "관리자 지급 변경권이 있어 닉네임 변경이 필요합니다.";
      forceNicknameByQueryPending = false;
    }
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
