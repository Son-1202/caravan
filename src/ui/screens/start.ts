// Minimal start screen: key art, title, Begin, seed (T-12 polishes).
import { findAsset } from '../../render/assets';
import { button, h } from '../dom';
import type { ScreenView } from './common';

export function startScreen(seed: number, onBegin: () => void): ScreenView {
  const art = findAsset('key_art');
  const el = h(
    'div',
    { class: 'screen screen--start', style: art ? { 'background-image': `url("${art}")` } : {} },
    h('div', { class: 'start__shade' }),
    h(
      'div',
      { class: 'start__box' },
      h('h1', { class: 'title', text: 'Caravan of Embers' }),
      h('p', { class: 'start__tag', text: 'Carry the last flame to Solenne.' }),
      button('Begin', onBegin, 'btn--big btn--ember'),
    ),
    h('div', { class: 'start__seed', text: `seed ${seed}` }),
  );
  return { el };
}
