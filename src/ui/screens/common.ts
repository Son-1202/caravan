// Shared pieces for the overlay screens: ScreenView contract, top bar (shards, relics, party), art lookups.
import { CONSUMABLE_BY_ID, HERO_BY_ID, RELIC_BY_ID } from '../../data';
import type { HeroId } from '../../data';
import type { Run } from '../../sim';
import { findAsset } from '../../render/assets';
import { h } from '../dom';
import { iconEl } from '../icons';

export interface ScreenView {
  el: HTMLElement;
  update?(dt: number): void;
  dispose?(): void;
}

export function portraitUrl(id: string): string | null {
  return findAsset(`heroes/${id}_portrait`);
}

export function relicIconUrl(id: string): string | null {
  return findAsset(`relics/${id}`);
}

export function relicChip(id: string, size = 'md'): HTMLElement {
  const def = RELIC_BY_ID[id];
  const url = relicIconUrl(id);
  const el = h('div', { class: `relic relic--${size}`, tip: def ? `${def.name} — ${def.description}` : id });
  if (url) el.append(h('img', { attrs: { src: url, alt: def?.name ?? id, draggable: 'false' } }));
  else el.append(iconEl('shard', 24));
  return el;
}

export function heroHp(run: Run, id: HeroId): { hp: number; max: number; frac: number } {
  const st = run.party.find((p) => p.id === id);
  const max = Math.round(run.heroMaxHp(id));
  const frac = st?.hpFrac ?? 0;
  return { hp: Math.round(max * frac), max, frac };
}

export function bar(frac: number, cls: string): HTMLElement {
  const fill = h('div', { class: 'bar__fill', style: { width: `${Math.max(0, Math.min(1, frac)) * 100}%` } });
  return h('div', { class: `bar ${cls}` }, fill);
}

export function partyChip(run: Run, id: HeroId): HTMLElement {
  const def = HERO_BY_ID[id];
  const hp = heroHp(run, id);
  const st = run.party.find((p) => p.id === id);
  const url = portraitUrl(id);
  return h(
    'div',
    { class: `pchip${hp.frac <= 0 ? ' pchip--down' : ''}`, tip: `${def.name} ${def.title} · Lv ${st?.level ?? 1} · skill rank ${st?.skillRank ?? 1} · ${hp.hp}/${hp.max} HP` },
    url ? h('img', { attrs: { src: url, alt: def.name, draggable: 'false' } }) : h('span', { text: def.name[0] ?? '?' }),
    bar(hp.frac, 'bar--hp'),
  );
}

export interface TopBarOpts {
  onUseItem?: (id: string) => void;
  /** compact region label shown instead of the full name on phone landscape */
  regionShort?: string;
}

/** Region · shards · relics · consumables · party HP. */
export function topBar(run: Run, regionName: string, opts: TopBarOpts = {}): HTMLElement {
  const relics = h('div', { class: 'topbar__relics' }, ...run.relics.map((r) => relicChip(r, 'sm')));
  if (run.relics.length === 0) relics.append(h('span', { class: 'muted', text: 'No relics yet' }));
  const items = h('div', { class: 'topbar__items' });
  run.consumables.forEach((id) => {
    const d = CONSUMABLE_BY_ID[id];
    const usable = !!opts.onUseItem && !!d?.usableIn.includes('map');
    const b = h('button', {
      class: `item${usable ? '' : ' item--passive'}`,
      tip: d ? `${d.name} — ${d.description}${usable ? ' (tap to use)' : ' (battle only)'}` : id,
      attrs: { type: 'button' },
      onClick: () => usable && opts.onUseItem?.(id),
    });
    b.append(iconEl('potion', 20));
    items.append(b);
  });
  return h(
    'div',
    { class: 'topbar panel' },
    h('div', { class: 'topbar__region' }, h('span', { class: 'topbar__full', text: regionName }), opts.regionShort ? h('span', { class: 'topbar__short', text: opts.regionShort }) : null),
    h('div', { class: 'topbar__shards', tip: 'Ember Shards' }, iconEl('shard', 20), h('span', { text: String(run.shards) })),
    relics,
    items,
    h('div', { class: 'topbar__party' }, ...run.party.map((p) => partyChip(run, p.id))),
  );
}
