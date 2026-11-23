// Minimal won / lost screens with run stats (T-12 polishes).
import type { Run } from '../../sim';
import { REGION_BY_ID } from '../../data';
import { button, h } from '../dom';
import type { ScreenView } from './common';

export function endScreen(run: Run, onAgain: () => void): ScreenView {
  const won = run.status === 'won';
  const s = run.stats;
  const reg = run.map[Math.min(run.regionIdx, run.map.length - 1)];
  const rows: Array<[string, string]> = [
    ['Region', won ? 'Solenne relit' : (reg ? REGION_BY_ID[reg.region].name : '?')],
    ['Nodes', String(s.nodes)],
    ['Fights', String(s.fights)],
    ['Breaks', String(s.breaks)],
    ['Ignites', String(s.ignites)],
    ['Kills', String(s.kills)],
    ['Damage dealt', String(Math.round(s.damageDealt))],
    ['Damage taken', String(Math.round(s.damageTaken))],
    ['Shards earned', String(s.shardsEarned)],
    ['Relics', String(run.relics.length)],
    ['Battle time', `${Math.round(s.time)} s`],
  ];
  const el = h(
    'div',
    { class: `screen screen--end ${won ? 'end--won' : 'end--lost'}` },
    h(
      'div',
      { class: 'panel end__box' },
      h('h1', { class: 'title', text: won ? 'The Brazier Burns' : 'The Ember Fades' }),
      h('p', { class: 'muted', text: won ? 'Solenne is warm again.' : 'The caravan falls silent in the dark.' }),
      h('dl', { class: 'stats' }, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('div', { class: 'muted small', text: `seed ${run.seed}` }),
      button('New run', onAgain, 'btn--big btn--ember'),
    ),
  );
  return { el };
}
