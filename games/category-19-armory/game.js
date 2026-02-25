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
  WEAPON_CRATE_COST,
  WEAPON_CATALOG,
  formatCashbackPercent,
  getEquippedWeapon,
  isWeaponOwned,
  normalizeOwnedWeapons,
  rollWeaponFromGacha
} from "../../shared/weapons.js?v=20260225b";

const pointsEl = document.getElementById("points");
const shardsEl = document.getElementById("weapon-shards");
const equippedWeaponEl = document.getElementById("equipped-weapon");
const equippedCashbackEl = document.getElementById("equipped-cashback");
const crateCostEl = document.getElementById("crate-cost");
const openCrateBtn = document.getElementById("open-crate-btn");
const crateResultEl = document.getElementById("crate-result");
const weaponListEl = document.getElementById("weapon-list");
const statusEl = document.getElementById("status");

let user = null;
let booted = false;
let profile = null;
let busy = false;

function render() {
  const points = Number(profile?.points || 0);
  const shards = Number(profile?.weaponShards || 0);
  const equipped = getEquippedWeapon(profile || {});
  pointsEl.textContent = String(points);
  shardsEl.textContent = String(shards);
  equippedWeaponEl.textContent = equipped?.name || "-";
  equippedCashbackEl.textContent = formatCashbackPercent(equipped?.cashbackRate || 0);
  crateCostEl.textContent = `${WEAPON_CRATE_COST} pts`;
  openCrateBtn.disabled = busy || points < WEAPON_CRATE_COST;

  weaponListEl.innerHTML = "";
  WEAPON_CATALOG.forEach((weapon) => {
    const owned = isWeaponOwned(profile || {}, weapon.id);
    const isEquipped = equipped?.id === weapon.id;

    const card = document.createElement("article");
    card.className = "weapon-card";

    const title = document.createElement("h3");
    title.textContent = weapon.name;
    card.appendChild(title);

    const rarity = document.createElement("span");
    rarity.className = `weapon-rarity ${String(weapon.rarity || "common").toLowerCase()}`;
    rarity.textContent = weapon.rarity || "Common";
    card.appendChild(rarity);

    const desc = document.createElement("p");
    desc.textContent = weapon.description;
    card.appendChild(desc);

    const cashback = document.createElement("p");
    cashback.textContent = `Roulette/Baccarat cashback: ${formatCashbackPercent(weapon.cashbackRate)}`;
    card.appendChild(cashback);

    const ownership = document.createElement("p");
    ownership.textContent = owned ? "Owned" : "Not owned";
    card.appendChild(ownership);

    const button = document.createElement("button");
    button.type = "button";
    if (isEquipped) button.textContent = "Equipped";
    else if (owned) button.textContent = "Equip";
    else button.textContent = "Locked";
    button.disabled = busy || isEquipped || !owned;
    button.addEventListener("click", () => {
      equipWeapon(weapon).catch((err) => {
        statusEl.textContent = `Equip failed: ${err.message}`;
      });
    });
    card.appendChild(button);

    weaponListEl.appendChild(card);
  });
}

async function openWeaponCrate() {
  if (!user || busy) return;
  busy = true;
  crateResultEl.textContent = "";
  statusEl.textContent = "Opening weapon crate...";
  const userRef = doc(db, "users", user.uid);

  let txResult = null;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("User profile missing");
      const data = snap.data() || {};
      const currentPoints = Number(data.points || 0);
      const owned = normalizeOwnedWeapons(data.ownedWeapons);
      const currentShards = Number(data.weaponShards || 0);
      if (currentPoints < WEAPON_CRATE_COST) throw new Error("Not enough points");

      const rolled = rollWeaponFromGacha();
      if (!rolled) throw new Error("Gacha pool not configured");
      const alreadyOwned = Boolean(owned[rolled.id]);
      const shardGain = alreadyOwned ? Number(rolled.duplicateShards || 0) : 0;

      if (!alreadyOwned) {
        owned[rolled.id] = true;
      }

      const updateData = {
        points: currentPoints - WEAPON_CRATE_COST,
        ownedWeapons: owned,
        weaponShards: currentShards + shardGain,
        updatedAt: serverTimestamp()
      };
      if (!alreadyOwned) {
        updateData.equippedWeaponId = rolled.id;
      }

      txResult = {
        weaponId: rolled.id,
        weaponName: rolled.name,
        rarity: rolled.rarity || "Common",
        cashbackRate: Number(rolled.cashbackRate || 0),
        duplicate: alreadyOwned,
        shardGain
      };
      tx.update(userRef, {
        ...updateData
      });
    });

    await addDoc(collection(db, "users", user.uid, "transactions"), {
      type: "weapon_crate_open",
      amount: -Math.abs(WEAPON_CRATE_COST),
      reason: "armory_weapon_crate",
      meta: {
        weaponId: txResult.weaponId,
        rarity: txResult.rarity,
        cashbackRate: txResult.cashbackRate,
        duplicate: txResult.duplicate,
        shardGain: txResult.shardGain
      },
      createdAt: serverTimestamp()
    });
    if (txResult.duplicate) {
      crateResultEl.textContent = `Duplicate: ${txResult.weaponName} (${txResult.rarity}) -> +${txResult.shardGain} shards`;
    } else {
      crateResultEl.textContent = `New Weapon: ${txResult.weaponName} (${txResult.rarity}) acquired`;
    }
    statusEl.textContent = "Crate opened successfully.";
  } finally {
    busy = false;
    render();
  }
}

async function equipWeapon(weapon) {
  if (!user || busy) return;
  busy = true;
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
    busy = false;
    render();
  }
}

function init() {
  openCrateBtn.addEventListener("click", () => {
    openWeaponCrate().catch((err) => {
      statusEl.textContent = `Crate failed: ${err.message}`;
      busy = false;
      render();
    });
  });

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
