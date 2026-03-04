import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "./firebase-app.js?v=20260224m";

function bool(v) {
  return v === true;
}

export async function resolveAdminAccess(user) {
  if (!user?.uid) return { isAdmin: false, via: "none" };

  try {
    const token = await getIdTokenResult(user, true);
    if (bool(token?.claims?.admin)) return { isAdmin: true, via: "claim" };
  } catch (_) {}

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const p = snap.data() || {};
    if (bool(p.isAdmin) || String(p.role || "").toLowerCase() === "admin") {
      return { isAdmin: true, via: "profile" };
    }
  } catch (_) {}

  return { isAdmin: false, via: "none" };
}
