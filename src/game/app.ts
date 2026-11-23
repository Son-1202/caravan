// Game app (T-09): screen state machine driven by Run.status; owns the march/battle
// render modes over the shared RenderContext. Screens are DOM overlays in src/ui/screens.
import { HEROES, REGION_BY_ID, STORY } from '../data';
import type { HeroId, RegionId, SceneId } from '../data';
import { Run, SeededRng, type Formation } from '../sim';
import type { RenderContext } from '../render/context';
import { getRegion, isRegionId } from '../render/regions';
import { h, installTooltips } from '../ui/dom';
import type { ScreenView } from '../ui/screens/common';
import { titleScreen } from '../ui/screens/title';
import { DialogueView } from '../ui/dialogue';
import { GameAudio, type MusicMode } from '../audio';
import '../ui/story.css';
import { loadSave, recordRun, withSettings, writeSave, type SaveData, type Settings } from './save';
import { installRotateOverlay } from '../ui/rotate';
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
  /** Story hook: show scene `id`, then call done(). Bots skip it. */
  onStory: (id: SceneId, done: () => void) => void = (id, done) => (this.bot.name ? done() : this.playStory(id, done));
  readonly audio = new GameAudio();
  save: SaveData;
  /** next run (and current run) is hard mode */
  hard = false;
  /** wall-clock seconds of the current run (excludes pauses) */
  runTime = 0;
  dialogue: DialogueView | null = null;
  private recorded: { rank: number } | null = null;
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
  private readonly hideTip: () => void;

  constructor(readonly ctx: RenderContext, parent: HTMLElement, seed: number) {
    parent.append(this.ui);
    this.hideTip = installTooltips(this.ui);
    this.save = loadSave();
    this.applySettings(this.save.settings);
    this.audio.installUnlock();
    this.installUiSounds();
    installRotateOverlay(parent);
    this.march = new MarchCast(ctx.diorama);
    this.formation = safeFormation(loadFormation(), HEROES.map((x) => x.id));
    this.bot = new BotDriver(this);
    this.newRun(seed);
    window.addEventListener('keydown', (e) => this.onKey(e));
    installDebug(this);
  }

  // ---------- lifecycle ----------
  newRun(seed: number, hard = this.hard): void {
    this.endBattle(false);
    this.closeDialogue();
    this.storyOpen = false;
    this.seed = seed >>> 0;
    this.hard = hard;
    this.run = new Run(this.seed, hard);
    this.visited.clear();
    this.started = false;
    this.eventOutcomeShown = false;
    this.runTime = 0;
    this.recorded = null;
    this.refresh();
  }

  begin(hard?: boolean): void {
    if (this.started) return;
    if (hard !== undefined && hard !== this.hard) this.newRun(this.seed, hard);
    this.started = true;
    this.refresh();
  }

  /** New run straight onto the road (skips the title). */
  restart(): void {
    this.bot.stop();
    this.newRun(randomSeed());
    this.begin();
  }

  /** Back to the title screen with a fresh seed. */
  toTitle(): void {
    this.bot.stop();
    this.newRun(randomSeed(), false);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.save = withSettings(this.save, patch);
    writeSave(this.save);
    this.applySettings(this.save.settings);
  }

  private applySettings(st: Settings): void {
    const pf = this.ctx.postfx;
    pf.autoQuality = st.quality === 'auto';
    if (st.quality !== 'auto') pf.setQuality(st.quality);
    this.audio.setVolume(st.volume);
  }

  /** Play a story scene over the dimmed diorama (also used by __debug.story). */
  playStory(id: SceneId, done: () => void): void {
    const scene = STORY.scenes.find((x) => x.id === id);
    if (!scene) return done();
    this.closeDialogue();
    this.setMusic('story');
    this.dialogue = new DialogueView(this.ui, scene, {
      onDone: () => {
        this.dialogue = null;
        done();
      },
      onType: () => this.audio.sfx.ui('type'),
      onAdvance: () => this.audio.sfx.ui('tick'),
    });
  }

  private closeDialogue(): void {
    const d = this.dialogue;
    this.dialogue = null;
    d?.dispose();
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
      this.screen = 'story';
      this.march.show(true);
      this.show({ el: h('div', { class: 'screen screen--story' }) });
      if (id) this.onStory(id, done);
      else done();
      return;
    }
    if ((run.status === 'won' || run.status === 'lost') && this.started && !this.recorded) this.recordEnd();
    this.screen = screenFor(run.status, { started: this.started, battleLive: !!this.battle, eventOutcomeShown: this.eventOutcomeShown });
    this.syncRegion();
    this.march.show(this.screen !== 'battle');
    this.show(this.build(this.screen));
    this.syncMusic();
    this.bot.onScreen(this.screen);
  }

  private recordEnd(): void {
    const run = this.run;
    const won = run.status === 'won';
    const r = run.map[Math.min(run.regionIdx, run.map.length - 1)];
    const rec = {
      won, hard: run.hard, seed: run.seed, time: this.runTime, regions: Math.min(4, run.regionIdx),
      regionName: r ? REGION_BY_ID[r.region].name : '', fights: Math.max(0, run.stats.fights - (won ? 0 : 1)),
      breaks: run.stats.breaks, ignites: run.stats.ignites, damage: Math.round(run.stats.damageDealt), relics: [...run.relics], date: Date.now(),
    };
    this.save = recordRun(this.save, rec);
    writeSave(this.save);
    this.recorded = { rank: this.save.bestRuns.indexOf(this.save.bestRuns.find((x) => x.date === rec.date && x.seed === rec.seed) ?? rec) };
  }

  private currentRegion(): RegionId {
    const r = this.run.map[Math.min(this.run.regionIdx, this.run.map.length - 1)];
    return r?.region ?? 'whisperpine';
  }

  private setMusic(mode: MusicMode): void {
    this.audio.music.set(mode, this.ctx.diorama.region.id as RegionId);
  }

  private syncMusic(): void {
    const s = this.screen;
    const kind = this.run.pendingEncounter()?.kind;
    const mode: MusicMode = s === 'start' ? 'title' : s === 'battle' ? (kind === 'boss' ? 'boss' : 'battle') : s === 'won' || s === 'lost' ? 'story' : 'map';
    this.audio.music.set(mode, this.currentRegion());
  }

  private installUiSounds(): void {
    this.ui.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (!b || b.disabled || b.closest('.dlg')) return;
      this.audio.sfx.ui(b.classList.contains('btn--ember') || b.classList.contains('mnode') ? 'confirm' : 'tick');
    });
    this.ui.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (b && !b.disabled && !(e.relatedTarget instanceof Node && b.contains(e.relatedTarget))) this.audio.sfx.ui('hover');
    });
  }

  private build(s: Screen): ScreenView {
    const run = this.run;
    const reg = this.regionName();
    switch (s) {
      case 'start': return titleScreen({ seed: this.seed, save: this.save, unlocked: this.audio.engine.ready }, {
        begin: (hard) => this.begin(hard),
        settings: (p) => this.updateSettings(p),
        unlock: () => this.audio.engine.unlock(),
        preview: () => this.audio.sfx.ui('confirm'),
      });
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
      case 'lost': return endScreen(run, { time: this.runTime, rank: this.recorded?.rank ?? -1 }, { again: () => this.restart(), title: () => this.toTitle() });
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
    if (!id || !isRegionId(id)) return;
    if (this.ctx.diorama.region.id !== id) this.ctx.diorama.setRegion(id);
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
      onEvents: (ev) => this.audio.onSimEvents(ev),
    });
    if (!this.bot.name) this.battle.setSpeed(this.save.settings.speed);
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
    this.audio.update(dt);
    const st = this.run.status;
    if (this.started && st !== 'won' && st !== 'lost' && !this.battle?.paused) this.runTime += dt;
  }

  onResize(): void {
    this.battle?.view.onResize();
  }

  private onKey(e: KeyboardEvent): void {
    const b = this.battle;
    if (!b || this.dialogue) return;
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
