// window.__debug hooks for QA / E2E (T-09).
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
    newRun: (seed: number) => app.newRun(seed),
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
    }),
  };
}
