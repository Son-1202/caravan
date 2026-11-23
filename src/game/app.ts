// Game app (T-09): screen state machine driven by Run.status; owns the march/battle
// render modes over the shared RenderContext. Screens are DOM overlays in src/ui/screens.
import { HEROES, REGION_BY_ID } from '../data';
import type { HeroId, SceneId } from '../data';
import { Run, SeededRng, type Formation } from '../sim';
import type { RenderContext } from '../render/context';
import { getRegion, isRegionId } from '../render/regions';
import { h, installTooltips } from '../ui/dom';
import type { ScreenView } from '../ui/screens/common';
import { startScreen } from '../ui/screens/start';
import { mapScreen } from '../ui/screens/map';
import { formationScreen } from '../ui/screens/formation';
import { rewardScreen } from '../ui/screens/reward';
import { campScreen } from '../ui/screens/camp';
import { merchantScreen } from '../ui/screens/merchant';
import { eventScreen } from '../ui/screens/event';
import { endScreen } from '../ui/screens/end';
import { BattleCtl } from './battleCtl';
import { MarchCast } from './march';
import { screenFor, type Screen } from './flow';
import { safeFormation } from './formation';
import { installDebug } from './debug';
import { BotDriver } from './botDriver';

export class App {
  run!: Run;
  seed = 0;
  screen: Screen = 'start';
  /** Story hook for T-12: show scene `id`, then call done(). Default: skip. */
  onStory: (id: SceneId, done: () => void) => void = (_id, done) => done();
  battle: BattleCtl | null = null;
  readonly bot: BotDriver;
  formation: Formation;
  readonly visited = new Set<string>();
  readonly ui = h('div', { class: 'ui' });
  private view: ScreenView | null = null;
  private readonly march: MarchCast;
  private started = false;
  private eventOutcomeShown = false;
  private storyOpen = false;
  private regionSet = false;
  private readonly hideTip: () => void;

  constructor(readonly ctx: RenderContext, parent: HTMLElement, seed: number) {
    parent.append(this.ui);
    this.hideTip = installTooltips(this.ui);
    this.march = new MarchCast(ctx.diorama);
    this.formation = safeFormation(loadFormation(), HEROES.map((x) => x.id));
    this.bot = new BotDriver(this);
    this.newRun(seed);
    window.addEventListener('keydown', (e) => this.onKey(e));
    installDebug(this);
  }

  // ---------- lifecycle ----------
  newRun(seed: number): void {
    this.endBattle(false);
    this.seed = seed >>> 0;
    this.run = new Run(this.seed);
    this.visited.clear();
    this.started = false;
    this.eventOutcomeShown = false;
    this.refresh();
  }

  begin(): void {
    if (this.started) return;
    this.started = true;
    this.refresh();
  }

  restart(): void {
    this.bot.stop();
    this.newRun(randomSeed());
  }

  /** Re-derive the screen from Run state and render it. */
  refresh(): void {
    const run = this.run;
    if (this.started && run.status === 'story' && !this.storyOpen) {
      const id = run.pendingStory;
      this.storyOpen = true;
      const done = (): void => {
        this.storyOpen = false;
        if (this.run === run && run.status === 'story') run.ackStory();
        this.refresh();
      };
      if (id) this.onStory(id, done);
      else done();
      return;
    }
    this.screen = screenFor(run.status, { started: this.started, battleLive: !!this.battle, eventOutcomeShown: this.eventOutcomeShown });
    this.syncRegion();
    this.march.show(this.screen !== 'battle');
    this.show(this.build(this.screen));
    this.bot.onScreen(this.screen);
  }

  private build(s: Screen): ScreenView {
    const run = this.run;
    const reg = this.regionName();
    switch (s) {
      case 'start': return startScreen(this.seed, () => this.begin());
      case 'story': return { el: h('div', { class: 'screen' }) };
      case 'map': return mapScreen(run, this.visited, { choose: (id) => this.chooseNode(id), useItem: (id) => this.useMapItem(id) });
      case 'formation': {
        const kind = run.pendingEncounter()?.kind ?? 'fight';
        const title = kind === 'boss' ? 'Boss — set your formation' : kind === 'elite' ? 'Elite — set your formation' : 'Set your formation';
        return formationScreen(run, this.formation, title, (f) => this.startBattle(f));
      }
      case 'battle': return { el: h('div', { class: 'screen screen--battle' }) };
      case 'reward': return rewardScreen(run, reg, { take: (id) => this.act(() => run.takeRelic(id)), skip: () => this.act(() => run.proceed()) });
      case 'camp': return campScreen(run, reg, {
        heal: () => this.act(() => run.camp({ kind: 'heal' })),
        train: (hero) => this.act(() => run.camp({ kind: 'skill', hero })),
      });
      case 'merchant': return merchantScreen(run, reg, {
        buy: (id) => this.act(() => run.buy(id)),
        reroll: () => this.act(() => run.reroll()),
        leave: () => this.act(() => run.proceed()),
      });
      case 'event': return eventScreen(run, reg, {
        choose: (i) => this.resolveEvent(i),
        pickHero: (id) => this.eventSkill(id),
        next: () => this.eventContinue(),
      });
      case 'won':
      case 'lost': return endScreen(run, () => this.restart());
    }
  }

