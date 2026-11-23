// Node map: current region's steps + boss as connected nodes over the marching diorama.
import { REGION_BY_ID } from '../../data';
import type { MapNode, Run } from '../../sim';
import { getAssetUrl } from '../../render/assets';
import { NODE_LABEL } from '../../game/flow';
import { h } from '../dom';
import { iconSvg } from '../icons';
import { topBar, type ScreenView } from './common';

export interface MapActions {
  choose(id: string): void;
  useItem(id: string): void;
}

const NODE_TIP: Record<string, string> = {
  fight: 'Fight — a band of foes. Shards, small relic chance.',
  elite: 'Elite — a hard fight. Guaranteed relic.',
  camp: 'Camp — heal the party or train a skill.',
  merchant: 'Merchant — spend Ember Shards on relics and supplies.',
  event: 'Event — a choice on the road.',
  boss: 'Boss — the guardian of the region. Pick 1 of 3 relics.',
};

/** Left→right quarter of the world parchment (ui/map_bg) that shows each region. */
const REGION_QUARTER: Record<string, number> = { whisperpine: 0, glass_dunes: 1, frostspire: 2, solenne: 3 };
/** Short top-bar names for phone landscape. */
export const REGION_SHORT: Record<string, string> = { whisperpine: 'Whisperpine', glass_dunes: 'Dunes', frostspire: 'Frostspire', solenne: 'Solenne' };
/** Background zoom: the board shows 1/MAP_ZOOM of the parchment's width (a region is 1/4). */
const MAP_ZOOM = 2.6;

/** Zoom/pan the parchment to one region's quarter; returns that quarter's span on the board (0..100). */
function regionView(q: number): { bgSize: string; bgPosX: string; from: number; to: number } {
  const v = 1 / MAP_ZOOM;
  const start = Math.min(1 - v, Math.max(0, (q + 0.5) / 4 - v / 2));
  return {
    bgSize: `${MAP_ZOOM * 100}% auto`,
    bgPosX: `${((start * MAP_ZOOM) / (MAP_ZOOM - 1)) * 100}%`,
    from: ((q / 4 - start) / v) * 100,
    to: (((q + 1) / 4 - start) / v) * 100,
  };
}

export function mapScreen(run: Run, visited: ReadonlySet<string>, act: MapActions): ScreenView {
  const region = run.map[run.regionIdx];
  if (!region) return { el: h('div', { class: 'screen' }) };
  const regName = REGION_BY_ID[region.region].name;
  const reachable = new Set(run.availableNodes().map((n) => n.id));
  const bg = getAssetUrl('ui/map_bg.jpg');
  const q = REGION_QUARTER[region.region] ?? Math.min(3, run.regionIdx);
  const view = regionView(q);
  const board = h('div', {
    class: 'map__board',
    style: bg ? { 'background-image': `url("${bg}")`, 'background-size': view.bgSize, 'background-position': `${view.bgPosX} 50%` } : {},
  });
  // the neighbouring regions' art at the edges: behind = travelled (warm sepia), ahead = fogged
  if (view.from > 0.5) board.append(h('div', { class: 'map__veil map__veil--past', style: { left: '0', width: `${view.from}%` } }, q > 0 ? h('span', { class: 'map__veil-tag', text: 'Travelled' }) : null));
  if (view.to < 99.5) board.append(h('div', { class: 'map__veil map__veil--ahead', style: { left: `${view.to}%`, right: '0' } }, h('span', { class: 'map__veil-tag', text: 'Ahead' })));
  const svgNs = 'http://www.w3.org/2000/svg';
  const lines = document.createElementNS(svgNs, 'svg');
  lines.setAttribute('class', 'map__lines');
  lines.setAttribute('viewBox', '0 0 100 100');
  lines.setAttribute('preserveAspectRatio', 'none');
  board.append(lines);

  const cols = region.steps.length;
  // nodes sit on this region's art (with a margin so labels stay inside the quarter)
  const x0 = Math.max(7, view.from + 5);
  const x1 = Math.min(93, view.to - 5);
  const pos = new Map<string, { x: number; y: number }>();
  region.steps.forEach((nodes, s) => {
    nodes.forEach((n, i) => {
      const x = x0 + ((x1 - x0) * s) / Math.max(1, cols - 1);
      const y = nodes.length === 1 ? 50 : 22 + (56 * i) / (nodes.length - 1);
      pos.set(n.id, { x, y });
    });
  });
  // connections: every node of step s links to every node of step s+1
  region.steps.forEach((nodes, s) => {
    const next = region.steps[s + 1];
    if (!next) return;
    for (const a of nodes) {
      for (const b of next) {
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        const ln = document.createElementNS(svgNs, 'line');
        ln.setAttribute('x1', String(pa.x));
        ln.setAttribute('y1', String(pa.y));
        ln.setAttribute('x2', String(pb.x));
        ln.setAttribute('y2', String(pb.y));
        const lit = (visited.has(a.id) && (visited.has(b.id) || reachable.has(b.id)));
        ln.setAttribute('class', lit ? 'map__line map__line--lit' : 'map__line');
        lines.append(ln);
      }
    }
  });
  region.steps.forEach((nodes) => nodes.forEach((n) => board.append(nodeEl(n, pos.get(n.id)!, run, visited, reachable, act))));

  const el = h(
    'div',
    { class: 'screen screen--map' },
    topBar(run, `${regName} · ${run.regionIdx + 1}/4`, { onUseItem: act.useItem, regionShort: `${REGION_SHORT[region.region] ?? regName} ${run.regionIdx + 1}/4` }),
    h('div', { class: 'map__wrap panel panel--parchment' }, board, h('div', { class: 'map__hint', text: 'Choose the road ahead' })),
  );
  return { el };
}

function nodeEl(
  n: MapNode, p: { x: number; y: number }, run: Run, visited: ReadonlySet<string>, reachable: ReadonlySet<string>, act: MapActions,
): HTMLElement {
  const isReach = reachable.has(n.id);
  const past = n.step < run.step;
  const state = visited.has(n.id) ? 'visited' : isReach ? 'reach' : past ? 'skipped' : 'future';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `mnode mnode--${n.type} mnode--${state}`;
  b.style.left = `${p.x}%`;
  b.style.top = `${p.y}%`;
  b.dataset.tip = NODE_TIP[n.type] ?? n.type;
  b.dataset.node = n.id;
  b.disabled = !isReach;
  b.innerHTML = `${iconSvg(n.type, n.type === 'boss' ? 40 : 28)}<span class="mnode__label">${NODE_LABEL[n.type] ?? n.type}</span>`;
  b.addEventListener('click', () => isReach && act.choose(n.id));
  return b;
}
