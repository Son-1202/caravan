// Pixel icons as inline SVG built from 8x8 bitmaps ('#' = main colour, '+' = accent, '.' = clear).
const ICONS: Record<string, { rows: string[]; main: string; accent: string }> = {
  slash: { main: '#e8e2d4', accent: '#8a8478', rows: ['......##', '.....##+', '....##+.', '...##+..', '+.##+...', '.##+....', '.+#.....', '+..+....'] },
  pierce: { main: '#bfe4ff', accent: '#5a7d9a', rows: ['....#...', '...###..', '....#...', '....#...', '....#...', '....#...', '...+#+..', '..+.+.+.'] },
  fire: { main: '#ff8a3a', accent: '#ffd36a', rows: ['...#....', '...##...', '..###.#.', '..##+##.', '.##++##.', '.#++++#.', '.##++##.', '..####..'] },
  holy: { main: '#ffe27a', accent: '#fff6c8', rows: ['...##...', '...##...', '########', '#++##++#', '...##...', '...##...', '...##...', '...##...'] },
  fight: { main: '#e8e2d4', accent: '#a0522d', rows: ['#......#', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '++....++', '++....++'] },
  elite: { main: '#ff6a5a', accent: '#ffd36a', rows: ['+..+..+.', '+#.+#.+#', '.######.', '.#+##+#.', '.######.', '..#..#..', '.##..##.', '........'] },
  camp: { main: '#ff9a3c', accent: '#7a4a22', rows: ['...#....', '..##.#..', '..####..', '.##++##.', '.#++++#.', '..####..', '+#+..+#+', '.+....+.'] },
  merchant: { main: '#ffd36a', accent: '#8a5a22', rows: ['..++++..', '.+....+.', '.######.', '##++++##', '#++##++#', '#++##++#', '##++++##', '.######.'] },
  event: { main: '#c9b8ff', accent: '#6a5aa0', rows: ['..####..', '.##++##.', '.#+..##.', '....##..', '...##...', '...##...', '........', '...##...'] },
  boss: { main: '#ffcf6a', accent: '#b02a2a', rows: ['#..#..#.', '##.##.##', '########', '#++##++#', '########', '.#.##.#.', '.######.', '..#..#..'] },
  shard: { main: '#ffb060', accent: '#fff0c0', rows: ['...#....', '..#+#...', '..#+#...', '.#++##..', '.#+###..', '.#####..', '..###...', '...#....'] },
  potion: { main: '#ff6a5a', accent: '#d8d0c0', rows: ['...++...', '...++...', '..+..+..', '.######.', '#######+', '########', '########', '.######.'] },
  heart: { main: '#ff5a5a', accent: '#ffb0b0', rows: ['.##..##.', '#+######', '#+######', '########', '.######.', '..####..', '...##...', '........'] },
  shield: { main: '#9ec8ff', accent: '#e8f4ff', rows: ['########', '#++#####', '#+######', '########', '.######.', '.######.', '..####..', '...##...'] },
};

export type IconName = keyof typeof ICONS;

const cache = new Map<string, string>();

export function iconSvg(name: string, size = 16): string {
  const key = `${name}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ic = ICONS[name] ?? ICONS.event!;
  let rects = '';
  ic.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '#' || c === '+') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === '#' ? ic.main : ic.accent}"/>`;
    }
  });
  const svg = `<svg class="px-icon" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  cache.set(key, svg);
  return svg;
}

export function iconEl(name: string, size = 16, cls = ''): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = `icon ${cls}`.trim();
  s.innerHTML = iconSvg(name, size);
  return s;
}
