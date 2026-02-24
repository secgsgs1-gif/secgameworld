import {
  collection,
  doc,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "./firebase-app.js?v=20260224c";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function watchUserProfile(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function claimDailyCheckIn(uid, reward = 100) {
  const userRef = doc(db, "users", uid);
  const txRef = collection(db, "users", uid, "transactions");
  const today = todayKey();

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error("User profile missing");

    const data = snap.data();
    if (data.lastCheckInDate === today) {
      return { granted: false, points: data.points };
    }

    const nextPoints = (data.points || 0) + reward;
    tx.update(userRef, {
      points: nextPoints,
      lastCheckInDate: today,
      updatedAt: serverTimestamp()
    });
    return { granted: true, points: nextPoints };
  });

  if (result.granted) {
    await addDoc(txRef, {
      type: "daily_check_in",
      amount: reward,
      createdAt: serverTimestamp()
    });
  }

  return result;
}

export async function spendPoints(uid, amount, reason = "game_entry", meta = {}) {
  if (amount <= 0) return { ok: true, points: null };

  const userRef = doc(db, "users", uid);
  const txRef = collection(db, "users", uid, "transactions");

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) throw new Error("User profile missing");

    const data = snap.data();
    const current = data.points || 0;
    if (current < amount) {
      return { ok: false, points: current };
    }

    const nextPoints = current - amount;
    tx.update(userRef, { points: nextPoints, updatedAt: serverTimestamp() });
    return { ok: true, points: nextPoints };
  });

  if (result.ok) {
    await addDoc(txRef, {
      type: "spend",
      amount: -Math.abs(amount),
      reason,
      meta,
      createdAt: serverTimestamp()
    });
  }

  return result;
}

export async function addPoints(uid, amount, reason = "reward", meta = {}) {
  if (amount <= 0) return;
  const userRef = doc(db, "users", uid);
  const txRef = collection(db, "users", uid, "transactions");

  await updateDoc(userRef, {
    points: increment(amount),
    updatedAt: serverTimestamp()
  });

  await addDoc(txRef, {
    type: "earn",
    amount: Math.abs(amount),
    reason,
    meta,
    createdAt: serverTimestamp()
  });
}
