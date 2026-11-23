// Live battle: sim Battle + CombatView + CombatHud, fixed-step accumulator, speed, pause, bot Ignite.
import type { Battle, Formation, SimEvent, Unit } from '../sim';
import { CombatView } from '../render/combatView';
import type { RenderContext } from '../render/context';
import { CombatHud } from '../ui/combatHud';
import { wantsIgnite, type BotName } from './bot';

const STEP = 0.05;
/** real seconds to linger on the final blow before the reward screen */
const END_DELAY = 1.8;

export interface BattleCtlOpts {
  regionId: string;
  title: string;
  bot: BotName | null;
  botSpeed: number;
  onEnd(): void;
  onQuit(): void;
}

export class BattleCtl {
  readonly view: CombatView;
  readonly hud: CombatHud;
  speed = 1;
  paused = false;
  private acc = 0;
  private endT = -1;
  private ended = false;
  /** bot driving Ignite (null = player) */
  bot: BotName | null;

  constructor(ctx: RenderContext, parent: HTMLElement, readonly battle: Battle, formation: Formation, private readonly opts: BattleCtlOpts) {
    this.view = new CombatView(ctx, { regionId: opts.regionId });
    this.view.setup(battle.state, formation);
    this.hud = new CombatHud(parent, (uid, a) => this.view.unitScreenPos(uid, a), battle.state, {
      ignite: () => this.ignite(),
      setSpeed: (s) => this.setSpeed(s),
      pause: (on) => this.setPaused(on),
      quit: () => opts.onQuit(),
      useItem: (id) => this.feed(this.battle.useConsumable(id)),
    }, opts.title);
    this.bot = opts.bot;
    if (opts.bot) this.speed = opts.botSpeed;
  }

  get over(): boolean {
    return this.battle.state.outcome !== 'ongoing';
  }

  setBot(bot: BotName | null, speed: number): void {
    this.bot = bot;
    this.speed = bot ? speed : 1;
  }

  setSpeed(s: number): void {
    if (this.bot) return;
    this.speed = s;
    this.hud.setSpeed(s);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.hud.setPaused(p);
  }

  ignite(): void {
    if (this.paused || this.view.busy || !this.battle.canIgnite()) return;
    this.feed(this.battle.ignite());
  }

  /** Debug: instantly win the current battle. */
  winNow(): void {
    if (this.over) return;
    // reaches into BattleCore internals on purpose (debug only; the sim has no "forfeit" API)
    const core = this.battle as unknown as { units: Unit[]; emit(e: SimEvent): void; end(o: 'win'): void; flush(): SimEvent[] };
    for (const u of core.units) {
      if (u.side !== 'enemy' || !u.alive) continue;
      u.hp = 0;
      u.alive = false;
      core.emit({ type: 'death', target: u.uid });
    }
    core.end('win');
    this.feed(core.flush());
  }

  private feed(events: SimEvent[]): void {
    if (events.length === 0) return;
    this.view.applyEvents(events);
    this.hud.onEvents(events);
  }

  update(dtReal: number): void {
    const b = this.battle;
    if (!this.paused) {
      this.view.update(dtReal);
      if (!this.over) {
        const bot = this.bot;
        if (bot && b.canIgnite() && !this.view.busy && wantsIgnite(bot, b.state.units)) this.feed(b.ignite());
        this.acc += dtReal * this.speed * this.view.timeScale;
        let guard = 0;
        while (this.acc >= STEP && !this.over && guard++ < 400) {
          this.acc -= STEP;
          this.feed(b.tick(STEP));
        }
      } else if (!this.ended) {
        if (this.endT < 0) this.endT = 0;
        this.endT += dtReal;
        if (this.endT >= (this.bot ? 0.3 : END_DELAY)) {
          this.ended = true;
          this.opts.onEnd();
          return;
        }
      }
    }
    this.hud.update(this.paused ? 0 : dtReal, b.state, !this.over && b.canIgnite() && !this.view.busy, b.consumables);
  }

  dispose(): void {
    this.hud.dispose();
    this.view.dispose();
  }
}
