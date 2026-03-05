(() => {
  const SAVE_KEY = "idleGrowerStandaloneV1";
  const MAX_OFFLINE_SECONDS = 60 * 60 * 6;

  const base = {
    gold: 0,
    level: 1,
    exp: 0,
    tapPower: 1,
    autoDps: 1,
    critChance: 0.05,
    critMult: 2,
    tapUp: 0,
    autoUp: 0,
    critUp: 0,
    lastSave: Date.now()
  };
  const cloneBase = () => ({ ...base, lastSave: Date.now() });

  const state = load();

  const el = {
    gold: document.getElementById("gold"),
    level: document.getElementById("level"),
    exp: document.getElementById("exp"),
    dps: document.getElementById("dps"),
    tapLog: document.getElementById("tap-log"),
    tapBtn: document.getElementById("tap-btn"),
    costTap: document.getElementById("cost-tap"),
    costAuto: document.getElementById("cost-auto"),
    costCrit: document.getElementById("cost-crit"),
    tapPower: document.getElementById("tap-power"),
    crit: document.getElementById("crit"),
    upgradeTap: document.getElementById("upgrade-tap"),
    upgradeAuto: document.getElementById("upgrade-auto"),
    upgradeCrit: document.getElementById("upgrade-crit"),
    offlineReward: document.getElementById("offline-reward"),
    saveBtn: document.getElementById("save-btn"),
    resetBtn: document.getElementById("reset-btn")
  };

  const offlineReward = applyOfflineReward();
  el.offlineReward.textContent = fmt(offlineReward);

  el.tapBtn.addEventListener("click", tapHunt);
  el.upgradeTap.addEventListener("click", () => buyUpgrade("tap"));
  el.upgradeAuto.addEventListener("click", () => buyUpgrade("auto"));
  el.upgradeCrit.addEventListener("click", () => buyUpgrade("crit"));
  el.saveBtn.addEventListener("click", () => {
    save();
    el.tapLog.textContent = "저장 완료";
  });
  el.resetBtn.addEventListener("click", () => {
    if (!window.confirm("정말 초기화할까요?")) return;
    localStorage.removeItem(SAVE_KEY);
    Object.assign(state, cloneBase());
    state.lastSave = Date.now();
    render();
    save();
  });

  setInterval(() => {
    addGold(state.autoDps);
  }, 1000);

  setInterval(save, 10000);
  window.addEventListener("beforeunload", save);

  render();

  function tapHunt() {
    const crit = Math.random() < state.critChance;
    const gain = state.tapPower * (crit ? state.critMult : 1);
    addGold(gain);
    el.tapLog.textContent = crit
      ? `CRITICAL! +${fmt(gain)} Gold`
      : `+${fmt(gain)} Gold`;
  }

  function addGold(amount) {
    if (amount <= 0) return;
    state.gold += amount;
    gainExp(amount * 0.2);
    render();
  }

  function gainExp(amount) {
    state.exp += amount;
    while (state.exp >= needExp(state.level)) {
      state.exp -= needExp(state.level);
      state.level += 1;
      state.tapPower *= 1.08;
      state.autoDps *= 1.05;
    }
  }

  function buyUpgrade(type) {
    const cost = getCost(type);
    if (state.gold < cost) {
      el.tapLog.textContent = "Gold가 부족합니다.";
      return;
    }

    state.gold -= cost;
    if (type === "tap") {
      state.tapUp += 1;
      state.tapPower += 1;
    }
    if (type === "auto") {
      state.autoUp += 1;
      state.autoDps += 1;
    }
    if (type === "crit") {
      state.critUp += 1;
      state.critChance = Math.min(0.7, state.critChance + 0.02);
    }

    render();
  }

  function getCost(type) {
    if (type === "tap") return Math.floor(15 * Math.pow(1.35, state.tapUp));
    if (type === "auto") return Math.floor(25 * Math.pow(1.38, state.autoUp));
    return Math.floor(40 * Math.pow(1.45, state.critUp));
  }

  function needExp(level) {
    return 10 + Math.floor(level * 6);
  }

  function applyOfflineReward() {
    const now = Date.now();
    const seconds = Math.max(0, Math.floor((now - Number(state.lastSave || now)) / 1000));
    const clamped = Math.min(MAX_OFFLINE_SECONDS, seconds);
    const reward = state.autoDps * clamped;
    state.lastSave = now;
    if (reward > 0) addGold(reward);
    return reward;
  }

  function render() {
    const tapCost = getCost("tap");
    const autoCost = getCost("auto");
    const critCost = getCost("crit");
    const expNeed = needExp(state.level);

    el.gold.textContent = fmt(state.gold);
    el.level.textContent = String(state.level);
    el.exp.textContent = `${fmt(state.exp)} / ${fmt(expNeed)}`;
    el.dps.textContent = fmt(state.autoDps);
    el.costTap.textContent = String(tapCost);
    el.costAuto.textContent = String(autoCost);
    el.costCrit.textContent = String(critCost);
    el.tapPower.textContent = fmt(state.tapPower);
    el.crit.textContent = `${(state.critChance * 100).toFixed(1)}%`;

    el.tapBtn.textContent = `HUNT (+${fmt(state.tapPower)})`;
    el.upgradeTap.disabled = state.gold < tapCost;
    el.upgradeAuto.disabled = state.gold < autoCost;
    el.upgradeCrit.disabled = state.gold < critCost;
  }

  function save() {
    state.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return cloneBase();
      const data = JSON.parse(raw);
      return {
        ...cloneBase(),
        ...data
      };
    } catch {
      return cloneBase();
    }
  }

  function fmt(v) {
    const n = Number(v || 0);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
    return `${Math.floor(n * 100) / 100}`;
  }
})();
