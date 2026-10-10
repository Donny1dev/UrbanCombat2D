// Fixed-timestep simulation (60 Hz) with an accumulator, a catch-up cap and render interpolation.
export const STEP = 1 / 60;
const MAX_STEPS = 5;          // never simulate more than 5 steps per frame
const MAX_GAP = 0.25;         // long stalls (tab switch, breakpoint) are clamped instead of fast-forwarded
const N = 240;                // rolling window for the perf overlay

export const Perf = {
  frame: new Float32Array(N), upd: new Float32Array(N), ren: new Float32Array(N), i: 0, count: 0,
  steps: 0, dropped: 0, onPush: null,
  push(f, u, r) {
    if (this.onPush) this.onPush(f, u, r); this.frame[this.i] = f; this.upd[this.i] = u; this.ren[this.i] = r; this.i = (this.i + 1) % N; this.count = Math.min(N, this.count + 1); },
  summary() {
    const n = this.count; if (!n) return null;
    const f = Array.from(this.frame.slice(0, n)).sort((a, b) => a - b);
    let fs = 0, us = 0, rs = 0; for (let k = 0; k < n; k++) { fs += this.frame[k]; us += this.upd[k]; rs += this.ren[k]; }
    return { fps: 1000 / (fs / n), avg: fs / n, p95: f[Math.floor(n * 0.95)], p99: f[Math.floor(n * 0.99)], upd: us / n, ren: rs / n };
  },
  reset() { this.i = 0; this.count = 0; },
};

export function startLoop({ step, render }) {
  let last = performance.now(), acc = 0;
  function frame(now) {
    let gap = (now - last) / 1000; last = now;
    if (gap > MAX_GAP) gap = STEP;            // resume gracefully after a stall
    acc += gap;
    const t0 = performance.now();
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { step(STEP); acc -= STEP; n++; }
    if (n === MAX_STEPS && acc >= STEP) { Perf.dropped++; acc = 0; }
    Perf.steps = n;
    const t1 = performance.now();
    render(acc / STEP, now / 1000);
    const t2 = performance.now();
    Perf.push(gap * 1000, t1 - t0, t2 - t1);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
