// T-12 QA screenshots: title, dialogue (prologue / twist CG / epilogue), win, lose at 1280x720,
// plus a phone-landscape pass (844x390, 740x360) over every screen with an overflow / touch-target audit,
// and the portrait rotate overlay. DPR 1. Fails (exit 1) on console errors.
// Usage: npm run build && npx tsx scripts/screens-t12.ts
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

const PORT = 4184;
const SEED = 7;
const outDir = path.resolve('docs/qa/screens');
const errors: string[] = [];
const issues: string[] = [];

async function waitFor(url: string, ms = 20000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not start: ${url}`);
}

async function shot(page: PwPage, name: string): Promise<void> {
  const file = path.join(outDir, `T-12-${name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', path.relative(process.cwd(), file));
}

const untilScreen = (page: PwPage, s: string, timeout = 15000) =>
  page.waitForFunction(`window.__debug && window.__debug.state && window.__debug.state().screen === ${JSON.stringify(s)}`, null, { timeout });
const screen = (page: PwPage) => page.evaluate<string>('window.__debug.state().screen');
const nodeIdx = (page: PwPage, types: string[]) =>
  page.evaluate<number>(`window.__debug.run.availableNodes().findIndex((n) => ${JSON.stringify(types)}.includes(n.type))`);

async function newPage(browser: Browser, w: number, h: number): Promise<PwPage> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1000 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}

/** Audit the visible UI: anything scrolling / clipped, visible buttons under 40 px, text under 10 px. */
const AUDIT = `(() => {
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  document.querySelectorAll('.ui *').forEach((el) => {
    if (!vis(el)) return;
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) out.push('scrolls: ' + el.className);
    const r = el.getBoundingClientRect();
    if (el.matches('button') && (r.width < 39.5 || r.height < 39.5) && !el.closest('.uplate')) out.push('small target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + (el.textContent || el.className).slice(0, 24));
    if ((r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1 || r.top < -1) && el.closest('.panel, .dlg__box, .title__box, .chud__bottom') && !el.closest('.title__embers')) out.push('offscreen: ' + el.className);
    if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(s.fontSize) < 10) out.push('tiny text ' + s.fontSize + ': ' + el.className);
  });
  return [...new Set(out)];
})()`;

async function audit(page: PwPage, label: string): Promise<void> {
  const res = await page.evaluate<string[]>(AUDIT);
  for (const r of res) issues.push(`${label}: ${r}`);
}

