// T-09 QA screenshots of the real game flow (1280x720 + one 844x390), DPR 1.
// Usage: npm run build && npm run screens:game [prefix=T-09]
// Drives the UI through window.__debug; ends with __debug.runBot('greedy') in the real UI
// and fails (exit 1) if the page logged any console error.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

interface PwPage {
  goto(url: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForFunction(fn: string, arg: unknown, o: { timeout: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  click(sel: string): Promise<void>;
  mouse: { move(x: number, y: number): Promise<void>; click(x: number, y: number): Promise<void> };
  screenshot(o: { path: string }): Promise<unknown>;
  on(ev: 'console', cb: (m: { type(): string; text(): string }) => void): void;
  on(ev: 'pageerror', cb: (e: Error) => void): void;
}
interface Browser {
  newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number; hasTouch?: boolean }): Promise<PwPage>;
  close(): Promise<void>;
}
interface Playwright { chromium: { launch(): Promise<Browser> } }

const require = createRequire(import.meta.url);
function loadPlaywright(): Playwright {
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

const PORT = 4183;
const SEED = 7;
const prefix = process.argv[2] ?? 'T-09';
const outDir = path.resolve('docs/qa/screens');
const errors: string[] = [];

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

async function shot(page: PwPage, name: string): Promise<void> {
  const file = path.join(outDir, `${prefix}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', path.relative(process.cwd(), file));
}

const screen = (page: PwPage) => page.evaluate<string>('window.__debug.state().screen');
const untilScreen = (page: PwPage, s: string, timeout = 15000) =>
  page.waitForFunction(`window.__debug && window.__debug.state && window.__debug.state().screen === ${JSON.stringify(s)}`, null, { timeout });

/** index of the first reachable node of one of the given types (-1 if none) */
const nodeIdx = (page: PwPage, types: string[]) =>
  page.evaluate<number>(`window.__debug.run.availableNodes().findIndex((n) => ${JSON.stringify(types)}.includes(n.type))`);

async function newPage(browser: Browser, w: number, h: number): Promise<PwPage> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1000 });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text());
      console.error('[page]', m.text());
    }
  });
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('[pageerror]', e.message);
  });
  return page;
}

/** From the map, walk fights (win instantly) until a node of `want` type is reachable; open it. */
async function walkTo(page: PwPage, want: string[]): Promise<boolean> {
  for (let guard = 0; guard < 12; guard++) {
    const s = await screen(page);
    if (s === 'map') {
      const i = await nodeIdx(page, want);
      if (i >= 0) {
        await page.evaluate(`window.__debug.gotoNode(${i})`);
        return true;
      }
      const f = await nodeIdx(page, ['fight', 'elite', 'boss']);
      await page.evaluate(`window.__debug.gotoNode(${Math.max(0, f)})`);
    } else if (s === 'formation') {
      await page.click('.screen--formation .btn--ember');
      await page.waitForTimeout(300);
      await page.evaluate('window.__debug.winFight()');
      await untilScreen(page, 'reward');
    } else if (s === 'reward') {
      await page.evaluate('window.__debug.run.proceed(); window.__debug.app.refresh()');
    } else if (s === 'event') {
      await page.evaluate("document.querySelector('.event__choice:not(:disabled)')?.click()");
      await page.waitForTimeout(100);
      await page.evaluate("document.querySelector('.screen--event .btn--ember')?.click()");
    } else return false;
    await page.waitForTimeout(150);
  }
  return false;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  try {
    const base = `http://localhost:${PORT}/?seed=${SEED}&quality=high`;
    await waitFor(`http://localhost:${PORT}/`);
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch();
    const page = await newPage(browser, 1280, 720);

    await page.goto(base);
    await untilScreen(page, 'start');
    await page.waitForTimeout(2500);
    await shot(page, 'start');

    await page.mouse.click(640, 400); // tap to start (T-12 title)
    await page.waitForTimeout(600);
    await page.click('.title__begin');
    await page.evaluate('window.__debug.app.dialogue?.finish()'); // skip the prologue (T-12)
    await untilScreen(page, 'map');
    await page.waitForTimeout(2500);
    await shot(page, 'map');

    const ev = await nodeIdx(page, ['event']);
    if (ev >= 0) {
      await page.evaluate(`window.__debug.gotoNode(${ev})`);
      await untilScreen(page, 'event');
      await page.waitForTimeout(600);
      await shot(page, 'event');
      await page.evaluate(`window.__debug.newRun(${SEED}); window.__debug.app.begin(); window.__debug.app.dialogue?.finish()`);
      await untilScreen(page, 'map');
    }

    await page.evaluate(`window.__debug.gotoNode(${Math.max(0, await nodeIdx(page, ['fight']))})`);
    await untilScreen(page, 'formation');
    await page.waitForTimeout(800);
    await shot(page, 'formation');

    await page.click('.screen--formation .btn--ember');
    await untilScreen(page, 'battle');
    await page.waitForTimeout(5200);
    await shot(page, 'battle');
    await page.evaluate('window.__debug.winFight()');
    await untilScreen(page, 'reward');
    await page.waitForTimeout(400);
    await shot(page, 'reward');
    await page.evaluate('window.__debug.run.proceed(); window.__debug.app.refresh()');

    if (await walkTo(page, ['merchant', 'camp'])) {
      await page.waitForTimeout(800);
      await shot(page, await screen(page));
    } else console.warn('! no merchant/camp reached');

    // phone landscape battle HUD
    const phone = await newPage(browser, 844, 390);
    await phone.goto(base);
    await untilScreen(phone, 'start');
    await phone.evaluate('window.__debug.gotoNode(0)');
    await untilScreen(phone, 'formation');
    await phone.waitForTimeout(500);
    await shot(phone, 'formation-844x390');
    await phone.click('.screen--formation .btn--ember');
    await untilScreen(phone, 'battle');
    // park the pointer off the HUD so the tap's hover doesn't leave a tooltip open
    await phone.mouse.move(2, 200);
    await phone.waitForTimeout(5200);
    await shot(phone, 'battle-844x390');

    // full greedy bot run in the real UI
    await page.evaluate(`window.__debug.newRun(${SEED})`);
    const t0 = Date.now();
    await page.evaluate('window.__botDone = null; window.__debug.runBot("greedy", { speed: 16 }).then((r) => { window.__botDone = r; })');
    await page.waitForFunction('window.__botDone !== null', null, { timeout: 600000 });
    const res = await page.evaluate<string>('window.__botDone');
    console.log(`bot run: ${res} in ${Math.round((Date.now() - t0) / 1000)} s`);
    await page.waitForTimeout(1200);
    await shot(page, 'end');

    await browser.close();
  } finally {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  }
  if (errors.length) {
    console.error(`${errors.length} console error(s)`);
    process.exit(1);
  }
  console.log('no console errors');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
