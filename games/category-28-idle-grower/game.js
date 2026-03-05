(() => {
  const SAVE_KEY = "idleGrowerStandaloneV6";
  const TICK = 0.05;
  const MAX_OFFLINE_SECONDS = 60 * 60 * 8;
  const SLOT_COUNT = 4;

  const RARITIES = [
    { key: "common", name: "커먼", color: "#d3def0", mult: 1.0 },
    { key: "rare", name: "레어", color: "#6ac0ff", mult: 1.22 },
    { key: "epic", name: "에픽", color: "#b087ff", mult: 1.58 },
    { key: "unique", name: "유니크", color: "#ffb661", mult: 2.1 },
    { key: "legend", name: "레전드", color: "#ff7fa4", mult: 2.85 },
    { key: "myth", name: "신화", color: "#ffef8a", mult: 3.75 }
  ];

  const HERO_TEMPLATES = [
    { rarity: "common", baseAtk: 15, baseSpd: 0.94, baseHp: 230, color: "#9ec4ff", accent: "#e4efff", weapon: "blade" },
    { rarity: "rare", baseAtk: 18, baseSpd: 1.06, baseHp: 214, color: "#78ffe5", accent: "#d7fff5", weapon: "dagger" },
    { rarity: "epic", baseAtk: 24, baseSpd: 0.92, baseHp: 205, color: "#9f91ff", accent: "#f0ebff", weapon: "staff" },
    { rarity: "unique", baseAtk: 31, baseSpd: 1.0, baseHp: 252, color: "#ff95a8", accent: "#ffe0e7", weapon: "greatsword" },
    { rarity: "legend", baseAtk: 40, baseSpd: 1.08, baseHp: 290, color: "#ffd98b", accent: "#fff2d2", weapon: "spear" },
    { rarity: "myth", baseAtk: 58, baseSpd: 1.15, baseHp: 340, color: "#fff2a4", accent: "#ffffff", weapon: "halberd" }
  ];
  const PET_TEMPLATES = [
    { rarity: "common", atkAmp: 0.07, spdAmp: 0.02, critAmp: 0.01, color: "#75f2ff" },
    { rarity: "rare", atkAmp: 0.1, spdAmp: 0.03, critAmp: 0.015, color: "#9be5ff" },
    { rarity: "epic", atkAmp: 0.14, spdAmp: 0.045, critAmp: 0.022, color: "#9fffcf" },
    { rarity: "unique", atkAmp: 0.19, spdAmp: 0.058, critAmp: 0.033, color: "#ffbe8a" },
    { rarity: "legend", atkAmp: 0.26, spdAmp: 0.076, critAmp: 0.052, color: "#c5a1ff" },
    { rarity: "myth", atkAmp: 0.36, spdAmp: 0.096, critAmp: 0.07, color: "#fff2a7" }
  ];
  const SKILL_TEMPLATES = [
    { rarity: "common", burst: 2.2, cooldown: 10.2, color: "#9edbff" },
    { rarity: "rare", burst: 2.6, cooldown: 9.7, color: "#ffcb96" },
    { rarity: "epic", burst: 3.05, cooldown: 9.1, color: "#b990ff" },
    { rarity: "unique", burst: 3.55, cooldown: 8.6, color: "#a4ecff" },
    { rarity: "legend", burst: 4.25, cooldown: 8.0, color: "#ffc2f2" },
    { rarity: "myth", burst: 5.2, cooldown: 7.4, color: "#fff2a9" }
  ];

  const HERO_NAMES = [
    "실버 나이트", "윈드 레인저", "아스트라 메이지", "블러드 워로드", "황혼 팔라딘", "천공 집행관",
    "유성 창기사", "흑월 암살자", "폭풍 검사", "유리 방패병", "심연 주문사", "백야 수호자",
    "서릿발 사수", "붉은 창도사", "신념의 수도사", "고독한 추격자", "광휘 집행자", "룬 해방자",
    "청룡 기수", "황금 심판관", "빙하 전투마법사", "그림자 파멸자", "강철 수호기사", "천뢰 전쟁군주"
  ];
  const PET_NAMES = [
    "루미 슬라임", "문 울프", "스카이 스피릿", "레드 피닉스", "아비셜 드래곤", "세라프 큐브",
    "네온 캣", "서리 여우", "바람 까마귀", "암영 팬더", "태양 거북", "기계 펭귄",
    "화염 도마뱀", "성운 토끼", "유령 올빼미", "번개 다람쥐", "블루 하운드", "카오스 벌",
    "보석 골렘", "나이트 베어", "천공 박쥐", "마나 폭스", "루나 리자드", "디바인 사슴"
  ];
  const SKILL_NAMES = [
    "월광 연참", "화염 파동", "그림자 폭풍", "빙뢰 낙하", "심연 노바", "천벌 제네시스",
    "유성 폭락", "룬 폭발", "혼돈 참격", "광휘 포화", "바람 포식", "서리 절단",
    "지옥 섬광", "환영 난무", "청천 낙뢰", "무한 창격", "사신의 낫", "결계 붕괴",
    "별빛 심판", "태초 충격", "성역 방출", "영혼 파쇄", "혈월 추적", "신격 강림"
  ];

  const HERO_POOL = buildPool("h", HERO_NAMES, HERO_TEMPLATES, (idx, name, t) => ({
    id: `h_${idx + 1}`,
    name,
    rarity: t.rarity,
    baseAtk: Math.round(t.baseAtk * (1 + Math.floor(idx / 6) * 0.045)),
    baseSpd: Number((t.baseSpd * (1 + Math.floor(idx / 6) * 0.01)).toFixed(2)),
    baseHp: Math.round(t.baseHp * (1 + Math.floor(idx / 6) * 0.05)),
    color: t.color,
    accent: t.accent,
    weapon: t.weapon
  }));
  const PET_POOL = buildPool("p", PET_NAMES, PET_TEMPLATES, (idx, name, t) => ({
    id: `p_${idx + 1}`,
    name,
    rarity: t.rarity,
    atkAmp: Number((t.atkAmp * (1 + Math.floor(idx / 6) * 0.05)).toFixed(3)),
    spdAmp: Number((t.spdAmp * (1 + Math.floor(idx / 6) * 0.05)).toFixed(3)),
    critAmp: Number((t.critAmp * (1 + Math.floor(idx / 6) * 0.05)).toFixed(3)),
    color: t.color
  }));
  const SKILL_POOL = buildPool("s", SKILL_NAMES, SKILL_TEMPLATES, (idx, name, t) => ({
    id: `s_${idx + 1}`,
    name,
    rarity: t.rarity,
    burst: Number((t.burst * (1 + Math.floor(idx / 6) * 0.06)).toFixed(2)),
    cooldown: Number((t.cooldown * (1 - Math.min(0.12, Math.floor(idx / 6) * 0.03))).toFixed(2)),
    color: t.color
  }));

  const BOSS_MODELS = [
    { key: "ogre", name: "절벽 오우거", hue: 22 },
    { key: "lich", name: "망령 군주", hue: 286 },
    { key: "golem", name: "균열 골렘", hue: 198 },
    { key: "wyrm", name: "심연 웜", hue: 330 }
  ];

  const BASE_STATE = {
    gold: 35000,
    stage: 1,
    bestStage: 1,
    wave: 1,
    farmStage: null,
    autoSkill: true,
    kills: 0,
    bossFailCount: 0,
    exp: 0,
    accountLv: 1,
    inventories: {
      heroes: { h_1: { level: 1, star: 1, shards: 0, total: 1 } },
      pets: { p_1: { level: 1, star: 1, shards: 0, total: 1 } },
      skills: { s_1: { level: 1, star: 1, shards: 0, total: 1 } }
    },
    equipped: {
      heroes: ["h_1", null, null, null],
      pets: ["p_1", null, null, null],
      skills: ["s_1", null, null, null]
    },
    selectedSlots: { heroes: 0, pets: 0, skills: 0 },
    summon: {
      heroes: { level: 1, draws: 0 },
      pets: { level: 1, draws: 0 },
      skills: { level: 1, draws: 0 }
    },
    heroHp: 280,
    lastSave: Date.now()
  };

  const state = load();

  const runtime = {
    enemyName: "",
    enemyMaxHp: 0,
    enemyHp: 0,
    enemyAtk: 0,
    enemyAtkInterval: 1.7,
    enemyModel: BOSS_MODELS[0],
    enemyKind: "mob",
    isBoss: false,
    attackTimer: 0,
    enemyAttackTimer: 0,
    skillCooldowns: [0, 0, 0, 0],
    bossTimer: 30,
    statusMsg: "전투 시작",
    lastLog: "자동 전투 진행중...",
    heroAttackFx: 0,
    enemyAttackFx: 0,
    skillFx: 0,
    skillColor: "#b990ff",
    hitFlash: 0,
    particles: [],
    projectiles: [],
    floatTexts: [],
    enemyShield: 0,
    enemyShieldTimer: 0,
    patternTimer: 0,
    dotTimer: 0,
    dotTick: 0,
    screenShake: 0,
    camX: 0,
    camY: 0,
    summonResultRows: [],
    rankEmitTimer: 0
  };

  const canvas = document.getElementById("battle-canvas");
  const ctx = canvas.getContext("2d");

  const el = {
    gold: document.getElementById("gold"),
    stage: document.getElementById("stage"),
    power: document.getElementById("power"),
    summonLevels: document.getElementById("summon-levels"),
    battleStatus: document.getElementById("battle-status"),
    offlineReward: document.getElementById("offline-reward"),
    heroLabel: document.getElementById("hero-label"),
    heroHpFill: document.getElementById("hero-hp-fill"),
    heroHpText: document.getElementById("hero-hp-text"),
    enemyName: document.getElementById("enemy-name"),
    enemyHpFill: document.getElementById("enemy-hp-fill"),
    enemyHpText: document.getElementById("enemy-hp-text"),
    bossTimerBox: document.getElementById("boss-timer-box"),
    bossTimerLabel: document.getElementById("boss-timer-label"),
    bossTimeFill: document.getElementById("boss-time-fill"),
    skillSlotList: document.getElementById("skill-slot-list"),
    toggleAutoSkill: document.getElementById("toggle-auto-skill"),
    bossChallenge: document.getElementById("boss-challenge"),
    farmStageInput: document.getElementById("farm-stage-input"),
    setFarmStageBtn: document.getElementById("set-farm-stage"),
    clearFarmStageBtn: document.getElementById("clear-farm-stage"),
    farmModeText: document.getElementById("farm-mode-text"),
    saveBtn: document.getElementById("save-btn"),
    resetBtn: document.getElementById("reset-btn"),
    summonHero1: document.getElementById("summon-hero-1"),
    summonHero10: document.getElementById("summon-hero-10"),
    summonPet1: document.getElementById("summon-pet-1"),
    summonPet10: document.getElementById("summon-pet-10"),
    summonSkill1: document.getElementById("summon-skill-1"),
    summonSkill10: document.getElementById("summon-skill-10"),
    costHero1: document.getElementById("cost-hero-1"),
    costHero10: document.getElementById("cost-hero-10"),
    costPet1: document.getElementById("cost-pet-1"),
    costPet10: document.getElementById("cost-pet-10"),
    costSkill1: document.getElementById("cost-skill-1"),
    costSkill10: document.getElementById("cost-skill-10"),
    summonLog: document.getElementById("summon-log"),
    summonResults: document.getElementById("summon-results"),
    heroSlots: document.getElementById("hero-slots"),
    petSlots: document.getElementById("pet-slots"),
    skillSlots: document.getElementById("skill-slots"),
    heroCollection: document.getElementById("hero-collection"),
    petCollection: document.getElementById("pet-collection"),
    skillCollection: document.getElementById("skill-collection"),
    statList: document.getElementById("stat-list"),
    log: document.getElementById("log")
  };

  bindEvents();
  normalizeState();
  spawnEnemy();

  const offline = applyOfflineReward();
  el.offlineReward.textContent = `오프라인 보상: ${fmt(offline)} Gold`;

  setInterval(tick, TICK * 1000);
  setInterval(save, 12000);
  window.addEventListener("beforeunload", save);

  requestAnimationFrame(drawFrame);
  render();
  emitStageProgress(true);

  function bindEvents() {
    el.toggleAutoSkill.addEventListener("click", () => {
      state.autoSkill = !state.autoSkill;
      render();
    });

    el.bossChallenge.addEventListener("click", () => {
      state.wave = 10;
      runtime.statusMsg = `Stage ${state.stage} 보스 도전`;
      log("보스 즉시 도전 시작");
      recoverForNextRound();
      spawnEnemy();
      emitStageProgress(true);
      render();
    });

    el.setFarmStageBtn.addEventListener("click", () => {
      const picked = Math.floor(Number(el.farmStageInput.value || 0));
      if (picked < 1) {
        log("사냥터 스테이지는 1 이상만 가능합니다");
        return;
      }
      const maxStage = Math.max(1, Number(state.bestStage || state.stage || 1));
      if (picked > maxStage) {
        log(`최대 ${maxStage} 스테이지까지만 고정 가능합니다`);
        return;
      }
      state.farmStage = picked;
      state.stage = picked;
      state.wave = 1;
      recoverForNextRound();
      spawnEnemy();
      log(`사냥터 고정: Stage ${picked}`);
      emitStageProgress(true);
      render();
    });

    el.clearFarmStageBtn.addEventListener("click", () => {
      state.farmStage = null;
      log("사냥터 고정 해제: 진행 모드");
      emitStageProgress(true);
      render();
    });

    el.saveBtn.addEventListener("click", () => {
      save();
      log("수동 저장 완료");
      render();
    });

    el.resetBtn.addEventListener("click", () => {
      if (!window.confirm("정말 초기화할까요?")) return;
      localStorage.removeItem(SAVE_KEY);
      Object.assign(state, cloneBase());
      resetRuntime();
      spawnEnemy();
      save();
      render();
    });

    el.summonHero1.addEventListener("click", () => summon("heroes", 1));
    el.summonHero10.addEventListener("click", () => summon("heroes", 10));
    el.summonPet1.addEventListener("click", () => summon("pets", 1));
    el.summonPet10.addEventListener("click", () => summon("pets", 10));
    el.summonSkill1.addEventListener("click", () => summon("skills", 1));
    el.summonSkill10.addEventListener("click", () => summon("skills", 10));

  }

  function equipToSelectedSlot(type, id) {
    const arr = state.equipped[type];
    const slot = state.selectedSlots[type] || 0;
    const prevIdx = arr.indexOf(id);
    if (prevIdx >= 0) {
      const t = arr[slot];
      arr[slot] = id;
      arr[prevIdx] = t;
      return;
    }
    arr[slot] = id;
  }

  function tick() {
    const dt = TICK;

    runtime.attackTimer += dt;
    runtime.enemyAttackTimer += dt;
    runtime.heroAttackFx = Math.max(0, runtime.heroAttackFx - dt);
    runtime.enemyAttackFx = Math.max(0, runtime.enemyAttackFx - dt);
    runtime.skillFx = Math.max(0, runtime.skillFx - dt * 1.4);
    runtime.hitFlash = Math.max(0, runtime.hitFlash - dt * 1.7);
    runtime.enemyShieldTimer = Math.max(0, runtime.enemyShieldTimer - dt);
    runtime.screenShake = Math.max(0, runtime.screenShake - dt * 1.9);

    if (runtime.enemyShieldTimer <= 0) runtime.enemyShield = 0;

    runtime.skillCooldowns = runtime.skillCooldowns.map((v) => Math.max(0, v - dt));

    const atkInterval = 1 / Math.max(0.3, getAttackSpeed());
    if (runtime.attackTimer >= atkInterval) {
      runtime.attackTimer -= atkInterval;
      runtime.heroAttackFx = 0.2;
      dealDamage(getAutoAttackDamage(), "파티 공격", true);
      burstParticles(370, 250, currentHeroAccent(), 8);
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

    if (state.autoSkill) {
      for (let i = 0; i < SLOT_COUNT; i += 1) {
        const skillId = state.equipped.skills[i];
        if (!skillId) continue;
        if (runtime.skillCooldowns[i] <= 0) castSkill(i);
      }
    }

    updateParticles(dt);
    updateFloatTexts(dt);
    updateCameraShake();
    runtime.rankEmitTimer += dt;
    if (runtime.rankEmitTimer >= 1) {
      runtime.rankEmitTimer = 0;
      emitStageProgress(false);
    }

    render();
  }

  function castSkill(slotIndex) {
    const skillId = state.equipped.skills[slotIndex];
    if (!skillId) return;
    if (runtime.skillCooldowns[slotIndex] > 0) return;

    const skill = findById(SKILL_POOL, skillId);
    const inv = state.inventories.skills[skillId];
    if (!inv) return;

    const rarityMult = rarityByKey(skill.rarity).mult;
    const burst = getTeamPower() * skill.burst * rarityMult * (1 + (inv.level - 1) * 0.08) * (1 + (inv.star - 1) * 0.16);
    const cd = Math.max(2.4, skill.cooldown - inv.level * 0.05 - inv.star * 0.04);

    runtime.skillCooldowns[slotIndex] = cd;
    runtime.skillFx = 0.58;
    runtime.skillColor = rarityByKey(skill.rarity).color;
    runtime.heroAttackFx = 0.26;

    dealDamage(burst, `${slotIndex + 1}번 ${skill.name}`, true);
    burstParticles(705, 205, runtime.skillColor, 22);
    shake(0.12);
  }

  function summon(type, count) {
    const costs = getSummonCosts(type);
    const price = count === 10 ? costs.ten : costs.one;

    if (state.gold < price) {
      el.summonLog.textContent = "Gold 부족";
      log("Gold 부족");
      return;
    }

    state.gold -= price;

    const pool = getPool(type);
    const rows = [];

    for (let i = 0; i < count; i += 1) {
      const rarityKey = rollRarityByLevel(state.summon[type].level);
      let candidates = pool.filter((p) => p.rarity === rarityKey);
      if (!candidates.length) {
        candidates = pool.filter((p) => p.rarity === "legend");
      }
      if (!candidates.length) {
        candidates = pool;
      }

      const item = candidates[Math.floor(Math.random() * candidates.length)];
      const result = obtainItem(type, item.id);
      rows.push({ item, result });
    }

    state.summon[type].draws += count;
    state.summon[type].level = calcSummonLevel(state.summon[type].draws);

    autoFillEmptySlots(type, rows.map((r) => r.item.id));

    runtime.summonResultRows = rows.map((r) => ({
      name: r.item.name,
      rarity: r.item.rarity,
      text: `${rarityByKey(r.item.rarity).name} ${r.item.name} ${r.result.promoted ? `-> ${r.result.star}성` : ""}`
    }));

    el.summonLog.textContent = `${categoryName(type)} ${count}회 뽑기 완료`;
    log(`${categoryName(type)} ${count}회 뽑기`);
    render();
  }

  function obtainItem(type, id) {
    const inv = state.inventories[type];
    if (!inv[id]) {
      inv[id] = { level: 1, star: 1, shards: 0, total: 1 };
      return { promoted: false, star: 1 };
    }

    inv[id].total += 1;
    inv[id].shards += 1;

    let promoted = false;
    while (inv[id].star < 10) {
      const need = inv[id].star + 1;
      if (inv[id].shards < need) break;
      inv[id].shards -= need;
      inv[id].star += 1;
      promoted = true;
    }

    return { promoted, star: inv[id].star };
  }

  function autoFillEmptySlots(type, ids) {
    const slots = state.equipped[type];
    ids.forEach((id) => {
      if (slots.includes(id)) return;
      const empty = slots.findIndex((v) => !v);
      if (empty >= 0) slots[empty] = id;
    });
  }

  function calcSummonLevel(draws) {
    return Math.max(1, Math.min(10, 1 + Math.floor(draws / 100)));
  }

  function rollRarityByLevel(level) {
    const t = (Math.max(1, Math.min(10, level)) - 1) / 9;
    const myth = lerp(0.00002, 0.001, t);
    const legend = lerp(0.0018, 0.006, t);
    const unique = lerp(0.02, 0.042, t);
    const epic = lerp(0.11, 0.185, t);
    const rare = lerp(0.33, 0.405, t);
    const common = 1 - (myth + legend + unique + epic + rare);

    const r = Math.random();
    if (r < myth) return "myth";
    if (r < myth + legend) return "legend";
    if (r < myth + legend + unique) return "unique";
    if (r < myth + legend + unique + epic) return "epic";
    if (r < myth + legend + unique + epic + rare) return "rare";
    return common > 0 ? "common" : "rare";
  }

  function processBossPattern(dt) {
    if (!runtime.isBoss || runtime.enemyHp <= 0) return;

    runtime.patternTimer += dt;

    if (runtime.enemyKind === "ogre" && runtime.patternTimer >= 5.8) {
      runtime.patternTimer = 0;
      heroTakeDamage(runtime.enemyAtk * 1.55, "지면 강타");
      runtime.enemyAttackFx = 0.32;
      runtime.attackTimer = Math.max(0, runtime.attackTimer - 0.25);
      burstParticles(320, 260, "#ffb995", 18);
      shake(0.22);
      log("보스 패턴: 지면 강타");
    }

    if (runtime.enemyKind === "lich" && runtime.patternTimer >= 4.9) {
      runtime.patternTimer = 0;
      for (let i = 0; i < 3; i += 1) {
        const angle = (Math.PI * (151 + i * 15)) / 180;
        const speed = 190 + i * 28;
        runtime.projectiles.push({ x: 790, y: 205, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 3.2, damage: runtime.enemyAtk * 0.52, color: "#d0a9ff" });
      }
      burstParticles(765, 205, "#d0a9ff", 16);
      shake(0.13);
      log("보스 패턴: 영혼 탄막");
    }

    if (runtime.enemyKind === "golem" && runtime.patternTimer >= 6.8) {
      runtime.patternTimer = 0;
      runtime.enemyShield = 0.45;
      runtime.enemyShieldTimer = 3.4;
      burstParticles(760, 210, "#9cecff", 18);
      shake(0.15);
      log("보스 패턴: 암석 장벽");
    }

    if (runtime.enemyKind === "wyrm" && runtime.patternTimer >= 6.3) {
      runtime.patternTimer = 0;
      runtime.dotTimer = 3.2;
      runtime.dotTick = 0;
      burstParticles(640, 220, "#ff8fc8", 20);
      shake(0.14);
      log("보스 패턴: 독룡 브레스");
    }
  }

  function processProjectiles(dt) {
    runtime.projectiles = runtime.projectiles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);

    for (let i = runtime.projectiles.length - 1; i >= 0; i -= 1) {
      const p = runtime.projectiles[i];
      const dx = p.x - 240;
      const dy = p.y - 220;
      if (dx * dx + dy * dy <= 35 * 35) {
        runtime.projectiles.splice(i, 1);
        heroTakeDamage(p.damage, "영혼탄 피격");
        burstParticles(245, 220, p.color, 10);
      }
    }
  }

  function processDot(dt) {
    if (runtime.dotTimer <= 0) return;
    runtime.dotTimer -= dt;
    runtime.dotTick += dt;
    if (runtime.dotTick >= 0.5) {
      runtime.dotTick = 0;
      heroTakeDamage(runtime.enemyAtk * 0.34, "브레스 도트");
      burstParticles(260, 220, "#ff9fcf", 8);
    }
  }

  function enemyAttack() {
    if (runtime.enemyHp <= 0) return;
    runtime.enemyAttackFx = 0.22;

    const dodge = Math.min(0.24, getPetBuff().spd * 0.8);
    if (Math.random() < dodge) {
      runtime.statusMsg = "회피";
      floatText("DODGE", 240, 120, "#9bffd9");
      return;
    }

    heroTakeDamage(runtime.enemyAtk * (0.86 + Math.random() * 0.33), "적의 반격");
  }

  function heroTakeDamage(damage, label) {
    setHeroHp(getHeroHp() - damage);
    runtime.statusMsg = label;
    floatText(`-${fmt(damage)}`, 240, 120, "#ffb4b4");
    burstParticles(250, 220, "#ffb4b4", 10);
    shake(0.12);
    if (getHeroHp() <= 0) onHeroDefeated();
  }

  function dealDamage(raw, source, byHero) {
    if (runtime.enemyHp <= 0 || getHeroHp() <= 0) return;

    const crit = Math.random() < getCritChance();
    let damage = raw * (crit ? getCritMul() : 1);

    if (runtime.enemyShield > 0) {
      damage *= 1 - runtime.enemyShield;
      floatText("SHIELD", 760, 100, "#a4eaff");
    }

    runtime.enemyHp = Math.max(0, runtime.enemyHp - damage);
    runtime.statusMsg = crit ? `${source} 치명타` : `${source} 적중`;
    floatText(`-${fmt(damage)}`, 780, 125, crit ? "#ffe690" : "#dcf7ff");

    if (byHero) runtime.hitFlash = 0.2;

    if (runtime.enemyHp <= 0) onEnemyDefeated();
  }

  function onEnemyDefeated() {
    state.kills += 1;

    const reward = runtime.enemyMaxHp * 0.15 * (runtime.isBoss ? 2.5 : 1) * (1 + state.stage * 0.02);
    state.gold += reward;

    gainExp(runtime.isBoss ? 18 : 5);

    if (runtime.isBoss) {
      if (state.farmStage) {
        state.stage = state.farmStage;
      } else {
        state.stage += 1;
        state.bestStage = Math.max(Number(state.bestStage || 1), state.stage);
      }
      state.wave = 1;
      runtime.statusMsg = `보스 처치! Stage ${state.stage}`;
      log("보스 토벌 성공: 다음 스테이지 진입");
      burstParticles(790, 200, "#ffe59b", 34);
      shake(0.24);
    } else {
      state.wave += 1;
      if (state.wave > 10) state.wave = 10;
      runtime.statusMsg = `Wave ${state.wave}`;
    }

    recoverForNextRound();
    spawnEnemy();
    emitStageProgress(true);
  }

  function onBossTimeout() {
    state.bossFailCount += 1;
    state.wave = 9;
    runtime.statusMsg = "보스 제한시간 초과";
    log("보스 제한시간 실패: 스테이지 상승 실패");
    burstParticles(780, 200, "#ff9cbc", 24);
    recoverForNextRound();
    spawnEnemy();
    emitStageProgress(true);
  }

  function onHeroDefeated() {
    runtime.statusMsg = "파티 전멸";
    log("패배: 웨이브 후퇴");
    state.wave = Math.max(1, state.wave - 1);
    recoverForNextRound();
    spawnEnemy();
    emitStageProgress(true);
  }

  function spawnEnemy() {
    if (state.farmStage) {
      state.stage = state.farmStage;
    }

    runtime.projectiles = [];
    runtime.particles = [];
    runtime.enemyShield = 0;
    runtime.enemyShieldTimer = 0;
    runtime.patternTimer = 0;
    runtime.dotTimer = 0;
    runtime.dotTick = 0;

    runtime.isBoss = state.wave >= 10;

    const bossModel = BOSS_MODELS[(state.stage - 1) % BOSS_MODELS.length];
    runtime.enemyModel = bossModel;

    if (runtime.isBoss) {
      runtime.enemyName = bossModel.name;
      runtime.enemyKind = bossModel.key;
      runtime.bossTimer = 30;
    } else {
      const mobs = ["숲 도적", "황야 늑대", "암흑 사제", "해골 전사", "독성 곤충"];
      const idx = (state.stage + state.wave) % mobs.length;
      runtime.enemyName = `${mobs[idx]} ${state.wave}`;
      runtime.enemyKind = "mob";
      runtime.bossTimer = 0;
    }

    const stagePow = Math.pow(state.stage, 1.62);
    const waveMul = 1 + state.wave * 0.28;
    const bossMul = runtime.isBoss ? 5.4 : 1;

    runtime.enemyMaxHp = Math.max(140, Math.floor((180 + stagePow * 26) * waveMul * bossMul));
    runtime.enemyHp = runtime.enemyMaxHp;

    runtime.enemyAtk = Math.max(14, (16 + stagePow * 4.2) * (runtime.isBoss ? 2.55 : 1));
    runtime.enemyAtkInterval = runtime.isBoss ? 1.3 : 1.75;
  }

  function recoverForNextRound() {
    state.heroHp = getHeroMaxHp();
    runtime.skillCooldowns = [0, 0, 0, 0];
    runtime.attackTimer = 0;
    runtime.enemyAttackTimer = 0;
  }

  function gainExp(v) {
    state.exp += v;
    const need = 26 + state.accountLv * 8;
    if (state.exp >= need) {
      state.exp -= need;
      state.accountLv += 1;
      log(`계정 레벨업 Lv.${state.accountLv}`);
    }
  }

  function getSummonCosts(type) {
    const level = state.summon[type].level;
    const base = type === "heroes" ? 7000 : type === "pets" ? 8500 : 10000;
    const one = Math.floor(base * Math.pow(1.08, level - 1));
    const ten = Math.floor(one * 10 * 0.94);
    return { one, ten };
  }

  function getEnhanceCost(type, id) {
    const inv = state.inventories[type][id];
    if (!inv) return 0;
    const base = type === "heroes" ? 2200 : type === "pets" ? 2600 : 3000;
    return Math.floor(base * Math.pow(1.32, inv.level - 1));
  }

  function tryEnhance(type, id) {
    const cost = getEnhanceCost(type, id);
    if (cost <= 0) return;
    if (state.gold < cost) {
      log("강화 Gold 부족");
      return;
    }
    state.gold -= cost;
    state.inventories[type][id].level += 1;
    log("강화 성공");
  }

  function getPool(type) {
    if (type === "heroes") return HERO_POOL;
    if (type === "pets") return PET_POOL;
    return SKILL_POOL;
  }

  function categoryName(type) {
    if (type === "heroes") return "영웅";
    if (type === "pets") return "펫";
    return "스킬";
  }

  function getEquipped(type) {
    return state.equipped[type]
      .map((id) => (id ? findById(getPool(type), id) : null));
  }

  function getPetBuff() {
    const equipped = state.equipped.pets.filter(Boolean);
    let atk = 0;
    let spd = 0;
    let crit = 0;

    equipped.forEach((id) => {
      const pet = findById(PET_POOL, id);
      const inv = state.inventories.pets[id];
      if (!pet || !inv) return;
      const rarity = rarityByKey(pet.rarity).mult;
      atk += pet.atkAmp * rarity * (1 + (inv.level - 1) * 0.02) * (1 + (inv.star - 1) * 0.08);
      spd += pet.spdAmp * rarity * (1 + (inv.level - 1) * 0.015);
      crit += pet.critAmp * rarity * (1 + (inv.star - 1) * 0.04);
    });

    return { atk, spd, crit };
  }

  function getTeamPower() {
    const heroes = state.equipped.heroes.filter(Boolean);
    const petBuff = getPetBuff();

    let heroPower = 0;
    heroes.forEach((id) => {
      const hero = findById(HERO_POOL, id);
      const inv = state.inventories.heroes[id];
      if (!hero || !inv) return;
      const rarity = rarityByKey(hero.rarity).mult;
      const p = hero.baseAtk * rarity * (1 + (inv.level - 1) * 0.17) * (1 + (inv.star - 1) * 0.33);
      heroPower += p;
    });

    const account = 1 + (state.accountLv - 1) * 0.04;
    return heroPower * (1 + petBuff.atk) * account;
  }

  function getAttackSpeed() {
    const heroes = state.equipped.heroes.filter(Boolean);
    if (!heroes.length) return 0.4;

    let speed = 0;
    heroes.forEach((id) => {
      const hero = findById(HERO_POOL, id);
      const inv = state.inventories.heroes[id];
      if (!hero || !inv) return;
      const rarity = rarityByKey(hero.rarity).mult;
      speed += hero.baseSpd * (1 + (inv.level - 1) * 0.02) * (1 + (inv.star - 1) * 0.04) * Math.sqrt(rarity);
    });

    const avg = speed / heroes.length;
    return avg * (1 + getPetBuff().spd);
  }

  function getCritChance() {
    const pet = getPetBuff();
    return Math.min(0.75, 0.05 + pet.crit);
  }

  function getCritMul() {
    const skillIds = state.equipped.skills.filter(Boolean);
    let bonus = 0;
    skillIds.forEach((id) => {
      const inv = state.inventories.skills[id];
      if (!inv) return;
      bonus += (inv.level - 1) * 0.006 + (inv.star - 1) * 0.04;
    });
    return 1.65 + bonus;
  }

  function getHeroMaxHp() {
    const heroes = state.equipped.heroes.filter(Boolean);
    if (!heroes.length) return 200;

    let hp = 0;
    heroes.forEach((id) => {
      const hero = findById(HERO_POOL, id);
      const inv = state.inventories.heroes[id];
      if (!hero || !inv) return;
      const rarity = rarityByKey(hero.rarity).mult;
      hp += hero.baseHp * rarity * (1 + (inv.level - 1) * 0.09) * (1 + (inv.star - 1) * 0.14);
    });

    return hp * (1 + (state.accountLv - 1) * 0.025);
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
    return getTeamPower() * 0.62;
  }

  function applyOfflineReward() {
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - Number(state.lastSave || now)) / 1000));
    const clamped = Math.min(MAX_OFFLINE_SECONDS, elapsed);
    const reward = getTeamPower() * getAttackSpeed() * 0.28 * clamped;
    state.gold += reward;
    state.lastSave = now;
    state.heroHp = getHeroMaxHp();
    return reward;
  }

  function resetRuntime() {
    runtime.attackTimer = 0;
    runtime.enemyAttackTimer = 0;
    runtime.skillCooldowns = [0, 0, 0, 0];
    runtime.particles = [];
    runtime.projectiles = [];
    runtime.floatTexts = [];
    runtime.summonResultRows = [];
  }

  function cloneBase() {
    return JSON.parse(JSON.stringify({ ...BASE_STATE, lastSave: Date.now() }));
  }

  function buildPool(prefix, names, templates, mapper) {
    return names.map((name, idx) => {
      const tpl = templates[idx % templates.length];
      return mapper(idx, name, tpl, prefix);
    });
  }

  function normalizeState() {
    if (!state.inventories) state.inventories = cloneBase().inventories;
    if (!state.equipped) state.equipped = cloneBase().equipped;
    if (!state.selectedSlots) state.selectedSlots = cloneBase().selectedSlots;
    if (!state.summon) state.summon = cloneBase().summon;

    ["heroes", "pets", "skills"].forEach((t) => {
      if (!Array.isArray(state.equipped[t])) state.equipped[t] = new Array(SLOT_COUNT).fill(null);
      if (state.equipped[t].length < SLOT_COUNT) {
        state.equipped[t] = [...state.equipped[t], ...new Array(SLOT_COUNT - state.equipped[t].length).fill(null)];
      }
      if (typeof state.selectedSlots[t] !== "number") state.selectedSlots[t] = 0;
      if (!state.inventories[t]) state.inventories[t] = {};
      if (!state.summon[t]) state.summon[t] = { level: 1, draws: 0 };
    });

    if (state.farmStage !== null) {
      const n = Math.floor(Number(state.farmStage));
      state.farmStage = Number.isFinite(n) && n >= 1 ? n : null;
    }

    if (!Number.isFinite(Number(state.bestStage))) {
      state.bestStage = Math.max(1, Number(state.stage || 1));
    } else {
      state.bestStage = Math.max(1, Math.floor(Number(state.bestStage)));
    }
    state.bestStage = Math.max(state.bestStage, Math.floor(Number(state.stage || 1)));

    if (!state.heroHp || Number.isNaN(state.heroHp)) state.heroHp = getHeroMaxHp();
    state.heroHp = Math.min(state.heroHp, getHeroMaxHp());
  }

  function emitStageProgress(force) {
    try {
      const payload = {
        stage: Number(state.stage || 1),
        wave: Number(state.wave || 1),
        bestStage: Number(state.bestStage || state.stage || 1),
        kills: Number(state.kills || 0),
        power: Math.floor(getTeamPower() * getAttackSpeed()),
        force: Boolean(force),
        ts: Date.now()
      };
      window.dispatchEvent(new CustomEvent("idle:stage-progress", { detail: payload }));
    } catch (_) {
      // Ignore dispatch failures in unsupported environments.
    }
  }

  function save() {
    state.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return cloneBase();
      const parsed = JSON.parse(raw);
      return {
        ...cloneBase(),
        ...parsed
      };
    } catch {
      return cloneBase();
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rarityByKey(key) {
    return RARITIES.find((r) => r.key === key) || RARITIES[0];
  }

  function findById(pool, id) {
    return pool.find((x) => x.id === id) || pool[0];
  }

  function starText(star) {
    return "★".repeat(Math.min(10, star));
  }

  function shadeColor(hex, percent) {
    const n = String(hex || "#ffffff").replace("#", "");
    const c = n.length === 3 ? n.split("").map((ch) => ch + ch).join("") : n;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const p = percent / 100;
    const nr = Math.max(0, Math.min(255, Math.round(r + (p >= 0 ? (255 - r) * p : r * p))));
    const ng = Math.max(0, Math.min(255, Math.round(g + (p >= 0 ? (255 - g) * p : g * p))));
    const nb = Math.max(0, Math.min(255, Math.round(b + (p >= 0 ? (255 - b) * p : b * p))));
    return `rgb(${nr}, ${ng}, ${nb})`;
  }

  function hexToRgba(hex, alpha) {
    const n = String(hex || "#ffffff").replace("#", "");
    const c = n.length === 3 ? n.split("").map((ch) => ch + ch).join("") : n.padEnd(6, "f");
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function burstParticles(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 25 + Math.random() * 130;
      runtime.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45 + Math.random() * 0.45, size: 1.5 + Math.random() * 2.8, color });
    }
    if (runtime.particles.length > 280) runtime.particles.splice(0, runtime.particles.length - 280);
  }

  function floatText(text, x, y, color) {
    runtime.floatTexts.push({ text, x, y, life: 0.9, vy: 26, color });
    if (runtime.floatTexts.length > 30) runtime.floatTexts.shift();
  }

  function updateParticles(dt) {
    runtime.particles = runtime.particles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 70 * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);
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
      runtime.camX = 0;
      runtime.camY = 0;
      return;
    }
    const amp = runtime.screenShake * 10;
    runtime.camX = (Math.random() - 0.5) * amp;
    runtime.camY = (Math.random() - 0.5) * amp;
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
    ctx.translate(runtime.camX, runtime.camY);

    drawBackground(w, h, t);

    const heroIds = state.equipped.heroes;
    const petIds = state.equipped.pets;
    const heroXs = [170, 245, 320, 395];

    heroIds.forEach((id, idx) => {
      if (!id) return;
      const hero = findById(HERO_POOL, id);
      const x = heroXs[idx] + (runtime.heroAttackFx > 0 ? 32 * (runtime.heroAttackFx / 0.2) : 0);
      const y = h - 124 + Math.sin(t * 5.4 + idx * 0.8) * 2;
      drawHero(x, y, hero, runtime.heroAttackFx > 0);

      const petId = petIds[idx];
      if (petId) {
        const pet = findById(PET_POOL, petId);
        drawPet(x - 42 + Math.cos(t * 2.8 + idx) * 6, y - 66 + Math.sin(t * 3.6 + idx) * 5, pet);
      }
    });

    const enemyX = 805 - (runtime.enemyAttackFx > 0 ? 34 * (runtime.enemyAttackFx / 0.22) : 0);
    const enemyY = h - 122 + Math.sin(t * 4.2) * 2;
    drawEnemy(enemyX, enemyY, runtime.enemyModel, runtime.enemyAttackFx > 0, runtime.isBoss, runtime.enemyShield > 0);

    if (runtime.heroAttackFx > 0) drawSlash(495, h - 170, currentHeroAccent());
    if (runtime.enemyAttackFx > 0) drawSlash(650, h - 170, "#ffb6cc");
    if (runtime.skillFx > 0) drawSkillEffect(w, h, runtime.skillColor, runtime.skillFx);

    drawProjectiles();
    drawParticles();
    drawFloatTexts();

    if (runtime.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 242, 196, ${runtime.hitFlash * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function drawBackground(w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2b4f83");
    sky.addColorStop(1, "#131d35");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 22; i += 1) {
      const x = (i * 62 + t * 14) % (w + 30) - 15;
      const y = 34 + Math.sin((i + t) * 0.82) * 7;
      ctx.fillStyle = "rgba(198, 230, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 8; i += 1) {
      const x = ((i * 170) + t * 6) % (w + 220) - 220;
      ctx.fillStyle = "rgba(151, 190, 242, 0.24)";
      ctx.beginPath();
      ctx.moveTo(x, h - 108);
      ctx.lineTo(x + 90, h - 245);
      ctx.lineTo(x + 180, h - 108);
      ctx.closePath();
      ctx.fill();
    }

    const ground = ctx.createLinearGradient(0, h - 112, 0, h);
    ground.addColorStop(0, "#1f4f46");
    ground.addColorStop(1, "#0f2f2b");
    ctx.fillStyle = ground;
    ctx.fillRect(0, h - 112, w, 112);
  }

  function drawHero(x, y, hero, attacking) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = hero.accent;
    ctx.beginPath();
    ctx.arc(0, -56, 14, 0, Math.PI * 2);
    ctx.fill();

    const bodyGrad = ctx.createLinearGradient(-18, -36, 18, 12);
    bodyGrad.addColorStop(0, hero.color);
    bodyGrad.addColorStop(1, shadeColor(hero.color, -30));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-15, -34);
    ctx.lineTo(15, -34);
    ctx.lineTo(20, 12);
    ctx.lineTo(-20, 12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hero.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    const ex = attacking ? 58 : 38;
    const ey = attacking ? -68 : -45;
    ctx.moveTo(8, -22);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = "#243c60";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(-17, 40);
    ctx.moveTo(10, 10);
    ctx.lineTo(17, 40);
    ctx.stroke();

    ctx.restore();
  }

  function drawPet(x, y, pet) {
    ctx.save();
    ctx.translate(x, y);

    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 26);
    glow.addColorStop(0, hexToRgba(pet.color, 0.95));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pet.color;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-3, -2, 1.2, 0, Math.PI * 2);
    ctx.arc(3, -2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(x, y, model, attacking, isBoss, shieldOn) {
    ctx.save();
    ctx.translate(x, y);

    if (!isBoss) {
      ctx.fillStyle = "#b58c6f";
      ctx.beginPath();
      ctx.arc(0, -56, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5c3a32";
      ctx.fillRect(-19, -35, 38, 50);
    } else {
      const hue = model.hue;
      ctx.fillStyle = `hsl(${hue} 58% 56%)`;
      ctx.beginPath();
      ctx.arc(0, -60, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} 54% 30%)`;
      ctx.fillRect(-31, -35, 62, 66);
    }

    if (shieldOn) {
      ctx.strokeStyle = "rgba(143, 229, 255, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -24, 58, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = isBoss ? "#ffd6e8" : "#ffd0bf";
    ctx.lineWidth = isBoss ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(attacking ? -58 : -31, attacking ? -49 : -28);
    ctx.stroke();

    ctx.strokeStyle = isBoss ? "#4c2438" : "#41242d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 28);
    ctx.lineTo(-20, 56);
    ctx.moveTo(10, 28);
    ctx.lineTo(20, 56);
    ctx.stroke();

    ctx.restore();
  }

  function drawSlash(x, y, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 26, Math.PI * 0.1, Math.PI * 0.92);
    ctx.stroke();
    ctx.restore();
  }

  function drawSkillEffect(w, h, color, power) {
    ctx.save();
    ctx.fillStyle = hexToRgba(color, Math.min(0.22, power * 0.3));
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.43, 190 * power, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.43, (110 + i * 40) * power, 0, Math.PI * 2);
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

  function currentHeroAccent() {
    const first = state.equipped.heroes.find(Boolean);
    if (!first) return "#d4ebff";
    return findById(HERO_POOL, first).accent;
  }

  function render() {
    const heroCosts = getSummonCosts("heroes");
    const petCosts = getSummonCosts("pets");
    const skillCosts = getSummonCosts("skills");

    const heroHp = getHeroHp();
    const heroMaxHp = getHeroMaxHp();
    const enemyRatio = runtime.enemyMaxHp > 0 ? runtime.enemyHp / runtime.enemyMaxHp : 0;

    el.gold.textContent = fmt(state.gold);
    el.stage.textContent = `${state.stage}-${state.wave}`;
    el.power.textContent = fmt(getTeamPower() * getAttackSpeed());
    el.summonLevels.textContent = `H${state.summon.heroes.level}/P${state.summon.pets.level}/S${state.summon.skills.level}`;

    el.battleStatus.textContent = runtime.statusMsg;
    el.heroLabel.textContent = "파티 HP";
    el.enemyName.textContent = runtime.isBoss ? `[BOSS] ${runtime.enemyName}` : runtime.enemyName;

    el.heroHpFill.style.width = `${(heroHp / heroMaxHp) * 100}%`;
    el.heroHpText.textContent = `${fmt(heroHp)} / ${fmt(heroMaxHp)}`;
    el.enemyHpFill.style.width = `${Math.max(0, Math.min(1, enemyRatio)) * 100}%`;
    el.enemyHpText.textContent = `${fmt(runtime.enemyHp)} / ${fmt(runtime.enemyMaxHp)}`;

    el.bossTimerBox.hidden = !runtime.isBoss;
    if (runtime.isBoss) {
      const r = Math.max(0, runtime.bossTimer / 30);
      el.bossTimeFill.style.width = `${r * 100}%`;
      el.bossTimerLabel.textContent = `보스 제한시간 ${runtime.bossTimer.toFixed(1)}초`;
    }

    el.toggleAutoSkill.textContent = `자동 스킬: ${state.autoSkill ? "ON" : "OFF"}`;
    el.farmModeText.textContent = state.farmStage
      ? `현재 모드: Stage ${state.farmStage} 고정 반복 사냥`
      : "현재 모드: 진행 모드";
    if (document.activeElement !== el.farmStageInput) {
      el.farmStageInput.value = state.farmStage ? String(state.farmStage) : "";
    }

    el.costHero1.textContent = `${fmt(heroCosts.one)} G`;
    el.costHero10.textContent = `${fmt(heroCosts.ten)} G`;
    el.costPet1.textContent = `${fmt(petCosts.one)} G`;
    el.costPet10.textContent = `${fmt(petCosts.ten)} G`;
    el.costSkill1.textContent = `${fmt(skillCosts.one)} G`;
    el.costSkill10.textContent = `${fmt(skillCosts.ten)} G`;

    el.summonHero1.disabled = state.gold < heroCosts.one;
    el.summonHero10.disabled = state.gold < heroCosts.ten;
    el.summonPet1.disabled = state.gold < petCosts.one;
    el.summonPet10.disabled = state.gold < petCosts.ten;
    el.summonSkill1.disabled = state.gold < skillCosts.one;
    el.summonSkill10.disabled = state.gold < skillCosts.ten;

    el.skillSlotList.innerHTML = state.equipped.skills.map((id, i) => {
      if (!id) {
        return `<article class="skill-cd-item"><p>${i + 1}번 슬롯</p><strong>비어있음</strong></article>`;
      }
      const s = findById(SKILL_POOL, id);
      const cd = runtime.skillCooldowns[i];
      return `<article class="skill-cd-item"><p>${i + 1}. ${s.name}</p><strong>${cd > 0 ? `${cd.toFixed(1)}s` : "READY"}</strong></article>`;
    }).join("");

    renderSlots("heroes", el.heroSlots);
    renderSlots("pets", el.petSlots);
    renderSlots("skills", el.skillSlots);

    renderCollection("heroes", el.heroCollection);
    renderCollection("pets", el.petCollection);
    renderCollection("skills", el.skillCollection);

    if (!runtime.summonResultRows.length) {
      el.summonResults.innerHTML = '<article class="result-item">최근 결과 없음</article>';
    } else {
      el.summonResults.innerHTML = runtime.summonResultRows.map((r) => {
        const rar = rarityByKey(r.rarity);
        return `<article class="result-item"><span class="rare" style="color:${rar.color}">[${rar.name}]</span> ${r.text}</article>`;
      }).join("");
    }

    const heroes = state.equipped.heroes.filter(Boolean).length;
    const pets = state.equipped.pets.filter(Boolean).length;
    const skills = state.equipped.skills.filter(Boolean).length;

    el.statList.innerHTML = [
      `파티 구성 <strong>H${heroes}/P${pets}/S${skills}</strong>`,
      `공격속도 <strong>${getAttackSpeed().toFixed(2)}/s</strong>`,
      `치명타 <strong>${(getCritChance() * 100).toFixed(2)}%</strong>`,
      `치명 배율 <strong>x${getCritMul().toFixed(2)}</strong>`,
      `누적 처치 <strong>${fmt(state.kills)}</strong>`,
      `계정 레벨 <strong>Lv.${state.accountLv}</strong>`,
      `뽑기횟수(영웅) <strong>${state.summon.heroes.draws}</strong>`,
      `뽑기횟수(스킬) <strong>${state.summon.skills.draws}</strong>`
    ].map((x) => `<li>${x}</li>`).join("");

    el.log.textContent = runtime.lastLog;
  }

  function renderSlots(type, host) {
    const pool = getPool(type);
    const slots = state.equipped[type];
    const selected = state.selectedSlots[type];

    host.innerHTML = slots.map((id, idx) => {
      const active = idx === selected ? "active" : "";
      if (!id) {
        return `<article class="slot-item empty ${active}"><p>${idx + 1}번 슬롯</p><strong>비어있음</strong><button data-pick-slot="${idx}">선택</button></article>`;
      }
      const item = findById(pool, id);
      const inv = state.inventories[type][id];
      const cost = getEnhanceCost(type, id);
      const r = rarityByKey(item.rarity);
      return `
        <article class="slot-item ${active}">
          <p>${idx + 1}번 슬롯</p>
          <strong style="color:${r.color}">${item.name}</strong>
          <p>${starText(inv.star)} Lv.${inv.level}</p>
          <button data-pick-slot="${idx}">선택</button>
          <button data-enhance="${type}|${id}">강화 (${fmt(cost)}G)</button>
          <button data-clear-slot="${idx}">해제</button>
        </article>
      `;
    }).join("");

    host.querySelectorAll("button[data-enhance]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [t, id] = btn.getAttribute("data-enhance").split("|");
        tryEnhance(t, id);
        render();
      });
    });

    host.querySelectorAll("button[data-pick-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSlots[type] = Number(btn.getAttribute("data-pick-slot"));
        render();
      });
    });

    host.querySelectorAll("button[data-clear-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-clear-slot"));
        state.equipped[type][idx] = null;
        render();
      });
    });
  }

  function renderCollection(type, host) {
    const pool = getPool(type);
    const invMap = state.inventories[type];

    const rows = Object.keys(invMap)
      .map((id) => {
        const item = findById(pool, id);
        const inv = invMap[id];
        return { item, inv };
      })
      .sort((a, b) => rarityByKey(b.item.rarity).mult - rarityByKey(a.item.rarity).mult || b.inv.star - a.inv.star)
      .map(({ item, inv }) => {
        const r = rarityByKey(item.rarity);
        return `
          <article class="collection-item">
            <div class="top"><strong style="color:${r.color}">[${r.name}] ${item.name}</strong><span>${starText(inv.star)}</span></div>
            <p>Lv.${inv.level} | 조각 ${inv.shards} | 총 획득 ${inv.total}</p>
            <button data-equip-id="${item.id}">선택 슬롯에 장착</button>
          </article>
        `;
      });

    host.innerHTML = rows.length ? rows.join("") : '<article class="collection-item"><p>없음</p></article>';

    host.querySelectorAll("button[data-equip-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-equip-id");
        equipToSelectedSlot(type, id);
        log(`${categoryName(type)} 장착: ${findById(pool, id).name}`);
        render();
      });
    });
  }

  function log(msg) {
    runtime.lastLog = `${msg} | ${new Date().toLocaleTimeString("ko-KR", { hour12: false })}`;
  }

  function fmt(v) {
    const n = Number(v || 0);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
    return `${Math.floor(n * 100) / 100}`;
  }
})();
