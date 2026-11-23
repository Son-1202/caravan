// Camp: heal the party (40%) or +1 skill rank for one hero.
import { BALANCE, HERO_BY_ID } from '../../data';
import type { HeroId } from '../../data';
import type { Run } from '../../sim';
import { button, h } from '../dom';
import { portraitUrl, topBar, type ScreenView } from './common';

export interface CampActions {
  heal(): void;
  train(hero: HeroId): void;
}

export function heroPicker(run: Run, label: string, onPick: (id: HeroId) => void): HTMLElement {
  const max = BALANCE.skills.maxRank;
  return h(
    'div',
    { class: 'cards' },
    ...run.party.map((p) => {
      const d = HERO_BY_ID[p.id];
      const url = portraitUrl(p.id);
      const full = p.skillRank >= max;
      return h(
        'div',
        { class: 'card', tip: `${d.skill.name}: ${d.skill.description}` },
        url ? h('img', { class: 'card__portrait', attrs: { src: url, alt: d.name, draggable: 'false' } }) : null,
        h('div', { class: 'card__name', text: d.name }),
        h('div', { class: 'card__desc', text: `${d.skill.name} · rank ${p.skillRank}/${max}` }),
        button(full ? 'Mastered' : label, () => onPick(p.id), '', full),
      );
    }),
  );
}

export function campScreen(run: Run, regionName: string, act: CampActions): ScreenView {
  const pct = Math.round((run.hard ? BALANCE.hardMode.campHealFrac : BALANCE.camp.healFrac) * 100);
  const box = h(
    'div',
    { class: 'panel camp' },
    h('h2', { class: 'title title--sm', text: 'Camp' }),
    h('p', { class: 'muted', text: 'The Ember crackles. Rest, or sharpen a skill.' }),
    button(`Rest — heal party ${pct}%`, act.heal, 'btn--big btn--ember'),
    h('p', { class: 'muted', text: 'or train one hero (+1 skill rank)' }),
    heroPicker(run, 'Train', act.train),
  );
  return { el: h('div', { class: 'screen screen--camp' }, topBar(run, regionName), box) };
}
