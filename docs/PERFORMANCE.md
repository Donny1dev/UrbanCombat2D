# Performance and stability

All numbers on this page were measured, and the raw output of every run is in [`docs/results/`](results/). Nothing here is estimated.

## Test machine and method

| | |
|---|---|
| CPU | AMD Ryzen 7 5700X (8 cores) |
| GPU | NVIDIA GeForce RTX 4060 |
| RAM | 16 GB |
| OS | Windows 11 |
| Browser | Microsoft Edge (Chromium), headless, driven by Playwright 1.64 |
| Display | 1920×1080 viewport. The headless compositor caps frames at about 144 fps, so **143–144 fps means "at the cap"** |

- **Benchmark:** `tests/bench/run-bench.mjs` starts each scenario on a fresh page through the `?bench` API, waits 2.5 s, then records 8 s of frames.
- **"cpu avg ms":** JavaScript time per frame (simulation plus canvas command submission). It does not include GPU or compositor time, so it says more about CPU headroom than fps does.
- **4× throttle:** Chrome DevTools CPU throttling. It emulates a much slower CPU but is not a real low-end device.
- **Quality pinning:** the preset is pinned to HIGH unless stated, so the AUTO preset cannot downgrade itself partway through a measurement.
- **v2 baseline:** v2 (commit `b004439`) runs the same scenarios through the same bench API via `tests/bench/v2-baseline/`. v2 has no quality presets.
- **Same-session pairs:** v2 and v3 were measured in the same session, back to back. Absolute numbers vary between sessions (an earlier session measured v2 dense at 39 fps rather than 55), so compare within a table, not across days.

### Scenarios

| Scenario | What it stresses |
|---|---|
| early | Wave-1 conditions: a handful of enemies |
| dense | 150 enemies and a rapid multi-shot, piercing build |
| projectiles | About 520 live enemy bullets plus a multi-shot build |
| explosions | An explosion every 0.1 s, explosive rounds and frag upgrades |
| xp | 1,500 XP gems on the ground plus magnet pulls |
| drones | 120 enemies, drones, blades and orbitals |
| indoor | 100 enemies inside buildings (walls, line of sight, flow field) |

## Results: v2 vs v3, same session

| Scenario | v2 fps (1×) | v3 fps (1×) | v2 fps (4×) | v3 fps (4×, HIGH) | v3 fps (4×, MEDIUM) | v3 fps (4×, LOW) |
|---|---|---|---|---|---|---|
| early | 143.9 | 143.7 | 131.7 | 143.0 | 142.9 | 143.0 |
| dense | 54.8 | **143.9** | 17.2 | **48.8** | 60.1 | 86.0 |
| projectiles | 96.5 | **143.6** | 26.0 | **65.4** | 67.3 | 68.0 |
| explosions | 55.7 | **141.0** | 14.3 | **45.2** | 49.0 | 66.3 |
| xp | 143.9 | 143.9 | 83.6 | **143.2** | 141.7 | 142.1 |
| drones | 69.6 | **143.7** | 25.3 | **76.9** | 78.5 | 106.8 |
| indoor | 104.9 | **143.9** | 53.0 | **141.4** | 141.2 | 142.6 |

CPU time per frame (ms, average):

| Scenario | v2 (1×) | v3 (1×) | v2 (4×) | v3 (4×, HIGH) |
|---|---|---|---|---|
| dense | 9.20 | 2.23 | 34.81 | 16.60 |
| projectiles | 4.70 | 2.09 | 24.66 | 11.93 |
| explosions | 9.59 | 2.90 | 40.12 | 17.60 |
| drones | 4.82 | 1.92 | 24.14 | 9.90 |
| indoor | 2.27 | 1.11 | 12.60 | 4.58 |

Takeaways:

- **Unthrottled:** every v3 scenario runs at the display cap. In v2, dense and explosions ran at about 55 fps.
- **Throttled (4×):** v3 at HIGH is 2.5–3.2× faster than v2 in the heavy scenarios. The LOW preset adds another 39–76% in dense, explosions and drones.
- **Remaining bottleneck:** the heaviest cases at 4× (dense, explosions) are still limited by canvas draw submission (`drawImage`/`fillRect`), not by simulation. Simulation update is 3–4 ms of the 14–18 ms.

## What changed to get there

These changes were chosen from CPU profiles (`tests/bench/profile.mjs`), not guesswork:

