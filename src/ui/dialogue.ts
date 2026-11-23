// Story dialogue scenes (T-12): dimmed overlay over the live diorama, portrait by speaker,
// name plate, typewriter text, optional full-screen CG, Skip. Click / tap / Space / Enter
// completes the line, then advances.
import { HERO_BY_ID } from '../data';
import type { SceneDef, SceneId, Speaker } from '../data';
import { findAsset } from '../render/assets';
import { button, h } from './dom';
import { iconEl } from './icons';

/** full-screen CG shown behind the box from line `from` onward */
const CG: Partial<Record<SceneId, { img: string; from: number }>> = {
  after_r3_twist: { img: 'cg/twist', from: 1 },
  epilogue: { img: 'cg/epilogue', from: 4 },
};

const LEFT: ReadonlySet<Speaker> = new Set<Speaker>(['mira', 'mira_child']);
const CPS = 42;

export interface DialogueOpts {
  onDone(): void;
  /** per typed character / line advance (audio hooks) */
  onType?(): void;
  onAdvance?(): void;
}

function speakerName(s: Speaker): string {
  if (s === 'mira' || s === 'mira_child') return 'Mira';
  if (s === 'ember') return 'The Ember';
  if (s === 'narrator') return '';
  return HERO_BY_ID[s]?.name ?? s;
}

export class DialogueView {
  readonly el: HTMLElement;
  index = -1;
  private readonly box: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly name: HTMLElement;
  private readonly text: HTMLElement;
  private readonly more: HTMLElement;
  private readonly cg: HTMLElement | null;
  private full = '';
  private shown = 0;
  private acc = 0;
  private raf = 0;
  private lastT = 0;
  private done = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      this.finish();
    }
  };

  constructor(parent: HTMLElement, readonly scene: SceneDef, private readonly opts: DialogueOpts) {
    const cgDef = CG[scene.id];
    const cgUrl = cgDef ? findAsset(cgDef.img) : null;
    this.cg = cgUrl ? h('div', { class: 'dlg__cg', style: { 'background-image': `url("${cgUrl}")` } }) : null;
    this.portrait = h('div', { class: 'dlg__portrait' });
    this.name = h('div', { class: 'dlg__name' });
    this.text = h('p', { class: 'dlg__text' });
    this.more = h('div', { class: 'dlg__more', text: '▼' });
    this.box = h('div', { class: 'panel dlg__box' }, this.portrait, h('div', { class: 'dlg__body' }, this.name, this.text), this.more);
    const skip = button('Skip ▸▸', () => this.finish(), 'dlg__skip');
    skip.addEventListener('click', (e) => e.stopPropagation());
    this.el = h(
      'div',
      { class: `dlg dlg--${scene.id}`, attrs: { role: 'dialog', 'aria-label': scene.title } },
      h('div', { class: 'dlg__dim' }),
      this.cg,
      h('div', { class: 'dlg__title', text: scene.title }),
      skip,
      this.box,
    );
    this.el.addEventListener('click', () => this.advance());
    window.addEventListener('keydown', this.onKey, true);
    parent.append(this.el);
    this.goto(0);
    this.lastT = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  /** Jump to line i (debug / QA). Shows it fully typed when `instant`. */
  goto(i: number, instant = false): void {
    const line = this.scene.lines[i];
    if (!line) return this.finish();
    this.index = i;
    const sp = line.speaker;
    const left = LEFT.has(sp);
    this.box.className = `panel dlg__box dlg__box--${left ? 'left' : 'right'} dlg__box--${sp}`;
    this.portrait.replaceChildren();
    if (sp === 'ember') this.portrait.append(h('div', { class: 'dlg__flame' }, iconEl('fire', 64)));
    else if (sp !== 'narrator') {
      const url = findAsset(`heroes/${sp}_portrait`);
      if (url) this.portrait.append(h('img', { attrs: { src: url, alt: speakerName(sp), draggable: 'false' } }));
    }
    this.portrait.hidden = sp === 'narrator';
    const nm = speakerName(sp);
    this.name.textContent = nm;
    this.name.hidden = !nm;
    this.full = line.text;
    this.shown = instant ? this.full.length : 0;
    this.acc = 0;
    this.render();
    const cgDef = CG[this.scene.id];
    if (this.cg && cgDef) this.cg.classList.toggle('dlg__cg--on', i >= cgDef.from);
  }

  get typing(): boolean {
    return this.shown < this.full.length;
  }

  advance(): void {
    if (this.done) return;
    if (this.typing) {
      this.shown = this.full.length;
      this.render();
      return;
    }
    this.opts.onAdvance?.();
    this.goto(this.index + 1);
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    this.dispose();
    this.opts.onDone();
  }

  private render(): void {
    this.text.textContent = this.full.slice(0, this.shown);
    this.more.classList.toggle('dlg__more--on', !this.typing);
  }

  private tick(t: number): void {
    if (this.done) return;
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.typing) {
      this.acc += dt * CPS;
      const n = Math.floor(this.acc);
      if (n > 0) {
        this.acc -= n;
        const before = this.shown;
        this.shown = Math.min(this.full.length, this.shown + n);
        if (/\S/.test(this.full.slice(before, this.shown))) this.opts.onType?.();
        this.render();
      }
    }
    this.raf = requestAnimationFrame((tt) => this.tick(tt));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    this.el.remove();
  }
}
