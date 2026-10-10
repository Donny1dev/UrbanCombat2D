// Menu sub-screens: Deploy, Loadout, Profile, Arsenal (codex), Local Records, Achievements.
import { G } from '../core/registry.js';
import { Sound } from '../core/audio.js';
import { esc, fmtTime, todayKey, TAU, clamp } from '../core/util.js';
import { prettyKey } from '../core/input.js';
import { Settings } from '../core/settings.js';
import { WEAPONS, WEAPON_IDS, WEAPON_COST, GUN_SHAPES } from '../data/weapons.js';
import { EQUIPMENT, EQ, SLOTS, SLOT_NAMES, RARITY_COL, RARITIES } from '../data/equipment.js';
import { EVOS, EVO } from '../data/evolutions.js';
import { UPG } from '../data/upgrades.js';
import { MODES, dailyConfig } from '../data/modes.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { careerXpFor, rankFor, FRAMES } from '../data/progression.js';
import { localLeaderboard } from '../systems/career.js';
import { evoPaths } from '../systems/offers.js';
import { Achievements } from '../systems/achievements.js';
import { drawIcon } from '../rendering/icons.js';
import { drawHuman, drawGun, lookToOpts, armourLook } from '../rendering/sprites.js';
import { $, UI } from './ui.js';

const stat = (k, v) => `<div class="stat"><small>${esc(k)}</small><b>${esc(v)}</b></div>`;
function icons(root) { for (const cv of root.querySelectorAll('canvas[data-icon]')) drawIcon(cv.getContext('2d'), cv.dataset.icon, cv.dataset.col, cv.width); }
function gunArt(cv, w) { const g = cv.getContext('2d'), gl = GUN_SHAPES[w][0], gs = Math.min(cv.height / 12, (cv.width - 16) / gl); g.clearRect(0, 0, cv.width, cv.height); g.save(); g.translate(cv.width / 2 - gl * gs / 2, cv.height / 2); g.scale(gs, gs); drawGun(g, w, 0, 0, false, false); g.restore(); }
const keyFor = s => (s === 'armour' || !EQ[G.save.profile().loadout[s]].active ? 'PASSIVE' : prettyKey(Settings.keys[s]));

