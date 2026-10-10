// Boot: wires systems into the registry, loads/migrates the save, runs the fixed-step loop, guards errors.
import './styles.css';
import { G, W } from './core/registry.js';
import { Settings, QUALITY, onSettingsChange } from './core/settings.js';
import { resize } from './core/canvas.js';
import { startLoop } from './core/loop.js';
import { audioInit } from './core/audio.js';
import { releaseAll } from './core/input.js';
import { generateMap } from './world/map.js';
import { LOOK_DEFAULT } from './data/cosmetics.js';
import { Grid } from './systems/grid.js';
import { Director } from './systems/director.js';
import { Equip } from './systems/equipment.js';
import { Objectives } from './systems/objectives.js';
import { Achievements } from './systems/achievements.js';
import { Destruct } from './entities/destruct.js';
import { Pickups, Hazards, Decoys } from './entities/pickups.js';
import { Bosses } from './entities/bosses.js';
import { Game } from './game/game.js';
import { Save } from './game/saveManager.js';
import { Training } from './game/training.js';
import { Tutorial } from './game/tutorial.js';
import { HUD } from './rendering/hud.js';
import { renderGame } from './rendering/renderer.js';
import { Scene, MenuScene, Intro } from './rendering/scene.js';
import { clearSpriteCache } from './rendering/sprites.js';
import { clearTextCache } from './rendering/textcache.js';
import { PerfOverlay, installBench } from './debug/perf.js';
import { UI, $ } from './ui/ui.js';
import { LevelUp } from './ui/levelup.js';
import { Results } from './ui/results.js';
import { Screens } from './ui/screens.js';
import { Designer } from './ui/designer.js';
import { SettingsUI } from './ui/settingsUI.js';
import { Welcome } from './ui/welcome.js';
import { TrainingUI } from './ui/trainingUI.js';

const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev', BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
const params = new URLSearchParams(location.search), DEBUG = params.has('debug') || params.has('bench');
Object.assign(G, {
  game: Game, ui: UI, hud: HUD, director: Director, equip: Equip, achievements: Achievements, objectives: Objectives, save: Save, training: Training,
  perf: PerfOverlay, pickups: Pickups, hazards: Hazards, decoys: Decoys, destruct: Destruct, grid: Grid, tutorial: Tutorial, bosses: Bosses,
  levelup: LevelUp, results: Results, screens: Screens, designer: Designer, settingsUI: SettingsUI, trainingUI: TrainingUI, welcome: Welcome,
  scene: { menu: MenuScene, intro: Intro, Scene }, lookVer: 0, build: `${VERSION} · ${BUILD}`,
  profileLook: () => { const p = Save.profile(); return p ? p.look : LOOK_DEFAULT; },
});

// ---------------- error boundary ----------------
let fatalShown = false;
function fatal(err) {
  console.error(err);
  if (fatalShown) return;
  fatalShown = true;
  try { Save.flush(); } catch (e) { }
  releaseAll();
  if (Game.state === 'play') Game.state = 'pause';
  $('fatalDetails').textContent = DEBUG || import.meta.env.DEV ? String(err && err.stack || err) : String(err && err.message || err);
  $('fatal').hidden = false; $('loader').hidden = true;
}
window.addEventListener('error', e => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', e => fatal(e.reason));
$('fatalReload').onclick = () => location.reload();
$('fatalContinue').onclick = () => { $('fatal').hidden = true; fatalShown = false; if (Game.state === 'pause') UI.pause(true); };

// ---------------- AUTO quality ----------------
const auto = { t: 0, samples: 0, sum: 0, steps: 0 };
function autoQuality(frameMs) {
  if (Settings.quality !== 'auto' || Game.state !== 'play' || auto.steps >= 2) return;
  auto.t += frameMs / 1000;
  if (auto.t < 4) return;                       // let the run settle first
  auto.sum += frameMs; auto.samples++;
  if (auto.samples < 240) return;
  const avg = auto.sum / auto.samples; auto.sum = 0; auto.samples = 0; auto.t = 0;
  const order = ['high', 'medium', 'low'], i = order.indexOf(Settings.autoLevel);
  if (avg > 20 && i < 2) {
    auto.steps++;
    Save.setSettings({ autoLevel: order[i + 1] }); resize();
    Game.toast(`Graphics set to ${QUALITY[order[i + 1]].label} for smoother play (Auto)`, '#ffd23f', 4);
  } else auto.steps = 2;                         // stable: stop checking for this session
}

// ---------------- loop ----------------
let lastRender = 0;
function step(dt) {
  const st = Game.state;
  if (st === 'play' || st === 'dying' || st === 'dead') Game.update(dt);
  else if (st === 'intro') Intro.update(dt);
  else if (st !== 'levelup' && st !== 'crate' && st !== 'pause' && st !== 'build') MenuScene.update(dt);
}
function render(alpha, t) {
  const dt = Math.min(0.1, lastRender ? t - lastRender : 0.016); lastRender = t;
  const st = Game.state;
  if (st === 'intro') Intro.render(dt, t);
  else if (st === 'menu' || st === 'sub' || st === 'welcome' || st === 'boot') {
    MenuScene.render(dt, t);
    if (UI.current === 'character') Designer.render(dt);
    else if (UI.current === 'deploy') Screens.renderPreview(dt);
  } else renderGame(st === 'play' ? alpha : 1, t);
  autoQuality(dt * 1000);
}
function safe(fn) { return (...a) => { if (fatalShown) return; try { fn(...a); } catch (e) { fatal(e); } }; }

// ---------------- boot ----------------
function afterIntro() { if (Welcome.needed()) Welcome.open(() => UI.toMenu()); else UI.toMenu(); }
G.afterIntro = afterIntro;
async function boot() {
  const r = Save.load();
  document.body.classList.toggle('reduced', Settings.reducedMotion);
  onSettingsChange(() => { clearTextCache(); });
  resize();
  window.addEventListener('resize', () => { resize(); clearSpriteCache(); });
  $('versionLabel').innerHTML = `v${VERSION}<br><small style="font-family:var(--body);letter-spacing:.1em">BUILD ${BUILD}</small>`;
  generateMap();                                   // the menu background city
  Game.state = 'boot';
  window.addEventListener('pointerdown', () => audioInit(), { once: true });
  try { await Promise.race([Promise.all([document.fonts.load('400 20px Bungee'), document.fonts.load('800 20px "Barlow Condensed"')]), new Promise(res => setTimeout(res, 1500))]); } catch (e) { }
  clearTextCache();
  $('loader').hidden = true;
  for (const msg of r.issues) UI.toast(msg, '#ff3b4e', 7);
  if (r.source === 'v2') UI.toast('Your v2 progress was migrated to the new save format', '#52f08a', 6);
  startLoop({ step: safe(step), render: safe(render) });
  if (DEBUG) {
    if (!Save.profile()) Save.useGuest();
    installBench();
    window.__UC.G = G; window.__UC.W = W;
    UI.toMenu();
  } else if (Intro.shouldPlay()) Intro.start();
  else afterIntro();
  if (!import.meta.env.DEV) checkVersion();
}
// Tell players when a newer build is live so nobody stays stuck on a cached release.
async function checkVersion() {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const v = await res.json();
    if (v.build && v.build !== BUILD) UI.toast(`Update available (v${v.version}) — reload the page to play it`, '#ffd23f', 10);
  } catch (e) { /* offline is fine */ }
}
boot().catch(fatal);
