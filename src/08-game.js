// ===================== GAME: state, combat resolution, healing, camera, render =====================
const COMBO_MSG = { 2: ['DOUBLE KILL', '#ffd23f'], 3: ['TRIPLE KILL', '#ff9a1f'], 5: ['RAMPAGE', '#ff4f5e'], 8: ['UNSTOPPABLE', '#ff4fd8'], 12: ['URBAN MAYHEM', '#2ef2ff'] };
const STREAKS = [
  { n: 5, label: '+XP BONUS', color: '#2ef2ff', apply: p => Game.addXp(4 + Game.wave) },
  { n: 10, label: 'FAST HANDS · RELOAD x2', color: '#ffd23f', apply: p => addBuff(p, 'streakReload', 5) },
  { n: 20, label: 'HOT BARREL · +25% FIRE RATE', color: '#ff9a1f', apply: p => { addBuff(p, 'streakFire', 5); Game.shake(8); FX.add(P_RING, p.x, p.y, 0, 0, 0.5, 200, '#ff9a1f', { lw: 8 }); } },
  { n: 35, label: 'MAYHEM', color: '#ff4fd8', apply: p => { if (Game.mayhemCd > 0) return false; addBuff(p, 'mayhem', 6); Game.mayhemCd = 40; Game.shake(14); FX.distort(p.x, p.y, 260); } },
];
const BUDGETED = new Set(['round', 'volatile', 'fire', 'impact']);
const Game = {
  state: 'menu', time: 0, wave: 1, kills: 0, combo: 0, comboT: 0, bestCombo: 0, comboMsg: null, bannerMsg: null, streakMsg: null,
  shakeAmt: 0, shakeX: 0, shakeY: 0, cam: { x: 0, y: 0 }, muzzle: null, hitstopT: 0, boss: null, bossCount: 0,
  pending: 0, xpFlash: 0, hurtFlash: 0, deathT: 0, levelFlash: 0, boomBudget: 8, chainCd: 0, mayhemCd: 0, blackout: 0, synMsg: null,
  streakDone: new Set(), runDisc: [],

  reset() {
    generateMap();
    player = newPlayer();
    enemies = []; corpses = []; timers.length = 0; nextEnemyId = 1;
    FX.reset(); Decals.reset(); Bullets.reset(); Pickups.reset(); Hazards.reset(); Decoys.reset(); Director.reset();
    Object.assign(this, { time: 0, wave: 1, kills: 0, combo: 0, comboT: 0, bestCombo: 0, comboMsg: null, bannerMsg: null, streakMsg: null, shakeAmt: 0, muzzle: null, hitstopT: 0, boss: null, bossCount: 0, pending: 0, xpFlash: 0, hurtFlash: 0, deathT: 0, levelFlash: 0, boomBudget: 8, chainCd: 0, mayhemCd: 0, blackout: 0, synMsg: null, runDisc: [] });
    this.streakDone = new Set();
    this.cam.x = player.x; this.cam.y = player.y;
    updateFlow(player.x, player.y, 1);
    for (let i = 0; i < 4; i++) { const pos = Director.findSpawn(player); if (pos) spawnEnemy('thug', pos[0], pos[1], 1); }
    Grid.build(enemies);
    this.banner('WAVE 1', '#2ef2ff');
  },
  shake(a) { this.shakeAmt = Math.min(26, Math.max(this.shakeAmt, a * Settings.shake)); },
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); },
  banner(text, color, sub) { this.bannerMsg = { text, color, sub, t: 2.4 }; },

  damageEnemy(e, dmg, ang, knock, crit, src, armor, width) {
    if (e.dead) return;
    if (armor === undefined) armor = src === 'burn' || src === 'fire' ? 0 : enemyArmor(e);
    dmg *= 1 - armor;
    e.hp -= dmg; e.flash = 0.07; e.squash = 1;
    const k = knock * (1 - (e.d.resist || 0));
    e.kvx += Math.cos(ang) * k; e.kvy += Math.sin(ang) * k;
    if (k > 0) e.twist = clamp(angDiff(e.a, ang) > 0 ? -k / 700 : k / 700, -0.6, 0.6);   // directional flinch
    const p = player; p.dmgDealt += dmg; p.combatT = 0;
    if (Settings.dmgNums) {
      const n = Math.round(dmg);
      if (crit) { FX.text(e.x, e.y - e.r - 6, n + '!', '#ffd23f', 22, { crit: true }); FX.add(P_RING, e.x, e.y, 0, 0, 0.2, 30, '#ffd23f', { lw: 3 }); }
      else if ((src !== 'fire' && src !== 'burn') || Math.random() < 0.25) FX.text(e.x, e.y - e.r - 6, n, src === 'fire' || src === 'burn' ? '#ff9a1f' : src === 'chain' ? '#9fe8ff' : armor > 0.2 ? '#c0c4d0' : '#ffffff', clamp(13 + Math.sqrt(dmg) * 1.1, 14, 26));
    }
    if (crit) Sound.crit();
    if (src === 'gun' || src === 'drone' || src === 'blade' || src === 'phantom') {
      FX.hitBurst(e.x - Math.cos(ang) * e.r * 0.5, e.y - Math.sin(ang) * e.r * 0.5, ang, e.d.col);
      if (src === 'gun') FX.weaponHit(e.x, e.y, ang, p.weapon, e.d.col);
      Sound.hit();
    }
    if (e.hp <= 0) {
      if (Settings.comic && src === 'gun' && (crit && dmg > 70 || p.weapon === 'shotgun' || p.weapon === 'heavy') && Math.random() < 0.12) FX.comic(e.x, e.y - 24, pick(['POW!', 'BLAM!', 'KRAK!', 'WHAM!', 'BOOM!']));
      killEnemy(e, ang, src);
    }
  },
  onKill(e, src) {
    const p = player, S = p.S;
    this.kills++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.5;
    if (this.combo === 1) this.streakDone.clear();
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const m = COMBO_MSG[this.combo] || (this.combo >= 20 && this.combo % 10 === 0 ? ['URBAN MAYHEM x' + this.combo / 10, '#2ef2ff'] : null);
    if (m) { this.comboMsg = { text: m[0], color: m[1], t: 1.3, n: this.combo }; Sound.combo(this.combo); }
    for (const s of STREAKS) if (this.combo >= s.n && !this.streakDone.has(s.n)) {
      this.streakDone.add(s.n);
      if (s.apply(p) !== false) { this.streakMsg = { text: s.label, color: s.color, t: 1.8 }; Sound.streak(STREAKS.indexOf(s)); }
    }
    if (S.vamp && p.hp < p.maxHp) {
      const want = 0.6 * S.vamp * (buff(p, 'bloodrush') ? 1.5 : 1), got = Math.min(want, p.vampBudget);
      p.vampBudget -= got; p.hp = Math.min(p.maxHp, p.hp + got);
    }
    if (S.adren) addBuff(p, 'adren', 1.5);
    if (S.syn.bloodrush) addBuff(p, 'bloodrush', 2);
    if (S.kinrec) p.dashCdT -= S.kinrec;
    if (S.overclock) {
      p.ocKills++;
      if (p.ocKills >= 35 - S.overclock * 5 && p.overclockT <= 0) { p.ocKills = 0; p.overclockT = 5; p.glowT = 5; p.glowCol = '#ff9a1f'; FX.text(p.x, p.y - 44, 'OVERCLOCK', '#ff9a1f', 24, { crit: true }); Sound.select(false); }
    }
    if (S.explosive && !BUDGETED.has(src) && src !== 'explosion' && Math.random() < 0.1 + S.explosive * 0.12)
      this.explosion(e.x, e.y, 85 + S.explosive * 14, (28 + S.explosive * 14) * S.dmgMul, 'round');
    if (e === this.boss) this.boss = null;
  },
  addXp(v) {
    const p = player;
    p.xp += v; p.xpTotal += v; p.xpPulse = 1;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed; p.level++; p.xpNeed = xpForLevel(p.level); this.pending++; this.xpFlash = 1;
      if (p.level % 6 === 0 && p.locks < 2) { p.locks++; FX.text(p.x, p.y - 56, '+1 LOCK', '#ffd23f', 14); }
      if (p.level % 7 === 0 && p.rerolls < 2) { p.rerolls++; FX.text(p.x, p.y - 70, '+1 REROLL', '#2ef2ff', 14); }
    }
  },
  heal(amount, source) {
    const p = player, S = p.S;
    if (source === 'medkit') {
      amount *= 1 + 0.25 * S.firstaid;
      if (S.trauma) addBuff(p, 'trauma', 5);
      if (S.syn.surgeon) addBuff(p, 'surgeon', 6);
      if (S.medic >= 3) addBuff(p, 'medregen', 4);
    }
    const room = p.maxHp - p.hp, used = Math.min(room, amount), over = amount - used;
    p.hp += used;
    let shieldGain = 0;
    if (S.overheal && over > 0) {
      const cap = p.maxHp * (0.15 + 0.1 * S.overheal);
      shieldGain = Math.min(cap - p.shield, over * 0.3 * S.overheal);
      if (shieldGain > 0) { p.shield += shieldGain; p.shieldT = 5; Sound.shield(); }
    }
    if (S.stimulant && amount >= 10) addBuff(p, 'stim', 4);
    FX.text(p.x, p.y - 26, '+' + Math.round(used) + ' HP' + (shieldGain >= 1 ? '  +' + Math.round(shieldGain) + ' SHIELD' : ''), '#52f08a', 18);
    if (source === 'medkit' && (S.trauma || S.syn.surgeon)) FX.add(P_RING, p.x, p.y, 0, 0, 0.4, 60, '#52f08a', { lw: 4 });
    Sound.heal();
  },
  explosion(x, y, r, dmg, kind) {
    if (BUDGETED.has(kind)) {   // cap explosion density so chains can't run away
      if (this.boomBudget < 1) { FX.sparkle(x, y, '#ff9a1f', 6, 160); return; }
      this.boomBudget -= 1;
    }
    const S = player.S;
    FX.explosion(x, y, r); Sound.explode(); this.shake(kind === 'round' || kind === 'impact' ? 5 : 14);
    if (r > 100) FX.distort(x, y, r * 1.2);
    if (kind !== 'round' && kind !== 'impact') Decals.add('scorch', x, y, rand(TAU), r / 60);
    if (dmg > 0) Grid.query(x, y, r + 30, e => {
      if (e.dead) return;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d >= r + e.r) return;
      if (S.syn.firestorm || kind === 'fire') applyBurn(e, (10 + 5 * S.incendiary) * S.elemMul, 3 * S.elemDur);
      this.damageEnemy(e, dmg * (1 - 0.5 * d / (r + e.r)), Math.atan2(e.y - y, e.x - x), 420, false, 'explosion');
    });
    if (S.syn.chainreact && kind === 'round' && Math.random() < 0.5) {
      for (let i = 0; i < 2; i++) Bullets.player(x, y, rand(TAU), 750, { dmg: dmg * 0.6, life: 0.7, r: 4, pierce: 0, rico: 0, knock: 120, trail: '#ff9a1f', width: 3, crit: 0, critMul: 1, src: 'frag', canFrag: false, seek: true });
    }
    damageTilesInRadius(x, y, r * 0.8, 60);
    if (kind === 'barrel' && dist2(x, y, player.x, player.y) < r * r) this.hurtPlayer(14, Math.atan2(player.y - y, player.x - x));
  },
  chainLightning(e0, dmg, n, isStatic) {
    if (!isStatic) { if (this.chainCd > 0) return; this.chainCd = 0.08; }
    const hit = [e0.id], S = player.S; let cur = e0;
    for (let k = 0; k < n; k++) {
      const best = nearestEnemy(cur.x, cur.y, 210, hit);
      if (!best) break;
      FX.arc(cur.x, cur.y, best.x, best.y, isStatic ? '#d8f4ff' : '#9fe8ff'); hit.push(best.id);
      this.damageEnemy(best, dmg, Math.atan2(best.y - cur.y, best.x - cur.x), 60, false, 'chain');
      if (S.syn.thunderstorm && Math.random() < 0.35) {
        const bx = best.x, by = best.y;
        FX.add(P_RING, bx, by, 0, 0, 0.2, 70, '#9fe8ff', { lw: 4 });
        Grid.query(bx, by, 90, o => { if (!o.dead && o !== best && dist2(bx, by, o.x, o.y) < 70 * 70) this.damageEnemy(o, dmg * 0.4, Math.atan2(o.y - by, o.x - bx), 80, false, 'chain'); });
      }
      cur = best;
    }
    if (hit.length > 1) Sound.zap();
  },
  shockwave(x, y, r, dmg) {
    FX.add(P_RING, x, y, 0, 0, 0.35, r, '#9ff6ff', { lw: 10 }); FX.distort(x, y, r);
    FX.light(x, y, r * 1.6, 0.25, GLOW.xp, 0.6); FX.sparkle(x, y, '#9ff6ff', 18, r * 3);
    Sound.explode(); this.shake(8);
    Grid.query(x, y, r + 30, e => { if (!e.dead && dist2(x, y, e.x, e.y) < (r + e.r) ** 2) this.damageEnemy(e, dmg, Math.atan2(e.y - y, e.x - x), 480, false, 'shock'); });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, x, y) < r * r) { b.dead = true; FX.sparkle(b.x, b.y, '#ff8090', 3, 80); }
  },
  coneBlast(x, y, a, r, dmg, knock) {
    FX.add(P_RING, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, 0, 0, 0.2, r * 0.7, '#ffb347', { lw: 6 });
    Grid.query(x, y, r + 30, e => {
      if (e.dead) return;
      const d = Math.hypot(e.x - x, e.y - y), ea = Math.atan2(e.y - y, e.x - x);
      if (d < r + e.r && Math.abs(angDiff(a, ea)) < 0.6) this.damageEnemy(e, dmg, ea, knock, false, 'shock');
    });
  },
  emp(x, y, r, dur) {
    FX.add(P_RING, x, y, 0, 0, 0.4, r, '#9fe8ff', { lw: 4 }); FX.add(P_RING, x, y, 0, 0, 0.3, r * 0.6, '#ffffff', { lw: 2 });
    Sound.zap();
    Grid.query(x, y, r, e => { if (!e.dead && (e.d.ranged || e.type === 'boss') && dist2(x, y, e.x, e.y) < r * r) e.stunT = e.type === 'boss' ? 0.6 : dur; });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, x, y) < r * r * 0.36) { b.dead = true; FX.sparkle(b.x, b.y, '#9fe8ff', 3, 80); }
  },
  avoided(p) { if (p.S.fleet) addBuff(p, 'fleet', 2); },
  // returns true when the hit "lands" (bullet is consumed), false when it passes through
  hurtPlayer(dmg, ang) {
    const p = player, S = p.S;
    if (this.state !== 'play') return false;
    if (p.dashT > 0 || p.invuln > 0 || p.hurtT > 0) { if (p.dashT > 0) this.avoided(p); return false; }
    if (Math.random() < S.evade) {
      FX.text(p.x, p.y - 30, 'DODGE', '#2ef2ff', 20, { crit: true }); p.invuln = S.syn.untouchable ? 0.6 : 0.3;
      if (S.syn.untouchable) p.dashCdT -= 0.5;
      this.avoided(p); return true;
    }
    let mul = (1 - 0.08 * S.fortified) * (buff(p, 'trauma') ? 1 - (0.2 + 0.1 * S.trauma) : 1) * (buff(p, 'surgeon') ? 0.75 : 1);
    dmg *= mul;
    p.combatT = 0;
    if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; p.shieldT = 5; FX.sparkle(p.x, p.y, '#9fd4ff', 6, 140); if (dmg <= 0) { p.hurtT = 0.3; Sound.shield(); return true; } }
    p.hp -= dmg; p.hurtT = 0.55; this.hurtFlash = 0.4;
    p.vx += Math.cos(ang) * 260; p.vy += Math.sin(ang) * 260;
    this.shake(9); Sound.hurt();
    FX.hitBurst(p.x, p.y, ang, '#1fa6b8');
    FX.text(p.x, p.y - 30, '-' + Math.round(dmg), '#ff3b4e', 20);
    if (S.reactive && p.reactiveCd <= 0) { p.reactiveCd = 3; this.shockwave(p.x, p.y, 100 + 25 * S.reactive, 20 + 15 * S.reactive); }
    if (p.hp <= 0 && S.ironwill && p.ironCd <= 0) {
      p.hp = p.maxHp * 0.15; p.ironCd = S.ironwill === 1 ? 150 : 100; p.invuln = 1.5;
      this.banner('IRON WILL', '#52f08a'); this.hitstop(0.2); FX.distort(p.x, p.y, 200); Sound.synergy();
    }
    if (p.hp <= 0) this.die();
    return true;
  },
  die() {
    const p = player;
    p.hp = 0; this.state = 'dying'; this.deathT = 1.3;
    Sound.die(); this.shake(24);
    FX.deathPop(p.x, p.y, '#1fa6b8', true); FX.explosion(p.x, p.y, 80);
    Decals.add('splat', p.x, p.y, rand(TAU), 1.5);
  },
  levelUpPush() {
    const p = player;
    FX.add(P_RING, p.x, p.y, 0, 0, 0.5, 240, '#2ef2ff', { lw: 8 });
    FX.sparkle(p.x, p.y, '#7ff6ff', 30, 420);
    Grid.query(p.x, p.y, 260, e => { if (e.dead) return; const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; if (d < 240) { const k = 500 * (1 - d / 240) * (1 - (e.d.resist || 0) * 0.6); e.kvx += (e.x - p.x) / d * k; e.kvy += (e.y - p.y) / d * k; } });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, p.x, p.y) < 240 * 240) b.dead = true;
  },
  onSynergy(s) {
    this.synMsg = { text: s.name.toUpperCase(), desc: s.desc, t: 2.8 };
    Sound.synergy(); FX.distort(player.x, player.y, 180); FX.sparkle(player.x, player.y, '#ff4fd8', 30, 360);
  },

  update(dt) {
    if (this.hitstopT > 0) { this.hitstopT -= dt; dt *= 0.08; }
    const playing = this.state === 'play', dying = this.state === 'dying';
    if (dying) { this.deathT -= dt; dt *= 0.3; if (this.deathT <= 0) { this.state = 'dead'; UI.gameOver(); } }
    if (playing) this.time += dt;
    const p = player;
    this.boomBudget = Math.min(8, this.boomBudget + dt * 14); this.chainCd -= dt; this.mayhemCd -= dt;
    updateTimers(dt);
    updateFlow(p.x, p.y, dt);
    updateEnemies(dt, p);
    Grid.build(enemies);
    if (playing) { updatePlayer(p, dt); Director.update(dt, p); Pickups.updateWorld(dt, p); }
    else { p.vx *= 0.9; p.vy *= 0.9; }
    mouse.x = this.cam.x + (mouse.sx - VW / 2) / ZOOM; mouse.y = this.cam.y + (mouse.sy - VH / 2) / ZOOM;
    Bullets.update(dt); Hazards.update(dt); Decoys.update(dt); Pickups.update(dt, p);
    FX.update(dt); Decals.update(dt);
    const look = 0.2, ox = clamp((mouse.x - p.x) * look, -200, 200), oy = clamp((mouse.y - p.y) * look, -140, 140);
    this.cam.x += (p.x + ox - this.cam.x) * damp(7, dt); this.cam.y += (p.y + oy - this.cam.y) * damp(7, dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 60);
    const s = this.shakeAmt * 0.6; this.shakeX = rand(-s, s); this.shakeY = rand(-s, s);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    for (const k of ['comboMsg', 'bannerMsg', 'streakMsg', 'synMsg']) if (this[k]) { this[k].t -= dt; if (this[k].t <= 0) this[k] = null; }
    if (this.muzzle) { this.muzzle.t -= dt; if (this.muzzle.t <= 0) this.muzzle = null; }
    const wantDark = Director.event && Director.event.type === 'blackout' ? 1 : 0;
    this.blackout += (wantDark - this.blackout) * damp(2, dt);
    this.xpFlash = Math.max(0, this.xpFlash - dt * 2); this.hurtFlash = Math.max(0, this.hurtFlash - dt); this.levelFlash = Math.max(0, this.levelFlash - dt * 2.5);
    p.xpPulse = Math.max(0, p.xpPulse - dt * 4);
    p.xpShown += ((p.xp / p.xpNeed) - p.xpShown) * damp(10, dt);
    if (p.xpShown > p.xp / p.xpNeed + 0.02 && this.pending === 0) p.xpShown = p.xp / p.xpNeed;
    if (playing && this.pending > 0) { this.levelFlash = 1; UI.openLevelUp(); }
  },

  render(time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0e12'; ctx.fillRect(0, 0, VW, VH);
    if (!player) return;
    const vw = VW / ZOOM, vh = VH / ZOOM;
    const camX = this.cam.x + this.shakeX - vw / 2, camY = this.cam.y + this.shakeY - vh / 2;
    ChunkCache.scale = clamp(Math.round(ZOOM * 4) / 4, 1, 2);
    if (ChunkCache.lastScale !== ChunkCache.scale) { ChunkCache.clear(); ChunkCache.lastScale = ChunkCache.scale; }
    ctx.setTransform(ZOOM, 0, 0, ZOOM, -camX * ZOOM, -camY * ZOOM);
    const v = { x0: camX - 60, y0: camY - 60, x1: camX + vw + 60, y1: camY + vh + 60 };
    drawWorldStatic(camX, camY, vw, vh);
    Decals.draw(v); Hazards.draw(v);
    drawDynamicTiles(camX, camY, vw, vh, time);
    FX.drawGround(v);
    Pickups.draw(v, time);
    Decoys.draw(time);
    drawEnemies(v, time);
    drawPlayer(player, time);
    Bullets.draw(v);
    this.drawMuzzle();
    FX.drawAir(v);
    FX.drawTexts();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.blackout > 0.02) this.drawBlackout(camX, camY, time);
    HUD.draw(time);
  },
  drawBlackout(camX, camY, time) {
    const c = this.darkCv || (this.darkCv = document.createElement('canvas'));
    if (c.width !== VW || c.height !== VH) { c.width = VW; c.height = VH; }
    const g = c.getContext('2d'), S = (x, y) => [(x - camX) * ZOOM, (y - camY) * ZOOM];
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, VW, VH);
    g.fillStyle = `rgba(2,3,10,${0.9 * this.blackout})`; g.fillRect(0, 0, VW, VH);
    g.globalCompositeOperation = 'destination-out';
    const cut = (x, y, r, a) => { const [sx, sy] = S(x, y); g.globalAlpha = a; g.drawImage(GLOW.white, sx - r * ZOOM, sy - r * ZOOM, r * 2 * ZOOM, r * 2 * ZOOM); };
    cut(player.x, player.y, 240, 1); cut(player.x + Math.cos(player.a) * 160, player.y + Math.sin(player.a) * 160, 200, 0.8);
    for (const l of FX.lights) cut(l.x, l.y, l.r * 1.6, (l.life / l.max));
    const em = [];
    for (const l of Map.lights) { const [sx, sy] = S(l.x, l.y); if (sx > -100 && sx < VW + 100 && sy > -100 && sy < VH + 100 && (Math.floor(l.x + l.y) % 3 === 0)) em.push(l); }
    const flick = 0.5 + 0.5 * Math.sin(time * 9);
    for (const l of em) cut(l.x, l.y, 90, 0.5 * flick);
    g.globalAlpha = 1;
    ctx.drawImage(c, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of em) { const [sx, sy] = S(l.x, l.y); ctx.globalAlpha = 0.35 * flick * this.blackout; ctx.drawImage(GLOW.red, sx - 70 * ZOOM, sy - 70 * ZOOM, 140 * ZOOM, 140 * ZOOM); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  drawMuzzle() {
    const m = this.muzzle; if (!m) return;
    const s = m.scale * (0.7 + Math.random() * 0.5), t = m.t / 0.05;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = HUE_COL[m.hue] || '#ffb347';
    ctx.globalAlpha = t;
    ctx.beginPath(); ctx.moveTo(0, -7 * s); ctx.lineTo(26 * s, 0); ctx.lineTo(0, 7 * s); ctx.lineTo(8 * s, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(10 * s, -13 * s); ctx.lineTo(14 * s, 0); ctx.lineTo(10 * s, 13 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(4 * s, 0, 6 * s, 0, TAU); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
};
