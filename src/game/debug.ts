// window.__debug hooks for QA / E2E (T-09).
import type { SceneId } from '../data';
import type { BotName } from './bot';
import type { App } from './app';
import type { RunBotOpts } from './botDriver';

export function installDebug(app: App): void {
  const prev = (window.__debug ?? {}) as Record<string, unknown>;
  window.__debug = {
    ...prev,
    app,
    get seed() { return app.seed; },
    get run() { return app.run; },
    /** choose the i-th reachable node on the map (starts the run if needed) */
    gotoNode(i: number): string | null {
      app.begin();
      app.dialogue?.finish();
      const n = app.run.availableNodes()[i];
      if (!n) return null;
      app.chooseNode(n.id);
      return n.id;
    },
    winFight: () => app.winFight(),
    setRelics(ids: string[]): void {
      app.run.relics = [...ids];
      app.refresh();
    },
    runBot: (name: BotName = 'greedy', opts: RunBotOpts = {}) => app.bot.start(name, opts),
    stopBot: () => app.bot.stop(),
    newRun: (seed: number, hard?: boolean) => app.newRun(seed, hard),
    /** open story scene `id` over the current diorama; `line` jumps to that line fully typed */
    story(id: SceneId, line = 0): void {
      app.begin();
      app.dialogue?.finish();
      app.playStory(id, () => app.refresh());
      if (line > 0) app.dialogue?.goto(line, true);
    },
    storyLine: (i: number) => app.dialogue?.goto(i, true),
    /** force the end screen (win or loss) for the current run */
    endRun(won: boolean): void {
      app.begin();
      app.dialogue?.finish();
      app.endBattle(false);
      app.run.status = won ? 'won' : 'lost';
      app.refresh();
    },
    toTitle: () => app.toTitle(),
    get save() { return app.save; },
    state: () => ({
      screen: app.screen,
      status: app.run.status,
      seed: app.seed,
      region: app.run.regionIdx,
      step: app.run.step,
      shards: app.run.shards,
      relics: [...app.run.relics],
      party: app.run.party.map((p) => ({ ...p })),
      battle: app.battle
        ? { outcome: app.battle.battle.state.outcome, ember: app.battle.battle.state.emberMeter, speed: app.battle.speed, paused: app.battle.paused }
        : null,
      bot: app.bot.name,
      hard: app.run.hard,
      dialogue: app.dialogue ? { scene: app.dialogue.scene.id, line: app.dialogue.index } : null,
    }),
  };
}
