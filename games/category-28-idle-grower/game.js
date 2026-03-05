(() => {
  const SAVE_KEY = "idleGrowerStandaloneV2";
  const MAX_OFFLINE_SECONDS = 60 * 60 * 8;
  const ATTACK_TICK = 0.05;

  const ENEMIES = ["고블린", "해골병", "어둠 늑대", "저주 사제", "심연 기사"];
  const BOSS_NAMES = ["망각의 수문장", "피안의 집행자", "폐허의 왕", "심연 포식자"];

  const base = {
    gold: 0,
    soul: 0,
    stage: 1,
    wave: 1,
    heroLv: 1,
    companionLv: 1,
    heroAtk: 8,
    companionAtk: 3,
    atkSpeedLv: 0,
    atkSpeed: 1,
    critLv: 0,
    critChance: 0.05,
    critMul: 1.6,
    skillLv: 0,
    skillMul: 2.5,
    refineLv: 0,
    autoSkill: false,
    kills: 0,
    lastSave: Date.now()
  };

  const state = load();

  const runtime = {
    enemyName: "",
    enemyMaxHp: 0,
    enemyHp: 0,
    isBoss: false,
    attackTimer: 0,
    skillCd: 0,
    statusMsg: "전투 시작",
    lastLog: "자동 전투 진행중..."
  };

  const el = {
    gold: byId("gold"),
    soul: byId("soul"),
    stage: byId("stage"),
    power: byId("power"),
    battleStatus: byId("battle-status"),
    offlineReward: byId("offline-reward"),
    enemyName: byId("enemy-name"),
    enemyHpFill: byId("enemy-hp-fill"),
    enemyHpText: byId("enemy-hp-text"),
    enemySprite: byId("enemy-sprite"),
    heroDps: byId("hero-dps"),
    manualHit: byId("manual-hit"),
    skillBtn: byId("skill-btn"),
    toggleAutoSkill: byId("toggle-auto-skill"),
    nextStage: byId("next-stage"),
    skillInfo: byId("skill-info"),
    upHero: byId("up-hero"),
    upCompanion: byId("up-companion"),
    upSpeed: byId("up-speed"),
    upCrit: byId("up-crit"),
    upSkill: byId("up-skill"),
    upRefine: byId("up-refine"),
    costHero: byId("cost-hero"),
    costCompanion: byId("cost-companion"),
    costSpeed: byId("cost-speed"),
    costCrit: byId("cost-crit"),
    costSkill: byId("cost-skill"),
    costRefine: byId("cost-refine"),
    heroLv: byId("hero-lv"),
    companionLv: byId("companion-lv"),
    atk: byId("atk"),
    atkSpeed: byId("atk-speed"),
    crit: byId("crit"),
    skillMul: byId("skill-mul"),
    refine: byId("refine"),
    kills: byId("kills"),
    saveBtn: byId("save-btn"),
    resetBtn: byId("reset-btn"),
    log: byId("log")
  };

  bindEvents();
  spawnEnemy();

  const offlineGold = applyOfflineReward();
  el.offlineReward.textContent = `오프라인 보상: ${fmt(offlineGold)} Gold`;

  setInterval(tick, ATTACK_TICK * 1000);
  setInterval(() => save(false), 12000);
  window.addEventListener("beforeunload", () => save(false));
  render();

  function byId(id) {
    return document.getElementById(id);
  }

  function bindEvents() {
    el.manualHit.addEventListener("click", () => {
      dealDamage(getTapDamage(), "강타");
    });

    el.skillBtn.addEventListener("click", () => {
      castSkill(false);
    });

    el.toggleAutoSkill.addEventListener("click", () => {
      state.autoSkill = !state.autoSkill;
      render();
    });

    el.nextStage.addEventListener("click", () => {
      state.stage += 1;
      state.wave = 1;
      runtime.statusMsg = `Stage ${state.stage} 진입`;
      spawnEnemy();
      render();
    });

    el.upHero.addEventListener("click", () => buyUpgrade("hero"));
    el.upCompanion.addEventListener("click", () => buyUpgrade("companion"));
    el.upSpeed.addEventListener("click", () => buyUpgrade("speed"));
    el.upCrit.addEventListener("click", () => buyUpgrade("crit"));
    el.upSkill.addEventListener("click", () => buyUpgrade("skill"));
    el.upRefine.addEventListener("click", () => buyUpgrade("refine"));

    el.saveBtn.addEventListener("click", () => {
      save(true);
      log("수동 저장 완료");
    });

    el.resetBtn.addEventListener("click", () => {
      if (!window.confirm("정말 초기화할까요?")) return;
      localStorage.removeItem(SAVE_KEY);
      Object.assign(state, createBaseState());
      runtime.skillCd = 0;
      runtime.attackTimer = 0;
      state.wave = 1;
      spawnEnemy();
      save(false);
      log("초기화 완료");
      render();
    });
  }

  function createBaseState() {
    return { ...base, lastSave: Date.now() };
  }

  function tick() {
    runtime.attackTimer += ATTACK_TICK;
    runtime.skillCd = Math.max(0, runtime.skillCd - ATTACK_TICK);

    const interval = 1 / Math.max(0.35, getAtkSpeed());
    if (runtime.attackTimer >= interval) {
      runtime.attackTimer -= interval;
      dealDamage(getAutoAttackDamage(), "자동 공격");
    }

    if (state.autoSkill && runtime.skillCd <= 0) {
      castSkill(true);
    }

    render();
  }

  function castSkill(isAuto) {
    if (runtime.skillCd > 0) return;
    const dmg = getPower() * state.skillMul;
    runtime.skillCd = Math.max(2.4, 8 - state.skillLv * 0.32);
    dealDamage(dmg, isAuto ? "자동 스킬" : "그림자 폭풍");
  }

  function dealDamage(rawDamage, source) {
    if (runtime.enemyHp <= 0) return;

    const crit = Math.random() < state.critChance;
    const dmg = rawDamage * (crit ? state.critMul : 1);
    runtime.enemyHp = Math.max(0, runtime.enemyHp - dmg);
    runtime.statusMsg = crit ? `${source} 치명타!` : `${source} 적중`;

    if (runtime.enemyHp <= 0) {
      onEnemyDefeated();
    }
  }

  function onEnemyDefeated() {
    state.kills += 1;

    const rewardBase = runtime.enemyMaxHp * 0.45;
    const goldGain = rewardBase * (runtime.isBoss ? 2.8 : 1) * (1 + state.stage * 0.03);
    const soulGain = rewardBase * 0.05 * (runtime.isBoss ? 2 : 1);

    state.gold += goldGain;
    state.soul += soulGain;

    if (runtime.isBoss) {
      state.stage += 1;
      state.wave = 1;
      runtime.statusMsg = `보스 처치! Stage ${state.stage}`;
    } else {
      state.wave += 1;
      if (state.wave > 10) {
        state.wave = 10;
      }
      runtime.statusMsg = `적 처치! Wave ${state.wave}`;
    }

    spawnEnemy();
  }

  function spawnEnemy() {
    runtime.isBoss = state.wave >= 10;

    if (runtime.isBoss) {
      runtime.enemyName = BOSS_NAMES[(state.stage - 1) % BOSS_NAMES.length];
    } else {
      runtime.enemyName = `${ENEMIES[(state.wave + state.stage) % ENEMIES.length]} ${state.wave}`;
    }

    const stagePow = Math.pow(state.stage, 1.48);
    const waveMul = 1 + state.wave * 0.22;
    const bossMul = runtime.isBoss ? 4.2 : 1;
    runtime.enemyMaxHp = Math.max(25, Math.floor((28 + stagePow * 12) * waveMul * bossMul));
    runtime.enemyHp = runtime.enemyMaxHp;
  }

  function buyUpgrade(type) {
    const costs = getCosts();

    if (type === "hero") {
      if (!spendGold(costs.hero)) return;
      state.heroLv += 1;
      state.heroAtk *= 1.17;
      log("영웅 훈련 성공");
    }

    if (type === "companion") {
      if (!spendGold(costs.companion)) return;
      state.companionLv += 1;
      state.companionAtk *= 1.2;
      log("동료가 강해졌습니다");
    }

    if (type === "speed") {
      if (!spendGold(costs.speed)) return;
      state.atkSpeedLv += 1;
      state.atkSpeed += 0.08;
      log("공격속도 증가");
    }

    if (type === "crit") {
      if (!spendSoul(costs.crit)) return;
      state.critLv += 1;
      state.critChance = Math.min(0.65, state.critChance + 0.015);
      state.critMul += 0.08;
      log("치명 연구 완료");
    }

    if (type === "skill") {
      if (!spendSoul(costs.skill)) return;
      state.skillLv += 1;
      state.skillMul += 0.2;
      log("스킬 강화 성공");
    }

    if (type === "refine") {
      if (!spendGold(costs.refineGold) || !spendSoul(costs.refineSoul)) return;
      const successRate = Math.max(0.28, 0.8 - state.refineLv * 0.05);
      if (Math.random() < successRate) {
        state.refineLv += 1;
        log(`제련 성공! +${state.refineLv}`);
      } else {
        log("제련 실패 (등급 유지)");
      }
    }

    render();
  }

  function spendGold(amount) {
    if (state.gold < amount) {
      log("Gold 부족");
      return false;
    }
    state.gold -= amount;
    return true;
  }

  function spendSoul(amount) {
    if (state.soul < amount) {
      log("Soul 부족");
      return false;
    }
    state.soul -= amount;
    return true;
  }

  function getCosts() {
    return {
      hero: Math.floor(22 * Math.pow(1.34, state.heroLv - 1)),
      companion: Math.floor(28 * Math.pow(1.36, state.companionLv - 1)),
      speed: Math.floor(60 * Math.pow(1.42, state.atkSpeedLv)),
      crit: Math.floor(12 * Math.pow(1.48, state.critLv)),
      skill: Math.floor(16 * Math.pow(1.52, state.skillLv)),
      refineGold: Math.floor(120 * Math.pow(1.46, state.refineLv)),
      refineSoul: Math.floor(8 * Math.pow(1.36, state.refineLv))
    };
  }

  function getPower() {
    const refineBonus = 1 + state.refineLv * 0.1;
    return (state.heroAtk + state.companionAtk) * refineBonus;
  }

  function getAutoAttackDamage() {
    return getPower();
  }

  function getTapDamage() {
    return getPower() * 1.45;
  }

  function getAtkSpeed() {
    return state.atkSpeed;
  }

  function applyOfflineReward() {
    const now = Date.now();
    const elapsedSec = Math.max(0, Math.floor((now - Number(state.lastSave || now)) / 1000));
    const clamped = Math.min(MAX_OFFLINE_SECONDS, elapsedSec);
    const offlineDps = getPower() * getAtkSpeed() * 0.55;
    const reward = offlineDps * clamped;
    state.gold += reward;
    state.lastSave = now;
    return reward;
  }

  function save(forceStamp) {
    if (forceStamp) {
      state.lastSave = Date.now();
    } else {
      state.lastSave = Date.now();
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return createBaseState();
      const data = JSON.parse(raw);
      return {
        ...createBaseState(),
        ...data
      };
    } catch {
      return createBaseState();
    }
  }

  function render() {
    const costs = getCosts();
    const hpRatio = runtime.enemyMaxHp > 0 ? runtime.enemyHp / runtime.enemyMaxHp : 0;

    el.gold.textContent = fmt(state.gold);
    el.soul.textContent = fmt(state.soul);
    el.stage.textContent = `${state.stage}-${state.wave}`;
    el.power.textContent = fmt(getPower() * getAtkSpeed());

    el.battleStatus.textContent = runtime.statusMsg;
    el.enemyName.textContent = runtime.isBoss ? `[BOSS] ${runtime.enemyName}` : runtime.enemyName;
    el.enemyHpFill.style.width = `${Math.max(0, Math.min(1, hpRatio)) * 100}%`;
    el.enemyHpText.textContent = `${fmt(runtime.enemyHp)} / ${fmt(runtime.enemyMaxHp)}`;
    el.enemySprite.classList.toggle("boss", runtime.isBoss);
    el.enemySprite.textContent = runtime.isBoss ? "😈" : "👹";
    el.heroDps.textContent = `DPS ${fmt(getPower() * getAtkSpeed())}`;

    el.skillBtn.classList.toggle("ready", runtime.skillCd <= 0.05);
    el.skillBtn.disabled = runtime.skillCd > 0.05;
    el.skillInfo.textContent = runtime.skillCd > 0
      ? `스킬 쿨다운 ${runtime.skillCd.toFixed(1)}초`
      : "스킬 준비 완료";

    el.toggleAutoSkill.textContent = `자동 스킬: ${state.autoSkill ? "ON" : "OFF"}`;

    el.costHero.textContent = `${fmt(costs.hero)} G`;
    el.costCompanion.textContent = `${fmt(costs.companion)} G`;
    el.costSpeed.textContent = `${fmt(costs.speed)} G`;
    el.costCrit.textContent = `${fmt(costs.crit)} S`;
    el.costSkill.textContent = `${fmt(costs.skill)} S`;
    el.costRefine.textContent = `${fmt(costs.refineGold)}G + ${fmt(costs.refineSoul)}S`;

    el.upHero.disabled = state.gold < costs.hero;
    el.upCompanion.disabled = state.gold < costs.companion;
    el.upSpeed.disabled = state.gold < costs.speed;
    el.upCrit.disabled = state.soul < costs.crit;
    el.upSkill.disabled = state.soul < costs.skill;
    el.upRefine.disabled = state.gold < costs.refineGold || state.soul < costs.refineSoul;

    el.heroLv.textContent = String(state.heroLv);
    el.companionLv.textContent = String(state.companionLv);
    el.atk.textContent = fmt(getPower());
    el.atkSpeed.textContent = `${getAtkSpeed().toFixed(2)}/s`;
    el.crit.textContent = `${(state.critChance * 100).toFixed(1)}% x ${state.critMul.toFixed(2)}`;
    el.skillMul.textContent = `x${state.skillMul.toFixed(2)}`;
    el.refine.textContent = `+${state.refineLv}`;
    el.kills.textContent = fmt(state.kills);

    el.log.textContent = runtime.lastLog;
  }

  function log(message) {
    runtime.lastLog = `${message} | ${new Date().toLocaleTimeString("ko-KR", { hour12: false })}`;
  }

  function fmt(value) {
    const n = Number(value || 0);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
    return `${Math.floor(n * 100) / 100}`;
  }
})();
