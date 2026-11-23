// T-14 end-to-end test: plain node + Playwright (run via tsx, NOT vitest).
// Usage: npm run build && npm run e2e
// Env: E2E_SEEDS=7,11,23,42,99 (bot seeds, stops at first win) · E2E_SKIP_BOT=1 · E2E_BOT_TIMEOUT_MIN=25
// Serves dist/ with `vite preview --port 4173`, checks (a) clean load, (b) greedy bot full runs,
// (c) screenshots into docs/qa/screens/final/. Prints a pass/fail summary; exits 1 on failure.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface PwPage {
  goto(url: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForFunction(fn: string, arg: unknown, o: { timeout: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  click(sel: string, o?: { timeout?: number }): Promise<void>;
  mouse: { move(x: number, y: number): Promise<void>; click(x: number, y: number): Promise<void> };
  screenshot(o: { path: string }): Promise<unknown>;
  on(ev: 'console', cb: (m: { type(): string; text(): string }) => void): void;
  on(ev: 'pageerror', cb: (e: Error) => void): void;
  setDefaultTimeout(ms: number): void;
  close(): Promise<void>;
}
interface Browser {
  newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number; hasTouch?: boolean }): Promise<PwPage>;
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

const PORT = 4173;
const ROOT = `http://localhost:${PORT}/`;
const SHOT_SEED = 7;
const SEEDS = (process.env.E2E_SEEDS ?? '7,11,23,42,99').split(',').map(Number).filter((n) => n > 0).slice(0, 5);
const BOT_TIMEOUT = Number(process.env.E2E_BOT_TIMEOUT_MIN ?? 25) * 60_000;
const outDir = path.resolve('docs/qa/screens/final');
const REGIONS = ['whisperpine', 'glass_dunes', 'frostspire', 'solenne'];

const results: Array<{ name: string; ok: boolean; info: string }> = [];
const errors: string[] = [];
const shots: string[] = [];

function check(name: string, ok: boolean, info = ''): void {
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`);
}

async function step(name: string, fn: () => Promise<string | void>): Promise<void> {
  const before = errors.length;
  try {
    const info = (await fn()) ?? '';
    const errs = errors.slice(before);
    check(name, errs.length === 0, errs.length ? `${info} console errors: ${errs.join(' | ')}` : info);
  } catch (e) {
    check(name, false, (e as Error).message.split('\n')[0]);
  }
}

async function waitFor(url: string, ms = 30000): Promise<void> {
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
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(path.relative(process.cwd(), file));
  console.log('      saved', path.relative(process.cwd(), file));
}

const state = <T = Record<string, unknown>>(page: PwPage) => page.evaluate<T>('window.__debug.state()');
const untilScreen = (page: PwPage, s: string, timeout = 60000) =>
  page.waitForFunction(`window.__debug && window.__debug.state && window.__debug.state().screen === ${JSON.stringify(s)}`, null, { timeout });
const nodeIdx = (page: PwPage, types: string[]) =>
  page.evaluate<number>(`window.__debug.run.availableNodes().findIndex((n) => ${JSON.stringify(types)}.includes(n.type))`);

async function newPage(browser: Browser, w: number, h: number): Promise<PwPage> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1000 });
  page.setDefaultTimeout(60000);
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return page;
}

/** Fresh started run (prologue skipped) on the map. */
async function freshRun(page: PwPage, seed = SHOT_SEED): Promise<void> {
  await page.evaluate(`window.__debug.newRun(${seed}); window.__debug.app.begin(); window.__debug.app.dialogue?.finish()`);
  await untilScreen(page, 'map');
}

/** Jump the current run to region `r` (0..3) at map step `stepIdx` (-1 = boss step). */
async function jumpRegion(page: PwPage, r: number, stepIdx = 0): Promise<void> {
  await page.evaluate(`(() => { const d = window.__debug, run = d.run; run.regionIdx = ${r};
    run.step = ${stepIdx} < 0 ? run.map[${r}].steps.length - 1 : ${stepIdx}; run.status = 'map'; d.app.refresh(); })()`);
  await untilScreen(page, 'map');
}

/** From the map: open a node of one of `types`, accept formation, wait until the battle is live. */
async function enterBattle(page: PwPage, types: string[]): Promise<string> {
  const i = await nodeIdx(page, types);
  if (i < 0) throw new Error(`no ${types.join('/')} node reachable`);
  const id = await page.evaluate<string>(`window.__debug.gotoNode(${i})`);
  await untilScreen(page, 'formation');
  await page.click('.screen--formation .btn--ember');
  await untilScreen(page, 'battle');
  return id;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  const botOutcomes: Array<{ seed: number; result: string; seconds: number }> = [];
  try {
    await waitFor(ROOT);
    const browser = await loadPlaywright().chromium.launch();
    const page = await newPage(browser, 1280, 720);
    const base = `${ROOT}?seed=${SHOT_SEED}&quality=high`;

    // (a) clean load + title
    await step('(a) game loads with zero console/page errors', async () => {
      await page.goto(base);
      await untilScreen(page, 'start');
      await page.waitForTimeout(2500);
      await page.mouse.click(640, 400); // tap to start
      await page.waitForTimeout(2500);
      const hasCanvas = await page.evaluate<boolean>('!!document.querySelector("canvas")');
      if (!hasCanvas) throw new Error('no canvas');
      await shot(page, 'title');
      return 'title shown';
    });

    // (c) screenshots
    await step('(c) map screen', async () => {
      await page.click('.title__begin');
      await page.waitForFunction('window.__debug.state().dialogue !== null', null, { timeout: 20000 });
      await page.evaluate('window.__debug.app.dialogue.finish()');
      await untilScreen(page, 'map');
      await page.waitForTimeout(2500);
      await shot(page, 'map');
      const n = await page.evaluate<number>('window.__debug.run.availableNodes().length');
      if (n < 2) throw new Error(`only ${n} nodes on step 1`);
      return `${n} nodes on step 1`;
    });

    for (let r = 0; r < 4; r++) {
      await step(`(c) combat in region ${r + 1} (${REGIONS[r]})`, async () => {
        await freshRun(page);
        if (r > 0) await jumpRegion(page, r, 0);
        await enterBattle(page, ['fight', 'elite']);
        await page.mouse.move(2, 360);
        await page.waitForTimeout(6000);
        const st = await state<{ region: number; battle: { outcome: string } | null }>(page);
        const dio = await page.evaluate<string>('window.__debug.diorama.region.id');
        await shot(page, `combat-${REGIONS[r]}`);
        if (dio !== REGIONS[r]) throw new Error(`diorama shows ${dio}`);
        return `region ${st.region}, diorama ${dio}, outcome ${st.battle?.outcome}`;
      });
    }

    await step('(c) Break moment', async () => {
      await freshRun(page);
      await enterBattle(page, ['fight', 'elite']);
      // watch sim events for a 'break'; then freeze the battle a beat later (mid-VFX)
      await page.evaluate(`(() => { const b = window.__debug.app.battle; window.__broke = 0; b.speed = 2;
        const orig = b.hud.onEvents.bind(b.hud);
        b.hud.onEvents = (ev) => { if (!window.__broke && ev.some((e) => e.type === 'break')) window.__broke = performance.now(); orig(ev); };
      })()`);
      await page.waitForFunction('window.__broke > 0 || window.__debug.state().battle?.outcome !== "ongoing"', null, { timeout: 240000 });
      const broke = await page.evaluate<number>('window.__broke');
      if (!broke) throw new Error('battle ended without a Break');
      await page.waitForTimeout(700);
      await page.evaluate('(() => { const b = window.__debug.app.battle; b.update = () => {}; })()');
      await page.mouse.move(2, 360);
      await page.waitForTimeout(300);
      await shot(page, 'break');
      await page.evaluate('delete window.__debug.app.battle.update');
      return 'break event captured';
    });

    await step('(c) Hollow King boss fight', async () => {
      await freshRun(page);
      await jumpRegion(page, 3, -1);
      await enterBattle(page, ['boss']);
      await page.mouse.move(2, 360);
      await page.waitForTimeout(7000);
      const names = await page.evaluate<string[]>('window.__debug.app.battle.battle.state.units.filter((u) => u.side === "enemy").map((u) => u.defId ?? u.id ?? u.name)');
      await shot(page, 'boss-hollow-king');
      const joined = names.join(',');
      if (!/hollow/i.test(joined)) throw new Error(`boss units: ${joined}`);
      return `enemies: ${joined}`;
    });

    await step('(c) twist dialogue', async () => {
      await freshRun(page);
      await page.evaluate("window.__debug.story('after_r3_twist', 2)");
      await page.waitForTimeout(3500);
      const d = await state<{ dialogue: { scene: string } | null }>(page);
      await shot(page, 'twist');
      await page.evaluate('window.__debug.storyLine(5)');
      await page.waitForTimeout(1500);
      await shot(page, 'twist-ember');
      if (d.dialogue?.scene !== 'after_r3_twist') throw new Error(`dialogue ${JSON.stringify(d.dialogue)}`);
      await page.evaluate('window.__debug.app.dialogue.finish()');
      return 'after_r3_twist lines 2 and 5';
    });

    await step('(c) story scenes all open', async () => {
      const seen: string[] = [];
      for (const id of ['prologue', 'after_r1', 'after_r2', 'after_r3_twist', 'epilogue']) {
        await page.evaluate(`window.__debug.story('${id}', 1)`);
        await page.waitForTimeout(800);
        const d = await state<{ dialogue: { scene: string } | null }>(page);
        if (d.dialogue?.scene === id) seen.push(id);
        await page.evaluate('window.__debug.app.dialogue?.finish()');
        await page.waitForTimeout(300);
      }
      if (seen.length !== 5) throw new Error(`opened ${seen.join(',')}`);
      return '5/5 scenes';
    });

    await step('(c) win screen', async () => {
      await freshRun(page);
      await page.evaluate("window.__debug.setRelics(['tinderbox','last_light','seers_lens','gilded_purse','phoenix_ash','bellows_charm']); window.__debug.endRun(true)");
      await untilScreen(page, 'won');
      await page.waitForTimeout(1500);
      await shot(page, 'win');
      return 'won screen';
    });

    // mobile 844x390
    const phone = await newPage(browser, 844, 390);
    await step('(c) mobile 844x390 map + battle', async () => {
      await phone.goto(base);
      await untilScreen(phone, 'start');
      await phone.waitForTimeout(1500);
      await phone.mouse.click(422, 195);
      await phone.waitForTimeout(800);
      await freshRun(phone);
      await phone.waitForTimeout(2000);
      await shot(phone, 'mobile-map-844x390');
      await enterBattle(phone, ['fight', 'elite']);
      await phone.mouse.move(2, 195);
      await phone.waitForTimeout(6000);
      await shot(phone, 'mobile-battle-844x390');
      const overflow = await phone.evaluate<boolean>('document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1');
      if (overflow) throw new Error('page scrolls at 844x390');
      return 'no page overflow';
    });
    await phone.close();
    await page.close();

    // (b) full greedy-bot runs in the real UI (low quality to keep software rendering tolerable)
    if (!process.env.E2E_SKIP_BOT) {
      const botPage = await newPage(browser, 1280, 720);
      let won = false;
      for (const seed of SEEDS) {
        await step(`(b) greedy bot full run, seed ${seed}`, async () => {
          await botPage.goto(`${ROOT}?seed=${seed}&quality=low`);
          await untilScreen(botPage, 'start');
          const t0 = Date.now();
          await botPage.evaluate('window.__botDone = null; window.__debug.runBot("greedy", { speed: 16 }).then((r) => { window.__botDone = r; })');
          await botPage.waitForFunction('window.__botDone !== null', null, { timeout: BOT_TIMEOUT });
          const res = await botPage.evaluate<string>('window.__botDone');
          const st = await state<{ screen: string; region: number }>(botPage);
          const seconds = Math.round((Date.now() - t0) / 1000);
          botOutcomes.push({ seed, result: res, seconds });
          if (st.screen !== 'won' && st.screen !== 'lost') throw new Error(`ended on screen ${st.screen}`);
          await botPage.waitForTimeout(1500);
          await shot(botPage, `bot-end-seed${seed}-${res}`);
          won = res === 'won';
          return `${res} in ${seconds}s (region reached ${st.region})`;
        });
        if (won) break;
      }
      check('(b) a greedy bot run wins within 5 seeds', won, JSON.stringify(botOutcomes));
      await botPage.close();
    }
    await browser.close();
  } finally {
    if (server.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  const summary = { when: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results, botOutcomes, shots };
  writeFileSync(path.resolve('docs/qa/e2e-results.json'), JSON.stringify(summary, null, 2));
  console.log(`\n=== E2E SUMMARY: ${summary.passed} passed, ${failed.length} failed ===`);
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.info}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
