(() => {
  const SAVE_KEY = "idleGrowerStandaloneV3";
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
    bossFailCount: 0,
    lastSave: Date.now()
  };

  const state = load();

  const runtime = {
    enemyName: "",
    enemyMaxHp: 0,
    enemyHp: 0,
    enemyAtk: 0,
    enemyAtkInterval: 1.7,
    isBoss: false,
    attackTimer: 0,
    enemyAttackTimer: 0,
    skillCd: 0,
    bossTimer: 30,
    statusMsg: "전투 시작",
    lastLog: "자동 전투 진행중...",
    heroAttackFx: 0,
    enemyAttackFx: 0,
    hitFlash: 0,
    floatTexts: []
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
    heroHpFill: byId("hero-hp-fill"),
    heroHpText: byId("hero-hp-text"),
    enemyName: byId("enemy-name"),
    enemyHpFill: byId("enemy-hp-fill"),
    enemyHpText: byId("enemy-hp-text"),
    bossTimerBox: byId("boss-timer-box"),
    bossTimerLabel: byId("boss-timer-label"),
    bossTimeFill: byId("boss-time-fill"),
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
  setInterval(() => save(), 12000);
  window.addEventListener("beforeunload", () => save());

  requestAnimationFrame(drawFrame);
  render();

  function byId(id) {
    return document.getElementById(id);
  }

  function createBaseState() {
    return { ...base, lastSave: Date.now() };
  }

  function bindEvents() {
    el.manualHit.addEventListener("click", () => {
      runtime.heroAttackFx = 0.22;
      dealDamage(getTapDamage(), "강타", true);
    });

    el.skillBtn.addEventListener("click", () => castSkill(false));

    el.toggleAutoSkill.addEventListener("click", () => {
      state.autoSkill = !state.autoSkill;
      render();
    });

    el.nextStage.addEventListener("click", () => {
      state.wave = 10;
      runtime.statusMsg = `Stage ${state.stage} 보스 도전`;
      log("보스 즉시 도전 시작");
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
      save();
      log("수동 저장 완료");
      render();
    });

    el.resetBtn.addEventListener("click", () => {
      if (!window.confirm("정말 초기화할까요?")) return;
      localStorage.removeItem(SAVE_KEY);
      Object.assign(state, createBaseState());
      runtime.skillCd = 0;
      runtime.attackTimer = 0;
      runtime.enemyAttackTimer = 0;
      runtime.floatTexts = [];
      spawnEnemy();
      save();
      log("초기화 완료");
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

    const atkInterval = 1 / Math.max(0.35, getAtkSpeed());
    if (runtime.attackTimer >= atkInterval) {
      runtime.attackTimer -= atkInterval;
      runtime.heroAttackFx = 0.19;
      dealDamage(getAutoAttackDamage(), "자동 공격", false);
    }

    if (runtime.enemyAttackTimer >= runtime.enemyAtkInterval) {
      runtime.enemyAttackTimer -= runtime.enemyAtkInterval;
      enemyAttack();
    }

    if (runtime.isBoss) {
      runtime.bossTimer = Math.max(0, runtime.bossTimer - dt);
      if (runtime.bossTimer <= 0 && runtime.enemyHp > 0) {
        onBossTimeout();
      }
    }

    if (state.autoSkill && runtime.skillCd <= 0) {
      castSkill(true);
    }

    updateFloatTexts(dt);
    render();
  }

  function castSkill(isAuto) {
    if (runtime.skillCd > 0) return;
    runtime.heroAttackFx = 0.3;
    const dmg = getPower() * state.skillMul;
    runtime.skillCd = Math.max(2.4, 8 - state.skillLv * 0.32);
    dealDamage(dmg, isAuto ? "자동 스킬" : "그림자 폭풍", true);
  }

  function dealDamage(rawDamage, source, byHero) {
    if (runtime.enemyHp <= 0 || getHeroHp() <= 0) return;

    const crit = Math.random() < state.critChance;
    const dmg = rawDamage * (crit ? state.critMul : 1);
    runtime.enemyHp = Math.max(0, runtime.enemyHp - dmg);
    runtime.statusMsg = crit ? `${source} 치명타!` : `${source} 적중`;
    addFloatText(`-${fmt(dmg)}`, 690, 120, crit ? "#ffd46f" : "#d1f0ff");

    if (byHero) {
      runtime.hitFlash = 0.25;
    }

    if (runtime.enemyHp <= 0) {
      onEnemyDefeated();
    }
  }

  function enemyAttack() {
    if (runtime.enemyHp <= 0) return;
    runtime.enemyAttackFx = 0.22;

    const dodgeChance = Math.min(0.22, state.companionLv * 0.003);
    if (Math.random() < dodgeChance) {
      runtime.statusMsg = "회피!";
      addFloatText("DODGE", 235, 120, "#9ff5cf");
      return;
    }

    const damage = runtime.enemyAtk * (0.85 + Math.random() * 0.3);
    const hpAfter = Math.max(0, getHeroHp() - damage);
    setHeroHp(hpAfter);
    addFloatText(`-${fmt(damage)}`, 235, 120, "#ffb0b0");
    runtime.statusMsg = "적의 공격";

    if (hpAfter <= 0) {
      onHeroDefeated();
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
      log("보스 토벌 성공! 다음 스테이지 진입");
    } else {
      state.wave += 1;
      if (state.wave > 10) state.wave = 10;
      runtime.statusMsg = `적 처치! Wave ${state.wave}`;
    }

    healHero(0.15);
    spawnEnemy();
  }

  function onBossTimeout() {
    state.bossFailCount += 1;
    state.wave = 9;
    runtime.statusMsg = "보스 제한시간 초과";
    log("보스 제한시간 실패: 스테이지 상승 실패");
    healHero(1);
    spawnEnemy();
  }

  function onHeroDefeated() {
    runtime.statusMsg = "영웅이 쓰러졌습니다";
    log("패배: 현재 스테이지에서 재정비");
    state.wave = Math.max(1, state.wave - 1);
    setHeroHp(getHeroMaxHp());
    spawnEnemy();
  }

  function spawnEnemy() {
    runtime.isBoss = state.wave >= 10;

    if (runtime.isBoss) {
      runtime.enemyName = BOSS_NAMES[(state.stage - 1) % BOSS_NAMES.length];
      runtime.bossTimer = 30;
    } else {
      runtime.enemyName = `${ENEMIES[(state.wave + state.stage) % ENEMIES.length]} ${state.wave}`;
      runtime.bossTimer = 0;
    }

    const stagePow = Math.pow(state.stage, 1.5);
    const waveMul = 1 + state.wave * 0.24;
    const bossMul = runtime.isBoss ? 4.4 : 1;

    runtime.enemyMaxHp = Math.max(25, Math.floor((30 + stagePow * 12) * waveMul * bossMul));
    runtime.enemyHp = runtime.enemyMaxHp;
    runtime.enemyAtk = Math.max(2, (2.8 + stagePow * 1.8) * (runtime.isBoss ? 2.1 : 1));
    runtime.enemyAtkInterval = runtime.isBoss ? 1.45 : 1.9;
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
      log("동료 강화 완료");
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
      if (state.gold < costs.refineGold || state.soul < costs.refineSoul) {
        log("Gold 또는 Soul 부족");
        return;
      }
      state.gold -= costs.refineGold;
      state.soul -= costs.refineSoul;
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

  function getHeroMaxHp() {
    return 120 + state.heroLv * 26 + state.refineLv * 40;
  }

  function getHeroHp() {
    if (typeof state.heroHp !== "number") {
      state.heroHp = getHeroMaxHp();
    }
    return state.heroHp;
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

  function getTapDamage() {
    return getPower() * 1.5;
  }

  function getAtkSpeed() {
    return state.atkSpeed;
  }

  function applyOfflineReward() {
    const now = Date.now();
    const elapsedSec = Math.max(0, Math.floor((now - Number(state.lastSave || now)) / 1000));
    const clamped = Math.min(MAX_OFFLINE_SECONDS, elapsedSec);
    const offlineDps = getPower() * getAtkSpeed() * 0.52;
    const reward = offlineDps * clamped;
    state.gold += reward;
    state.lastSave = now;
    setHeroHp(getHeroMaxHp());
    return reward;
  }

  function save() {
    state.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        return createBaseState();
      }
      const data = JSON.parse(raw);
      return {
        ...createBaseState(),
        ...data
      };
    } catch {
      return createBaseState();
    }
  }

  function addFloatText(text, x, y, color) {
    runtime.floatTexts.push({ text, x, y, vy: 24, life: 0.8, color });
    if (runtime.floatTexts.length > 18) runtime.floatTexts.shift();
  }

  function updateFloatTexts(dt) {
    runtime.floatTexts = runtime.floatTexts
      .map((f) => ({ ...f, y: f.y - f.vy * dt, life: f.life - dt }))
      .filter((f) => f.life > 0);
  }

  function drawFrame(ts) {
    drawScene(ts / 1000);
    requestAnimationFrame(drawFrame);
  }

  function drawScene(t) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#304d7a");
    sky.addColorStop(1, "#1a243d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(33, 71, 52, 0.7)";
    ctx.fillRect(0, h - 95, w, 95);

    drawMountains(t, w, h);

    const heroX = 230 + (runtime.heroAttackFx > 0 ? 36 * (runtime.heroAttackFx / 0.22) : 0);
    const heroY = h - 110 + Math.sin(t * 5.2) * 2;
    const enemyX = 730 - (runtime.enemyAttackFx > 0 ? 24 * (runtime.enemyAttackFx / 0.22) : 0);
    const enemyY = h - 112 + Math.sin(t * 4.3 + 0.7) * 2;

    drawHero(heroX, heroY, runtime.heroAttackFx > 0);
    drawEnemy(enemyX, enemyY, runtime.isBoss, runtime.enemyAttackFx > 0);

    if (runtime.heroAttackFx > 0) drawSlash(heroX + 52, heroY - 35, "#d2fbff");
    if (runtime.enemyAttackFx > 0) drawSlash(enemyX - 45, enemyY - 35, "#ffb3c7");

    if (runtime.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 242, 196, ${runtime.hitFlash * 0.2})`;
      ctx.fillRect(0, 0, w, h);
    }

    drawFloatTexts();
  }

  function drawMountains(t, w, h) {
    ctx.fillStyle = "rgba(145, 177, 230, 0.25)";
    for (let i = 0; i < 6; i += 1) {
      const x = ((i * 190) + t * 8) % (w + 220) - 220;
      ctx.beginPath();
      ctx.moveTo(x, h - 95);
      ctx.lineTo(x + 90, h - 230);
      ctx.lineTo(x + 180, h - 95);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHero(x, y, attacking) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#6bc5ff";
    ctx.beginPath();
    ctx.arc(0, -50, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#203b63";
    ctx.fillRect(-13, -35, 26, 45);

    ctx.strokeStyle = "#d8f6ff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(4, -22);
    ctx.lineTo(attacking ? 48 : 25, attacking ? -58 : -38);
    ctx.stroke();

    ctx.strokeStyle = "#34587f";
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(-18, 42);
    ctx.moveTo(10, 10);
    ctx.lineTo(18, 42);
    ctx.stroke();

    ctx.restore();
  }

  function drawEnemy(x, y, boss, attacking) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = boss ? "#cf5f90" : "#a87967";
    ctx.beginPath();
    ctx.arc(0, -54, boss ? 24 : 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = boss ? "#6f2949" : "#4f352d";
    ctx.fillRect(boss ? -23 : -16, -34, boss ? 46 : 32, boss ? 55 : 42);

    ctx.strokeStyle = boss ? "#f8bfd0" : "#ffd0bf";
    ctx.lineWidth = boss ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(attacking ? -52 : -28, attacking ? -46 : -26);
    ctx.stroke();

    ctx.strokeStyle = "#41242d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, 20);
    ctx.lineTo(-20, 50);
    ctx.moveTo(10, 20);
    ctx.lineTo(20, 50);
    ctx.stroke();

    ctx.restore();
  }

  function drawSlash(x, y, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(x, y, 24, Math.PI * 0.15, Math.PI * 0.92);
    ctx.stroke();
    ctx.restore();
  }

  function drawFloatTexts() {
    runtime.floatTexts.forEach((f) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.8));
      ctx.fillStyle = f.color;
      ctx.font = "bold 20px 'JetBrains Mono'";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function render() {
    const costs = getCosts();
    const hpRatio = runtime.enemyMaxHp > 0 ? runtime.enemyHp / runtime.enemyMaxHp : 0;
    const heroHp = getHeroHp();
    const heroMaxHp = getHeroMaxHp();

    el.gold.textContent = fmt(state.gold);
    el.soul.textContent = fmt(state.soul);
    el.stage.textContent = `${state.stage}-${state.wave}`;
    el.power.textContent = fmt(getPower() * getAtkSpeed());

    el.battleStatus.textContent = runtime.statusMsg;
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
    el.skillInfo.textContent = runtime.skillCd > 0 ? `스킬 쿨다운 ${runtime.skillCd.toFixed(1)}초` : "스킬 준비 완료";

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
