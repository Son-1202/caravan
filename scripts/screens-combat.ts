// QA screenshots of the ?demo=combat CombatView (1280x720, DPR 1).
// Usage: npm run build && npx tsx scripts/screens-combat.ts [prefix=T-13] [perf]
//   perf: also log the average frame time over 5 s with the battle running (high quality).
// Each shot uses the demo's ?freeze=<cue>:<ms> switch and waits until the
// frame is frozen, so captures are deterministic-ish (seeded sim, real-time clock).
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

interface PwPage {
  goto(url: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForFunction(fn: string, arg: unknown, o: { timeout: number }): Promise<unknown>;
  screenshot(o: { path: string }): Promise<unknown>;
  evaluate(fn: string): Promise<unknown>;
  on(ev: 'console', cb: (m: { type(): string; text(): string }) => void): void;
  on(ev: 'pageerror', cb: (e: Error) => void): void;
}
interface Playwright {
  chromium: {
    launch(): Promise<{
      newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<PwPage>;
      close(): Promise<void>;
    }>;
  };
}

const require = createRequire(import.meta.url);
function loadPlaywright(): Playwright {
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

const PORT = 4181;
const prefix = process.argv[2] ?? 'T-13';
const perf = process.argv.includes('perf');
const only = process.env.SHOTS?.split(',');
const ALL_SHOTS: Array<{ name: string; query: string }> = [
  { name: 'break', query: 'demo=combat&freeze=break:120' },
  { name: 'ignite', query: 'demo=combat&speed=3&freeze=ignite:1450' },
  { name: 'dunes', query: 'demo=combat&region=glass_dunes&freeze=attack:200' },
  { name: 'frostspire', query: 'demo=combat&region=frostspire&freeze=attack:200' },
  { name: 'solenne', query: 'demo=combat&region=solenne&freeze=attack:200' },
  { name: 'march', query: 'demo=combat&march=1&freeze=time:2500' },
];
const SHOTS = only ? ALL_SHOTS.filter((s) => only.includes(s.name)) : ALL_SHOTS;

/** In-page: average rAF frame time (ms) over `ms` of wall time. */
const MEASURE = (ms: number): string => `new Promise((res) => {
  const dbg = window.__debug; let cpu = 0;
  const timed = (o, k) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); cpu += performance.now() - t; return r; }; };
  timed(dbg.combat, 'update'); timed(dbg.diorama, 'update');
  const d = []; let last = performance.now(); const end = last + ${ms};
  const f = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else {
    d.sort((a, b) => a - b);
    res({ frames: d.length, avgFrameMs: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)], jsUpdateMsPerFrame: cpu / d.length, drawCalls: dbg.renderer.info.render.calls, gl: (() => { const g = dbg.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })(), quality: dbg.postfx.quality });
  } };
  requestAnimationFrame(f);
})`;

async function waitFor(url: string, ms = 20000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not start: ${url}`);
}

async function main(): Promise<void> {
  const outDir = path.resolve('docs/qa/screens');
  mkdirSync(outDir, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  try {
    const base = `http://localhost:${PORT}/`;
    await waitFor(base);
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    if (perf) {
      for (const q of ['high', 'low']) {
        await page.goto(`${base}?demo=combat&speed=2&quality=${q}`);
        await page.waitForTimeout(2500);
        const r = await page.evaluate(MEASURE(5000));
        console.log(`perf ${q} 1280x720:`, JSON.stringify(r));
      }
    }
    for (const s of SHOTS) {
      await page.goto(`${base}?${s.query}&quality=high`);
      try {
        await page.waitForFunction('window.__debug && window.__debug.frozen === true', null, { timeout: 60000 });
      } catch {
        console.warn(`! ${s.name}: freeze trigger never fired; capturing anyway`);
      }
      await page.waitForTimeout(250);
      const file = path.join(outDir, `${prefix}-${s.name}.png`);
      await page.screenshot({ path: file });
      console.log('saved', path.relative(process.cwd(), file));
    }
    await browser.close();
  } finally {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
