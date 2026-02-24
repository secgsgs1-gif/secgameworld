import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { auth, db, isFirebaseConfigured } from "./firebase-app.js?v=20260224f";

export function requireFirebaseConfigured() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase not configured");
  }
}

export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const username = emailToUsername(user.email || "");
  const profile = {
    username,
    email: user.email || "",
    points: 300,
    lastCheckInDate: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  return profile;
}

export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export function usernameToEmail(username) {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3) {
    throw new Error("아이디는 영문/숫자/언더바 3자 이상으로 입력하세요.");
  }
  return `${normalized}@secgame.local`;
}

export function emailToUsername(email) {
  const e = String(email || "").toLowerCase();
  if (e.endsWith("@secgame.local")) return e.replace("@secgame.local", "");
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : e;
}

export async function signUpWithUsername(username, password) {
  const email = usernameToEmail(username);
  return signUp(email, password);
}

export async function signInWithUsername(username, password) {
  const email = usernameToEmail(username);
  return signIn(email, password);
}

export async function logOut() {
  await signOut(auth);
}

export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
