(() => {
  const SAVE_KEY = "idleGrowerStandaloneV6";
  const HIDE_BATTLE_KEY = "idleGrowerHideBattleModeV1";
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
    gold: 500000,
    pendingOfflineGold: 0,
    stage: 1,
    bestStage: 1,
    wave: 1,
    climbMode: true,
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
    tickets: { heroes: 100, pets: 100, skills: 100 },
    attendance: { lastClaimDay: "" },
    dungeons: {
      lastResetDay: "",
      entries: { gold: 2, heroes: 2, pets: 2, skills: 2 }
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
    bossTimerMax: 25,
    enemyModel: BOSS_MODELS[0],
    enemyKind: "mob",
    isBoss: false,
    attackTimer: 0,
    enemyAttackTimer: 0,
    skillCooldowns: [0, 0, 0, 0],
    bossTimer: 25,
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
    enemyDefense: 0,
    enemyShieldTimer: 0,
    patternTimer: 0,
    dotTimer: 0,
    dotTick: 0,
    screenShake: 0,
    camX: 0,
    camY: 0,
    comboHits: 0,
    comboTimer: 0,
    roundBanner: "",
    roundBannerTimer: 0,
    dangerVignette: 0,
    stagePulse: 0,
    roundTransition: 0,
    pendingRespawn: false,
    transitionLabel: "",
    summonResultRows: [],
    rankEmitTimer: 0,
    inventoryUiDirty: true,
    lastHeroMaxHp: 0
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
    claimOfflineBtn: document.getElementById("claim-offline-btn"),
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
    toggleBattleView: document.getElementById("toggle-battle-view"),
    saveBtn: document.getElementById("save-btn"),
    resetBtn: document.getElementById("reset-btn"),
    summonHero1: document.getElementById("summon-hero-1"),
    summonHero10: document.getElementById("summon-hero-10"),
    summonHeroMeta: document.getElementById("summon-hero-meta"),
    summonPet1: document.getElementById("summon-pet-1"),
    summonPet10: document.getElementById("summon-pet-10"),
    summonPetMeta: document.getElementById("summon-pet-meta"),
    summonSkill1: document.getElementById("summon-skill-1"),
    summonSkill10: document.getElementById("summon-skill-10"),
    summonSkillMeta: document.getElementById("summon-skill-meta"),
    ticketHeroes: document.getElementById("ticket-heroes"),
    ticketPets: document.getElementById("ticket-pets"),
    ticketSkills: document.getElementById("ticket-skills"),
    dailyResetText: document.getElementById("daily-reset-text"),
    dungeonGoldBtn: document.getElementById("dungeon-gold"),
    dungeonHeroBtn: document.getElementById("dungeon-heroes"),
    dungeonPetBtn: document.getElementById("dungeon-pets"),
    dungeonSkillBtn: document.getElementById("dungeon-skills"),
    dungeonGoldMeta: document.getElementById("dungeon-gold-meta"),
    dungeonHeroMeta: document.getElementById("dungeon-heroes-meta"),
    dungeonPetMeta: document.getElementById("dungeon-pets-meta"),
    dungeonSkillMeta: document.getElementById("dungeon-skills-meta"),
    dailyAttendanceBtn: document.getElementById("daily-attendance-claim"),
    dailyAttendanceStatus: document.getElementById("daily-attendance-status"),
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
  applyBattleHiddenMode(localStorage.getItem(HIDE_BATTLE_KEY) === "1");
  spawnEnemy();

  const offline = applyOfflineReward();
  if (offline > 0) {
    log(`오프라인 누적 +${fmt(offline)} Gold`);
  }

  setInterval(tick, TICK * 1000);
  setInterval(save, 12000);
  window.addEventListener("beforeunload", save);

  requestAnimationFrame(drawFrame);
  render();
  emitStageProgress(true);

  function bindEvents() {
    resetDailyDungeonsIfNeeded();
    el.toggleAutoSkill.addEventListener("click", () => {
      state.autoSkill = !state.autoSkill;
      render();
    });

    el.bossChallenge.addEventListener("click", () => {
      if (state.climbMode) {
        log("현재 보스 처치 후 자동으로 다음 보스로 진행됩니다");
        render();
        return;
      }
      if (runtime.roundTransition > 0 || runtime.pendingRespawn) {
        log("전투 전환 중에는 도전할 수 없습니다");
        render();
        return;
      }
      if (state.farmStage) state.farmStage = null;
      state.climbMode = true;
      if (state.wave >= 10) {
        state.stage += 1;
        state.wave = 1;
      } else {
        state.wave += 1;
      }
      runtime.statusMsg = `${state.stage}-${state.wave} 보스 등반 도전`;
      log(`등반 재개: ${state.stage}-${state.wave}`);
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
      state.climbMode = false;
      recoverForNextRound();
      spawnEnemy();
      log(`사냥터 고정: Stage ${picked}`);
      emitStageProgress(true);
      render();
    });

    el.clearFarmStageBtn.addEventListener("click", () => {
      state.farmStage = null;
      state.climbMode = true;
      log("사냥터 고정 해제: 진행 모드");
      emitStageProgress(true);
      render();
    });

    el.saveBtn.addEventListener("click", () => {
      save();
      log("수동 저장 완료");
      render();
    });

    el.claimOfflineBtn.addEventListener("click", () => {
      const gain = Math.max(0, Number(state.pendingOfflineGold || 0));
      if (gain <= 0) {
        log("받을 오프라인 보상이 없습니다");
        return;
      }
      state.gold += gain;
      state.pendingOfflineGold = 0;
      log(`오프라인 보상 수령 +${fmt(gain)} Gold`);
      emitStageProgress(true);
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

    if (el.toggleBattleView) {
      el.toggleBattleView.addEventListener("click", () => {
        const next = !document.body.classList.contains("hide-battle");
        applyBattleHiddenMode(next);
      });
    }

    el.summonHero1.addEventListener("click", () => summon("heroes", 1));
    el.summonHero10.addEventListener("click", () => summon("heroes", 10));
    el.summonPet1.addEventListener("click", () => summon("pets", 1));
    el.summonPet10.addEventListener("click", () => summon("pets", 10));
    el.summonSkill1.addEventListener("click", () => summon("skills", 1));
    el.summonSkill10.addEventListener("click", () => summon("skills", 10));
    if (el.dungeonGoldBtn) el.dungeonGoldBtn.addEventListener("click", () => runDailyDungeon("gold"));
    if (el.dungeonHeroBtn) el.dungeonHeroBtn.addEventListener("click", () => runDailyDungeon("heroes"));
    if (el.dungeonPetBtn) el.dungeonPetBtn.addEventListener("click", () => runDailyDungeon("pets"));
    if (el.dungeonSkillBtn) el.dungeonSkillBtn.addEventListener("click", () => runDailyDungeon("skills"));
    if (el.dailyAttendanceBtn) el.dailyAttendanceBtn.addEventListener("click", claimDailyAttendance);

  }

  function equipToSelectedSlot(type, id) {
    const arr = state.equipped[type];
    const slot = state.selectedSlots[type] || 0;
    const prevIdx = arr.indexOf(id);
    if (prevIdx >= 0) {
      const t = arr[slot];
      arr[slot] = id;
      arr[prevIdx] = t;
      runtime.inventoryUiDirty = true;
      return;
    }
    arr[slot] = id;
    runtime.inventoryUiDirty = true;
  }

  function applyBattleHiddenMode(enabled) {
    const on = Boolean(enabled);
    document.body.classList.toggle("hide-battle", on);
    localStorage.setItem(HIDE_BATTLE_KEY, on ? "1" : "0");
    if (el.toggleBattleView) {
      el.toggleBattleView.textContent = on ? "전투화면 보이기" : "전투화면 숨기기";
    }
  }

  function syncHeroHpToMax() {
    const maxHp = getHeroMaxHp();
    const prevMaxRaw = Number(runtime.lastHeroMaxHp || 0);
    if (!Number.isFinite(prevMaxRaw) || prevMaxRaw <= 0) {
      state.heroHp = maxHp;
      runtime.lastHeroMaxHp = maxHp;
      return;
    }
    const prevMax = Math.max(1, prevMaxRaw);
    const currentHp = Number(state.heroHp || 0);

    if (!Number.isFinite(currentHp) || currentHp <= 0) {
      state.heroHp = maxHp;
    } else if (Math.abs(maxHp - prevMax) > 0.0001) {
      const ratio = Math.max(0, Math.min(1, currentHp / prevMax));
      state.heroHp = maxHp * ratio;
    }

    state.heroHp = Math.max(0, Math.min(maxHp, Number(state.heroHp || 0)));
    runtime.lastHeroMaxHp = maxHp;
  }

  function tick() {
    const dt = TICK;
    syncHeroHpToMax();

    state.pendingOfflineGold = Number(state.pendingOfflineGold || 0) + getOfflineIncomePerSec() * dt;

    runtime.attackTimer += dt;
    runtime.enemyAttackTimer += dt;
    runtime.heroAttackFx = Math.max(0, runtime.heroAttackFx - dt);
    runtime.enemyAttackFx = Math.max(0, runtime.enemyAttackFx - dt);
    runtime.skillFx = Math.max(0, runtime.skillFx - dt * 1.4);
    runtime.hitFlash = Math.max(0, runtime.hitFlash - dt * 1.7);
    runtime.enemyShieldTimer = Math.max(0, runtime.enemyShieldTimer - dt);
    runtime.screenShake = Math.max(0, runtime.screenShake - dt * 1.9);
    runtime.comboTimer = Math.max(0, runtime.comboTimer - dt);
    runtime.roundBannerTimer = Math.max(0, runtime.roundBannerTimer - dt);
    runtime.dangerVignette = Math.max(0, runtime.dangerVignette - dt * 1.2);
    runtime.stagePulse = Math.max(0, runtime.stagePulse - dt * 1.8);
    if (runtime.comboTimer <= 0) runtime.comboHits = 0;

    if (runtime.enemyShieldTimer <= 0) runtime.enemyShield = 0;

    runtime.skillCooldowns = runtime.skillCooldowns.map((v) => Math.max(0, v - dt));
    healHero(getHpRegenPerSec() * dt);

    if (runtime.roundTransition > 0) {
      runtime.roundTransition = Math.max(0, runtime.roundTransition - dt);
      runtime.statusMsg = `${runtime.transitionLabel || "다음 전투 준비"} (${runtime.roundTransition.toFixed(1)}s)`;
      if (runtime.roundTransition <= 0 && runtime.pendingRespawn) {
        runtime.pendingRespawn = false;
        spawnEnemy();
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
      return;
    }

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
    const passive = getCollectionPassive();
    const burst = getTeamPower() * skill.burst * rarityMult * (1 + (inv.level - 1) * 0.08) * (1 + (inv.star - 1) * 0.16) * (1 + passive.skillBurst);
    const cdRaw = (skill.cooldown - inv.level * 0.05 - inv.star * 0.04) * (1 - passive.skillCdCut);
    const cd = Math.max(2.4, cdRaw);

    runtime.skillCooldowns[slotIndex] = cd;
    runtime.skillFx = 0.58;
    runtime.skillColor = rarityByKey(skill.rarity).color;
    runtime.heroAttackFx = 0.26;

    dealDamage(burst, `${slotIndex + 1}번 ${skill.name}`, true);
    burstParticles(705, 205, runtime.skillColor, 22);
    shake(0.12);
  }

  function summon(type, count) {
    const ticketKey = type;
    const tickets = Number(state.tickets[ticketKey] || 0);
    if (tickets < count) {
      el.summonLog.textContent = "소환권 부족";
      log("소환권 부족");
      return;
    }
    state.tickets[ticketKey] -= count;

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
    runtime.inventoryUiDirty = true;

    runtime.summonResultRows = rows.map((r) => ({
      name: r.item.name,
      rarity: r.item.rarity,
      text: `${rarityByKey(r.item.rarity).name} ${r.item.name} ${r.result.promoted ? `-> ${r.result.star}성` : ""}`
    }));

    const payLabel = `${categoryName(type)} 뽑기권 ${count}장 사용`;
    el.summonLog.textContent = `${categoryName(type)} ${count}회 뽑기 완료 (${payLabel})`;
    log(`${categoryName(type)} ${count}회 뽑기 (${payLabel})`);
    render();
  }

  function runDailyDungeon(type) {
    resetDailyDungeonsIfNeeded();
    const entries = state.dungeons.entries;
    if (!Number.isFinite(entries[type])) entries[type] = 2;
    if (entries[type] <= 0) {
      log("해당 던전 일일 입장 횟수를 모두 사용했습니다");
      render();
      return;
    }
    const best = Math.max(1, Math.floor(Number(state.bestStage || state.stage || 1)));
    const power = getTeamPower() * getAttackSpeed();
    const diffBase = Math.pow(best, 1.42) * 230;
    const diffMul = type === "gold" ? 0.9 : type === "pets" ? 1.06 : type === "heroes" ? 1.12 : 1.2;
    const ratio = power / Math.max(1, diffBase * diffMul);

    const grade = ratio >= 1.28 ? "perfect" : ratio >= 0.86 ? "clear" : "fail";
    if (grade === "fail") {
      log(`일일 ${dungeonName(type)} 실패 (입장권 소모 없음)`);
      runtime.roundBanner = `${dungeonName(type)} 실패`;
      runtime.roundBannerTimer = 1.2;
      render();
      return;
    }

    entries[type] -= 1;
    const reward = computeDungeonReward(type, best, grade);

    state.gold += reward.gold;
    state.tickets.heroes += reward.heroTickets;
    state.tickets.pets += reward.petTickets;
    state.tickets.skills += reward.skillTickets;

    const gradeKo = grade === "perfect" ? "완벽 클리어" : grade === "clear" ? "클리어" : "실패";
    const rewardText = [
      reward.gold > 0 ? `Gold +${fmt(reward.gold)}` : "",
      reward.heroTickets > 0 ? `영웅권 +${reward.heroTickets}` : "",
      reward.petTickets > 0 ? `펫권 +${reward.petTickets}` : "",
      reward.skillTickets > 0 ? `스킬권 +${reward.skillTickets}` : ""
    ].filter(Boolean).join(" / ");

    log(`일일 ${dungeonName(type)} ${gradeKo} (${rewardText || "보상 없음"})`);
    runtime.roundBanner = `${dungeonName(type)} ${gradeKo}`;
    runtime.roundBannerTimer = 1.4;
    runtime.stagePulse = Math.max(runtime.stagePulse, 0.7);
    render();
  }

  function dungeonName(type) {
    if (type === "gold") return "골드 던전";
    if (type === "heroes") return "영웅 던전";
    if (type === "pets") return "펫 던전";
    return "스킬 던전";
  }

  function computeDungeonReward(type, bestStage, grade) {
    const mult = grade === "perfect" ? 1.55 : grade === "clear" ? 1 : 0;
    if (type === "gold") {
      const baseGold = Math.floor((Math.pow(bestStage, 1.24) * 1500) + 18000);
      return { gold: Math.floor(baseGold * mult), heroTickets: 0, petTickets: 0, skillTickets: 0 };
    }

    if (grade === "fail") {
      return { gold: 0, heroTickets: 0, petTickets: 0, skillTickets: 0 };
    }

    const baseTicket = Math.max(10, 10 + Math.floor(bestStage / 150));
    const bonus = grade === "perfect" ? 2 : 0;
    return {
      gold: Math.floor(10000 * mult),
      heroTickets: type === "heroes" ? baseTicket + bonus : 0,
      petTickets: type === "pets" ? baseTicket + bonus : 0,
      skillTickets: type === "skills" ? baseTicket + bonus : 0
    };
  }

  function todayKeyKST() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  }

  function claimDailyAttendance() {
    const day = todayKeyKST();
    if (!state.attendance) state.attendance = { lastClaimDay: "" };
    if (state.attendance.lastClaimDay === day) {
      log("오늘 일일출석체크보상은 이미 수령했습니다");
      render();
      return;
    }
    state.attendance.lastClaimDay = day;
    state.tickets.heroes += 100;
    state.tickets.pets += 100;
    state.tickets.skills += 100;
    log("일일출석체크보상 수령: 영웅/펫/스킬 티켓 +100");
    runtime.roundBanner = "출석 보상 수령!";
    runtime.roundBannerTimer = 1.3;
    render();
  }

  function resetDailyDungeonsIfNeeded() {
    if (!state.dungeons) return;
    const nowKey = todayKeyKST();
    if (state.dungeons.lastResetDay === nowKey) return;
    state.dungeons.lastResetDay = nowKey;
    state.dungeons.entries = { gold: 2, heroes: 2, pets: 2, skills: 2 };
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

  function getRarityRatesByLevel(level) {
    const t = (Math.max(1, Math.min(10, level)) - 1) / 9;
    const myth = lerp(0.00002, 0.001, t);
    const legend = lerp(0.0018, 0.006, t);
    const unique = lerp(0.02, 0.042, t);
    const epic = lerp(0.11, 0.185, t);
    const rare = lerp(0.33, 0.405, t);
    const common = Math.max(0, 1 - (myth + legend + unique + epic + rare));
    return { common, rare, epic, unique, legend, myth };
  }

  function rollRarityByLevel(level) {
    const { myth, legend, unique, epic, rare, common } = getRarityRatesByLevel(level);

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

  function getBossHpPercentDamageRate() {
    const stage = Math.max(1, Math.floor(Number(state.stage || 1)));
    const wave = Math.max(1, Math.floor(Number(state.wave || 1)));
    if (stage < 100) return 0;
    const over = stage - 100;
    return Math.min(0.15, 0.028 + over * 0.0009 + (wave - 1) * 0.004);
  }

  function heroTakeDamage(damage, label) {
    const reduction = getDefenseRate();
    const mitigated = damage * (1 - reduction);
    const minimum = Math.max(1, runtime.enemyAtk * 0.05);
    const hpPercentRate = getBossHpPercentDamageRate();
    const hpPercentDamage = getHeroMaxHp() * hpPercentRate;
    const finalDamage = Math.max(minimum, mitigated) + hpPercentDamage;
    setHeroHp(getHeroHp() - finalDamage);
    runtime.statusMsg = label;
    runtime.comboHits = 0;
    runtime.comboTimer = 0;
    runtime.dangerVignette = Math.min(1, runtime.dangerVignette + 0.55);
    floatText(`-${fmt(finalDamage)}`, 240, 120, "#ffb4b4");
    floatText(`HP% -${(hpPercentRate * 100).toFixed(2)}%`, 210, 140, "#ff9fc7");
    if (reduction > 0.02) {
      floatText(`BLOCK ${(reduction * 100).toFixed(1)}%`, 210, 98, "#8fd8ff");
    }
    burstParticles(250, 220, "#ffb4b4", 10);
    shake(0.12);
    if (getHeroHp() <= 0) onHeroDefeated();
  }

  function dealDamage(raw, source, byHero) {
    if (runtime.enemyHp <= 0 || getHeroHp() <= 0) return;

    const crit = Math.random() < getCritChance();
    let damage = raw * (crit ? getCritMul() : 1);
    const bossDefense = Math.max(0, Math.min(0.95, Number(runtime.enemyDefense || 0)));
    if (bossDefense > 0) {
      damage *= 1 - bossDefense;
      if (bossDefense >= 0.15) {
        floatText(`DEF ${(bossDefense * 100).toFixed(0)}%`, 760, 84, "#c1ddff");
      }
    }

    if (runtime.enemyShield > 0) {
      damage *= 1 - runtime.enemyShield;
      floatText("SHIELD", 760, 100, "#a4eaff");
    }

    runtime.enemyHp = Math.max(0, runtime.enemyHp - damage);
    runtime.statusMsg = crit ? `${source} 치명타` : `${source} 적중`;
    floatText(`-${fmt(damage)}`, 780, 125, crit ? "#ffe690" : "#dcf7ff");

    if (byHero) {
      runtime.hitFlash = 0.2;
      runtime.comboHits += 1;
      runtime.comboTimer = 2.2;
    }

    if (runtime.enemyHp <= 0) onEnemyDefeated();
  }

  function onEnemyDefeated() {
    state.kills += 1;

    const clearedStage = Math.max(1, Math.floor(Number(state.stage || 1)));
    const clearedWave = Math.max(1, Math.floor(Number(state.wave || 1)));

    const reward = runtime.enemyMaxHp * 0.15 * 2.5 * (1 + state.stage * 0.02);
    state.gold += reward;

    gainExp(18);

    grantMilestoneDungeonTickets(clearedStage, clearedWave);

    if (state.climbMode) {
      if (state.wave >= 10) {
        state.stage += 1;
        state.wave = 1;
        state.bestStage = Math.max(Number(state.bestStage || 1), state.stage);
        runtime.roundBanner = `STAGE ${state.stage} 진입`;
      } else {
        state.wave += 1;
        runtime.roundBanner = `${state.stage}-${state.wave} 도달`;
      }
      runtime.roundBannerTimer = 1.8;
      runtime.stagePulse = 1;
      runtime.statusMsg = `보스 처치! ${state.stage}-${state.wave}`;
      log(`등반 성공: ${state.stage}-${state.wave}`);
      burstParticles(790, 200, "#ffe59b", 34);
      shake(0.24);
    } else {
      runtime.statusMsg = `${state.stage}-${state.wave} 반복 사냥`;
      log(`반복 사냥: ${state.stage}-${state.wave}`);
    }

    scheduleNextEncounter(1.0, "다음 적 출현");
    emitStageProgress(true);
  }

  function grantMilestoneDungeonTickets(stage, wave) {
    if (wave !== 10) return;

    const keys = ["heroes", "pets", "skills"];
    const ticketPerRoll = 10;
    const gains = { heroes: 0, pets: 0, skills: 0 };
    for (let i = 0; i < 3; i += 1) {
      const pick = keys[Math.floor(Math.random() * keys.length)];
      gains[pick] += ticketPerRoll;
      state.tickets[pick] += ticketPerRoll;
    }

    const gainedText = [
      gains.heroes > 0 ? `영웅 던전 입장권 +${gains.heroes}` : "",
      gains.pets > 0 ? `펫 던전 입장권 +${gains.pets}` : "",
      gains.skills > 0 ? `스킬 던전 입장권 +${gains.skills}` : ""
    ].filter(Boolean).join(" / ");

    log(`${stage}-${wave} 클리어 보상: ${gainedText}`);
    runtime.roundBanner = `${stage}-${wave} 클리어 보상`;
    runtime.roundBannerTimer = Math.max(runtime.roundBannerTimer, 1.8);
  }

  function onBossTimeout() {
    state.bossFailCount += 1;
    state.climbMode = false;
    state.wave = Math.max(1, state.wave - 1);
    runtime.statusMsg = "보스 제한시간 초과";
    runtime.roundBanner = `BOSS FAIL - ${state.stage}-${state.wave} 복귀`;
    runtime.roundBannerTimer = 1.5;
    log(`보스 제한시간 실패: ${state.stage}-${state.wave} 반복 사냥`);
    burstParticles(780, 200, "#ff9cbc", 24);
    scheduleNextEncounter(1.0, "전투 재정비");
    emitStageProgress(true);
  }

  function onHeroDefeated() {
    runtime.statusMsg = "파티 전멸";
    runtime.roundBanner = "DEFEAT - 재정비";
    runtime.roundBannerTimer = 1.5;
    state.climbMode = false;
    state.wave = Math.max(1, state.wave - 1);
    log(`패배: ${state.stage}-${state.wave}로 후퇴, 반복 사냥`);
    scheduleNextEncounter(1.0, "파티 재정비");
    emitStageProgress(true);
  }

  function scheduleNextEncounter(delaySec, label) {
    recoverForNextRound();
    runtime.roundTransition = Math.max(0.2, Number(delaySec || 1));
    runtime.pendingRespawn = true;
    runtime.transitionLabel = label || "다음 전투 준비";
  }

  function spawnEnemy() {
    if (state.farmStage && !state.climbMode) {
      state.stage = state.farmStage;
    }

    runtime.projectiles = [];
    runtime.particles = [];
    runtime.enemyShield = 0;
    runtime.enemyDefense = 0;
    runtime.enemyShieldTimer = 0;
    runtime.patternTimer = 0;
    runtime.dotTimer = 0;
    runtime.dotTick = 0;
    runtime.stagePulse = Math.max(runtime.stagePulse, 0.52);

    runtime.isBoss = true;

    const bossModel = BOSS_MODELS[(state.stage + state.wave - 2) % BOSS_MODELS.length];
    runtime.enemyModel = bossModel;

    runtime.enemyName = `${bossModel.name} ${state.stage}-${state.wave}`;
    runtime.enemyKind = bossModel.key;
    runtime.bossTimerMax = 25;
    runtime.bossTimer = runtime.bossTimerMax;

    if (state.stage <= 10) {
      // Beginner zone: force-clear friendly tuning through stage 10-10.
      const stagePow = Math.pow(state.stage, 1.2);
      const waveRamp = 1 + (state.wave - 1) * 0.09;
      const bossMul = 1.1 + state.wave * 0.08;
      runtime.enemyMaxHp = Math.max(70, Math.floor((70 + stagePow * 12) * waveRamp * bossMul));
      runtime.enemyHp = runtime.enemyMaxHp;
      runtime.enemyDefense = Math.min(0.82, 0.36 + state.stage * 0.032 + (state.wave - 1) * 0.024);

      runtime.enemyAtk = Math.max(4, (6 + Math.pow(state.stage, 1.08) * 1.35) * (1 + state.wave * 0.05));
      runtime.enemyAtkInterval = Math.max(1.15, 1.62 - state.wave * 0.02);
      return;
    }

    const stagePow = Math.pow(state.stage, 1.95);
    const stageRamp = Math.pow(1.018, Math.max(0, state.stage - 1));
    const waveRamp = Math.pow(1.22, Math.max(0, state.wave - 1));
    const bossMul = 3.2 + state.wave * 0.22;

    runtime.enemyMaxHp = Math.max(260, Math.floor((240 + stagePow * 42) * stageRamp * waveRamp * bossMul));
    runtime.enemyHp = runtime.enemyMaxHp;
    runtime.enemyDefense = Math.min(0.95, 0.62 + Math.max(0, state.stage - 11) * 0.01 + (state.wave - 1) * 0.035);

    const atkStagePow = Math.pow(state.stage, 1.52);
    const atkRamp = Math.pow(1.012, Math.max(0, state.stage - 1));
    runtime.enemyAtk = Math.max(18, (22 + atkStagePow * 6.4) * atkRamp * (1.45 + state.wave * 0.18));
    if (state.stage >= 100) {
      const over = state.stage - 100;
      const lateStageMul = 1.8 + Math.min(3.4, over * 0.035) + (state.wave - 1) * 0.09;
      runtime.enemyAtk *= lateStageMul;
    }
    runtime.enemyAtkInterval = Math.max(0.82, 1.38 - state.wave * 0.03);
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
    runtime.inventoryUiDirty = true;
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

  function getCollectionStarTotal(type) {
    const inv = state.inventories[type] || {};
    return Object.values(inv).reduce((sum, row) => {
      const star = Math.max(1, Math.floor(Number(row?.star || 1)));
      return sum + star;
    }, 0);
  }

  function getCollectionPassive() {
    const heroStars = getCollectionStarTotal("heroes");
    const petStars = getCollectionStarTotal("pets");
    const skillStars = getCollectionStarTotal("skills");

    return {
      heroStars,
      petStars,
      skillStars,
      heroAtk: Math.min(2.5, heroStars * 0.0035),
      heroHp: Math.min(9.5, heroStars * 0.012),
      petSpd: Math.min(1.1, petStars * 0.0025),
      petCrit: Math.min(0.35, petStars * 0.00075),
      skillBurst: Math.min(2.2, skillStars * 0.004),
      skillCdCut: Math.min(0.45, skillStars * 0.0012)
    };
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
    const passive = getCollectionPassive();

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
    return heroPower * (1 + petBuff.atk) * account * (1 + passive.heroAtk);
  }

  function getAttackSpeed() {
    const heroes = state.equipped.heroes.filter(Boolean);
    if (!heroes.length) return 0.4;
    const passive = getCollectionPassive();

    let speed = 0;
    heroes.forEach((id) => {
      const hero = findById(HERO_POOL, id);
      const inv = state.inventories.heroes[id];
      if (!hero || !inv) return;
      const rarity = rarityByKey(hero.rarity).mult;
      speed += hero.baseSpd * (1 + (inv.level - 1) * 0.02) * (1 + (inv.star - 1) * 0.04) * Math.sqrt(rarity);
    });

    const avg = speed / heroes.length;
    return avg * (1 + getPetBuff().spd) * (1 + passive.petSpd);
  }

  function getCritChance() {
    const pet = getPetBuff();
    const passive = getCollectionPassive();
    return Math.min(0.85, 0.05 + pet.crit + passive.petCrit);
  }

  function getDefenseRate() {
    const heroes = state.equipped.heroes.filter(Boolean);
    const pets = state.equipped.pets.filter(Boolean);
    const skills = state.equipped.skills.filter(Boolean);

    let defensePower = 0;

    heroes.forEach((id) => {
      const hero = findById(HERO_POOL, id);
      const inv = state.inventories.heroes[id];
      if (!hero || !inv) return;
      const rarity = rarityByKey(hero.rarity).mult;
      defensePower += hero.baseHp * 0.19 * rarity * (1 + (inv.level - 1) * 0.11) * (1 + (inv.star - 1) * 0.22);
    });

    pets.forEach((id) => {
      const pet = findById(PET_POOL, id);
      const inv = state.inventories.pets[id];
      if (!pet || !inv) return;
      const rarity = rarityByKey(pet.rarity).mult;
      defensePower += (pet.spdAmp * 1100 + pet.critAmp * 1300) * rarity * (1 + (inv.level - 1) * 0.1) * (1 + (inv.star - 1) * 0.15);
    });

    skills.forEach((id) => {
      const inv = state.inventories.skills[id];
      if (!inv) return;
      defensePower += 44 * inv.level + 68 * (inv.star - 1);
    });

    defensePower *= 1 + (state.accountLv - 1) * 0.026;
    const mitigation = defensePower / (defensePower + runtime.enemyAtk * 1.75 + 95);
    return Math.max(0, Math.min(0.93, mitigation));
  }

  function getHpRegenPerSec() {
    const heroCount = state.equipped.heroes.filter(Boolean).length;
    const petCount = state.equipped.pets.filter(Boolean).length;
    const skillCount = state.equipped.skills.filter(Boolean).length;
    const base = 0.004;
    const byParty = heroCount * 0.0007 + petCount * 0.0011 + skillCount * 0.0008;
    const byAccount = Math.max(0, state.accountLv - 1) * 0.0002;
    return Math.min(0.022, base + byParty + byAccount);
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
    if (!heroes.length) return 320;
    const passive = getCollectionPassive();

    let hp = 0;
    heroes.forEach((id) => {
      const hero = findById(HERO_POOL, id);
      const inv = state.inventories.heroes[id];
      if (!hero || !inv) return;
      const rarity = rarityByKey(hero.rarity).mult;
      hp += hero.baseHp * rarity * (1 + (inv.level - 1) * 0.35) * (1 + (inv.star - 1) * 0.62);
    });

    const globalHpBoost = 4.2;
    return hp * globalHpBoost * (1 + (state.accountLv - 1) * 0.11) * (1 + passive.heroHp);
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
    const reward = getOfflineIncomePerSec() * clamped;
    state.pendingOfflineGold = Number(state.pendingOfflineGold || 0) + reward;
    state.lastSave = now;
    state.heroHp = getHeroMaxHp();
    return reward;
  }

  function getOfflineIncomePerSec() {
    return getTeamPower() * getAttackSpeed() * 0.28 * getOfflineStageMultiplier();
  }

  function getOfflineStageMultiplier() {
    const stage = Math.max(1, Math.floor(Number(state.stage || 1)));
    const wave = Math.max(1, Math.floor(Number(state.wave || 1)));
    return 1 + (stage - 1) * 0.18 + Math.floor((stage - 1) / 10) * 0.6 + (wave - 1) * 0.03;
  }

  function summonMetaText(type) {
    const s = state.summon[type];
    const lvl = Math.max(1, Math.min(10, Number(s.level || 1)));
    const draws = Math.max(0, Number(s.draws || 0));
    const nextNeed = lvl >= 10 ? 0 : (lvl * 100) - draws;
    const rates = getRarityRatesByLevel(lvl);
    const ticket = Math.max(0, Math.floor(Number(state.tickets[type] || 0)));
    return `Lv.${lvl} | 누적 ${draws}회 | ${lvl >= 10 ? "MAX" : `다음 Lv까지 ${Math.max(0, nextNeed)}회`} | 뽑기권 ${ticket}장 | 신화 ${(rates.myth * 100).toFixed(3)}% · 전설 ${(rates.legend * 100).toFixed(2)}% · 유니크 ${(rates.unique * 100).toFixed(2)}%`;
  }

  function dungeonMetaText(type) {
    const left = Math.max(0, Number(state.dungeons.entries[type] || 0));
    const best = Math.max(1, Math.floor(Number(state.bestStage || state.stage || 1)));
    const perfect = computeDungeonReward(type, best, "perfect");
    const reward = type === "gold"
      ? `최대 Gold +${fmt(perfect.gold)}`
      : `최대 ${type === "heroes" ? "영웅권" : type === "pets" ? "펫권" : "스킬권"} +${type === "heroes" ? perfect.heroTickets : type === "pets" ? perfect.petTickets : perfect.skillTickets}`;
    return `남은 횟수 ${left}/2 | ${reward}`;
  }

  function resetRuntime() {
    runtime.attackTimer = 0;
    runtime.enemyAttackTimer = 0;
    runtime.skillCooldowns = [0, 0, 0, 0];
    runtime.bossTimerMax = 25;
    runtime.particles = [];
    runtime.projectiles = [];
    runtime.floatTexts = [];
    runtime.roundTransition = 0;
    runtime.pendingRespawn = false;
    runtime.transitionLabel = "";
    runtime.summonResultRows = [];
    runtime.inventoryUiDirty = true;
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
    if (!state.tickets) state.tickets = { heroes: 0, pets: 0, skills: 0 };
    if (!state.attendance) state.attendance = { lastClaimDay: "" };
    if (!state.dungeons) {
      state.dungeons = { lastResetDay: "", entries: { gold: 2, heroes: 2, pets: 2, skills: 2 } };
    }
    if (!state.dungeons.entries) state.dungeons.entries = { gold: 2, heroes: 2, pets: 2, skills: 2 };

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
    if (typeof state.climbMode !== "boolean") state.climbMode = true;
    state.tickets.heroes = Math.max(0, Math.floor(Number(state.tickets.heroes || 0)));
    state.tickets.pets = Math.max(0, Math.floor(Number(state.tickets.pets || 0)));
    state.tickets.skills = Math.max(0, Math.floor(Number(state.tickets.skills || 0)));
    ["gold", "heroes", "pets", "skills"].forEach((k) => {
      state.dungeons.entries[k] = Math.max(0, Math.floor(Number(state.dungeons.entries[k] ?? 2)));
    });
    resetDailyDungeonsIfNeeded();
    state.wave = Math.max(1, Math.min(10, Math.floor(Number(state.wave || 1))));

    if (!Number.isFinite(Number(state.bestStage))) {
      state.bestStage = Math.max(1, Number(state.stage || 1));
    } else {
      state.bestStage = Math.max(1, Math.floor(Number(state.bestStage)));
    }
    state.bestStage = Math.max(state.bestStage, Math.floor(Number(state.stage || 1)));

    if (!state.heroHp || Number.isNaN(state.heroHp)) state.heroHp = getHeroMaxHp();
    state.heroHp = Math.min(state.heroHp, getHeroMaxHp());
    if (!Number.isFinite(Number(state.pendingOfflineGold))) state.pendingOfflineGold = 0;
    state.pendingOfflineGold = Math.max(0, Number(state.pendingOfflineGold));
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

  function hashString(input) {
    const s = String(input || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seedFloat(seed, offset) {
    const x = Math.sin((seed + offset * 101) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function starText(star) {
    const n = Math.max(1, Math.min(10, Math.floor(Number(star || 1))));
    const filled = Math.max(0, Math.min(5, n - 5));
    const normal = n <= 5 ? n : 10 - n;
    return `<span class="star-tier"><span class="tier-num">${n}성</span><span class="tier-stars"><span class="normal">${"★".repeat(normal)}</span><span class="fill">${"★".repeat(filled)}</span></span></span>`;
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
    if (runtime.skillFx > 0) drawSkillEffect(w, h, runtime.skillColor, runtime.skillFx, state.equipped.skills);

    drawProjectiles();
    drawParticles();
    drawFloatTexts();
    drawComboHud(w, h);
    drawBossWarning(w, h, t);
    drawRoundBanner(w, h, t);
    drawStageBadge(w, h, t);

    if (runtime.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 242, 196, ${runtime.hitFlash * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
    drawDamageVignette(w, h, t);

    ctx.restore();
  }

  function drawBackground(w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2b4f83");
    sky.addColorStop(1, "#131d35");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const moon = ctx.createRadialGradient(w * 0.82, 72, 2, w * 0.82, 72, 90);
    moon.addColorStop(0, "rgba(220, 240, 255, 0.9)");
    moon.addColorStop(1, "rgba(220, 240, 255, 0)");
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(w * 0.82, 72, 90, 0, Math.PI * 2);
    ctx.fill();

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

    for (let i = 0; i < 4; i += 1) {
      const fx = ((i * 300) + t * (8 + i * 1.8)) % (w + 240) - 240;
      const fog = ctx.createLinearGradient(0, h - 220, 0, h - 70);
      fog.addColorStop(0, "rgba(166, 213, 255, 0)");
      fog.addColorStop(1, "rgba(166, 213, 255, 0.12)");
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.ellipse(fx, h - 106 - i * 6, 130, 44, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const ground = ctx.createLinearGradient(0, h - 112, 0, h);
    ground.addColorStop(0, "#1f4f46");
    ground.addColorStop(1, "#0f2f2b");
    ctx.fillStyle = ground;
    ctx.fillRect(0, h - 112, w, 112);

    if (runtime.stagePulse > 0) {
      ctx.fillStyle = `rgba(255, 227, 154, ${runtime.stagePulse * 0.1})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawHero(x, y, hero, attacking) {
    const seed = hashString(hero.id || hero.name || "hero");
    const f1 = seedFloat(seed, 1);
    const f2 = seedFloat(seed, 2);
    const f3 = seedFloat(seed, 3);
    ctx.save();
    ctx.translate(x, y);

    const aura = ctx.createRadialGradient(0, -18, 8, 0, -18, 44 + f1 * 16);
    aura.addColorStop(0, hexToRgba(hero.accent, 0.45));
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -18, 44 + f1 * 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hexToRgba(hero.accent, 0.95);
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

    // Shoulder plates for silhouette variety.
    ctx.fillStyle = hexToRgba(shadeColor(hero.color, -24), 0.95);
    ctx.beginPath();
    ctx.moveTo(-18, -24);
    ctx.lineTo(-4, -20 - f2 * 6);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    ctx.moveTo(18, -24);
    ctx.lineTo(4, -20 - f3 * 6);
    ctx.lineTo(12, -5);
    ctx.closePath();
    ctx.fill();

    // Emblem by id hash.
    ctx.fillStyle = hexToRgba(hero.accent, 0.85);
    if ((seed % 3) === 0) {
      ctx.fillRect(-4, -20, 8, 8);
    } else if ((seed % 3) === 1) {
      ctx.beginPath();
      ctx.arc(0, -16, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -23);
      ctx.lineTo(5, -14);
      ctx.lineTo(-5, -14);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = hexToRgba(hero.accent, 0.95);
    ctx.lineWidth = 5;
    ctx.beginPath();
    const ex = attacking ? 58 : 38;
    const ey = attacking ? -68 : -45;
    ctx.moveTo(8, -22);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Weapon tip glow.
    ctx.fillStyle = hexToRgba(hero.accent, attacking ? 0.9 : 0.45);
    ctx.beginPath();
    ctx.arc(ex, ey, attacking ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fill();

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
    const seed = hashString(pet.id || pet.name || "pet");
    const mode = seed % 3;
    ctx.save();
    ctx.translate(x, y);

    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 30);
    glow.addColorStop(0, hexToRgba(pet.color, 0.95));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pet.color;
    if (mode === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.lineTo(-14, -14);
      ctx.lineTo(-3, -10);
      ctx.closePath();
      ctx.moveTo(8, -6);
      ctx.lineTo(14, -14);
      ctx.lineTo(3, -10);
      ctx.closePath();
      ctx.fill();
    } else if (mode === 1) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-3, -12, 6, 6);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(11, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-11, 0);
      ctx.closePath();
      ctx.fill();
    }

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
      const bossGrad = ctx.createLinearGradient(-36, -70, 36, 36);
      bossGrad.addColorStop(0, `hsl(${hue} 72% 64%)`);
      bossGrad.addColorStop(1, `hsl(${hue} 54% 28%)`);
      ctx.fillStyle = bossGrad;
      ctx.beginPath();
      ctx.arc(0, -60, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} 54% 30%)`;
      ctx.fillRect(-31, -35, 62, 66);

      // Boss unique ornaments.
      if (model.key === "ogre") {
        ctx.fillStyle = "#ffd9a5";
        ctx.fillRect(-24, -75, 10, 16);
        ctx.fillRect(14, -75, 10, 16);
      } else if (model.key === "lich") {
        ctx.fillStyle = "#d8b8ff";
        ctx.beginPath();
        ctx.arc(0, -77, 9, 0, Math.PI * 2);
        ctx.fill();
      } else if (model.key === "golem") {
        ctx.strokeStyle = "#9be8ff";
        ctx.lineWidth = 3;
        ctx.strokeRect(-25, -31, 50, 56);
      } else if (model.key === "wyrm") {
        ctx.fillStyle = "#ffb0dc";
        ctx.beginPath();
        ctx.moveTo(0, -40);
        ctx.lineTo(20, -6);
        ctx.lineTo(0, 12);
        ctx.lineTo(-20, -6);
        ctx.closePath();
        ctx.fill();
      }
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

  function drawSkillEffect(w, h, color, power, skillIds) {
    const ids = Array.isArray(skillIds) ? skillIds : [];
    const sig = hashString(ids.filter(Boolean).join("|") || "none");
    const mode = sig % 3;
    const cx = w * 0.72;
    const cy = h * 0.43;

    ctx.save();
    ctx.fillStyle = hexToRgba(color, Math.min(0.22, power * 0.3));
    ctx.beginPath();
    ctx.arc(cx, cy, 190 * power, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, (110 + i * 40) * power, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (mode === 0) {
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8 + power * 2.4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 50 * power, cy + Math.sin(a) * 50 * power);
        ctx.lineTo(cx + Math.cos(a) * 150 * power, cy + Math.sin(a) * 150 * power);
        ctx.stroke();
      }
    } else if (mode === 1) {
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx - 130 * power + i * 52 * power, cy - 100 * power);
        ctx.lineTo(cx - 90 * power + i * 52 * power, cy + 110 * power);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 155 * power);
      ctx.lineTo(cx + 140 * power, cy + 90 * power);
      ctx.lineTo(cx - 140 * power, cy + 90 * power);
      ctx.closePath();
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

  function drawComboHud(w, h) {
    if (runtime.comboHits < 2 || runtime.comboTimer <= 0) return;
    const alpha = Math.min(1, runtime.comboTimer / 1.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "700 24px 'JetBrains Mono'";
    ctx.fillStyle = "#ffe49a";
    ctx.fillText(`${runtime.comboHits} HIT`, w * 0.43, 58);
    ctx.font = "600 12px 'Pretendard'";
    ctx.fillStyle = "#cfe9ff";
    ctx.fillText("COMBO", w * 0.43, 76);
    ctx.restore();
  }

  function drawBossWarning(w, h, t) {
    if (!runtime.isBoss || runtime.bossTimer >= 8) return;
    const pulse = (Math.sin(t * 12) + 1) / 2;
    const a = 0.08 + pulse * 0.12;
    ctx.save();
    ctx.fillStyle = `rgba(255, 120, 120, ${a})`;
    ctx.fillRect(0, 0, w, h);
    ctx.font = "700 20px 'JetBrains Mono'";
    ctx.fillStyle = `rgba(255, 225, 205, ${0.65 + pulse * 0.35})`;
    ctx.fillText("BOSS TIME OUT WARNING", w - 360, 42);
    ctx.restore();
  }

  function drawRoundBanner(w, h, t) {
    if (runtime.roundBannerTimer <= 0 || !runtime.roundBanner) return;
    const life = Math.min(1, runtime.roundBannerTimer / 1.8);
    const y = 54 + Math.sin(t * 7) * 2;
    ctx.save();
    ctx.globalAlpha = life;
    const bw = 360;
    const bx = (w - bw) / 2;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, "rgba(14, 38, 72, 0.2)");
    grad.addColorStop(0.5, "rgba(36, 78, 132, 0.75)");
    grad.addColorStop(1, "rgba(14, 38, 72, 0.2)");
    ctx.fillStyle = grad;
    ctx.fillRect(bx, y - 24, bw, 36);
    ctx.strokeStyle = "rgba(207, 232, 255, 0.8)";
    ctx.strokeRect(bx, y - 24, bw, 36);
    ctx.font = "700 16px 'JetBrains Mono'";
    ctx.fillStyle = "#eaf4ff";
    ctx.fillText(runtime.roundBanner, bx + 16, y);
    ctx.restore();
  }

  function drawStageBadge(w, h, t) {
    const bounce = Math.sin(t * 3.7) * 1.5;
    ctx.save();
    ctx.fillStyle = "rgba(10, 29, 52, 0.72)";
    ctx.fillRect(18, 14 + bounce, 156, 42);
    ctx.strokeStyle = "rgba(168, 214, 255, 0.75)";
    ctx.strokeRect(18, 14 + bounce, 156, 42);
    ctx.font = "700 13px 'JetBrains Mono'";
    ctx.fillStyle = "#9fd5ff";
    ctx.fillText("HUNT ZONE", 30, 32 + bounce);
    ctx.font = "700 16px 'JetBrains Mono'";
    ctx.fillStyle = "#e9f5ff";
    ctx.fillText(`${state.stage}-${state.wave}`, 30, 50 + bounce);
    ctx.restore();
  }

  function drawDamageVignette(w, h, t) {
    if (runtime.dangerVignette <= 0) return;
    const pulse = (Math.sin(t * 18) + 1) / 2;
    const a = runtime.dangerVignette * (0.12 + pulse * 0.08);
    ctx.save();
    const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.65);
    g.addColorStop(0, "rgba(255, 130, 130, 0)");
    g.addColorStop(1, `rgba(255, 96, 96, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function currentHeroAccent() {
    const first = state.equipped.heroes.find(Boolean);
    if (!first) return "#d4ebff";
    return findById(HERO_POOL, first).accent;
  }

  function render() {
    resetDailyDungeonsIfNeeded();

    const heroHp = getHeroHp();
    const heroMaxHp = getHeroMaxHp();
    const enemyRatio = runtime.enemyMaxHp > 0 ? runtime.enemyHp / runtime.enemyMaxHp : 0;

    el.gold.textContent = fmt(state.gold);
    el.stage.textContent = `${state.stage}-${state.wave}`;
    el.power.textContent = fmt(getTeamPower() * getAttackSpeed());
    el.summonLevels.textContent = `H${state.summon.heroes.level}/P${state.summon.pets.level}/S${state.summon.skills.level}`;

    el.battleStatus.textContent = runtime.statusMsg;
    el.offlineReward.textContent = `오프라인 보상: ${fmt(state.pendingOfflineGold)} Gold (+${fmt(getOfflineIncomePerSec())}/s, x${getOfflineStageMultiplier().toFixed(2)})`;
    el.heroLabel.textContent = "파티 HP";
    el.enemyName.textContent = runtime.isBoss ? `[BOSS] ${runtime.enemyName}` : runtime.enemyName;

    el.heroHpFill.style.width = `${(heroHp / heroMaxHp) * 100}%`;
    el.heroHpText.textContent = `${fmt(heroHp)} / ${fmt(heroMaxHp)}`;
    el.enemyHpFill.style.width = `${Math.max(0, Math.min(1, enemyRatio)) * 100}%`;
    el.enemyHpText.textContent = `${fmt(runtime.enemyHp)} / ${fmt(runtime.enemyMaxHp)}`;

    el.bossTimerBox.hidden = !runtime.isBoss;
    if (runtime.isBoss) {
      const maxTimer = Math.max(1, runtime.bossTimerMax || 25);
      const r = Math.max(0, runtime.bossTimer / maxTimer);
      el.bossTimeFill.style.width = `${r * 100}%`;
      el.bossTimerLabel.textContent = `보스 제한시간 ${runtime.bossTimer.toFixed(1)} / ${maxTimer.toFixed(1)}초`;
    }

    el.toggleAutoSkill.textContent = `자동 스킬: ${state.autoSkill ? "ON" : "OFF"}`;
    el.bossChallenge.textContent = state.climbMode ? "다음 보스 도전" : "보스 등반 재개";
    el.bossChallenge.disabled = state.climbMode || runtime.roundTransition > 0 || runtime.pendingRespawn;
    if (state.farmStage) {
      el.farmModeText.textContent = `현재 모드: Stage ${state.farmStage} 고정 반복 사냥 (${state.climbMode ? "등반" : "반복"})`;
    } else {
      el.farmModeText.textContent = `현재 모드: ${state.climbMode ? "등반 모드" : "반복 사냥 모드"}`;
    }
    if (document.activeElement !== el.farmStageInput) {
      el.farmStageInput.value = state.farmStage ? String(state.farmStage) : "";
    }

    el.costHero1.textContent = `티켓 1`;
    el.costHero10.textContent = `티켓 10`;
    el.costPet1.textContent = `티켓 1`;
    el.costPet10.textContent = `티켓 10`;
    el.costSkill1.textContent = `티켓 1`;
    el.costSkill10.textContent = `티켓 10`;

    el.summonHero1.disabled = state.tickets.heroes < 1;
    el.summonHero10.disabled = state.tickets.heroes < 10;
    el.summonPet1.disabled = state.tickets.pets < 1;
    el.summonPet10.disabled = state.tickets.pets < 10;
    el.summonSkill1.disabled = state.tickets.skills < 1;
    el.summonSkill10.disabled = state.tickets.skills < 10;
    if (el.summonHeroMeta) el.summonHeroMeta.textContent = summonMetaText("heroes");
    if (el.summonPetMeta) el.summonPetMeta.textContent = summonMetaText("pets");
    if (el.summonSkillMeta) el.summonSkillMeta.textContent = summonMetaText("skills");
    if (el.ticketHeroes) el.ticketHeroes.textContent = fmt(state.tickets.heroes);
    if (el.ticketPets) el.ticketPets.textContent = fmt(state.tickets.pets);
    if (el.ticketSkills) el.ticketSkills.textContent = fmt(state.tickets.skills);
    if (el.dailyResetText) el.dailyResetText.textContent = `일일 입장 초기화: 매일 00:00 (KST) | 오늘 키 ${state.dungeons.lastResetDay}`;
    if (el.dungeonGoldMeta) el.dungeonGoldMeta.textContent = dungeonMetaText("gold");
    if (el.dungeonHeroMeta) el.dungeonHeroMeta.textContent = dungeonMetaText("heroes");
    if (el.dungeonPetMeta) el.dungeonPetMeta.textContent = dungeonMetaText("pets");
    if (el.dungeonSkillMeta) el.dungeonSkillMeta.textContent = dungeonMetaText("skills");
    if (el.dungeonGoldBtn) el.dungeonGoldBtn.disabled = state.dungeons.entries.gold <= 0;
    if (el.dungeonHeroBtn) el.dungeonHeroBtn.disabled = state.dungeons.entries.heroes <= 0;
    if (el.dungeonPetBtn) el.dungeonPetBtn.disabled = state.dungeons.entries.pets <= 0;
    if (el.dungeonSkillBtn) el.dungeonSkillBtn.disabled = state.dungeons.entries.skills <= 0;
    if (el.dailyAttendanceBtn && el.dailyAttendanceStatus) {
      const day = todayKeyKST();
      const claimed = state.attendance && state.attendance.lastClaimDay === day;
      el.dailyAttendanceBtn.disabled = claimed;
      el.dailyAttendanceStatus.textContent = claimed
        ? `오늘 보상 수령 완료 (${day})`
        : `오늘 보상 미수령 (${day})`;
    }

    el.skillSlotList.innerHTML = state.equipped.skills.map((id, i) => {
      if (!id) {
        return `<article class="skill-cd-item"><p>${i + 1}번 슬롯</p><strong>비어있음</strong></article>`;
      }
      const s = findById(SKILL_POOL, id);
      const cd = runtime.skillCooldowns[i];
      return `<article class="skill-cd-item"><p>${i + 1}. ${s.name}</p><strong>${cd > 0 ? `${cd.toFixed(1)}s` : "READY"}</strong></article>`;
    }).join("");

    if (runtime.inventoryUiDirty) {
      renderSlots("heroes", el.heroSlots);
      renderSlots("pets", el.petSlots);
      renderSlots("skills", el.skillSlots);

      renderCollection("heroes", el.heroCollection);
      renderCollection("pets", el.petCollection);
      renderCollection("skills", el.skillCollection);
      runtime.inventoryUiDirty = false;
    }

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
    const passive = getCollectionPassive();

    el.statList.innerHTML = [
      `파티 구성 <strong>H${heroes}/P${pets}/S${skills}</strong>`,
      `공격속도 <strong>${getAttackSpeed().toFixed(2)}/s</strong>`,
      `방어율 <strong>${(getDefenseRate() * 100).toFixed(2)}%</strong>`,
      `HP재생 <strong>${(getHpRegenPerSec() * 100).toFixed(2)}%/s</strong>`,
      `치명타 <strong>${(getCritChance() * 100).toFixed(2)}%</strong>`,
      `치명 배율 <strong>x${getCritMul().toFixed(2)}</strong>`,
      `누적 처치 <strong>${fmt(state.kills)}</strong>`,
      `계정 레벨 <strong>Lv.${state.accountLv}</strong>`,
      `뽑기 레벨 <strong>H${state.summon.heroes.level}/P${state.summon.pets.level}/S${state.summon.skills.level}</strong>`,
      `뽑기횟수(영웅) <strong>${state.summon.heroes.draws}</strong>`,
      `뽑기횟수(펫) <strong>${state.summon.pets.draws}</strong>`,
      `뽑기횟수(스킬) <strong>${state.summon.skills.draws}</strong>`,
      `보유 성급합 <strong>H${passive.heroStars}/P${passive.petStars}/S${passive.skillStars}</strong>`,
      `보유효과(영웅) <strong>공격 +${(passive.heroAtk * 100).toFixed(2)}% / HP +${(passive.heroHp * 100).toFixed(2)}%</strong>`,
      `보유효과(펫) <strong>공속 +${(passive.petSpd * 100).toFixed(2)}% / 치명 +${(passive.petCrit * 100).toFixed(2)}%</strong>`,
      `보유효과(스킬) <strong>피해 +${(passive.skillBurst * 100).toFixed(2)}% / 쿨감 ${(passive.skillCdCut * 100).toFixed(2)}%</strong>`,
      `보유권(영웅/펫/스킬) <strong>${state.tickets.heroes}/${state.tickets.pets}/${state.tickets.skills}</strong>`,
      `오프라인/s <strong>${fmt(getOfflineIncomePerSec())}</strong>`,
      `오프라인 배율 <strong>x${getOfflineStageMultiplier().toFixed(2)}</strong>`
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
        runtime.inventoryUiDirty = true;
        render();
      });
    });

    host.querySelectorAll("button[data-clear-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-clear-slot"));
        state.equipped[type][idx] = null;
        runtime.inventoryUiDirty = true;
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
