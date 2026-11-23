// Formation: drag (mouse + touch via pointer events) or tap-tap the 4 portraits into a 2x2 grid.
import { HERO_BY_ID } from '../../data';
import type { Formation, Run } from '../../sim';
import { getSlot, parseSlot, SLOT_KEYS, swapSlots, type SlotKey } from '../../game/formation';
import { button, h } from '../dom';
import { iconEl } from '../icons';
import { bar, heroHp, portraitUrl, type ScreenView } from './common';

export function formationScreen(run: Run, initial: Formation, title: string, onFight: (f: Formation) => void): ScreenView {
  let f = initial;
  let selected: SlotKey | null = null;
  const grid = h('div', { class: 'fgrid' });
  const rowLabel = (t: string, tip: string): HTMLElement => h('div', { class: 'fgrid__row', text: t, tip });
  const slots = new Map<SlotKey, HTMLElement>();

  const render = (): void => {
    grid.replaceChildren(
      rowLabel('Back', 'Back row: safer from melee'),
      rowLabel('Front', 'Front row takes 70% of melee hits'),
    );
    for (const k of ['back0', 'front0', 'back1', 'front1'] as SlotKey[]) {
      const s = h('div', { class: `fslot fslot--${parseSlot(k).row}${selected === k ? ' fslot--sel' : ''}`, attrs: { 'data-slot': k } });
      const id = getSlot(f, k);
      if (id) s.append(card(run, id));
      slots.set(k, s);
      grid.append(s);
    }
  };

  const slotAt = (x: number, y: number): SlotKey | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
    const k = el?.dataset.slot as SlotKey | undefined;
    return k && SLOT_KEYS.includes(k) ? k : null;
  };

  // pointer drag with a floating ghost; a short press without movement = tap-select
  grid.addEventListener('pointerdown', (e) => {
    const from = slotAt(e.clientX, e.clientY);
    if (!from || !getSlot(f, from)) {
      if (from && selected) { f = swapSlots(f, selected, from); selected = null; render(); }
      return;
    }
    e.preventDefault();
    const src = slots.get(from)!.firstElementChild as HTMLElement | null;
    let ghost: HTMLElement | null = null;
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent): void => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8 && src) {
        ghost = src.cloneNode(true) as HTMLElement;
        ghost.classList.add('fcard--ghost');
        ghost.style.width = `${src.offsetWidth}px`;
        document.body.append(ghost);
        src.classList.add('fcard--lifted');
      }
      if (ghost) {
        ghost.style.left = `${ev.clientX - ghost.offsetWidth / 2}px`;
        ghost.style.top = `${ev.clientY - ghost.offsetHeight / 2}px`;
        for (const [k, s] of slots) s.classList.toggle('fslot--over', k === slotAt(ev.clientX, ev.clientY));
      }
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (ghost) {
        ghost.remove();
        const to = slotAt(ev.clientX, ev.clientY);
        if (to && to !== from) f = swapSlots(f, from, to);
        selected = null;
      } else if (selected && selected !== from) {
        f = swapSlots(f, selected, from);
        selected = null;
      } else selected = selected === from ? null : from;
      render();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  render();

  const el = h(
    'div',
    { class: 'screen screen--formation' },
    h(
      'div',
      { class: 'panel formation' },
      h('h2', { class: 'title title--sm', text: title }),
      h('p', { class: 'formation__tip' }, iconEl('shield', 16), h('span', { text: 'Front row takes 70% of melee hits. Drag heroes to swap.' })),
      h('div', { class: 'formation__body' }, grid, h('div', { class: 'formation__arrow', text: 'enemies ▶' })),
      button('Fight', () => onFight(f), 'btn--big btn--ember'),
    ),
  );
  el.dataset.screen = 'formation';
  return { el };
}

function card(run: Run, id: keyof typeof HERO_BY_ID): HTMLElement {
  const def = HERO_BY_ID[id];
  const hp = heroHp(run, id);
  const url = portraitUrl(id);
  return h(
    'div',
    { class: `fcard${hp.frac <= 0 ? ' fcard--down' : ''}`, attrs: { 'data-hero': id } },
    url ? h('img', { attrs: { src: url, alt: def.name, draggable: 'false' } }) : h('div', { class: 'fcard__ph', text: def.name }),
    h('div', { class: 'fcard__name', text: def.name }),
    h('div', { class: 'fcard__role', text: def.role }),
    bar(hp.frac, 'bar--hp'),
  );
}