async function phonePass(browser: Browser, w: number, h: number, base: string): Promise<void> {
  const tag = `${w}x${h}`;
  const page = await newPage(browser, w, h);
  await page.goto(base);
  await untilScreen(page, 'start');
  await page.mouse.click(w / 2, h / 2);
  await page.waitForTimeout(900);
  await audit(page, `${tag} title`);
  await shot(page, `title-${tag}`);
  await page.click('.title__row .btn:last-child');
  await page.waitForTimeout(200);
  await audit(page, `${tag} settings`);
  if (w === 844) await shot(page, `settings-${tag}`);
  await page.evaluate("document.querySelector('.title__modal .btn--ember').click()");

  await page.evaluate("window.__debug.story('after_r3_twist', 2)");
  await page.waitForTimeout(1600);
  await audit(page, `${tag} dialogue`);
  await shot(page, `dialogue-${tag}`);
  await page.evaluate('window.__debug.app.dialogue.finish()');
  await untilScreen(page, 'map');
  await page.waitForTimeout(400);
  await audit(page, `${tag} map`);
  if (w === 740) await shot(page, `map-${tag}`);

  const seen = new Set<string>();
  for (let guard = 0; guard < 40 && seen.size < 7; guard++) {
    const s = await screen(page);
    if (!seen.has(s) && s !== 'map') {
      seen.add(s);
      await page.waitForTimeout(s === 'battle' ? 2500 : 400);
      await page.mouse.move(2, h / 2);
      await audit(page, `${tag} ${s}`);
      if (w === 740) await shot(page, `${s}-${tag}`);
    }
    if (s === 'map') {
      const want = ['merchant', 'camp', 'event', 'elite', 'fight'].filter((t) => !seen.has(t === 'elite' || t === 'fight' ? 'battle' : t));
      const i = await nodeIdx(page, want);
      await page.evaluate(`window.__debug.gotoNode(${Math.max(0, i)})`);
    } else if (s === 'formation') {
      await page.click('.screen--formation .btn--ember');
    } else if (s === 'battle') {
      await page.evaluate('window.__debug.winFight()');
      await untilScreen(page, 'reward').catch(async () => console.warn('after winFight:', JSON.stringify(await page.evaluate('window.__debug.state()'))));
    } else if (s === 'reward') {
      await page.evaluate('window.__debug.run.proceed(); window.__debug.app.refresh()');
    } else if (s === 'event') {
      await page.evaluate("document.querySelector('.event__choice:not(:disabled)')?.click()");
      await page.waitForTimeout(150);
      await audit(page, `${tag} event-outcome`);
      await page.evaluate("document.querySelector('.screen--event .btn--ember')?.click()");
    } else if (s === 'camp') {
      await page.evaluate("document.querySelector('.screen--camp .btn--ember')?.click()");
      await page.waitForTimeout(150);
      if ((await screen(page)) === 'camp') await page.evaluate("document.querySelector('.screen--camp .btn')?.click()");
    } else if (s === 'merchant') {
      await page.evaluate("[...document.querySelectorAll('.screen--merchant .btn')].pop()?.click()");
    } else break;
    await page.waitForTimeout(200);
  }
  console.log(`${tag} screens covered:`, [...seen].join(', '));
  // forced states for screens the walk may miss: camp, 3-relic boss reward
  await page.evaluate("window.__debug.newRun(7); window.__debug.app.begin(); window.__debug.app.dialogue?.finish()");
  await page.evaluate("const r = window.__debug.run; r.status = 'camp'; window.__debug.app.refresh()");
  await page.waitForTimeout(300);
  await audit(page, `${tag} camp`);
  if (w === 740) await shot(page, `camp-${tag}`);
  await page.evaluate("const r = window.__debug.run; r.relicChoices = ['tinderbox','last_light','seers_lens']; r.lastReward = { shards: 60, relicChoices: r.relicChoices, levelUp: true }; r.status = 'reward'; window.__debug.app.refresh()");
  await page.waitForTimeout(300);
  await audit(page, `${tag} boss-reward`);
  if (w === 740) await shot(page, `reward3-${tag}`);
  await page.evaluate("window.__debug.setRelics(['tinderbox','last_light','seers_lens','gilded_purse','phoenix_ash','bellows_charm']); window.__debug.endRun(true)");
  await page.waitForTimeout(500);
  await audit(page, `${tag} won`);
  await shot(page, `win-${tag}`);
  await page.close();
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  try {
    const base = `http://localhost:${PORT}/?seed=${SEED}&quality=high`;
    await waitFor(`http://localhost:${PORT}/`);
    const browser = await loadPlaywright().chromium.launch();
    const page = await newPage(browser, 1280, 720);
    await page.goto(base);
    await untilScreen(page, 'start');
    await page.waitForTimeout(1200);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(2200);
    await audit(page, '1280 title');
    await shot(page, 'title');

    // Begin Journey -> prologue
    await page.click('.title__begin');
    await page.waitForFunction('window.__debug.state().dialogue !== null', null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.mouse.click(640, 600); // complete line 0
    await page.mouse.click(640, 600); // -> line 1
    await page.mouse.click(640, 600); // complete
    await page.mouse.click(640, 600); // -> line 2 (Mira)
    await page.waitForTimeout(3500);
    await audit(page, '1280 prologue');
    await shot(page, 'prologue');
    await page.click('.dlg__skip');
    await untilScreen(page, 'map');

    await page.evaluate("window.__debug.story('after_r3_twist', 1)");
    await page.waitForTimeout(3000);
    await shot(page, 'twist-cg');
    await page.evaluate('window.__debug.storyLine(5)');
    await page.waitForTimeout(500);
    await shot(page, 'twist-ember');

    await page.evaluate("window.__debug.story('epilogue', 7)");
    await page.waitForTimeout(3000);
    await audit(page, '1280 epilogue');
    await shot(page, 'epilogue');
    await page.evaluate('window.__debug.app.dialogue.finish()');

    await page.evaluate("window.__debug.setRelics(['tinderbox','last_light','seers_lens','gilded_purse','phoenix_ash','bellows_charm','hearth_psalter','cinder_brand'])");
    await page.evaluate('window.__debug.endRun(true)');
    await page.waitForTimeout(600);
    await audit(page, '1280 won');
    await shot(page, 'win');

    await page.click('.screen--end .btn:not(.btn--ember)'); // Title
    await untilScreen(page, 'start');
    await page.waitForTimeout(300);
    const hardOk = await page.evaluate<boolean>("!document.querySelector('.btn--hard').disabled");
    if (!hardOk) issues.push('hard mode not unlocked after a win');
    await page.click('.title__row .btn:first-child'); // Best Runs
    await page.waitForTimeout(300);
    await shot(page, 'best-runs');
    await page.evaluate("document.querySelector('.title__modal .btn--ember').click()");
    await page.click('.btn--hard');
    await page.waitForFunction('window.__debug.state().dialogue !== null', null, { timeout: 5000 });
    const hard = await page.evaluate<boolean>('window.__debug.state().hard');
    if (!hard) issues.push('hard run did not set Run.hard');
    await page.evaluate("window.__debug.app.dialogue.finish(); window.__debug.setRelics(['tinderbox','crimson_ribbon'])");
    await page.evaluate('window.__debug.gotoNode(0)');
    await page.waitForTimeout(300);
    await page.evaluate('window.__debug.endRun(false)');
    await page.waitForTimeout(600);
    await audit(page, '1280 lost');
    await shot(page, 'lose');

    await phonePass(browser, 844, 390, base);
    await phonePass(browser, 740, 360, base);

    const portrait = await newPage(browser, 390, 844);
    await portrait.goto(base);
    await untilScreen(portrait, 'start');
    await portrait.waitForTimeout(500);
    await shot(portrait, 'rotate-390x844');

    await browser.close();
  } finally {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  }
  console.log(issues.length ? `layout issues:\n  ${issues.join('\n  ')}` : 'layout audit clean');
  if (errors.length) {
    console.error(`${errors.length} console error(s):\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log('no console errors');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
