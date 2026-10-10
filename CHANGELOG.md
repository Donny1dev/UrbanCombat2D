# Changelog

## 3.0.0: Release Edition (2026-10-10)

### Engine and performance
- Rebuilt from a single HTML file into ES modules with Vite. Layers flow one way (core → data → systems → world → rendering → entities → game → ui), with no circular imports.
- Fixed 60 Hz simulation with an accumulator and interpolated rendering. Game speed no longer depends on refresh rate.
- Spatial grid, swept bullet collision, object pools, map chunk caching and cached enemy poses.
- Damage numbers merge per enemy, and the audio voice limiter stops audio spikes in big fights.
- Quality presets (Auto, Low, Medium, High) and an F3 performance overlay.
- Measured against v2 on the same machine: heavy scenarios now run at the display cap, and 2.5–3.2× faster under 4× CPU throttling. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- Fixed a v2 bug where particles could pile up past 30,000 in long fights.

### Equipment and loadouts
- Three slots (Armour, Tactical Gadget, Support) with 8 items each.
- Every item has 3 ranks and 4 rarities, and each rarity adds a real perk.
- 8 equipment synergies and a cooldown/charge HUD.
- Equipment crates appear after wave 3, then every 3–4 waves. Bosses, elite hunts, rare elite kills (at most one per 3 waves) and supply drops also drop them. Each crate offers a rank upgrade, a rarity upgrade or a gear swap.

### Progression
- Local profiles with callsigns (3–18 characters: letters, numbers, underscore), with filters for reserved and offensive names. Guest play is always available; guest profiles can rename later and keep their progress.
- 8 career ranks and Supply Credits for unlocking gear and weapons. Rewards are idempotent per run.
- 32 achievements, profile frames and cosmetic unlocks.
- Clearly labelled **LOCAL RECORDS**: per-device rankings by wave, survival time, kills, score and today's Daily. There is no online service, and nothing claims otherwise.

### Content and modes
- Three bosses with telegraphed attacks and weakness windows: Juggernaut, Commander and Engineer.
- Modes: Standard, Hardcore, Daily Operation (date-seeded city, weapon and modifiers) and Training Grounds (dummies, DPS meter, live gear switching).
- In-run objectives, a first-run tutorial with contextual tips, and pacing rebalance.

### Interface
- New main menu: Play, Loadout, Character, Profile, Arsenal, Local Records, Achievements and Settings.
- Pre-deployment screen with mode select and kit summary.
- **OPERATION COMPLETE** results screen with REDEPLOY, CHANGE LOADOUT and MAIN MENU.
- Overhauled HUD: equipment slots, objectives, achievement cards.
- Settings in six tabs, including full key rebinding, colour-blind palettes, reduced motion and flashing, and HUD scale.
- Loading screen, error screen with safe recovery, favicon and social preview metadata.

### Saves
- Versioned save (`uc3_save`, schema 3) with validation. v2 progress is migrated automatically.
- Corrupt saves are backed up, not lost.
- Export and import with a checksum, plus a full reset in Settings → Data.

### Quality
- Unit tests (Vitest), 27 end-to-end tests (Playwright) and benchmark and soak scripts, run in CI before every deploy.
- Fixed before release, after the new tests caught them:
  - DEPLOY buttons not responding
  - a grenade-render crash
  - a crate being replaced by a simultaneous level-up
  - overkill damage inflating rewards
  - crate flooding from elites
  - layout overflow at 1280×720

## 2.0: The Evolution & Arsenal Update
- 71 upgrades, 14 synergies, card locks and rerolls, medkits.
- Evolution 2.0: 10 tier I and 6 tier II evolutions, tracked per weapon.
- HUD inventory, animated menu and intro, character designer, codex, archetypes, streaks, events and lifetime stats.

## 1.0: Initial release
- Top-down arcade shooter with a procedural city, weapons, upgrades and enemy waves.
