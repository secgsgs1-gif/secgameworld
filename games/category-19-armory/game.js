import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { db } from "../../shared/firebase-app.js?v=20260224m";
import {
  WEAPON_CATALOG,
  formatCashbackPercent,
  getEquippedWeapon,
  isWeaponOwned,
  normalizeOwnedWeapons
} from "../../shared/weapons.js?v=20260225a";

const pointsEl = document.getElementById("points");
const equippedWeaponEl = document.getElementById("equipped-weapon");
const equippedCashbackEl = document.getElementById("equipped-cashback");
const weaponListEl = document.getElementById("weapon-list");
const statusEl = document.getElementById("status");

let user = null;
let booted = false;
let profile = null;
let busyWeaponId = "";

function render() {
  const points = Number(profile?.points || 0);
  const equipped = getEquippedWeapon(profile || {});
  pointsEl.textContent = String(points);
  equippedWeaponEl.textContent = equipped?.name || "-";
  equippedCashbackEl.textContent = formatCashbackPercent(equipped?.cashbackRate || 0);

  weaponListEl.innerHTML = "";
  WEAPON_CATALOG.forEach((weapon) => {
    const owned = isWeaponOwned(profile || {}, weapon.id);
    const isEquipped = equipped?.id === weapon.id;
    const canAfford = points >= weapon.cost;

    const card = document.createElement("article");
    card.className = "weapon-card";

    const title = document.createElement("h3");
    title.textContent = weapon.name;
    card.appendChild(title);

    const desc = document.createElement("p");
    desc.textContent = weapon.description;
    card.appendChild(desc);

    const cashback = document.createElement("p");
    cashback.textContent = `Roulette/Baccarat cashback: ${formatCashbackPercent(weapon.cashbackRate)}`;
    card.appendChild(cashback);

    const ownership = document.createElement("p");
    ownership.textContent = owned ? "Owned" : `Price: ${weapon.cost} pts`;
    card.appendChild(ownership);

    const button = document.createElement("button");
    button.type = "button";
    if (isEquipped) button.textContent = "Equipped";
    else if (owned) button.textContent = "Equip";
    else button.textContent = `Buy (${weapon.cost})`;
    button.disabled = Boolean(busyWeaponId) || isEquipped || (!owned && !canAfford);
    button.addEventListener("click", () => {
      if (owned) {
        equipWeapon(weapon).catch((err) => {
          statusEl.textContent = `Equip failed: ${err.message}`;
        });
      } else {
        buyWeapon(weapon).catch((err) => {
          statusEl.textContent = `Purchase failed: ${err.message}`;
        });
      }
    });
    card.appendChild(button);

    weaponListEl.appendChild(card);
  });
}

async function buyWeapon(weapon) {
  if (!user) return;
  if (busyWeaponId) return;
  busyWeaponId = weapon.id;
  render();
  statusEl.textContent = `Buying ${weapon.name}...`;
  const userRef = doc(db, "users", user.uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("User profile missing");
      const data = snap.data() || {};
      const currentPoints = Number(data.points || 0);
      const owned = normalizeOwnedWeapons(data.ownedWeapons);
      if (owned[weapon.id]) throw new Error("Already owned");
      if (currentPoints < weapon.cost) throw new Error("Not enough points");

      owned[weapon.id] = true;
      tx.update(userRef, {
        points: currentPoints - weapon.cost,
        ownedWeapons: owned,
        equippedWeaponId: weapon.id,
        updatedAt: serverTimestamp()
      });
    });

    await addDoc(collection(db, "users", user.uid, "transactions"), {
      type: "weapon_purchase",
      amount: -Math.abs(weapon.cost),
      reason: "armory_weapon_purchase",
      meta: {
        weaponId: weapon.id,
        cashbackRate: weapon.cashbackRate
      },
      createdAt: serverTimestamp()
    });

    statusEl.textContent = `${weapon.name} purchased and equipped.`;
  } finally {
    busyWeaponId = "";
    render();
  }
}

async function equipWeapon(weapon) {
  if (!user) return;
  if (busyWeaponId) return;
  busyWeaponId = weapon.id;
  render();
  statusEl.textContent = `Equipping ${weapon.name}...`;
  const userRef = doc(db, "users", user.uid);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("User profile missing");
      const data = snap.data() || {};
      const owned = normalizeOwnedWeapons(data.ownedWeapons);
      if (!owned[weapon.id]) throw new Error("Weapon not owned");
      tx.update(userRef, {
        equippedWeaponId: weapon.id,
        updatedAt: serverTimestamp()
      });
    });
    statusEl.textContent = `${weapon.name} equipped.`;
  } finally {
    busyWeaponId = "";
    render();
  }
}

function init() {
  onSnapshot(doc(db, "users", user.uid), (snap) => {
    profile = snap.data() || {};
    render();
  }, (err) => {
    statusEl.textContent = `Load failed: ${err.message}`;
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
