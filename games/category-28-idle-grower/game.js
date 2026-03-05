(() => {
  const SAVE_KEY = "idleGrowerStandaloneV5";
  const ATTACK_TICK = 0.05;
  const MAX_OFFLINE_SECONDS = 60 * 60 * 8;

  const HERO_POOL = [
    { id: "hero_knight", name: "은빛 기사", rarity: 1, baseAtk: 14, baseSpd: 1.0, hp: 190, color: "#9ec4ff", accent: "#dce9ff", weapon: "blade" },
    { id: "hero_assassin", name: "야영 추적자", rarity: 2, baseAtk: 17, baseSpd: 1.13, hp: 175, color: "#72ffd3", accent: "#c8fff0", weapon: "dagger" },
    { id: "hero_mage", name: "별빛 마도사", rarity: 3, baseAtk: 22, baseSpd: 0.95, hp: 168, color: "#9b8dff", accent: "#eee6ff", weapon: "staff" },
    { id: "hero_warlord", name: "붉은 군주", rarity: 4, baseAtk: 30, baseSpd: 1.05, hp: 220, color: "#ff8ea2", accent: "#ffdce3", weapon: "greatsword" },
    { id: "hero_angel", name: "여명 성기사", rarity: 5, baseAtk: 39, baseSpd: 1.15, hp: 250, color: "#ffd98b", accent: "#fff0d2", weapon: "spear" }
  ];

  const PET_POOL = [
    { id: "pet_slime", name: "루미 슬라임", rarity: 1, atkAmp: 0.08, speedAmp: 0.02, crit: 0.01, color: "#74f0ff" },
    { id: "pet_wolf", name: "문페이드 울프", rarity: 2, atkAmp: 0.11, speedAmp: 0.03, crit: 0.02, color: "#9be2ff" },
    { id: "pet_spirit", name: "바람 정령", rarity: 3, atkAmp: 0.15, speedAmp: 0.05, crit: 0.03, color: "#9fffca" },
    { id: "pet_phoenix", name: "피닉스 새끼", rarity: 4, atkAmp: 0.2, speedAmp: 0.06, crit: 0.05, color: "#ffbd86" },
    { id: "pet_dragon", name: "심연 드래곤", rarity: 5, atkAmp: 0.28, speedAmp: 0.09, crit: 0.07, color: "#c5a1ff" }
  ];

  const SKILL_POOL = [
    { id: "skill_slash", name: "월광 연참", rarity: 1, burstMul: 2.4, cd: 8.6, color: "#9dd9ff" },
    { id: "skill_flare", name: "성염 파동", rarity: 2, burstMul: 2.8, cd: 8.1, color: "#ffc98a" },
    { id: "skill_storm", name: "그림자 폭풍", rarity: 3, burstMul: 3.3, cd: 7.6, color: "#b794ff" },
    { id: "skill_blizzard", name: "빙뢰 낙하", rarity: 4, burstMul: 3.8, cd: 7.1, color: "#9cf2ff" },
    { id: "skill_nova", name: "심연 노바", rarity: 5, burstMul: 4.5, cd: 6.6, color: "#ffd0ff" }
  ];

  const BOSS_MODELS = [
    { key: "ogre", name: "절벽 오우거", hue: 22 },
    { key: "lich", name: "망령 군주", hue: 286 },
    { key: "golem", name: "균열 골렘", hue: 198 },
    { key: "wyrm", name: "심연 웜", hue: 330 }
  ];

  const base = {
    gold: 200,
    soul: 40,
    stage: 1,
    wave: 1,
    autoSkill: false,
    kills: 0,
    bossFailCount: 0,
    exp: 0,
    accountLv: 1,
    selectedHero: "hero_knight",
    selectedPet: "pet_slime",
    selectedSkill: "skill_slash",
    heroes: { hero_knight: { copies: 1, level: 1 } },
    pets: { pet_slime: { copies: 1, level: 1 } },
    skills: { skill_slash: { copies: 1, level: 1 } },
    heroHp: 190,
    lastSave: Date.now()
  };

  const state = load();

  const runtime = {
    enemyName: "",
    enemyMaxHp: 0,
    enemyHp: 0,
    enemyAtk: 0,
    enemyAtkInterval: 1.8,
    enemyKind: "mob",
    enemyModel: BOSS_MODELS[0],
    isBoss: false,
    attackTimer: 0,
    enemyAttackTimer: 0,
    skillCd: 0,
    bossTimer: 30,
    statusMsg: "자동 사냥 시작",
    lastLog: "자동 전투 진행중...",
    heroAttackFx: 0,
    enemyAttackFx: 0,
    hitFlash: 0,
    skillFx: 0,
    skillColor: "#b794ff",
    floatTexts: [],
    particles: [],
    projectiles: [],
    enemyShield: 0,
    enemyShieldTimer: 0,
    bossPatternTimer: 0,
    dotTimer: 0,
    dotTickTimer: 0,
    screenShake: 0,
    cameraX: 0,
    cameraY: 0
  };

  const canvas = byId("battle-canvas");
  const ctx = canvas.getContext("2d");

  const el = {
    gold: byId("gold"),
    soul: byId("soul"),
    stage: byId("stage"),
    power: byId("power"),
    battleStatus: byId("battle-status"),
    offlineReward: byId("offline-reward"),
    heroLabel: byId("hero-label"),
    heroHpFill: byId("hero-hp-fill"),
    heroHpText: byId("hero-hp-text"),
    enemyName: byId("enemy-name"),
    enemyHpFill: byId("enemy-hp-fill"),
    enemyHpText: byId("enemy-hp-text"),
    bossTimerBox: byId("boss-timer-box"),
    bossTimerLabel: byId("boss-timer-label"),
    bossTimeFill: byId("boss-time-fill"),
    skillBtn: byId("skill-btn"),
    toggleAutoSkill: byId("toggle-auto-skill"),
    bossChallenge: byId("boss-challenge"),
    skillInfo: byId("skill-info"),
    summonHero: byId("summon-hero"),
    summonPet: byId("summon-pet"),
    summonSkill: byId("summon-skill"),
    enhanceHero: byId("enhance-hero"),
    enhancePet: byId("enhance-pet"),
    enhanceSkill: byId("enhance-skill"),
    costSummonHero: byId("cost-summon-hero"),
    costSummonPet: byId("cost-summon-pet"),
    costSummonSkill: byId("cost-summon-skill"),
    costEnhanceHero: byId("cost-enhance-hero"),
    costEnhancePet: byId("cost-enhance-pet"),
    costEnhanceSkill: byId("cost-enhance-skill"),
    summonLog: byId("summon-log"),
    eqHero: byId("eq-hero"),
    eqPet: byId("eq-pet"),
    eqSkill: byId("eq-skill"),
    crit: byId("crit"),
    atkSpeed: byId("atk-speed"),
    kills: byId("kills"),
    heroCollection: byId("hero-collection"),
    petCollection: byId("pet-collection"),
    skillCollection: byId("skill-collection"),
    saveBtn: byId("save-btn"),
    resetBtn: byId("reset-btn"),
    log: byId("log")
  };

  bindEvents();
  normalizeState();
  spawnEnemy();

  const offlineGold = applyOfflineReward();
  el.offlineReward.textContent = `오프라인 보상: ${fmt(offlineGold)} Gold`;

  setInterval(tick, ATTACK_TICK * 1000);
  setInterval(save, 12000);
  window.addEventListener("beforeunload", save);

  requestAnimationFrame(drawFrame);
  render();

  function byId(id) {
    return document.getElementById(id);
  }

  function createBaseState() {
    return JSON.parse(JSON.stringify({ ...base, lastSave: Date.now() }));
  }

  function normalizeState() {
    if (!state.heroes[state.selectedHero]) state.selectedHero = Object.keys(state.heroes)[0];
    if (!state.pets[state.selectedPet]) state.selectedPet = Object.keys(state.pets)[0];
    if (!state.skills[state.selectedSkill]) state.selectedSkill = Object.keys(state.skills)[0];
    if (!state.heroHp || Number.isNaN(state.heroHp)) state.heroHp = getHeroMaxHp();
    state.heroHp = Math.min(state.heroHp, getHeroMaxHp());
  }

  function bindEvents() {
    el.skillBtn.addEventListener("click", () => castSkill(false));

    el.toggleAutoSkill.addEventListener("click", () => {
      state.autoSkill = !state.autoSkill;
      render();
    });

    el.bossChallenge.addEventListener("click", () => {
      state.wave = 10;
      runtime.statusMsg = `Stage ${state.stage} 보스 도전`;
      log("보스 즉시 도전 시작");
      spawnEnemy();
      render();
    });

    el.summonHero.addEventListener("click", () => summon("hero"));
    el.summonPet.addEventListener("click", () => summon("pet"));
    el.summonSkill.addEventListener("click", () => summon("skill"));

    el.enhanceHero.addEventListener("click", () => enhanceSelected("hero"));
    el.enhancePet.addEventListener("click", () => enhanceSelected("pet"));
    el.enhanceSkill.addEventListener("click", () => enhanceSelected("skill"));

    el.saveBtn.addEventListener("click", () => {
      save();
      log("수동 저장 완료");
      render();
    });

    el.resetBtn.addEventListener("click", () => {
      if (!window.confirm("정말 초기화할까요?")) return;
      localStorage.removeItem(SAVE_KEY);
      Object.assign(state, createBaseState());
      runtime.attackTimer = 0;
      runtime.enemyAttackTimer = 0;
      runtime.skillCd = 0;
      runtime.floatTexts = [];
      runtime.particles = [];
      runtime.projectiles = [];
      spawnEnemy();
      log("초기화 완료");
      save();
      render();
    });

    el.heroCollection.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-equip-hero]");
      if (!btn) return;
      state.selectedHero = btn.getAttribute("data-equip-hero");
      state.heroHp = Math.min(state.heroHp, getHeroMaxHp());
      log(`영웅 변경: ${findById(HERO_POOL, state.selectedHero).name}`);
      render();
    });

    el.petCollection.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-equip-pet]");
      if (!btn) return;
      state.selectedPet = btn.getAttribute("data-equip-pet");
      log(`펫 변경: ${findById(PET_POOL, state.selectedPet).name}`);
      render();
    });

    el.skillCollection.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-equip-skill]");
      if (!btn) return;
      state.selectedSkill = btn.getAttribute("data-equip-skill");
      runtime.skillCd = 0;
      log(`스킬 변경: ${findById(SKILL_POOL, state.selectedSkill).name}`);
      render();
    });
  }

  function tick() {
    const dt = ATTACK_TICK;

    runtime.attackTimer += dt;
    runtime.enemyAttackTimer += dt;
    runtime.skillCd = Math.max(0, runtime.skillCd - dt);
    runtime.heroAttackFx = Math.max(0, runtime.heroAttackFx - dt);
    runtime.enemyAttackFx = Math.max(0, runtime.enemyAttackFx - dt);
    runtime.hitFlash = Math.max(0, runtime.hitFlash - dt * 1.7);
    runtime.skillFx = Math.max(0, runtime.skillFx - dt * 1.3);
    runtime.enemyShieldTimer = Math.max(0, runtime.enemyShieldTimer - dt);
    if (runtime.enemyShieldTimer <= 0) runtime.enemyShield = 0;
    runtime.screenShake = Math.max(0, runtime.screenShake - dt * 1.8);

    const atkInterval = 1 / Math.max(0.35, getAtkSpeed());
    if (runtime.attackTimer >= atkInterval) {
      runtime.attackTimer -= atkInterval;
      runtime.heroAttackFx = 0.2;
      dealDamage(getAutoAttackDamage(), "자동 공격", true);
      emitArcParticles(340, 240, currentHero().accent, 5);
    }

    if (runtime.enemyAttackTimer >= runtime.enemyAtkInterval) {
      runtime.enemyAttackTimer -= runtime.enemyAtkInterval;
      enemyAttack();
    }

    processBossPattern(dt);
    processProjectiles(dt);
    processDot(dt);

    if (runtime.isBoss) {
      runtime.bossTimer = Math.max(0, runtime.bossTimer - dt);
      if (runtime.bossTimer <= 0 && runtime.enemyHp > 0) onBossTimeout();
    }

    if (state.autoSkill && runtime.skillCd <= 0) castSkill(true);

    updateFloatTexts(dt);
    updateParticles(dt);
    updateCameraShake();
    render();
  }

  function processBossPattern(dt) {
    if (!runtime.isBoss || runtime.enemyHp <= 0) return;

    runtime.bossPatternTimer += dt;
    const k = runtime.enemyKind;

    if (k === "ogre" && runtime.bossPatternTimer >= 5.8) {
      runtime.bossPatternTimer = 0;
      runtime.enemyShield = 0;
      heavySmash();
    }

    if (k === "lich" && runtime.bossPatternTimer >= 4.9) {
      runtime.bossPatternTimer = 0;
      spawnLichVolley();
    }

    if (k === "golem" && runtime.bossPatternTimer >= 6.8) {
      runtime.bossPatternTimer = 0;
      runtime.enemyShield = 0.45;
      runtime.enemyShieldTimer = 3.3;
      runtime.statusMsg = "균열 골렘: 암석 장벽";
      log("보스 패턴: 실드 전개");
      emitArcParticles(740, 205, "#9cf2ff", 16);
      shake(0.14);
    }

    if (k === "wyrm" && runtime.bossPatternTimer >= 6.2) {
      runtime.bossPatternTimer = 0;
      runtime.dotTimer = 3.2;
      runtime.dotTickTimer = 0;
      runtime.statusMsg = "심연 웜: 독룡 브레스";
      log("보스 패턴: 브레스 지속 피해");
      emitArcParticles(610, 215, "#ff8ec6", 18);
      shake(0.16);
    }
  }

  function processProjectiles(dt) {
    runtime.projectiles = runtime.projectiles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);

    for (let i = runtime.projectiles.length - 1; i >= 0; i -= 1) {
      const p = runtime.projectiles[i];
      const dx = p.x - 255;
      const dy = p.y - 215;
      if (dx * dx + dy * dy < 32 * 32) {
        runtime.projectiles.splice(i, 1);
        heroTakeDamage(p.damage, "암흑 탄막");
        emitArcParticles(255, 215, "#c49cff", 10);
      }
    }
  }

  function processDot(dt) {
    if (runtime.dotTimer <= 0) return;
    runtime.dotTimer -= dt;
    runtime.dotTickTimer += dt;
    if (runtime.dotTickTimer >= 0.5) {
      runtime.dotTickTimer = 0;
      heroTakeDamage(runtime.enemyAtk * 0.32, "독룡 브레스");
      emitArcParticles(275, 225, "#ff9dc8", 8);
    }
  }

  function heavySmash() {
    runtime.enemyAttackFx = 0.34;
    runtime.statusMsg = "절벽 오우거: 지면 강타";
    log("보스 패턴: 강타");
    heroTakeDamage(runtime.enemyAtk * 1.45, "지면 강타");
    runtime.attackTimer = Math.max(0, runtime.attackTimer - 0.25);
    emitArcParticles(310, 245, "#ffb995", 16);
    shake(0.22);
  }

  function spawnLichVolley() {
    runtime.statusMsg = "망령 군주: 영혼 탄막";
    log("보스 패턴: 3연 영혼탄");
    for (let i = 0; i < 3; i += 1) {
      const angle = (Math.PI * (150 + i * 16)) / 180;
      const speed = 180 + i * 28;
      runtime.projectiles.push({
        x: 760,
        y: 205,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 3,
        color: "#d6a8ff",
        damage: runtime.enemyAtk * 0.54
      });
    }
    emitArcParticles(730, 200, "#d6a8ff", 14);
    shake(0.13);
  }

  function summon(type) {
    const costs = getCosts();

    if (type === "hero") {
      if (state.gold < costs.summonHero) return failResource("Gold 부족");
      state.gold -= costs.summonHero;
      const item = rollUnit(HERO_POOL);
      obtain(state.heroes, item.id);
      if (starOf(state.heroes[item.id].copies) >= starOf(state.heroes[state.selectedHero].copies)) state.selectedHero = item.id;
      el.summonLog.textContent = `영웅 획득: ${rarityText(item.rarity)} ${item.name}`;
      log(`영웅 뽑기: ${item.name}`);
    }

    if (type === "pet") {
      if (state.gold < costs.summonPet) return failResource("Gold 부족");
      state.gold -= costs.summonPet;
      const item = rollUnit(PET_POOL);
      obtain(state.pets, item.id);
      if (starOf(state.pets[item.id].copies) >= starOf(state.pets[state.selectedPet].copies)) state.selectedPet = item.id;
      el.summonLog.textContent = `펫 획득: ${rarityText(item.rarity)} ${item.name}`;
      log(`펫 뽑기: ${item.name}`);
    }

    if (type === "skill") {
      if (state.soul < costs.summonSkill) return failResource("Soul 부족");
      state.soul -= costs.summonSkill;
      const item = rollUnit(SKILL_POOL);
      obtain(state.skills, item.id);
      if (starOf(state.skills[item.id].copies) >= starOf(state.skills[state.selectedSkill].copies)) state.selectedSkill = item.id;
      el.summonLog.textContent = `스킬 획득: ${rarityText(item.rarity)} ${item.name}`;
      log(`스킬 뽑기: ${item.name}`);
    }

    render();
  }

  function enhanceSelected(type) {
    const costs = getCosts();

    if (type === "hero") {
      if (state.gold < costs.enhanceHero) return failResource("Gold 부족");
      state.gold -= costs.enhanceHero;
      state.heroes[state.selectedHero].level += 1;
      log("선택 영웅 강화 성공");
    }

    if (type === "pet") {
      if (state.gold < costs.enhancePet) return failResource("Gold 부족");
      state.gold -= costs.enhancePet;
      state.pets[state.selectedPet].level += 1;
      log("선택 펫 강화 성공");
    }

    if (type === "skill") {
      if (state.soul < costs.enhanceSkill) return failResource("Soul 부족");
      state.soul -= costs.enhanceSkill;
      state.skills[state.selectedSkill].level += 1;
      log("선택 스킬 강화 성공");
    }

    render();
  }

  function failResource(msg) {
    el.summonLog.textContent = msg;
    log(msg);
    return false;
  }

  function obtain(store, id) {
    if (!store[id]) store[id] = { copies: 0, level: 1 };
    store[id].copies += 1;
  }

  function rollUnit(pool) {
    const rarity = rollRarity();
    const candidates = pool.filter((p) => p.rarity === rarity);
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : pool[Math.floor(Math.random() * pool.length)];
  }

  function rollRarity() {
    const r = Math.random();
    if (r < 0.52) return 1;
    if (r < 0.78) return 2;
    if (r < 0.92) return 3;
    if (r < 0.985) return 4;
    return 5;
  }

  function rarityText(rarity) {
    return `${"★".repeat(rarity)}(${rarity}성)`;
  }

  function starOf(copies) {
    if (copies >= 14) return 5;
    if (copies >= 9) return 4;
    if (copies >= 5) return 3;
    if (copies >= 2) return 2;
    return 1;
  }

  function castSkill(isAuto) {
    const skill = currentSkill();
    const info = state.skills[state.selectedSkill];
    if (runtime.skillCd > 0) return;

    const skillLvScale = 1 + (info.level - 1) * 0.06;
    const starScale = 1 + (starOf(info.copies) - 1) * 0.2;
    const cd = Math.max(2.2, skill.cd - info.level * 0.03 - starOf(info.copies) * 0.08);

    runtime.skillCd = cd;
    runtime.heroAttackFx = 0.32;
    runtime.skillFx = 0.6;
    runtime.skillColor = skill.color;

    const burst = getPower() * skill.burstMul * skillLvScale * starScale;
    dealDamage(burst, isAuto ? "자동 스킬" : skill.name, true);
    emitArcParticles(620, 215, skill.color, 24);
    shake(0.12);
  }

  function dealDamage(rawDamage, source, byHero) {
    if (runtime.enemyHp <= 0 || getHeroHp() <= 0) return;

    const crit = Math.random() < getCritChance();
    let damage = rawDamage * (crit ? getCritMul() : 1);

    if (runtime.enemyShield > 0) {
      damage *= 1 - runtime.enemyShield;
      addFloatText("SHIELD", 735, 100, "#a4e8ff");
    }

    runtime.enemyHp = Math.max(0, runtime.enemyHp - damage);
    runtime.statusMsg = crit ? `${source} 치명타` : `${source} 적중`;

    addFloatText(`-${fmt(damage)}`, 760, 125, crit ? "#ffe48f" : "#dcf5ff");
    if (byHero) runtime.hitFlash = 0.2;

    if (runtime.enemyHp <= 0) onEnemyDefeated();
  }

  function enemyAttack() {
    if (runtime.enemyHp <= 0) return;
    runtime.enemyAttackFx = 0.22;

    const dodgeChance = Math.min(0.2, currentPet().speedAmp * 1.3);
    if (Math.random() < dodgeChance) {
      runtime.statusMsg = "회피";
      addFloatText("DODGE", 235, 120, "#96ffd8");
      return;
    }

    heroTakeDamage(runtime.enemyAtk * (0.85 + Math.random() * 0.3), "적의 반격");
  }

  function heroTakeDamage(dmg, label) {
    setHeroHp(getHeroHp() - dmg);
    runtime.statusMsg = label;
    addFloatText(`-${fmt(dmg)}`, 235, 120, "#ffb7b7");
    emitArcParticles(260, 220, "#ffb7b7", 10);
    shake(0.14);
    if (getHeroHp() <= 0) onHeroDefeated();
  }

  function onEnemyDefeated() {
    state.kills += 1;

    const goldGain = runtime.enemyMaxHp * (runtime.isBoss ? 2.8 : 1.05) * (1 + state.stage * 0.03);
    const soulGain = runtime.enemyMaxHp * (runtime.isBoss ? 0.14 : 0.04);

    state.gold += goldGain;
    state.soul += soulGain;
    gainExp(runtime.isBoss ? 15 : 4);

    if (runtime.isBoss) {
      state.stage += 1;
      state.wave = 1;
      runtime.statusMsg = `보스 처치! Stage ${state.stage}`;
      log("보스 토벌 성공: 다음 스테이지 진입");
      emitArcParticles(760, 200, "#ffe59b", 32);
      shake(0.25);
    } else {
      state.wave += 1;
      if (state.wave > 10) state.wave = 10;
      runtime.statusMsg = `Wave ${state.wave}`;
    }

    healHero(0.22);
    spawnEnemy();
  }

  function onBossTimeout() {
    state.bossFailCount += 1;
    state.wave = 9;
    runtime.statusMsg = "보스 제한시간 초과";
    log("보스 제한시간 실패: 스테이지 상승 실패");
    healHero(1);
    emitArcParticles(760, 200, "#ff8ea9", 26);
    shake(0.2);
    spawnEnemy();
  }

  function onHeroDefeated() {
    runtime.statusMsg = "영웅 전투불능";
    log("패배: 파티 재정비 후 재도전");
    state.wave = Math.max(1, state.wave - 1);
    state.heroHp = getHeroMaxHp();
    emitArcParticles(255, 210, "#ffc0c0", 20);
    spawnEnemy();
  }

  function spawnEnemy() {
    runtime.isBoss = state.wave >= 10;
    runtime.enemyShield = 0;
    runtime.enemyShieldTimer = 0;
    runtime.bossPatternTimer = 0;
    runtime.dotTimer = 0;
    runtime.projectiles = [];

    const bossModel = BOSS_MODELS[(state.stage - 1) % BOSS_MODELS.length];
    runtime.enemyModel = bossModel;

    if (runtime.isBoss) {
      runtime.enemyName = bossModel.name;
      runtime.enemyKind = bossModel.key;
      runtime.bossTimer = 30;
    } else {
      const names = ["숲 도적", "황야 늑대", "암흑 사제", "해골 전사", "독성 곤충"];
      const mobNo = (state.wave + state.stage) % names.length;
      runtime.enemyName = `${names[mobNo]} ${state.wave}`;
      runtime.enemyKind = "mob";
      runtime.bossTimer = 0;
    }

    const stagePow = Math.pow(state.stage, 1.48);
    const waveMul = 1 + state.wave * 0.23;
    const bossMul = runtime.isBoss ? 4.6 : 1;

    runtime.enemyMaxHp = Math.max(40, Math.floor((40 + stagePow * 13) * waveMul * bossMul));
    runtime.enemyHp = runtime.enemyMaxHp;

    runtime.enemyAtk = Math.max(4, (3 + stagePow * 1.85) * (runtime.isBoss ? 2.3 : 1));
    runtime.enemyAtkInterval = runtime.isBoss ? 1.35 : 1.85;
  }

  function gainExp(v) {
    state.exp += v;
    const need = 18 + state.accountLv * 6;
    if (state.exp >= need) {
      state.exp -= need;
      state.accountLv += 1;
      log(`계정 레벨 업: Lv.${state.accountLv}`);
    }
  }

  function getCosts() {
    const heroLv = state.heroes[state.selectedHero]?.level || 1;
    const petLv = state.pets[state.selectedPet]?.level || 1;
    const skillLv = state.skills[state.selectedSkill]?.level || 1;

    return {
      summonHero: Math.floor(180 * Math.pow(1.05, state.accountLv - 1)),
      summonPet: Math.floor(220 * Math.pow(1.05, state.accountLv - 1)),
      summonSkill: Math.floor(14 * Math.pow(1.04, state.accountLv - 1)),
      enhanceHero: Math.floor(90 * Math.pow(1.23, heroLv - 1)),
      enhancePet: Math.floor(110 * Math.pow(1.22, petLv - 1)),
      enhanceSkill: Math.floor(9 * Math.pow(1.2, skillLv - 1))
    };
  }

  function currentHero() {
    return findById(HERO_POOL, state.selectedHero);
  }

  function currentPet() {
    return findById(PET_POOL, state.selectedPet);
  }

  function currentSkill() {
    return findById(SKILL_POOL, state.selectedSkill);
  }

  function getPower() {
    const hero = currentHero();
    const pet = currentPet();
    const heroData = state.heroes[state.selectedHero];
    const petData = state.pets[state.selectedPet];

    const heroStar = starOf(heroData.copies);
    const petStar = starOf(petData.copies);

    const heroAtk = hero.baseAtk * (1 + (heroData.level - 1) * 0.15) * (1 + (heroStar - 1) * 0.34);
    const petAtk = heroAtk * (pet.atkAmp + (petData.level - 1) * 0.008 + (petStar - 1) * 0.02);
    const accountBonus = 1 + (state.accountLv - 1) * 0.03;

    return (heroAtk + petAtk) * accountBonus;
  }

  function getAtkSpeed() {
    const hero = currentHero();
    const pet = currentPet();
    const heroData = state.heroes[state.selectedHero];
    const petData = state.pets[state.selectedPet];
    const skillData = state.skills[state.selectedSkill];

    const petStar = starOf(petData.copies);
    const skillStar = starOf(skillData.copies);

    return hero.baseSpd * (1 + pet.speedAmp + (petData.level - 1) * 0.004 + (petStar - 1) * 0.015) * (1 + (skillStar - 1) * 0.01);
  }

  function getCritChance() {
    const pet = currentPet();
    const heroData = state.heroes[state.selectedHero];
    const petData = state.pets[state.selectedPet];
    return Math.min(0.72, 0.05 + pet.crit + (heroData.level - 1) * 0.001 + (petData.level - 1) * 0.0015);
  }

  function getCritMul() {
    const skillData = state.skills[state.selectedSkill];
    const star = starOf(skillData.copies);
    return 1.6 + (skillData.level - 1) * 0.015 + (star - 1) * 0.08;
  }

  function getHeroMaxHp() {
    const hero = currentHero();
    const heroData = state.heroes[state.selectedHero];
    const star = starOf(heroData.copies);
    return hero.hp * (1 + (heroData.level - 1) * 0.08 + (star - 1) * 0.18) * (1 + (state.accountLv - 1) * 0.015);
  }

  function getHeroHp() {
    return Math.max(0, state.heroHp || 0);
  }

  function setHeroHp(v) {
    state.heroHp = Math.max(0, Math.min(getHeroMaxHp(), v));
  }

  function healHero(ratio) {
    setHeroHp(getHeroHp() + getHeroMaxHp() * ratio);
  }

  function getAutoAttackDamage() {
    return getPower();
  }

  function applyOfflineReward() {
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - Number(state.lastSave || now)) / 1000));
    const clamped = Math.min(MAX_OFFLINE_SECONDS, elapsed);
    const reward = getPower() * getAtkSpeed() * 0.52 * clamped;
    state.gold += reward;
    state.lastSave = now;
    state.heroHp = getHeroMaxHp();
    return reward;
  }

  function save() {
    state.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return createBaseState();
      const parsed = JSON.parse(raw);
      return {
        ...createBaseState(),
        ...parsed,
        heroes: { ...createBaseState().heroes, ...(parsed.heroes || {}) },
        pets: { ...createBaseState().pets, ...(parsed.pets || {}) },
        skills: { ...createBaseState().skills, ...(parsed.skills || {}) }
      };
    } catch {
      return createBaseState();
    }
  }

  function emitArcParticles(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 120;
      runtime.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.45 + Math.random() * 0.45,
        size: 1.5 + Math.random() * 2.8,
        color
      });
    }
    if (runtime.particles.length > 240) runtime.particles.splice(0, runtime.particles.length - 240);
  }

  function updateParticles(dt) {
    runtime.particles = runtime.particles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 70 * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);
  }

  function addFloatText(text, x, y, color) {
    runtime.floatTexts.push({ text, x, y, vy: 26, life: 0.9, color });
    if (runtime.floatTexts.length > 24) runtime.floatTexts.shift();
  }

  function updateFloatTexts(dt) {
    runtime.floatTexts = runtime.floatTexts
      .map((f) => ({ ...f, y: f.y - f.vy * dt, life: f.life - dt }))
      .filter((f) => f.life > 0);
  }

  function shake(amount) {
    runtime.screenShake = Math.max(runtime.screenShake, amount);
  }

  function updateCameraShake() {
    if (runtime.screenShake <= 0) {
      runtime.cameraX = 0;
      runtime.cameraY = 0;
      return;
    }
    const amp = 8 * runtime.screenShake;
    runtime.cameraX = (Math.random() - 0.5) * amp;
    runtime.cameraY = (Math.random() - 0.5) * amp;
  }

  function drawFrame(ts) {
    drawScene(ts / 1000);
    requestAnimationFrame(drawFrame);
  }

  function drawScene(t) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(runtime.cameraX, runtime.cameraY);

    drawBackground(t, w, h);

    const hero = currentHero();
    const pet = currentPet();

    const heroX = 250 + (runtime.heroAttackFx > 0 ? 42 * (runtime.heroAttackFx / 0.2) : 0);
    const heroY = h - 120 + Math.sin(t * 5.8) * 2;
    const petX = 190 + Math.cos(t * 2.4) * 8;
    const petY = h - 180 + Math.sin(t * 3.8) * 6;

    const enemyX = 770 - (runtime.enemyAttackFx > 0 ? 28 * (runtime.enemyAttackFx / 0.22) : 0);
    const enemyY = h - 118 + Math.sin(t * 4.4 + 0.7) * 2;

    drawHero(heroX, heroY, hero, runtime.heroAttackFx > 0);
    drawPet(petX, petY, pet);
    drawEnemy(enemyX, enemyY, runtime.enemyModel, runtime.enemyAttackFx > 0, runtime.isBoss, runtime.enemyShield > 0);

    if (runtime.heroAttackFx > 0) drawSlash(heroX + 66, heroY - 38, hero.accent);
    if (runtime.enemyAttackFx > 0) drawSlash(enemyX - 56, enemyY - 36, "#ffb9cf");

    if (runtime.skillFx > 0) drawSkillEffect(w, h, runtime.skillColor, runtime.skillFx);

    drawProjectiles();
    drawParticles();
    drawFloatTexts();

    if (runtime.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 242, 196, ${runtime.hitFlash * 0.23})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function drawBackground(t, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2b4f83");
    sky.addColorStop(1, "#131d35");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 20; i += 1) {
      const x = (i * 70 + t * 14) % (w + 40) - 20;
      const y = 36 + Math.sin((i + t) * 0.8) * 7;
      ctx.fillStyle = "rgba(198, 230, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 7; i += 1) {
      const x = ((i * 180) + t * 6) % (w + 220) - 220;
      ctx.fillStyle = "rgba(151, 190, 242, 0.24)";
      ctx.beginPath();
      ctx.moveTo(x, h - 100);
      ctx.lineTo(x + 95, h - 240);
      ctx.lineTo(x + 190, h - 100);
      ctx.closePath();
      ctx.fill();
    }

    const ground = ctx.createLinearGradient(0, h - 110, 0, h);
    ground.addColorStop(0, "#1f4f46");
    ground.addColorStop(1, "#0f2f2b");
    ctx.fillStyle = ground;
    ctx.fillRect(0, h - 110, w, 110);
  }

  function drawHero(x, y, hero, attacking) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = hero.accent;
    ctx.beginPath();
    ctx.arc(0, -56, 16, 0, Math.PI * 2);
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(-20, -36, 20, 12);
    bodyGrad.addColorStop(0, hero.color);
    bodyGrad.addColorStop(1, shadeColor(hero.color, -30));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -36);
    ctx.lineTo(16, -36);
    ctx.lineTo(22, 12);
    ctx.lineTo(-22, 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(14, 25, 47, 0.45)";
    ctx.fillRect(-17, -10, 34, 20);

    ctx.strokeStyle = hero.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (hero.weapon === "staff") {
      ctx.moveTo(11, -26);
      ctx.lineTo(attacking ? 58 : 42, attacking ? -84 : -62);
    } else if (hero.weapon === "spear") {
      ctx.moveTo(7, -20);
      ctx.lineTo(attacking ? 82 : 56, attacking ? -48 : -33);
    } else if (hero.weapon === "greatsword") {
      ctx.moveTo(8, -20);
      ctx.lineTo(attacking ? 65 : 40, attacking ? -66 : -42);
    } else {
      ctx.moveTo(8, -22);
      ctx.lineTo(attacking ? 52 : 33, attacking ? -60 : -37);
    }
    ctx.stroke();

    ctx.strokeStyle = "#243c60";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 11);
    ctx.lineTo(-18, 42);
    ctx.moveTo(10, 11);
    ctx.lineTo(18, 42);
    ctx.stroke();

    ctx.restore();
  }

  function drawPet(x, y, pet) {
    ctx.save();
    ctx.translate(x, y);

    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 28);
    glow.addColorStop(0, hexToRgba(pet.color, 0.95));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pet.color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-3, -2, 1.3, 0, Math.PI * 2);
    ctx.arc(3, -2, 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(x, y, bossModel, attacking, isBoss, shieldOn) {
    ctx.save();
    ctx.translate(x, y);

    if (!isBoss) {
      ctx.fillStyle = "#b58c6f";
      ctx.beginPath();
      ctx.arc(0, -54, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#5c3a32";
      ctx.fillRect(-17, -34, 34, 46);
      ctx.fillStyle = "#ffd2b4";
      ctx.fillRect(-8, -60, 16, 8);
    } else {
      const hue = bossModel.hue;
      ctx.fillStyle = `hsl(${hue} 58% 56%)`;
      ctx.beginPath();
      ctx.arc(0, -58, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsl(${hue} 54% 30%)`;
      ctx.fillRect(-28, -33, 56, 62);

      if (bossModel.key === "ogre") {
        ctx.fillStyle = `hsl(${hue} 70% 70%)`;
        ctx.fillRect(-24, -72, 8, 16);
        ctx.fillRect(16, -72, 8, 16);
      }
      if (bossModel.key === "lich") {
        ctx.fillStyle = "#cba6ff";
        ctx.beginPath();
        ctx.arc(0, -72, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (bossModel.key === "golem") {
        ctx.strokeStyle = "#98e7ff";
        ctx.lineWidth = 3;
        ctx.strokeRect(-24, -28, 48, 52);
      }
      if (bossModel.key === "wyrm") {
        ctx.fillStyle = "#ffb0dc";
        ctx.beginPath();
        ctx.moveTo(0, -38);
        ctx.lineTo(18, -8);
        ctx.lineTo(0, 10);
        ctx.lineTo(-18, -8);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (shieldOn) {
      ctx.strokeStyle = "rgba(143, 229, 255, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -24, 54, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = isBoss ? "#ffd6e8" : "#ffd0bf";
    ctx.lineWidth = isBoss ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(attacking ? -54 : -28, attacking ? -48 : -28);
    ctx.stroke();

    ctx.strokeStyle = isBoss ? "#4c2438" : "#41242d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 26);
    ctx.lineTo(-20, 54);
    ctx.moveTo(10, 26);
    ctx.lineTo(20, 54);
    ctx.stroke();

    ctx.restore();
  }

  function drawSlash(x, y, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 25, Math.PI * 0.12, Math.PI * 0.92);
    ctx.stroke();
    ctx.restore();
  }

  function drawSkillEffect(w, h, color, power) {
    ctx.save();
    ctx.fillStyle = hexToRgba(color, Math.min(0.22, power * 0.3));
    ctx.beginPath();
    ctx.arc(w * 0.73, h * 0.44, 180 * power, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(w * 0.73, h * 0.44, (110 + i * 38) * power, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProjectiles() {
    runtime.projectiles.forEach((p) => {
      ctx.save();
      ctx.fillStyle = hexToRgba(p.color, 0.95);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawParticles() {
    runtime.particles.forEach((p) => {
      ctx.save();
      ctx.fillStyle = hexToRgba(p.color, Math.max(0, Math.min(1, p.life)));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawFloatTexts() {
    runtime.floatTexts.forEach((f) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.9));
      ctx.fillStyle = f.color;
      ctx.font = "bold 20px 'JetBrains Mono'";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function render() {
    const costs = getCosts();
    const hero = currentHero();
    const pet = currentPet();
    const skill = currentSkill();

    const heroData = state.heroes[state.selectedHero];
    const petData = state.pets[state.selectedPet];
    const skillData = state.skills[state.selectedSkill];

    const heroHp = getHeroHp();
    const heroMaxHp = getHeroMaxHp();
    const hpRatio = runtime.enemyMaxHp > 0 ? runtime.enemyHp / runtime.enemyMaxHp : 0;

    el.gold.textContent = fmt(state.gold);
    el.soul.textContent = fmt(state.soul);
    el.stage.textContent = `${state.stage}-${state.wave}`;
    el.power.textContent = fmt(getPower() * getAtkSpeed());

    el.battleStatus.textContent = runtime.statusMsg;
    el.heroLabel.textContent = `${hero.name} HP`;
    el.enemyName.textContent = runtime.isBoss ? `[BOSS] ${runtime.enemyName}` : runtime.enemyName;

    el.heroHpFill.style.width = `${(heroHp / heroMaxHp) * 100}%`;
    el.heroHpText.textContent = `${fmt(heroHp)} / ${fmt(heroMaxHp)}`;

    el.enemyHpFill.style.width = `${Math.max(0, Math.min(1, hpRatio)) * 100}%`;
    el.enemyHpText.textContent = `${fmt(runtime.enemyHp)} / ${fmt(runtime.enemyMaxHp)}`;

    el.bossTimerBox.hidden = !runtime.isBoss;
    if (runtime.isBoss) {
      const ratio = Math.max(0, runtime.bossTimer / 30);
      el.bossTimeFill.style.width = `${ratio * 100}%`;
      el.bossTimerLabel.textContent = `보스 제한시간 ${runtime.bossTimer.toFixed(1)}초`;
    }

    el.skillBtn.classList.toggle("ready", runtime.skillCd <= 0.05);
    el.skillBtn.disabled = runtime.skillCd > 0.05;
    el.skillInfo.textContent = runtime.skillCd > 0 ? `스킬 쿨다운 ${runtime.skillCd.toFixed(1)}초` : `${skill.name} 준비 완료`;
    el.toggleAutoSkill.textContent = `자동 스킬: ${state.autoSkill ? "ON" : "OFF"}`;

    el.costSummonHero.textContent = `${fmt(costs.summonHero)} G`;
    el.costSummonPet.textContent = `${fmt(costs.summonPet)} G`;
    el.costSummonSkill.textContent = `${fmt(costs.summonSkill)} S`;
    el.costEnhanceHero.textContent = `${fmt(costs.enhanceHero)} G`;
    el.costEnhancePet.textContent = `${fmt(costs.enhancePet)} G`;
    el.costEnhanceSkill.textContent = `${fmt(costs.enhanceSkill)} S`;

    el.summonHero.disabled = state.gold < costs.summonHero;
    el.summonPet.disabled = state.gold < costs.summonPet;
    el.summonSkill.disabled = state.soul < costs.summonSkill;
    el.enhanceHero.disabled = state.gold < costs.enhanceHero;
    el.enhancePet.disabled = state.gold < costs.enhancePet;
    el.enhanceSkill.disabled = state.soul < costs.enhanceSkill;

    el.eqHero.textContent = `${hero.name} ${starString(starOf(heroData.copies))} Lv.${heroData.level}`;
    el.eqPet.textContent = `${pet.name} ${starString(starOf(petData.copies))} Lv.${petData.level}`;
    el.eqSkill.textContent = `${skill.name} ${starString(starOf(skillData.copies))} Lv.${skillData.level}`;

    el.crit.textContent = `${(getCritChance() * 100).toFixed(1)}% x ${getCritMul().toFixed(2)}`;
    el.atkSpeed.textContent = `${getAtkSpeed().toFixed(2)}/s`;
    el.kills.textContent = fmt(state.kills);

    el.heroCollection.innerHTML = renderCollection(HERO_POOL, state.heroes, state.selectedHero, "hero");
    el.petCollection.innerHTML = renderCollection(PET_POOL, state.pets, state.selectedPet, "pet");
    el.skillCollection.innerHTML = renderCollection(SKILL_POOL, state.skills, state.selectedSkill, "skill");

    el.log.textContent = runtime.lastLog;
  }

  function renderCollection(pool, store, selectedId, type) {
    const rows = pool
      .filter((item) => store[item.id])
      .sort((a, b) => b.rarity - a.rarity)
      .map((item) => {
        const data = store[item.id];
        const star = starOf(data.copies);
        const active = item.id === selectedId ? "active" : "";
        const attr = type === "hero" ? "data-equip-hero" : type === "pet" ? "data-equip-pet" : "data-equip-skill";
        return `
          <article class="collection-item ${active}">
            <div class="row"><strong>${item.name}</strong><span>${starString(star)}</span></div>
            <p>보유 ${data.copies} | 레벨 ${data.level}</p>
            <button type="button" ${attr}="${item.id}">장착</button>
          </article>
        `;
      });

    if (!rows.length) return '<article class="collection-item"><p>아직 없음</p></article>';
    return rows.join("");
  }

  function starString(star) {
    return "★".repeat(star) + "☆".repeat(Math.max(0, 5 - star));
  }

  function findById(pool, id) {
    return pool.find((x) => x.id === id) || pool[0];
  }

  function shadeColor(hex, percent) {
    const n = hex.replace("#", "");
    const r = parseInt(n.substring(0, 2), 16);
    const g = parseInt(n.substring(2, 4), 16);
    const b = parseInt(n.substring(4, 6), 16);
    const p = percent / 100;
    const nr = Math.max(0, Math.min(255, Math.round(r + (p >= 0 ? (255 - r) * p : r * p))));
    const ng = Math.max(0, Math.min(255, Math.round(g + (p >= 0 ? (255 - g) * p : g * p))));
    const nb = Math.max(0, Math.min(255, Math.round(b + (p >= 0 ? (255 - b) * p : b * p))));
    return `rgb(${nr}, ${ng}, ${nb})`;
  }

  function hexToRgba(hex, alpha) {
    const raw = String(hex || "#ffffff").replace("#", "");
    const safe = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "f");
    const r = parseInt(safe.slice(0, 2), 16);
    const g = parseInt(safe.slice(2, 4), 16);
    const b = parseInt(safe.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
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
