// T-07 QA screenshots of the ?demo=combat CombatView (1280x720, DPR 1).
// Usage: npm run build && npx tsx scripts/screens-combat.ts [prefix=T-07]
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
const prefix = process.argv[2] ?? 'T-07';
const SHOTS: Array<{ name: string; query: string }> = [
  { name: 'combat-idle', query: 'demo=combat&freeze=time:1200' },
  { name: 'attack', query: 'demo=combat&freeze=attack:190' },
  { name: 'break', query: 'demo=combat&freeze=break:140' },
  { name: 'glass_dunes', query: 'demo=combat&region=glass_dunes&freeze=time:1200' },
  { name: 'ignite', query: 'demo=combat&speed=3&freeze=ignite:450' },
];

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