- **Fixed 60 Hz simulation:** accumulator with interpolated rendering, so simulation cost no longer scales with refresh rate.
- **Spatial grid:** allocation-free neighbour queries for enemy separation, bullet hits, explosions, magnets and drones.
- **Swept bullet collision:** segment-versus-circle tests, so no tunnelling at high speed or low frame rate.
- **Object pools:** particles, bullets, damage numbers and decals are pooled. Particle overflow recycles the oldest particle; v2 could grow to more than 30,000 particles.
- **Render caches:**
  - map chunks cached as bitmaps and invalidated only when tiles change
  - cached enemy poses: four walk frames, a hit-flash variant and the shadow baked in
  - a text-sprite LRU cache, with damage numbers merging per enemy
  - batched bullet and spark paths
- **Audio voice limiter:** at most 14 new voices per 100 ms. Node creation was about 7% of frame time in heavy fights.
- **Quality presets:** LOW, MEDIUM, HIGH and AUTO. AUTO steps down at most twice if average frame time stays above 20 ms.
- **F3 overlay:** shows fps, frame-time percentiles, update and render split, draw calls and entity counts in game.

## Long-run stability

`tests/stability/soak.mjs` runs the real simulation much faster than real time with a bot, using the production build:

- **Bot behaviour:** it aims at the nearest enemy, fires, moves, dashes and uses its gadget and support item.
- **Real game logic:** level-ups and crates use the real offer generation and apply logic; only the card animation is skipped.
- **HP refills:** the bot's HP is topped up when it drops below a threshold, so runs reach late waves while every damage path still runs. Each refill is counted.
- **Heap figures:** measured after a forced garbage collection.

### 45 game-minutes, one continuous run (refill below 60%)

| Game minute | Wave | Level | Kills | Enemies | Particles | ms per sim step | Heap (MB) |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 5 | 81 | 13 | 64 | 0.055 | 3.85 |
| 10 | 21 | 40 | 2,724 | 152 | 1,197 | 0.281 | 5.68 |
| 20 | 40 | 81 | 10,494 | 183 | 591 | 0.346 | 6.17 |
| 30 | 59 | 124 | 23,980 | 181 | 933 | 0.382 | 6.66 |
| 45 | 87 | 181 | 48,296 | 189 | 868 | 0.453 | 6.77 |

- **Heap levels off at about 6–7 MB** after minute 25. Enemies are capped at about 190 and particles stay pooled.
- **0 page errors.** The run included 180 level-ups, 30 crates and 414 gadget/support uses.

### 20 and 45 game-minutes at the default refill (below 30%)

- **20 minutes:** wave 35, heap 3.75 → 6.29 MB, 0 errors. The bot died once at wave 6 to a boss melee hit with 33 HP left; that's a fair hit, not a one-shot. It restarted automatically.
- **45 minutes:** the bot died once at wave 37 (an elite explosion plus chip damage), restarted and reached wave 52. Heap 4.02 → 6.95 MB, 0 errors.

### Death → results → redeploy cycles

| Cycle | 1 | 10 | 25 | 50 | 100 | 150 | 200 | 250 | 300 |
|---|---|---|---|---|---|---|---|---|---|
| Heap (MB) | 4.64 | 5.29 | 5.24 | 5.68 | 5.89 | 6.04 | 5.96 | 6.22 | 6.29 |

- **DOM:** stays at 245 nodes in every cycle.
- **Growth comes from run history:** heap grows by about 5 KB per run until the history reaches its 150-run cap, then stays within 5.96–6.29 MB. The save file stabilises at about 28 KB.
- **Results screen:** every cycle reached the OPERATION COMPLETE screen.

## Not measured, and limitations

- **No real low-end hardware:** no phones, tablets or low-end laptops were tested. "4×" is CPU throttling emulation on a desktop.
- **Headless only:** everything ran in headless Edge. GPU-heavy differences between browsers (Firefox, Safari) were not benchmarked.
- **Not a reflex test:** the soak bot does not play like a human. It is a stability and leak test, not a difficulty test, and its HP top-ups mean its wave numbers say nothing about real difficulty.
- **Frame cap hides headroom:** fps at the 144 cap hides remaining headroom. Use the "cpu avg ms" column for that.

## Reproducing

```bash
npm run build
npx vite preview --port 4173                      # serves dist/
npm run bench -- "http://localhost:4173/?bench" --throttle=4 --quality=high --channel=msedge
npm run soak  -- "http://localhost:4173/?debug" --minutes=45 --cycles=50 --channel=msedge
node tests/bench/v2-baseline/make-v2-bench.mjs    # then pass its file:// URL to the bench
```

Leave out `--channel` to use Playwright's bundled Chromium (`npx playwright install chromium`).
