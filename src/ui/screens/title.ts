// Title screen (T-12): Ken Burns key art, ember particles, glowing title, tap-to-start,
// Begin / Hard Mode (locked until first win) / Best Runs / Settings.
import { findAsset } from '../../render/assets';
import { formatTime, type QualitySetting, type RunRecord, type SaveData, type Settings } from '../../game/save';
import { button, h } from '../dom';
import { relicChip, type ScreenView } from './common';

export interface TitleActions {
  begin(hard: boolean): void;
  settings(patch: Partial<Settings>): void;
  /** first tap: unlock audio */
  unlock(): void;
  /** volume slider release (preview the new level) */
  preview?(): void;
}

export interface TitleOpts {
  seed: number;
  save: SaveData;
  /** skip the "tap to start" gate (already unlocked this session) */
  unlocked: boolean;
}

function embers(n: number): HTMLElement {
  const wrap = h('div', { class: 'title__embers', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < n; i++) {
    const size = 2 + Math.round(Math.random() * 3);
    wrap.append(
      h('i', {
        style: {
          left: `${Math.random() * 100}%`,
          width: `${size}px`,
          height: `${size}px`,
          'animation-duration': `${6 + Math.random() * 8}s`,
          'animation-delay': `${-Math.random() * 14}s`,
          '--drift': `${(Math.random() - 0.5) * 160}px`,
        },
      }),
    );
  }
  return wrap;
}

function seg<T extends string | number>(label: string, opts: Array<[T, string]>, cur: T, on: (v: T) => void): HTMLElement {
  const btns = opts.map(([v, l]) => {
    const b = button(l, () => {
      btns.forEach((x) => x.classList.remove('btn--on'));
      b.classList.add('btn--on');
      on(v);
    }, v === cur ? 'btn--on' : '');
    return b;
  });
  return h('div', { class: 'set__row' }, h('span', { class: 'set__label', text: label }), h('div', { class: 'set__seg' }, ...btns));
}

function runRow(r: RunRecord, i: number): HTMLElement {
  return h(
    'div',
    { class: `best__row${r.won ? ' best__row--won' : ''}` },
    h('span', { class: 'best__rank', text: `#${i + 1}` }),
    h('span', { class: 'best__res', text: r.won ? (r.hard ? 'Victory (Hard)' : 'Victory') : `Fell in ${r.regionName}` }),
    h('span', { class: 'best__time', text: formatTime(r.time) }),
    h('span', { class: 'best__relics' }, ...r.relics.slice(0, 8).map((id) => relicChip(id, 'xs'))),
    h('span', { class: 'best__seed muted', text: `seed ${r.seed}` }),
  );
}

export function titleScreen(o: TitleOpts, act: TitleActions): ScreenView {
  const art = findAsset('key_art');
  const s = o.save;
  const modal = h('div', { class: 'title__modal' });
  const closeModal = (): void => {
    modal.replaceChildren();
    modal.classList.remove('title__modal--on');
  };
  const openModal = (title: string, ...body: HTMLElement[]): void => {
    modal.replaceChildren(h('div', { class: 'panel title__panel' }, h('h2', { class: 'title title--sm', text: title }), ...body, button('Close', closeModal, 'btn--ember')));
    modal.classList.add('title__modal--on');
  };

  const best = (): void => {
    const list = s.bestRuns.length
      ? h('div', { class: 'best' }, ...s.bestRuns.map(runRow))
      : h('p', { class: 'muted', text: 'No runs yet. The road is waiting.' });
    openModal('Best Runs', h('p', { class: 'muted small', text: `${s.totalWins} win${s.totalWins === 1 ? '' : 's'} · ${s.totalRuns} run${s.totalRuns === 1 ? '' : 's'}` }), list);
  };

  const settings = (): void => {
    const st = s.settings;
    const vol = h('input', { class: 'set__range', attrs: { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(st.volume * 100)), 'aria-label': 'Volume' } });
    const volTxt = h('span', { class: 'set__val', text: `${Math.round(st.volume * 100)}%` });
    vol.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      volTxt.textContent = `${Math.round(v * 100)}%`;
      act.settings({ volume: v });
    });
    vol.addEventListener('change', () => act.preview?.());
    openModal(
      'Settings',
      seg<QualitySetting>('Quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']], st.quality, (v) => act.settings({ quality: v })),
      h('div', { class: 'set__row' }, h('span', { class: 'set__label', text: 'Volume' }), h('div', { class: 'set__seg' }, vol, volTxt)),
      seg<number>('Battle speed', [[1, '1x'], [2, '2x']], st.speed, (v) => act.settings({ speed: v })),
    );
  };

  const hard = button('Hard Mode', () => act.begin(true), 'btn--hard', !s.hardUnlocked);
  const hardWrap = h('span', { class: 'title__hard', tip: s.hardUnlocked ? 'Fiercer foes, fewer shards, weaker camps.' : 'Locked: win a run to unlock Hard Mode.' }, hard);
  if (!s.hardUnlocked) hardWrap.append(h('span', { class: 'title__lock', text: 'Locked' }));
  const menu = h(
    'div',
    { class: 'title__menu' },
    button('Begin Journey', () => act.begin(false), 'btn--big btn--ember title__begin'),
    hardWrap,
    h('div', { class: 'title__row' }, button('Best Runs', best), button('Settings', settings)),
  );
  const tap = h('div', { class: 'title__tap', text: 'Tap to start' });
  const el = h(
    'div',
    { class: `screen screen--start tscreen${o.unlocked ? ' tscreen--open' : ''}` },
    h('div', { class: 'title__art', style: art ? { 'background-image': `url("${art}")` } : {} }),
    h('div', { class: 'start__shade' }),
    embers(36),
    // logo in the sky, menu lower-left over a soft shade: the caravan in the key art stays visible
    h('div', { class: 'title__foot', attrs: { 'aria-hidden': 'true' } }),
    h(
      'div',
      { class: 'title__head' },
      h('h1', { class: 'title title__name', text: 'Caravan of Embers' }),
      h('p', { class: 'start__tag', text: 'Carry the last flame to Solenne.' }),
    ),
    h('div', { class: 'title__box' }, tap, menu),
    h('div', { class: 'start__seed', text: `seed ${o.seed}${s.totalWins ? ` · ${s.totalWins} win${s.totalWins === 1 ? '' : 's'}` : ''}` }),
    modal,
  );
  if (!o.unlocked) {
    const open = (e: Event): void => {
      e.preventDefault();
      act.unlock();
      el.classList.add('tscreen--open');
      el.removeEventListener('pointerdown', open);
      window.removeEventListener('keydown', open);
    };
    el.addEventListener('pointerdown', open);
    window.addEventListener('keydown', open);
    return { el, dispose: () => window.removeEventListener('keydown', open) };
  }
  return { el };
}
