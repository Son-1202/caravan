// Shared helpers for sim unit tests.
import { HEROES } from '../../src/data';
import type { HeroId } from '../../src/data';
import { DEFAULT_FORMATION, Run, SeededRng, type Formation, type HeroState, type SimEvent } from '../../src/sim';

export function party(level = 1, overrides: Partial<Record<HeroId, Partial<HeroState>>> = {}): HeroState[] {
  return HEROES.map((h) => ({ id: h.id, level, skillRank: 1, hpFrac: 1, ...overrides[h.id] }));
}

export function only(...ids: HeroId[]): Formation {
  const f: Formation = { front: [null, null], back: [null, null] };
  for (const id of ids) {
    const row = DEFAULT_FORMATION.front.includes(id) ? 'front' : 'back';
    const slot = f[row][0] === null ? 0 : 1;
    f[row][slot] = id;
  }
  return f;
}

export function ofType<T extends SimEvent['type']>(log: readonly SimEvent[], t: T): Extract<SimEvent, { type: T }>[] {
  return log.filter((e): e is Extract<SimEvent, { type: T }> => e.type === t);
}

/** Plays a whole run with a simple seeded policy. Returns the run and the path node types. */
export function autoplay(seed: number, hard = false): { run: Run; path: string[] } {
  const run = new Run(seed, hard);
  const rng = new SeededRng(seed ^ 0x5eed);
  const path: string[] = [];
  for (let guard = 0; guard < 500; guard++) {
    switch (run.status) {
      case 'won':
      case 'lost':
        return { run, path };
      case 'story': run.ackStory(); break;
      case 'map': {
        const node = rng.pick(run.availableNodes());
        path.push(node.type);
        run.chooseNode(node.id);
        break;
      }
      case 'battle': {
        const b = run.startBattle();
        b.runToEnd();
        run.finishBattle(b);
        break;
      }
      case 'reward': {
        const choices = run.pendingRelicChoice();
        if (choices?.[0]) run.takeRelic(choices[0]);
        else run.proceed();
        break;
      }
      case 'camp': run.camp({ kind: 'heal' }); break;
      case 'merchant': {
        const item = run.merchantStock().find((s) => s.price <= run.shards);
        if (item) run.buy(item.id);
        run.proceed();
        break;
      }
      case 'event': {
        if (!run.eventResult) {
          const ev = run.event();
          if (!ev) throw new Error('event node without event');
          const idx = ev.choices.findIndex((c) => (c.costShards ?? 0) <= run.shards);
          run.resolveEvent(Math.max(0, idx));
        } else if (run.eventResult.pendingSkillRank) run.chooseSkillRank('kit');
        else run.proceed();
        break;
      }
    }
  }
  throw new Error('autoplay did not finish');
}
