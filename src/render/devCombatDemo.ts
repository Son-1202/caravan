// Dev demo (?demo=combat): a real seeded sim Battle rendered by CombatView.
// Query: region=<id> fight=<fight id> seed=<n> speed=<x> freeze=<trigger>:<ms>
//   trigger = time | attack (hero) | break | ignite | death; fires on the visual beat, then freezes the frame
import { DEFAULT_FORMATION, Battle, type SimEvent } from '../sim';
import { HEROES, REGION_BY_ID } from '../data';
import type { RegionId } from '../data';
import { CombatView } from './combatView';
import type { RenderContext } from './context';
import { isRegionId } from './regions';

const STEP = 0.05;
const RESTART_AFTER = 3;

export interface CombatDemo {
  readonly view: CombatView;
  /** true once a ?freeze trigger fired: the caller should stop advancing time */
  frozen: boolean;
  battle: Battle;
  update(dt: number): void;
}

export function startCombatDemo(ctx: RenderContext, params: URLSearchParams): CombatDemo {
  const regionParam = params.get('region') ?? 'whisperpine';
  const regionId: RegionId = isRegionId(regionParam) ? regionParam : 'whisperpine';
  const region = REGION_BY_ID[regionId];
  const all = [...region.fights, ...region.elites, region.boss];
  const fightParam = params.get('fight');
  let fightIdx = Math.max(0, all.findIndex((f) => f.id === fightParam));
  if (!fightParam) fightIdx = Math.min(2, all.length - 1);
  let seed = Number(params.get('seed') ?? 7);
  const speed = Number(params.get('speed') ?? 1);
  const [trigger, delayMs] = (params.get('freeze') ?? '').split(':');
  const freezeDelay = Number(delayMs ?? 0) / 1000;

  const view = new CombatView(ctx, { regionId });
  let elapsed = 0;
  let freezeAt = trigger === 'time' ? freezeDelay : Infinity;
  let acc = 0;
  let endedAt = -1;
  // freeze triggers fire on the visual beat (not the sim event) so shots land mid-effect
  view.onCue = (cue, _uid, side) => {
    if (freezeAt !== Infinity || !trigger || cue !== trigger) return;
    if (cue === 'attack' && side !== 'hero') return;
    freezeAt = elapsed + freezeDelay;
  };

  const newBattle = (): Battle => {
    const fight = all[fightIdx % all.length]!;
    const b = new Battle({
      party: HEROES.map((h) => ({ id: h.id, level: 1, skillRank: 1, hpFrac: 1 })),
      formation: DEFAULT_FORMATION,
      enemies: { front: fight.front, back: fight.back },
      regionOrder: region.order,
      rng: seed,
    });
    view.setup(b.state, DEFAULT_FORMATION);
    return b;
  };

  const demo: CombatDemo = {
    view,
    frozen: false,
    battle: newBattle(),
    update(dt: number) {
      if (demo.frozen) return;
      elapsed += dt;
      if (elapsed >= freezeAt) {
        demo.frozen = true;
        window.__debug.frozen = true;
        return;
      }
      view.update(dt);
      const b = demo.battle;
      if (b.state.outcome !== 'ongoing') {
        if (endedAt < 0) endedAt = elapsed;
        if (elapsed - endedAt > RESTART_AFTER) {
          endedAt = -1;
          seed++;
          fightIdx++;
          demo.battle = newBattle();
        }
        return;
      }
      if (b.canIgnite() && !view.busy) feed(b.ignite());
      acc += dt * speed * view.timeScale;
      while (acc >= STEP) {
        acc -= STEP;
        feed(b.tick(STEP));
      }
    },
  };

  function feed(events: SimEvent[]): void {
    if (events.length) view.applyEvents(events);
  }

  return demo;
}
