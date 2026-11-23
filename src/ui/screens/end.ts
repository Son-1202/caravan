// Win / lose screens (T-12): run stats, relic icons, rank among best runs, New Run / Title.
import type { Run } from '../../sim';
import { REGION_BY_ID } from '../../data';
import { formatTime } from '../../game/save';
import { button, h } from '../dom';
import { relicChip, type ScreenView } from './common';

export interface EndInfo {
  /** wall-clock seconds */
  time: number;
  /** 0-based rank in best runs, or -1 */
  rank: number;
}

export interface EndActions {
  again(): void;
  title(): void;
}

export function endScreen(run: Run, info: EndInfo, act: EndActions): ScreenView {
  const won = run.status === 'won';
  const s = run.stats;
  const reg = run.map[Math.min(run.regionIdx, run.map.length - 1)];
  const regName = reg ? REGION_BY_ID[reg.region].name : '?';
  const fightsWon = Math.max(0, s.fights - (won ? 0 : 1));
  const rows: Array<[string, string]> = [
    ['Time', formatTime(info.time)],
    ['Region reached', won ? 'Solenne — relit' : `${regName} (${run.regionIdx + 1}/4)`],
    ['Fights won', String(fightsWon)],
    ['Breaks', String(s.breaks)],
    ['Ignites', String(s.ignites)],
    ['Damage dealt', Math.round(s.damageDealt).toLocaleString('en-US')],
    ['Seed', `${run.seed}${run.hard ? ' · Hard' : ''}`],
  ];
  const relics = h('div', { class: 'end__relics' }, ...run.relics.map((id) => relicChip(id, 'sm')));
  if (!run.relics.length) relics.append(h('span', { class: 'muted small', text: 'No relics' }));
  const badge = info.rank >= 0 ? h('div', { class: 'end__rank', text: info.rank === 0 ? 'New best run!' : `Best runs #${info.rank + 1}` }) : null;
  const el = h(
    'div',
    { class: `screen screen--end ${won ? 'end--won' : 'end--lost'}` },
    h(
      'div',
      { class: 'panel end__box' },
      h('h1', { class: 'title', text: won ? 'The Brazier Burns' : 'The Ember Fades' }),
      h('p', { class: 'muted end__sub', text: won ? 'Solenne is warm again. Keep it moving.' : 'The caravan falls silent in the dark.' }),
      badge,
      h('dl', { class: 'stats' }, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('div', { class: 'end__label muted small', text: `Relics collected (${run.relics.length})` }),
      relics,
      h('div', { class: 'row' }, button('New Run', act.again, 'btn--big btn--ember'), button('Title', act.title, 'btn--big')),
    ),
  );
  return { el };
}