export const Screens = {
  loTab: 'weapon', codexTab: 'weapons', recCat: 'wave', recRange: 'all', previewT: 0,
  open(id) {
    const fn = { deploy: 'deploy', loadout: 'loadout', profile: 'profile', arsenal: 'codex', records: 'records', achievementsScreen: 'achievements', settings: 'settings', character: 'character' }[id];
    if (fn === 'settings') G.settingsUI.open();
    else if (fn === 'character') G.designer.open();
    else if (fn) this[fn]();
  },
  credits() { const p = G.save.profile(); return `${p.credits.toLocaleString()} <small>SUPPLY CREDITS</small>`; },
  // ---------------- deploy ----------------
  deploy() {
    const p = G.save.profile(), r = rankFor(p.career.level);
    $('depCredits').innerHTML = this.credits();
    $('deployWho').innerHTML = `<b style="font-family:var(--display);font-weight:400;font-size:22px">${esc(p.name)}</b><br><span class="hint" style="font-size:13px;color:${r.col}">${esc(r.title.toUpperCase())} · CAREER LV ${p.career.level}</span>`;
    const daily = dailyConfig(todayKey());
    const best = p.runs.filter(x => x.mode === 'daily' && x.daily === daily.dateKey).reduce((m, x) => Math.max(m, x.score), 0);
    $('modes').innerHTML = Object.values(MODES).map(m => {
      let mods = m.mods.slice();
      if (m.id === 'daily') mods = [`Weapon: ${WEAPONS[daily.weapon].name}`, ...daily.mods.map(d => `${d.name}: ${d.desc}`), best ? `Your best today: ${best.toLocaleString()}` : 'Not attempted today'];
      return `<button type="button" class="mode ${UI.selectedMode === m.id ? 'on' : ''}" data-mode="${m.id}"><h4>${esc(m.name)}</h4><p>${esc(m.desc)}</p>${mods.length ? `<ul>${mods.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</button>`;
    }).join('');
    for (const b of $('modes').children) b.onclick = () => { UI.selectedMode = b.dataset.mode; Sound.hover(); this.deploy(); };
    const lo = p.loadout, weapon = UI.selectedMode === 'daily' ? daily.weapon : lo.weapon;
    const evoNames = evoPaths(weapon).filter(e => e.tier === 1).map(e => e.name).join(' / ');
    $('kit').innerHTML = `<div class="kitRow" style="--c:#ff9a1f"><canvas id="kitGun" width="88" height="88"></canvas><div><b>${esc(WEAPONS[weapon].name)}</b><span>${esc(WEAPONS[weapon].blurb)}</span><span>Evolves into: ${esc(evoNames)}</span></div><small>WEAPON${UI.selectedMode === 'daily' ? '<br>DAILY' : ''}</small></div>` +
      SLOTS.map(s => { const d = EQ[lo[s]]; return `<div class="kitRow" style="--c:${RARITY_COL.common}"><canvas data-icon="${d.icon}" data-col="#f4f6fb" width="88" height="88"></canvas><div><b>${esc(d.name)}</b><span>${esc(d.desc)}</span><span>Rank I: ${esc(d.ranks[0])}</span></div><small>${esc(SLOT_NAMES[s].toUpperCase())}<br>${keyFor(s)}</small></div>`; }).join('') +
      `<p class="fine" style="margin:4px 0 0">Gear starts at Common rank I. Equipment crates (after wave 3, then every 3–4 waves, bosses and elite hunts) upgrade rank, rarity or swap gear.</p>`;
    gunArt($('kitGun'), weapon); icons($('kit'));
    $('deployBtn').textContent = UI.selectedMode === 'training' ? 'ENTER TRAINING' : 'DEPLOY';
  },
  renderPreview(dt) {
    const cv = $('deployPreview'), g = cv.getContext('2d'), p = G.save.profile(); if (!p) return;
    this.previewT += dt;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.save(); g.translate(cv.width / 2, cv.height / 2 + 8);
    drawHuman(g, 0, 0, Object.assign(armourLook(lookToOpts(p.look), p.loadout.armour), { a: this.previewT * 0.6, phase: this.previewT * 6, moving: true, scale: 3.2, weapon: UI.selectedMode === 'daily' ? dailyConfig(todayKey()).weapon : p.loadout.weapon }));
    g.restore();
  },
  // ---------------- loadout ----------------
  loadout() {
    const p = G.save.profile();
    $('loCredits').innerHTML = this.credits();
    const tabs = [['weapon', 'Weapon'], ['armour', 'Armour'], ['gadget', 'Tactical gadget (' + prettyKey(Settings.keys.gadget) + ')'], ['support', 'Support (' + prettyKey(Settings.keys.support) + ')']];
    $('loTabs').innerHTML = tabs.map(([id, n]) => `<button type="button" role="tab" class="${this.loTab === id ? 'on' : ''}" data-t="${id}">${esc(n)}</button>`).join('');
    for (const b of $('loTabs').children) b.onclick = () => { this.loTab = b.dataset.t; Sound.hover(); this.loadout(); };
    const box = $('loItems'); box.innerHTML = '';
    if (this.loTab === 'weapon') {
      $('loNote').textContent = 'Your starting weapon. Other weapons can still appear as level-up swaps during a run, and each keeps its own evolution.';
      for (const w of WEAPON_IDS) {
        const owned = p.unlocked.weapons.includes(w), on = p.loadout.weapon === w, cost = WEAPON_COST[w];
        const el = document.createElement('article'); el.className = 'item' + (on ? ' on' : '') + (owned ? '' : ' locked');
        el.innerHTML = `<header><canvas width="120" height="48" style="width:90px;height:36px"></canvas><h4>${esc(WEAPONS[w].name)}</h4></header><p>${esc(WEAPONS[w].blurb)}</p>
          <p class="fine" style="margin:0">Evolutions: ${esc(evoPaths(w).filter(e => e.tier === 1).map(e => e.name).join(' / '))}</p><div class="act"></div>`;
        gunArt(el.querySelector('canvas'), w);
        this.actButton(el.querySelector('.act'), owned, on, cost, 1, () => { p.loadout.weapon = w; G.save.markDirty(); }, () => G.save.buy('weapon', w));
        box.appendChild(el);
      }
      return;
    }
    $('loNote').textContent = { armour: 'Armour works automatically.', gadget: 'Tactical gadgets are aimed at your cursor and recharge on a cooldown.', support: 'Support equipment helps you stay in the fight. Supply Scanner is passive.' }[this.loTab];
    for (const d of EQUIPMENT.filter(e => e.slot === this.loTab)) {
      const owned = p.unlocked.equipment.includes(d.id), on = p.loadout[d.slot] === d.id;
      const el = document.createElement('article'); el.className = 'item' + (on ? ' on' : '') + (owned ? '' : ' locked');
      el.innerHTML = `<header><canvas data-icon="${d.icon}" data-col="${owned ? '#f4f6fb' : '#6a6e7a'}" width="96" height="96"></canvas><div><h4>${esc(d.name)}</h4><span class="lockedTag">${d.active ? (d.slot === 'gadget' ? 'ACTIVE · ' + prettyKey(Settings.keys.gadget) : 'ACTIVE · ' + prettyKey(Settings.keys.support)) : 'PASSIVE'}</span></div></header>
        <p>${esc(d.desc)}</p><ol>${d.ranks.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
        <div class="perks">${d.perks.map((t, i) => (i && t ? `<span style="color:${RARITY_COL[RARITIES[i]]}">${RARITIES[i].toUpperCase()}: ${esc(t)}</span>` : '')).join('')}</div><div class="act"></div>`;
      this.actButton(el.querySelector('.act'), owned, on, d.cost, d.minCareer, () => { p.loadout[d.slot] = d.id; G.save.markDirty(); }, () => G.save.buy('equipment', d.id));
      box.appendChild(el);
    }
    icons(box);
  },
  actButton(root, owned, on, cost, minCareer, equip, buy) {
    const p = G.save.profile();
    if (owned) {
      root.innerHTML = `<span class="lockedTag">${on ? 'EQUIPPED' : 'UNLOCKED'}</span><button type="button" class="btn small ${on ? 'alt' : ''}" ${on ? 'disabled' : ''}>${on ? 'EQUIPPED' : 'EQUIP'}</button>`;
      root.querySelector('button').onclick = () => { equip(); Sound.confirm(); this.loadout(); };
    } else {
      const lockedLv = p.career.level < minCareer;
      root.innerHTML = `<span class="credits" style="font-size:15px">${cost.toLocaleString()} <small>CR</small>${lockedLv ? `<br><span class="lockedTag">CAREER LV ${minCareer}</span>` : ''}</span><button type="button" class="btn small" ${lockedLv || p.credits < cost ? 'disabled' : ''}>UNLOCK</button>`;
      root.querySelector('button').onclick = () => { const r = buy(); if (r.ok) { Sound.select(true); UI.toast('Unlocked!', '#ffd23f'); equip(); } else { Sound.error(); UI.toast(r.error, '#ff3b4e'); } this.loadout(); };
    }
  },
  // ---------------- profile ----------------
  profile() {
    const p = G.save.profile(), r = rankFor(p.career.level), need = careerXpFor(p.career.level), frame = FRAMES.find(f => f.id === p.frame) || FRAMES[0];
    const fav = Object.entries(p.life.weaponTime).sort((a, b) => b[1] - a[1])[0];
    const achDone = Object.keys(p.achievements).length;
    const others = G.save.profiles().filter(q => q.id !== p.id);
    $('profileBody').innerHTML = `
      <div class="profileCard" style="--frame:${frame.col}">
        <canvas id="profilePortrait" width="240" height="240"></canvas>
        <div style="display:flex;flex-direction:column;gap:6px">
          <h3>${esc(p.name)}${p.guest ? ' <span class="lockedTag">GUEST</span>' : ''}</h3>
          <b style="font-family:var(--display);font-weight:400;color:${r.col}">${esc(r.title.toUpperCase())} · CAREER LEVEL ${p.career.level}</b>
          <div class="careerBar"><i style="--v:${Math.round(p.career.xp / need * 100)}%"></i></div>
          <span class="hint" style="font-size:13px">${p.career.xp.toLocaleString()} / ${need.toLocaleString()} XP TO NEXT LEVEL</span>
          <span class="credits">${p.credits.toLocaleString()} <small>SUPPLY CREDITS</small></span>
          <b class="hint" style="font-size:13px;margin-top:6px">PROFILE FRAME</b>
          <div class="frames">${FRAMES.map(f => `<button type="button" data-f="${f.id}" style="--c:${f.col}" class="${p.frame === f.id ? 'on' : ''}" ${p.career.level < f.level ? 'disabled title="Career level ' + f.level + '"' : ''}>${esc(f.name)}${p.career.level < f.level ? ' · LV ' + f.level : ''}</button>`).join('')}</div>
        </div>
      </div>
      <div class="panel" style="margin-top:12px"><div class="statGrid">
        ${stat('Total eliminations', p.life.kills.toLocaleString())}${stat('Total runs', p.life.runs)}${stat('Highest wave', p.records.wave)}${stat('Best survival', fmtTime(p.records.longest))}
        ${stat('Best kill streak', 'x' + p.records.streak)}${stat('Highest score', p.records.score.toLocaleString())}${stat('Favourite weapon', fav ? WEAPONS[fav[0]].name : '—')}
        ${stat('Equipment collection', p.unlocked.equipment.length + ' / ' + EQUIPMENT.length)}${stat('Achievements', achDone + ' / ' + ACHIEVEMENTS.length)}${stat('Evolutions discovered', p.discoveries.length + ' / ' + EVOS.length)}
        ${stat('Damage dealt', Math.round(p.life.damage).toLocaleString())}${stat('Bosses defeated', p.life.bossKills)}
      </div></div>
      <div class="panel" style="margin-top:12px">
        <b class="hint" style="font-size:13px">${p.guest ? 'SET A CALLSIGN (keeps all your guest progress)' : 'CHANGE CALLSIGN'}</b>
        <div class="row" style="justify-content:flex-start;margin-top:6px"><input id="renameInput" maxlength="18" value="${p.guest ? '' : esc(p.name)}" placeholder="CALLSIGN" style="font-size:18px;padding:8px;border-radius:5px;border:1px solid var(--line);background:#0b0c10;color:var(--text);font-weight:800"><button class="btn small" type="button" id="renameBtn">SAVE</button><button class="btn small alt" type="button" id="toCharacter">EDIT APPEARANCE</button></div>
        <div class="err" id="renameErr"></div>
      </div>
      <div class="panel" style="margin-top:12px">
        <b class="hint" style="font-size:13px">PROFILES ON THIS DEVICE</b>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${others.length ? others.map(q => `<div class="row" style="justify-content:space-between;background:var(--panel-2);border-radius:6px;padding:6px 10px"><b>${esc(q.name)}</b><span class="hint" style="font-size:12px">${esc(rankFor(q.career.level).title.toUpperCase())} · LV ${q.career.level}</span><span class="row"><button class="btn small alt" type="button" data-sw="${q.id}">SWITCH</button><button class="btn small danger" type="button" data-del="${q.id}">DELETE</button></span></div>`).join('') : '<span class="fine">Only this profile so far.</span>'}</div>
        <div class="row" style="justify-content:flex-start;margin-top:10px"><input id="newProfInput" maxlength="18" placeholder="NEW CALLSIGN" style="font-size:16px;padding:7px;border-radius:5px;border:1px solid var(--line);background:#0b0c10;color:var(--text);font-weight:800"><button class="btn small alt" type="button" id="newProfBtn">CREATE NEW PROFILE</button></div>
        <div class="err" id="newProfErr"></div>
        <p class="fine">Profiles live in this browser's storage. Export or reset save data from Settings → Data.</p>
      </div>`;
    const cv = $('profilePortrait'), g = cv.getContext('2d'); g.translate(120, 124); drawHuman(g, 0, 0, Object.assign(armourLook(lookToOpts(p.look), p.loadout.armour), { a: -Math.PI / 2 + 0.4, scale: 4.2, weapon: p.loadout.weapon }));
    for (const b of document.querySelectorAll('.frames button')) b.onclick = () => { p.frame = b.dataset.f; G.save.markDirty(); Sound.confirm(); this.profile(); };
    $('renameBtn').onclick = () => { const r2 = G.save.rename($('renameInput').value); if (r2.ok) { Sound.confirm(); UI.toast('Callsign saved'); UI.refreshWho(); this.profile(); } else { Sound.error(); $('renameErr').textContent = r2.error; } };
    $('toCharacter').onclick = () => UI.openSub('character', 'profile');
    for (const b of document.querySelectorAll('[data-sw]')) b.onclick = () => { G.save.switchTo(b.dataset.sw); G.lookVer++; Sound.confirm(); UI.refreshWho(); this.profile(); };
    for (const b of document.querySelectorAll('[data-del]')) b.onclick = () => {
      if (b.dataset.confirm) { G.save.deleteProfile(b.dataset.del); Sound.ui(); this.profile(); }
      else { b.dataset.confirm = '1'; b.textContent = 'CONFIRM DELETE'; }
    };
    $('newProfBtn').onclick = () => { const r2 = G.save.createProfile($('newProfInput').value); if (r2.ok) { G.lookVer++; Sound.confirm(); UI.toast('Profile created'); UI.refreshWho(); this.profile(); } else { Sound.error(); $('newProfErr').textContent = r2.error; } };
  },
  // ---------------- arsenal codex ----------------
  codex() {
    const p = G.save.profile();
    $('codexCount').textContent = `Evolutions discovered ${EVOS.filter(e => p.discoveries.includes(e.id)).length} / ${EVOS.length}`;
    $('codexTabs').innerHTML = [['weapons', 'Weapons & evolutions'], ['equipment', 'Equipment']].map(([id, n]) => `<button type="button" class="${this.codexTab === id ? 'on' : ''}" data-t="${id}">${n}</button>`).join('');
    for (const b of $('codexTabs').children) b.onclick = () => { this.codexTab = b.dataset.t; Sound.hover(); this.codex(); };
    const box = $('codexBody'); box.innerHTML = '';
    if (this.codexTab === 'equipment') {
      box.className = 'items';
      for (const d of EQUIPMENT) {
        const owned = p.unlocked.equipment.includes(d.id), el = document.createElement('article'); el.className = 'item' + (owned ? '' : ' locked');
        el.innerHTML = `<header><canvas data-icon="${d.icon}" data-col="${owned ? '#f4f6fb' : '#6a6e7a'}" width="96" height="96"></canvas><div><h4>${esc(d.name)}</h4><span class="lockedTag">${esc(SLOT_NAMES[d.slot].toUpperCase())} · ${owned ? 'UNLOCKED' : d.cost + ' CR' + (d.minCareer > 1 ? ' · LV ' + d.minCareer : '')}</span></div></header><p>${esc(d.desc)}</p><ol>${d.ranks.map(r => `<li>${esc(r)}</li>`).join('')}</ol><div class="perks">${d.perks.map((t, i) => (i && t ? `<span style="color:${RARITY_COL[RARITIES[i]]}">${RARITIES[i].toUpperCase()}: ${esc(t)}</span>` : '')).join('')}</div>`;
        box.appendChild(el);
      }
      icons(box); return;
    }
    box.className = 'codex';
    const maxRange = Math.max(...WEAPON_IDS.map(w => WEAPONS[w].speed * WEAPONS[w].life));
    for (const w of WEAPON_IDS) {
      const W2 = WEAPONS[w], card = document.createElement('article'); card.className = 'wcard';
      const bars = [['Damage', W2.dmg * W2.pellets / 100], ['Fire rate', W2.rate / 15], ['Magazine', W2.mag / 40], ['Reload', 1 - (W2.reload - 0.8) / 0.7], ['Accuracy', 1 - W2.spread / 0.45], ['Range', W2.speed * W2.life / maxRange]];
      card.innerHTML = `<header><canvas width="240" height="96"></canvas><div><h3>${esc(W2.name)}</h3><p class="blurb">${esc(W2.blurb)}</p></div></header><div class="bars">${bars.map(([k, v]) => `<span>${k}</span><i style="--v:${Math.round(clamp(v, 0.05, 1) * 100)}%"></i>`).join('')}</div>`;
      gunArt(card.querySelector('canvas'), w);
      for (const e of evoPaths(w)) {
        const found = p.discoveries.includes(e.id), el = document.createElement('div'); el.className = 'evo' + (found ? '' : ' locked');
        const req = (e.tier === 2 ? `From ${EVO[e.from].name} + ` : '') + Object.keys(e.req).map(id => `${UPG[id].name} ${e.req[id]}`).join(' + ') + ` · Level ${e.minLevel}`;
        const shared = e.tier === 1 && e.weapons.length > 1 ? ` · also ${e.weapons.filter(x => x !== w).map(x => WEAPONS[x].name).join(', ')}` : '';
        el.innerHTML = `<h4>${esc(e.name)} <span><span class="tag2 ${found ? '' : 'dim'}">${found ? 'DISCOVERED' : 'UNDISCOVERED'}</span> <span class="tag2 dim">${e.tier === 2 ? 'TIER II' : 'TIER I'}</span></span></h4><div class="req">${esc(req + shared)}</div><p>${esc(e.desc)}</p><p style="color:${found ? '#ffe9a8' : 'var(--muted)'};font-weight:700">${esc(e.benefits.join(' · '))}</p>`;
        card.appendChild(el);
      }
      box.appendChild(card);
    }
  },
  // ---------------- local records ----------------
  records() {
    const cats = [['wave', 'Highest wave'], ['survival', 'Longest survival'], ['kills', 'Most kills'], ['score', 'Highest score'], ['daily', "Today's daily"]];
    $('recCats').innerHTML = cats.map(([id, n]) => `<button type="button" class="${this.recCat === id ? 'on' : ''}" data-c="${id}">${n}</button>`).join('');
    for (const b of $('recCats').children) b.onclick = () => { this.recCat = b.dataset.c; Sound.hover(); this.records(); };
    $('recRange').innerHTML = this.recCat === 'daily' ? '' : [['daily', 'Today'], ['weekly', 'This week'], ['all', 'All time']].map(([id, n]) => `<button type="button" class="${this.recRange === id ? 'on' : ''}" data-r="${id}">${n}</button>`).join('');
    for (const b of $('recRange').children) b.onclick = () => { this.recRange = b.dataset.r; Sound.hover(); this.records(); };
    const rows = localLeaderboard(G.save.profiles(), this.recCat, this.recRange, Date.now(), todayKey());
    const me = G.save.profile().id, fmt = r => this.recCat === 'survival' ? fmtTime(r.value) : r.value.toLocaleString();
    $('recBody').innerHTML = rows.length ? `<table class="records"><thead><tr><th>#</th><th>Callsign</th><th>${cats.find(c => c[0] === this.recCat)[1]}</th><th>Mode</th><th>Weapon</th><th>Date</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.profileId === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${fmt(r)}</td><td>${esc(MODES[r.mode] ? MODES[r.mode].short : r.mode)}</td><td>${esc(r.evo || (WEAPONS[r.weapon] || {}).name || '')}</td><td>${new Date(r.date).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>` : '<p class="fine">No runs recorded for this view yet. Deploy and set the first record.</p>';
  },
  // ---------------- achievements ----------------
  achievements() {
    const p = G.save.profile(), done = Object.keys(p.achievements).length;
    $('achCount').textContent = `${done} / ${ACHIEVEMENTS.length} unlocked`;
    $('achBody').innerHTML = ACHIEVEMENTS.map(a => {
      const t = p.achievements[a.id], prog = t ? 1 : Achievements.progress(p, a);
      return `<div class="ach ${t ? 'done' : ''}"><canvas data-icon="${a.icon || 'star'}" data-col="${t ? '#ffc93c' : '#6a6e7a'}" width="88" height="88"></canvas><div style="flex:1"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>
        ${t ? `<span style="color:var(--gold)">Unlocked ${new Date(t).toLocaleDateString()} · +${a.credits} CR</span>` : `<div class="bar"><i style="--v:${Math.round(prog * 100)}%"></i></div><span>${Math.round(prog * 100)}% · reward ${a.credits} CR</span>`}</div></div>`;
    }).join('');
    icons($('achBody'));
  },
};
