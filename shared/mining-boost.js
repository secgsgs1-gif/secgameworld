import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "./firebase-app.js?v=20260224m";

const DEFAULT_STATE = {
  active: false,
  multiplier: 1,
  label: ""
};

function parseTimeMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return Number(v.toMillis() || 0);
  if (typeof v.seconds === "number") return Number(v.seconds * 1000);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeState(data, nowMs = Date.now()) {
  const enabled = data?.enabled === true;
  const rawMultiplier = Number(data?.multiplier || 1);
  const multiplier = Number.isFinite(rawMultiplier) && rawMultiplier > 1 ? rawMultiplier : 1;
  const startsAtMs = parseTimeMs(data?.startsAt || data?.startsAtMs);
  const endsAtMs = parseTimeMs(data?.endsAt || data?.endsAtMs);
  const startsOk = !startsAtMs || nowMs >= startsAtMs;
  const endsOk = !endsAtMs || nowMs <= endsAtMs;
  const active = enabled && multiplier > 1 && startsOk && endsOk;
  const label = String(data?.label || "").trim();
  return {
    active,
    multiplier: active ? multiplier : 1,
    label: active ? label : ""
  };
}

export function watchMiningBoost(onChange) {
  if (typeof onChange !== "function") return () => {};
  onChange(DEFAULT_STATE);
  return onSnapshot(
    doc(db, "runtime_events", "mining"),
    (snap) => onChange(normalizeState(snap.data() || {})),
    () => onChange(DEFAULT_STATE)
  );
}
