// Look up how a sim action should be drawn (pure data lookup, unit-tested).
import { ENEMY_BY_ID, HERO_BY_ID } from '../data';
import type { HeroId } from '../data';
import { attackStyle, type AttackStyle } from './layout';

export interface ActionInfo {
  kind: string | undefined;
  damageType: string | undefined;
  style: AttackStyle;
}

/** `skill` is the SimEvent skill id ('basic' for hero basics). */
export function actionInfo(side: 'hero' | 'enemy', defId: string, skill: string): ActionInfo {
  let kind: string | undefined;
  let damageType: string | undefined;
  if (side === 'hero') {
    const h = HERO_BY_ID[defId as HeroId];
    if (h) {
      const a = skill === 'basic' ? h.basic : skill === h.skill.id ? h.skill : skill === h.ultimate.id ? h.ultimate : h.basic;
      kind = a.kind;
      damageType = a.damageType ?? h.basic.damageType;
    }
  } else {
    const a = ENEMY_BY_ID[defId]?.actions.find((x) => x.id === skill);
    kind = a?.kind;
    damageType = a?.damageType;
  }
  return { kind, damageType, style: attackStyle(kind, damageType) };
}

/** Sprite tier sizing for placeholders (matches scripts/pixelize.ts heights). */
export function enemyTier(defId: string): { tier: string; big: boolean } {
  const e = ENEMY_BY_ID[defId];
  const tier = e?.tier ?? 'normal';
  return { tier, big: (e?.size ?? 1) >= 2 || tier === 'boss' || tier === 'final' };
}

export const TIER_PX: Record<string, number> = { normal: 96, elite: 120, boss: 192, final: 192 };
