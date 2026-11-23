// Event: title, text, choices -> outcome text (+ skill-rank pick, or a fight it started).
import type { HeroId } from '../../data';
import type { Run } from '../../sim';
import { button, h } from '../dom';
import { iconEl } from '../icons';
import { heroPicker } from './camp';
import { topBar, type ScreenView } from './common';

export interface EventActions {
  choose(i: number): void;
  pickHero(id: HeroId): void;
  next(): void;
}

export function eventScreen(run: Run, regionName: string, act: EventActions): ScreenView {
  const ev = run.event();
  const res = run.eventResult;
  const box = h('div', { class: 'panel event' }, h('h2', { class: 'title title--sm', text: ev?.title ?? 'On the road' }));
  if (!res) {
    box.append(h('p', { class: 'event__text', text: ev?.text ?? '' }));
    const list = h('div', { class: 'event__choices' });
    ev?.choices.forEach((c, i) => {
      const cost = c.costShards ?? 0;
      const b = button(c.label, () => act.choose(i), 'event__choice', cost > run.shards);
      if (cost) b.append(h('span', { class: 'event__cost' }, iconEl('shard', 14), h('span', { text: String(cost) })));
      list.append(b);
    });
    box.append(list);
  } else {
    box.append(h('p', { class: 'event__text event__outcome', text: res.text }));
    if (res.pendingSkillRank) {
      box.append(h('p', { class: 'muted', text: 'Choose a hero to gain +1 skill rank' }), heroPicker(run, 'Choose', act.pickHero));
    } else {
      box.append(button(run.status === 'battle' ? 'To battle!' : 'Continue', act.next, 'btn--big btn--ember'));
    }
  }
  return { el: h('div', { class: 'screen screen--event' }, topBar(run, regionName), box) };
}
