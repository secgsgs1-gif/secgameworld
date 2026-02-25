export const DEFAULT_WEAPON_ID = "starter_dagger";
export const WEAPON_CRATE_COST = 1800;

export const WEAPON_CATALOG = [
  {
    id: DEFAULT_WEAPON_ID,
    name: "Starter Dagger",
    description: "Basic weapon for all players.",
    cashbackRate: 0.01,
    rarity: "Common",
    dropWeight: 0,
    duplicateShards: 0
  },
  {
    id: "steel_blade",
    name: "Steel Blade",
    description: "Sharper blade with better chip return.",
    cashbackRate: 0.02,
    rarity: "Rare",
    dropWeight: 70,
    duplicateShards: 35
  },
  {
    id: "neon_katana",
    name: "Neon Katana",
    description: "Premium weapon for stronger cashback.",
    cashbackRate: 0.04,
    rarity: "Legendary",
    dropWeight: 30,
    duplicateShards: 120
  }
];

const WEAPON_BY_ID = WEAPON_CATALOG.reduce((acc, weapon) => {
  acc[weapon.id] = weapon;
  return acc;
}, {});

export function getWeaponById(id) {
  return WEAPON_BY_ID[String(id || "")] || null;
}

export function normalizeOwnedWeapons(rawOwned) {
  const owned = {};
  WEAPON_CATALOG.forEach((weapon) => {
    owned[weapon.id] = weapon.id === DEFAULT_WEAPON_ID;
  });

  if (!rawOwned || typeof rawOwned !== "object") return owned;
  Object.keys(rawOwned).forEach((id) => {
    if (WEAPON_BY_ID[id]) owned[id] = Boolean(rawOwned[id]);
  });
  owned[DEFAULT_WEAPON_ID] = true;
  return owned;
}

export function isWeaponOwned(profile, weaponId) {
  if (weaponId === DEFAULT_WEAPON_ID) return true;
  const owned = normalizeOwnedWeapons(profile?.ownedWeapons);
  return Boolean(owned[weaponId]);
}

export function getEquippedWeapon(profile) {
  const equippedId = String(profile?.equippedWeaponId || "");
  if (equippedId && isWeaponOwned(profile, equippedId)) {
    return getWeaponById(equippedId) || getWeaponById(DEFAULT_WEAPON_ID);
  }
  return getWeaponById(DEFAULT_WEAPON_ID);
}

export function formatCashbackPercent(rate) {
  const num = Number(rate || 0) * 100;
  const normalized = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${normalized}%`;
}

export function getWeaponGachaPool() {
  return WEAPON_CATALOG.filter((w) => w.id !== DEFAULT_WEAPON_ID && Number(w.dropWeight || 0) > 0);
}

export function rollWeaponFromGacha(rng = Math.random) {
  const pool = getWeaponGachaPool();
  const totalWeight = pool.reduce((sum, w) => sum + Number(w.dropWeight || 0), 0);
  if (!pool.length || totalWeight <= 0) return null;

  let pick = rng() * totalWeight;
  for (const weapon of pool) {
    pick -= Number(weapon.dropWeight || 0);
    if (pick <= 0) return weapon;
  }
  return pool[pool.length - 1];
}
