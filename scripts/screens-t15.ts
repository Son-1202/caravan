// T-15-1 QA screenshots: fg clip (combat / map / end screens), hit-flash, boss rim.
// Usage: npm run build && npx tsx scripts/screens-t15.ts
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

interface PwPage {
  goto(url: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForFunction(fn: string, arg: unknown, o: { timeout: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  screenshot(o: { path: string }): Promise<unknown>;
  close(): Promise<void>;
  on(ev: 'pageerror', cb: (e: Error) => void): void;
}
interface Browser {
  newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<PwPage>;
  close(): Promise<void>;
}

const require = createRequire(import.meta.url);
function loadPlaywright(): { chromium: { launch(): Promise<Browser> } } {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const PORT = 4183;
const out = path.resolve('docs/qa/screens');
const only = process.env.SHOTS?.split(',');
const want = (n: string): boolean => !only || only.includes(n);

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  try {
    const base = `http://localhost:${PORT}/`;
    await waitFor(base);
    const browser = await loadPlaywright().chromium.launch();
    const save = async (page: PwPage, name: string): Promise<void> => {
      await page.screenshot({ path: path.join(out, `T-15-1-${name}.png`) });
      console.log('saved', name);
    };
    const combat: Array<[string, string, number, number]> = [
      ['combat-whisperpine', 'region=whisperpine&freeze=attack:200', 1280, 720],
      ['combat-whisperpine-1080', 'region=whisperpine&freeze=attack:200', 1920, 1080],
      ['combat-frostspire', 'region=frostspire&freeze=attack:200', 1280, 720],
      ['combat-dunes', 'region=glass_dunes&freeze=attack:200', 1280, 720],
      ['combat-solenne', 'region=solenne&freeze=attack:200', 1280, 720],
      ['break', 'region=whisperpine&freeze=break:120', 1280, 720],
      ['boss-solenne', 'region=solenne&fight=so_boss&freeze=attack:600', 1280, 720],
      ['march', 'march=1&freeze=time:2500', 1280, 720],
    ];
    for (const [name, q, w, h] of combat) {
      if (!want(name)) continue;
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error('[pageerror]', e.message));
      await page.goto(`${base}?demo=combat&${q}&quality=high`);
      try {
        await page.waitForFunction('window.__debug && window.__debug.frozen === true', null, { timeout: 60000 });
      } catch {
        console.warn(`! ${name}: freeze never fired`);
      }
      await page.waitForTimeout(400);
      await save(page, name);
      await page.close();
    }
    if (want('map') || want('win')) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error('[pageerror]', e.message));
      await page.goto(`${base}?seed=7&quality=high`);
      await page.waitForFunction('window.__debug && window.__debug.app', null, { timeout: 30000 });
      await page.evaluate('window.__debug.app.begin(); window.__debug.app.dialogue?.finish(); window.__debug.app.refresh()');
      await page.waitForTimeout(3000);
      if (want('map')) await save(page, 'map');
      await page.evaluate('window.__debug.endRun(true)');
      await page.waitForTimeout(3000);
      if (want('win')) await save(page, 'win');
      await page.close();
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
