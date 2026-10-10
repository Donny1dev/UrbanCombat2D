// Pause summary, TAB build overview and the end-of-run "Operation Complete" screen.
import { G, W } from '../core/registry.js';
import { Sound, Music } from '../core/audio.js';
import { esc, fmtTime, pct } from '../core/util.js';
import { CATS, CAT_ORDER, UPG } from '../data/upgrades.js';
import { SYNERGIES, SYN, archetypeOf } from '../data/evolutions.js';
import { WEAPONS } from '../data/weapons.js';
import { EQ, RARITY_COL, SLOTS, SLOT_NAMES, EQ_SYNERGIES } from '../data/equipment.js';
import { careerXpFor, rankFor } from '../data/progression.js';
import { ACH } from '../data/achievements.js';
import { MODES } from '../data/modes.js';
import { evoTop } from '../systems/stats.js';
import { openPaths, reqList } from '../systems/offers.js';
import { fireRate, reloadTime, moveSpeed } from '../entities/player.js';
import { drawIcon } from '../rendering/icons.js';
import { $ } from './ui.js';

const statCell = (k, v) => `<div class="stat"><small>${esc(k)}</small><b>${esc(v)}</b></div>`;
function drawIcons(root) { for (const cv of root.querySelectorAll('canvas[data-icon]')) drawIcon(cv.getContext('2d'), cv.dataset.icon, cv.dataset.col, cv.width); }