  private show(v: ScreenView): void {
    this.hideTip();
    this.view?.dispose?.();
    this.view?.el.remove();
    this.view = v;
    v.el.dataset.screen = this.screen;
    this.ui.prepend(v.el);
  }

  private act(fn: () => unknown): void {
    fn();
    this.refresh();
  }

  regionName(): string {
    const r = this.run.map[Math.min(this.run.regionIdx, this.run.map.length - 1)];
    return r ? REGION_BY_ID[r.region].name : '';
  }

  private syncRegion(): void {
    const r = this.run.map[Math.min(this.run.regionIdx, this.run.map.length - 1)];
    const id = r?.region;
    if (!id || !isRegionId(id) || (this.regionSet && this.ctx.diorama.region.id === id)) return;
    this.regionSet = true;
    this.ctx.diorama.setRegion(id);
    this.ctx.postfx.setGrade(getRegion(id).grade);
  }

  // ---------- actions (UI + bot) ----------
  chooseNode(id: string): void {
    this.visited.add(id);
    this.act(() => this.run.chooseNode(id));
  }

  useMapItem(id: string): void {
    this.act(() => this.run.useConsumable(id));
  }

  resolveEvent(i: number): void {
    this.run.resolveEvent(i);
    this.eventOutcomeShown = true;
    this.refresh();
  }

  eventSkill(hero: HeroId): void {
    this.act(() => this.run.chooseSkillRank(hero));
  }

  eventContinue(): void {
    this.eventOutcomeShown = false;
    if (this.run.status === 'event') this.run.proceed();
    this.refresh();
  }

  startBattle(f: Formation): void {
    this.formation = safeFormation(f, HEROES.map((x) => x.id));
    saveFormation(this.formation);
    const run = this.run;
    const battle = run.startBattle(this.formation);
    const reg = run.map[run.regionIdx]?.region ?? 'whisperpine';
    const kind = run.pendingEncounter()?.kind ?? 'fight';
    this.march.show(false);
    this.battle = new BattleCtl(this.ctx, this.ui, battle, this.formation, {
      regionId: reg,
      title: `${REGION_BY_ID[reg].name} · ${kind === 'boss' ? 'Boss' : kind === 'elite' ? 'Elite' : 'Battle'}`,
      bot: this.bot.name,
      botSpeed: this.bot.speed,
      onEnd: () => this.endBattle(true),
      onQuit: () => this.restart(),
    });
    this.refresh();
  }

  /** Finish (record=true) or tear down the live battle. */
  endBattle(record: boolean): void {
    const b = this.battle;
    if (!b) return;
    this.battle = null;
    if (record && this.run.status === 'battle' && b.over) this.run.finishBattle(b.battle);
    b.dispose();
    if (record) this.refresh();
  }

  winFight(): boolean {
    if (!this.battle) return false;
    this.battle.winNow();
    return true;
  }

  // ---------- frame / input ----------
  update(dt: number): void {
    this.march.update(dt);
    this.battle?.update(dt);
    this.bot.update(dt);
  }

  onResize(): void {
    this.battle?.view.onResize();
  }

  private onKey(e: KeyboardEvent): void {
    const b = this.battle;
    if (!b) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      b.ignite();
    } else if (e.key === '1' || e.key === '2') b.setSpeed(Number(e.key));
    else if (e.key === 'Escape') b.setPaused(!b.paused);
  }
}

export function randomSeed(): number {
  return new SeededRng(`${Date.now()}:${Math.random()}`).int(1, 999999);
}

const FORMATION_KEY = 'coe.formation';
function loadFormation(): Formation | null {
  try {
    const raw = localStorage.getItem(FORMATION_KEY);
    return raw ? (JSON.parse(raw) as Formation) : null;
  } catch {
    return null;
  }
}
function saveFormation(f: Formation): void {
  try {
    localStorage.setItem(FORMATION_KEY, JSON.stringify(f));
  } catch {
    /* storage unavailable */
  }
}
