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

export function mapScreen(run: Run, visited: ReadonlySet<string>, act: MapActions): ScreenView {
  const region = run.map[run.regionIdx];
  if (!region) return { el: h('div', { class: 'screen' }) };
  const regName = REGION_BY_ID[region.region].name;
  const reachable = new Set(run.availableNodes().map((n) => n.id));
  const bg = getAssetUrl('ui/map_bg.jpg');
  const board = h('div', { class: 'map__board', style: bg ? { 'background-image': `url("${bg}")` } : {} });
  const svgNs = 'http://www.w3.org/2000/svg';
  const lines = document.createElementNS(svgNs, 'svg');
  lines.setAttribute('class', 'map__lines');
  lines.setAttribute('viewBox', '0 0 100 100');
  lines.setAttribute('preserveAspectRatio', 'none');
  board.append(lines);

  const cols = region.steps.length;
  const pos = new Map<string, { x: number; y: number }>();
  region.steps.forEach((nodes, s) => {
    nodes.forEach((n, i) => {
      const x = 10 + (80 * s) / Math.max(1, cols - 1);
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
    topBar(run, `${regName} · ${run.regionIdx + 1}/4`, { onUseItem: act.useItem }),
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
