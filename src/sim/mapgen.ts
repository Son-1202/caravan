// Node map generation from map.json: 4 regions × (stepsPerRegion steps of 2–3 choices + boss).
import { EVENTS, MAP_CONFIG, REGION_BY_ID, REGION_ORDER } from '../data';
import type { MapGenConfig, NodeType, RegionId } from '../data';
import type { SeededRng } from './rng';

export interface MapNode {
  id: string;
  region: RegionId;
  /** 0-based region index */
  regionIdx: number;
  /** 0-based step within the region; the boss is step = stepsPerRegion */
  step: number;
  type: NodeType;
  /** encounter id for fight / elite / boss */
  encounterId?: string;
  /** event id for event nodes */
  eventId?: string;
}

export interface RegionMap {
  region: RegionId;
  steps: MapNode[][];
}

type PathType = Exclude<NodeType, 'boss'>;
const TYPES: PathType[] = ['fight', 'elite', 'camp', 'merchant', 'event'];

export function generateMap(rng: SeededRng, cfg: MapGenConfig = MAP_CONFIG): RegionMap[] {
  const usedEvents = new Set<string>();
  const out: RegionMap[] = [];
  REGION_ORDER.forEach((region, regionIdx) => {
    const reg = REGION_BY_ID[region];
    const counts: Partial<Record<PathType, number>> = {};
    const steps: MapNode[][] = [];
    for (let step = 0; step < cfg.stepsPerRegion; step++) {
      let types: PathType[];
      if (regionIdx === 0 && step === 0) types = [...cfg.firstStepTypes];
      else {
        const n = rng.int(cfg.nodesPerStep.min, cfg.nodesPerStep.max);
        const weights = cfg.stepWeights[Math.min(step, cfg.stepWeights.length - 1)] ?? {};
        types = [];
        for (let i = 0; i < n; i++) {
          const t = rng.weighted(TYPES, (ty) => {
            if (cfg.rules.uniqueTypesPerStep && types.includes(ty)) return 0;
            const max = cfg.rules.maxPerRegion[ty];
            if (max !== undefined && (counts[ty] ?? 0) + types.filter((x) => x === ty).length >= max) return 0;
            return weights[ty] ?? 0;
          });
          if (t) types.push(t);
        }
        if (cfg.rules.guaranteeCombatEachStep && !types.some((t) => t === 'fight' || t === 'elite')) {
          if (types.length === 0) types.push('fight');
          else types[rng.int(0, types.length - 1)] = 'fight';
        }
      }
      const nodes: MapNode[] = [];
      types.forEach((type, i) => {
        const node: MapNode = { id: `r${regionIdx}s${step}n${i}`, region, regionIdx, step, type };
        if (type === 'event') {
          const pool = EVENTS.filter((e) => (!e.regions || e.regions.includes(region)) && !usedEvents.has(e.id));
          if (pool.length === 0) node.type = 'fight';
          else {
            const ev = rng.pick(pool);
            if (cfg.rules.noRepeatEvents) usedEvents.add(ev.id);
            node.eventId = ev.id;
          }
        }
        if (node.type === 'fight') node.encounterId = rng.pick(reg.fights).id;
        if (node.type === 'elite') node.encounterId = rng.pick(reg.elites).id;
        nodes.push(node);
      });
      if (cfg.rules.uniqueTypesPerStep) {
        // an event slot that fell back to 'fight' may duplicate a type: keep the first of each
        const seen = new Set<NodeType>();
        const dedup = nodes.filter((nd) => (seen.has(nd.type) ? false : (seen.add(nd.type), true)));
        nodes.length = 0;
        dedup.forEach((nd, i) => nodes.push({ ...nd, id: `r${regionIdx}s${step}n${i}` }));
      }
      for (const nd of nodes) {
        const t = nd.type as PathType;
        counts[t] = (counts[t] ?? 0) + 1;
      }
      steps.push(nodes);
    }
    if (cfg.bossNodeAtEnd) {
      steps.push([{
        id: `r${regionIdx}boss`, region, regionIdx, step: cfg.stepsPerRegion, type: 'boss', encounterId: reg.boss.id,
      }]);
    }
    out.push({ region, steps });
  });
  return out;
}

export function isEncounter(t: NodeType): boolean {
  return t === 'fight' || t === 'elite' || t === 'event' || t === 'boss';
}
