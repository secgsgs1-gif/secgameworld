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
  LEGENDARY_DUPLICATE_BONUS_PER_LEVEL,
  RARE_DUPLICATE_PAYBACK_RATE,
  WEAPON_CRATE_COST,
  WEAPON_CATALOG,
  formatCashbackPercent,
  getEquippedWeapon,
  isWeaponOwned,
  normalizeOwnedWeapons,
  rollWeaponFromGacha
} from "../../shared/weapons.js?v=20260225c";

const pointsEl = document.getElementById("points");
const equippedWeaponEl = document.getElementById("equipped-weapon");
const equippedCashbackEl = document.getElementById("equipped-cashback");
const neonLevelEl = document.getElementById("neon-level");
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
  const neonLevel = Math.max(0, Math.floor(Number(profile?.neonKatanaLevel || 0)));
  const equipped = getEquippedWeapon(profile || {});
  pointsEl.textContent = String(points);
  equippedWeaponEl.textContent = equipped?.name || "-";
  equippedCashbackEl.textContent = formatCashbackPercent(equipped?.cashbackRate || 0);
  neonLevelEl.textContent = `Lv.${neonLevel}`;
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
    if (weapon.id === "neon_katana") {
      const bonus = document.createElement("p");
      bonus.textContent = `Legend Level Bonus: +${formatCashbackPercent(LEGENDARY_DUPLICATE_BONUS_PER_LEVEL)} per level (current Lv.${neonLevel})`;
      card.appendChild(bonus);
    }

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
      const currentNeonLevel = Math.max(0, Math.floor(Number(data.neonKatanaLevel || 0)));
      if (currentPoints < WEAPON_CRATE_COST) throw new Error("Not enough points");

      const rolled = rollWeaponFromGacha();
      if (!rolled) throw new Error("Gacha pool not configured");
      const alreadyOwned = Boolean(owned[rolled.id]);
      const isLegendaryDuplicate = alreadyOwned && rolled.id === "neon_katana";
      const isRareDuplicate = alreadyOwned && rolled.rarity === "Rare";
      const payback = isRareDuplicate ? Math.floor(WEAPON_CRATE_COST * RARE_DUPLICATE_PAYBACK_RATE) : 0;
      const nextNeonLevel = isLegendaryDuplicate ? currentNeonLevel + 1 : currentNeonLevel;

      if (!alreadyOwned) {
        owned[rolled.id] = true;
      }

      const updateData = {
        points: currentPoints - WEAPON_CRATE_COST + payback,
        ownedWeapons: owned,
        neonKatanaLevel: nextNeonLevel,
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
        isLegendaryDuplicate,
        isRareDuplicate,
        payback,
        nextNeonLevel
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
        isLegendaryDuplicate: txResult.isLegendaryDuplicate,
        isRareDuplicate: txResult.isRareDuplicate,
        payback: txResult.payback,
        nextNeonLevel: txResult.nextNeonLevel
      },
      createdAt: serverTimestamp()
    });
    if (txResult.isLegendaryDuplicate) {
      crateResultEl.textContent = `Legendary duplicate! ${txResult.weaponName} upgraded to Lv.${txResult.nextNeonLevel}`;
    } else if (txResult.isRareDuplicate) {
      crateResultEl.textContent = `Rare duplicate: ${txResult.weaponName} -> ${txResult.payback} pts payback`;
    } else if (txResult.duplicate) {
      crateResultEl.textContent = `Duplicate: ${txResult.weaponName} (${txResult.rarity})`;
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
