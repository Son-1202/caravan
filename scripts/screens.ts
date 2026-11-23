// Screenshot the built demo with Playwright (1280x720, DPR 1).
// Usage: npm run build && npm run screens [-- prefix region1 region2 ...]
// Starts `vite preview` in the background, captures, then kills it.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Playwright is pre-installed globally (not a project dep), so type the
// small surface we use instead of importing its types.
interface PwPage {
  goto(url: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
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

const PORT = 4179;
const [prefix = 'T-01', ...regionArgs] = process.argv.slice(2);
const regions = regionArgs.length ? regionArgs : ['whisperpine', 'frostspire'];
const outDir = path.resolve('docs/qa/screens');

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
  mkdirSync(outDir, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: true,
  });
  try {
    const base = `http://localhost:${PORT}/`;
    await waitFor(base);
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    for (const r of regions) {
      await page.goto(`${base}?region=${r}&quality=high`);
      await page.waitForTimeout(3000);
      const file = path.join(outDir, `${prefix}-${r}.png`);
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
