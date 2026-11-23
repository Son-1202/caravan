// "Rotate your device" overlay (T-12). Shown purely by CSS (.rotate) on narrow portrait screens.
import { h } from './dom';

export function installRotateOverlay(parent: HTMLElement): HTMLElement {
  const el = h(
    'div',
    { class: 'rotate', attrs: { 'aria-live': 'polite' } },
    h('div', { class: 'rotate__phone', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'rotate__text', text: 'Rotate your device' }),
    h('div', { class: 'rotate__sub', text: 'Caravan of Embers plays in landscape.' }),
  );
  parent.append(el);
  return el;
}
