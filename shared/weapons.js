export const DEFAULT_WEAPON_ID = "starter_dagger";

export const WEAPON_CATALOG = [
  {
    id: DEFAULT_WEAPON_ID,
    name: "Starter Dagger",
    description: "Basic weapon for all players.",
    cashbackRate: 0.01,
    cost: 0
  },
  {
    id: "steel_blade",
    name: "Steel Blade",
    description: "Sharper blade with better chip return.",
    cashbackRate: 0.02,
    cost: 3500
  },
  {
    id: "neon_katana",
    name: "Neon Katana",
    description: "Premium weapon for stronger cashback.",
    cashbackRate: 0.04,
    cost: 12000
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
