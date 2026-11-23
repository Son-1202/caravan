// Merchant: stock list, buy, reroll, leave.
import { BALANCE, CONSUMABLE_BY_ID, RELIC_BY_ID } from '../../data';
import type { Run } from '../../sim';
import { button, h } from '../dom';
import { iconEl } from '../icons';
import { relicChip, topBar, type ScreenView } from './common';

export interface MerchantActions {
  buy(id: string): void;
  reroll(): void;
  leave(): void;
}

export function merchantScreen(run: Run, regionName: string, act: MerchantActions): ScreenView {
  const stock = run.merchantStock();
  const rows = stock.map((it) => {
    const relic = it.kind === 'relic' ? RELIC_BY_ID[it.id] : undefined;
    const cons = it.kind === 'consumable' ? CONSUMABLE_BY_ID[it.id] : undefined;
    const name = relic?.name ?? cons?.name ?? it.id;
    const desc = relic?.description ?? cons?.description ?? '';
    const icon = relic ? relicChip(it.id, 'md') : iconEl('potion', 32, 'shop__potion');
    const afford = run.shards >= it.price;
    return h(
      'div',
      { class: `shop__row${it.sold ? ' shop__row--sold' : ''}` },
      icon,
      h('div', { class: 'shop__text' }, h('div', { class: 'card__name', text: name + (relic ? ` (${relic.rarity})` : '') }), h('div', { class: 'card__desc', text: desc })),
      it.sold
        ? h('div', { class: 'shop__sold', text: 'Sold' })
        : button(`${it.price}`, () => act.buy(it.id), afford ? 'btn--ember shop__buy' : 'shop__buy', !afford),
    );
  });
  const cost = BALANCE.merchant.rerollCost;
  const box = h(
    'div',
    { class: 'panel shop' },
    h('h2', { class: 'title title--sm', text: 'Wandering Merchant' }),
    h('p', { class: 'muted' }, h('span', { text: 'Prices in ' }), iconEl('shard', 14), h('span', { text: ' Ember Shards' })),
    h('div', { class: 'shop__list' }, ...rows),
    h('div', { class: 'row' }, button(`Reroll (${cost})`, act.reroll, '', run.shards < cost), button('Leave', act.leave, 'btn--ember')),
  );
  return { el: h('div', { class: 'screen screen--merchant' }, topBar(run, regionName), box) };
}
