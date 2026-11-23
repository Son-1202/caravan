// Post-fight reward: shards, relic choice (1 or 3), level-up note after region bosses.
import { RELIC_BY_ID } from '../../data';
import type { Run } from '../../sim';
import { button, h } from '../dom';
import { iconEl } from '../icons';
import { relicChip, topBar, type ScreenView } from './common';

export interface RewardActions {
  take(id: string): void;
  skip(): void;
}

export function rewardScreen(run: Run, regionName: string, act: RewardActions): ScreenView {
  const r = run.lastReward;
  const choices = run.pendingRelicChoice() ?? [];
  const box = h(
    'div',
    { class: 'panel reward' },
    h('h2', { class: 'title title--sm', text: 'Victory' }),
    h('div', { class: 'reward__shards' }, iconEl('shard', 24), h('span', { text: `+${r?.shards ?? 0} Ember Shards` })),
  );
  if (r?.levelUp) box.append(h('div', { class: 'reward__level', text: 'Level up! The party grows stronger and is fully healed.' }));
  if (choices.length > 0) {
    box.append(h('p', { class: 'muted', text: choices.length > 1 ? 'Choose one relic' : 'A relic glints in the ash' }));
    box.append(
      h(
        'div',
        { class: 'cards' },
        ...choices.map((id) => {
          const d = RELIC_BY_ID[id];
          return h(
            'div',
            { class: `card card--${d?.rarity ?? 'common'}` },
            relicChip(id, 'lg'),
            h('div', { class: 'card__name', text: d?.name ?? id }),
            h('div', { class: 'card__desc', text: d?.description ?? '' }),
            button('Take', () => act.take(id), 'btn--ember'),
          );
        }),
      ),
    );
  }
  box.append(button(choices.length > 0 ? 'Skip' : 'Continue', act.skip));
  return { el: h('div', { class: 'screen screen--reward' }, topBar(run, regionName), box) };
}
