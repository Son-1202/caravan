// Drives the real UI with a bot (window.__debug.runBot). Each screen gets one decision
// after a short delay; battles run inside BattleCtl at bot speed with bot Ignite.
// { headless: true } instead plays the rest of the run in the sim and jumps to the end screen.
import { playBattleWithBot } from '../sim/bots';
import type { SeededRng } from '../sim';
import type { App } from './app';
import {
  autoPlayRun, botCampHeal, botEventChoice, botFormation, botNode, botPurchase, botRelic, botRngFor, botUpgradeHero, type BotName,
} from './bot';
import type { Screen } from './flow';

export interface RunBotOpts {
  headless?: boolean;
  /** battle speed multiplier in the UI (default 12) */
  speed?: number;
  /** seconds between UI decisions (default 0.12) */
  delay?: number;
}

export class BotDriver {
  name: BotName | null = null;
  speed = 12;
  private delay = 0.12;
  private wait = 0;
  private rng: SeededRng | null = null;
  private buys = 0;
  private resolve: ((s: 'won' | 'lost') => void) | null = null;

  constructor(private readonly app: App) {}

  start(name: BotName, opts: RunBotOpts = {}): Promise<'won' | 'lost'> {
    const app = this.app;
    this.rng = botRngFor(app.seed, name);
    if (opts.headless) {
      this.name = null;
      if (app.battle) {
        const b = app.battle.battle;
        if (!app.battle.over) playBattleWithBot(b, name);
        app.endBattle(true);
      }
      this.name = name; // bots skip story scenes
      app.begin();
      this.name = null;
      app.dialogue?.finish();
      const res = autoPlayRun(app.run, name, this.rng);
      app.refresh();
      return Promise.resolve(res);
    }
    this.name = name;
    this.speed = opts.speed ?? 12;
    this.delay = opts.delay ?? 0.12;
    this.wait = this.delay;
    app.battle?.setBot(name, this.speed);
    return new Promise((res) => {
      this.resolve = res;
      this.onScreen(app.screen);
    });
  }

  stop(): void {
    this.name = null;
    this.app.battle?.setBot(null, 1);
  }

  onScreen(s: Screen): void {
    if (!this.name) return;
    this.wait = this.delay;
    if (s !== 'merchant') this.buys = 0;
    if (s === 'won' || s === 'lost') {
      this.stop();
      this.resolve?.(s);
      this.resolve = null;
    }
  }

  update(dt: number): void {
    if (!this.name || this.app.battle) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = this.delay;
    this.act(this.name, this.rng!);
  }

  private act(bot: BotName, rng: SeededRng): void {
    const app = this.app;
    const run = app.run;
    switch (app.screen) {
      case 'start': app.begin(); break;
      case 'story': app.dialogue?.finish(); break;
      case 'map': app.chooseNode(botNode(run, bot, rng).id); break;
      case 'formation': app.startBattle(botFormation(bot, rng)); break;
      case 'reward': {
        const pick = botRelic(run.pendingRelicChoice() ?? [], run.relics, bot, rng);
        if (pick) run.takeRelic(pick);
        else run.proceed();
        app.refresh();
        break;
      }
      case 'camp':
        if (botCampHeal(run, bot, rng)) run.camp({ kind: 'heal' });
        else run.camp({ kind: 'skill', hero: botUpgradeHero(run, bot, rng) });
        app.refresh();
        break;
      case 'merchant': {
        const id = this.buys < 6 ? botPurchase(run, bot, rng) : undefined;
        this.buys++;
        if (!id || !run.buy(id)) run.proceed();
        app.refresh();
        break;
      }
      case 'event': {
        const ev = run.event();
        if (!run.eventResult && ev) app.resolveEvent(botEventChoice(ev.choices, run.shards, bot, rng));
        else if (run.eventResult?.pendingSkillRank) app.eventSkill(botUpgradeHero(run, bot, rng));
        else app.eventContinue();
        break;
      }
      default: break;
    }
  }
}