export const Results = {
  fillPause() {
    const p = W.player, g = G.game;
    $('pauseStats').innerHTML = [['Time', fmtTime(g.time)], ['Wave', g.wave], ['Level', p.level], ['Kills', g.run.kills], ['Best streak', 'x' + g.bestCombo], ['Damage', Math.round(p.dmgDealt).toLocaleString()], ['Mode', MODES[g.mode].short], ['Credits so far', '+' + g.run.bonusCredits]].map(([k, v]) => statCell(k, v)).join('');
    const top = evoTop(p);
    const parts = [`<span style="border-color:${top ? '#ffc93c' : '#ff9a1f'}">${esc(top ? top.name : WEAPONS[p.weapon].name)}</span>`];
    for (const s of SLOTS) parts.push(`<span style="border-color:${RARITY_COL[p.eq[s].rarity]}">${esc(EQ[p.eq[s].id].name)} <em>R${p.eq[s].rank}</em></span>`);
    for (const id of p.synergies) parts.push(`<span style="border-color:#ff4fd8">${esc(SYN[id].name)}</span>`);
    for (const id in p.upg) parts.push(`<span>${esc(UPG[id].name)} <em>${p.upg[id]}</em></span>`);
    $('pauseBuild').innerHTML = parts.join('');
  },
  renderBuild() {
    const p = W.player, g = p.gun, S = p.S, top = evoTop(p), arch = archetypeOf(p);
    const kv = [['Damage', Math.round(g.dmg) + (g.pellets > 1 ? ' x' + g.pellets : '')], ['Fire rate', fireRate(p).toFixed(1) + '/s'], ['Magazine', g.mag], ['Reload', reloadTime(p).toFixed(2) + 's'],
      ['Pierce', g.pierce], ['Ricochet', g.ricochet], ['Crit', pct(g.critChance) + ' · x' + g.critMul.toFixed(1)], ['Move speed', Math.round(moveSpeed(p))],
      ['Dash cooldown', S.dashCd.toFixed(2) + 's'], ['Max HP', p.maxHp], ['Energy shield', S.shieldCap || '—'], ['Regen', S.regen.toFixed(1) + '/s'], ['Dodge', pct(S.evade)], ['Pickup radius', pct(S.magnet)]];
    const paths = openPaths(p).map(e => `<div class="syn"><b style="color:var(--gold)">${esc(e.name)}</b><span>${esc(e.desc)}</span>${reqList(p, e.req).map(q => `<em class="${q.ok ? 'ok' : ''}">${esc(q.name)} ${q.have}/${q.need}</em>`).join(' · ')} · <em class="${p.level >= e.minLevel ? 'ok' : ''}">Level ${e.minLevel}</em></div>`).join('') || '<div class="syn"><span>All evolutions for this weapon unlocked.</span></div>';
    const gear = SLOTS.map(s => { const it = p.eq[s], d = EQ[it.id]; return `<div class="kitRow" style="--c:${RARITY_COL[it.rarity]}"><canvas data-icon="${d.icon}" data-col="${RARITY_COL[it.rarity]}" width="88" height="88"></canvas><div><b>${esc(d.name)}</b><span>${esc(SLOT_NAMES[s])} · ${it.rarity} · rank ${it.rank}</span><span>${esc(d.ranks[it.rank - 1])}</span></div></div>`; }).join('');
    let ups = '';
    for (const c of CAT_ORDER) {
      const ids = Object.keys(p.upg).filter(id => UPG[id].cat === c); if (!ids.length) continue;
      ups += `<h3 style="color:${CATS[c].col};margin-top:8px">${CATS[c].name}</h3><div class="upList">` + ids.map(id => `<div class="up" style="--c:${CATS[c].col}" title="${esc(UPG[id].fx(p.upg[id]))}"><canvas data-icon="${UPG[id].icon}" data-col="${CATS[c].col}" width="52" height="52"></canvas>${esc(UPG[id].name)}<small>${p.upg[id]}/${UPG[id].max}</small></div>`).join('') + '</div>';
    }
    const syns = SYNERGIES.map(s => `<div class="syn ${p.synergies.has(s.id) ? 'on' : ''}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span>${reqList(p, s.req).map(q => `<em class="${q.ok ? 'ok' : ''}">${esc(q.name)} ${q.have}/${q.need}</em>`).join(' · ')}</div>`).join('');
    const eqSyns = EQ_SYNERGIES.map(s => { const on = !!S.eqSyn[s.id]; return `<div class="syn ${on ? 'on' : ''}" style="${on ? 'border-color:#b46bff' : ''}"><b style="${on ? 'color:#b46bff' : ''}">${esc(s.name)}</b><span>${esc(s.desc)}</span><em class="${p.eq[EQ[s.eq].slot].id === s.eq ? 'ok' : ''}">${esc(EQ[s.eq].name)}</em> · <em class="${p.upg[s.upg] ? 'ok' : ''}">${esc(UPG[s.upg].name)}</em></div>`; }).join('');
    $('buildBody').innerHTML = `
      <div class="panel"><h3>WEAPON</h3><div class="arch" style="color:${top ? 'var(--gold)' : 'var(--text)'}">${esc(top ? top.name : g.name.toUpperCase())}</div>
        <div class="hint" style="font-size:14px;margin-bottom:8px">${esc(WEAPONS[p.weapon].name)}${top ? ' · ' + (top.tier === 2 ? 'Tier II' : 'Tier I') + ' evolution' : ''}</div>
        <h3>GEAR</h3><div class="kit">${gear}</div>
        <h3 style="margin-top:10px">ARCHETYPE</h3><div class="arch">${esc(arch.name)}</div><p class="fine" style="margin:0 0 8px">${esc(arch.desc)}</p>
        <h3>EFFECTIVE STATS</h3><div class="kv">${kv.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>
        <h3 style="margin-top:12px">EVOLUTION PROGRESS</h3>${paths}</div>
      <div class="panel"><h3>UPGRADES · ${Object.keys(p.upg).length}</h3>${ups || '<p class="hint">No upgrades yet.</p>'}</div>
      <div class="panel"><h3>SYNERGIES · ${p.synergies.size}/${SYNERGIES.length}</h3>${syns}<h3 style="margin-top:10px">EQUIPMENT SYNERGIES</h3>${eqSyns}</div>`;
    drawIcons($('buildBody'));
  },
  gameOver(result) {
    const prof = G.save.profile(), { run, res } = result || {};
    Music.set('menu');
    const training = run.mode === 'training';
    const lines = [['Survival time', fmtTime(run.time)], ['Wave reached', run.wave], ['Eliminations', run.kills.toLocaleString()], ['Damage dealt', Math.round(run.damage).toLocaleString()],
      ['Highest kill streak', 'x' + run.streak], ['XP collected', Math.round(run.xp).toLocaleString()], ['Level', run.level], ['Mode', MODES[run.mode].short]];
    const used = Object.entries(run.equipUsed || {}).map(([id, n]) => `${EQ[id].name} ×${n}`).join(' · ') || 'None activated';
    const gear = SLOTS.map(s => { const it = run.equipment[s]; return `<span style="border-color:${RARITY_COL[it.rarity]}">${esc(EQ[it.id].name)} <em>${it.rarity} R${it.rank}</em></span>`; }).join('');
    let career = '';
    if (res && res.applied && !training) {
      const before = res.before, after = res.after, need = careerXpFor(after.level), r = rankFor(after.level);
      career = `<div class="panel"><div class="row" style="justify-content:space-between"><b style="font-family:var(--display);font-weight:400;font-size:18px;color:${r.col}">${esc(r.title.toUpperCase())} · LEVEL ${after.level}${res.levelsGained ? ` <span style="color:var(--yellow)">(+${res.levelsGained})</span>` : ''}</b>
        <span class="credits">+${res.credits} <small>SUPPLY CREDITS</small></span></div>
        <div class="careerBar"><i id="goBar" style="--v:${before.level === after.level ? Math.round(before.xp / need * 100) : 0}%"></i></div>
        <div class="row" style="justify-content:space-between"><span class="hint" style="font-size:13px">+${res.careerXp} CAREER XP · SCORE ${res.score.toLocaleString()}</span><span class="hint" style="font-size:13px">${after.xp} / ${need}</span></div></div>`;
      setTimeout(() => { const b = document.getElementById('goBar'); if (b) b.style.setProperty('--v', Math.round(after.xp / need * 100) + '%'); }, 250);
    }
    const achs = (res && res.achievements || []).concat((run.achievements || []).filter(id => !(res && res.achievements || []).some(a => a.id === id)).map(id => ACH[id]));
    const uniq = [...new Map(achs.filter(Boolean).map(a => [a.id, a])).values()];
    $('goBody').innerHTML = `
      <div class="who panel"><div><small class="hint" style="font-size:12px">OPERATOR</small><br><b>${esc(prof ? prof.name : 'Guest')}</b></div>
        <div style="text-align:right"><small class="hint" style="font-size:12px">WEAPON</small><br><b style="color:${run.evo ? 'var(--gold)' : 'var(--text)'}">${esc(run.evo || WEAPONS[run.weapon].name)}</b></div></div>
      ${training ? '<p class="fine">Training runs never award career XP, credits, records or achievements.</p>' : ''}
      <div class="panel"><div class="stats">${lines.map(([k, v]) => statCell(k, v)).join('')}</div>
        <div class="build">${gear}</div><p class="fine" style="margin:8px 0 0">Equipment used: ${esc(used)}</p></div>
      ${career}
      ${res && res.broken && res.broken.length ? `<div class="records">${res.broken.map(b => `<span>NEW RECORD · ${esc(b.toUpperCase())}</span>`).join('')}</div>` : ''}
      ${uniq.length ? `<div class="panel"><b class="hint" style="font-size:13px">ACHIEVEMENTS UNLOCKED</b><div class="unlocks" style="margin-top:6px">${uniq.map(a => `<span>${esc(a.name)} +${a.credits}</span>`).join('')}</div></div>` : ''}`;
    G.ui.show('gameover');
    Sound.confirm();
  },
};
