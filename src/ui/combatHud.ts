// Combat HUD (T-09): per-unit HP / ATB / shield pips + weakness icons / Broken badge,
// floating damage numbers, Ember meter + IGNITE, speed toggle, pause overlay, battle items.
import { BALANCE, CONSUMABLE_BY_ID } from '../data';
import type { BattleSnapshot, SimEvent, UnitSnapshot } from '../sim';
import { button, h } from './dom';
import { iconEl, iconSvg } from './icons';

export type PosFn = (uid: string, anchor: 'top' | 'center' | 'feet') => { x: number; y: number } | null;

export interface HudActions {
  ignite(): void;
  setSpeed(s: number): void;
  pause(on: boolean): void;
  quit(): void;
  useItem(id: string): void;
}

interface Plate {
  el: HTMLElement;
  hp: HTMLElement;
  hpText: HTMLElement;
  atb: HTMLElement;
  pips: HTMLElement;
  shieldKey: string;
  broken: HTMLElement;
  /** where the plate sat last frame (kept while it stays clear: no flicker during lunges) */
  spot?: Spot;
}

type Spot = 'above' | 'below';

interface Placed {
  p: Plate;
  x: number;
  /** sprite head (plate bottom when above) */
  y: number;
  /** sprite feet (plate top when below) */
  feet: number;
  prefer: Spot;
}

interface Float {
  at: number;
  uid: string;
  text: string;
  cls: string;
}

const FLOAT_DELAY = 0.22;

export class CombatHud {
  readonly el = h('div', { class: 'chud' });
  private readonly plates = new Map<string, Plate>();
  private readonly layer = h('div', { class: 'chud__layer' });
  private readonly floats = h('div', { class: 'chud__layer' });
  private readonly emberFill = h('div', { class: 'ember__fill' });
  private readonly emberText = h('div', { class: 'ember__text' });
  private readonly igniteBtn: HTMLButtonElement;
  private readonly speedBtns: HTMLButtonElement[] = [];
  private readonly items = h('div', { class: 'chud__items' });
  private readonly pauseEl: HTMLElement;
  private pending: Float[] = [];
  private clock = 0;
  private itemsKey = '';
  paused = false;

  constructor(parent: HTMLElement, private readonly pos: PosFn, state: BattleSnapshot, private readonly act: HudActions, title: string) {
    for (const u of state.units) this.plates.set(u.uid, this.makePlate(u));
    this.igniteBtn = h('button', { class: 'ignite', attrs: { type: 'button' }, onClick: () => act.ignite() }, h('span', { text: 'IGNITE' }), h('small', { text: 'Space' }));
    const speeds = h('div', { class: 'chud__speed' });
    [1, 2].forEach((s) => {
      const b = button(`${s}×`, () => act.setSpeed(s), s === 1 ? 'btn--on' : '');
      b.dataset.tip = `Battle speed ${s}× (key ${s})`;
      this.speedBtns.push(b);
      speeds.append(b);
    });
    speeds.append(button('II', () => act.pause(true), 'chud__pausebtn'));
    this.pauseEl = h(
      'div',
      { class: 'pause' },
      h(
        'div',
        { class: 'panel pause__box' },
        h('h2', { class: 'title title--sm', text: 'Paused' }),
        button('Resume', () => act.pause(false), 'btn--big btn--ember'),
        button('Quit run', () => act.quit(), 'btn--big'),
      ),
    );
    this.el.append(
      this.layer,
      this.floats,
      h('div', { class: 'chud__title', text: title }),
      speeds,
      h(
        'div',
        { class: 'chud__bottom' },
        this.items,
        h('div', { class: 'ember', tip: 'Ember meter: fills as heroes hit, break shields and take blows. Full = IGNITE (all ultimates).' }, h('div', { class: 'ember__track' }, this.emberFill), this.emberText),
        this.igniteBtn,
      ),
      this.pauseEl,
    );
    parent.append(this.el);
  }

  private makePlate(u: UnitSnapshot): Plate {
    const hp = h('div', { class: 'bar__fill' });
    const hpText = h('div', { class: 'uplate__hp' });
    const atb = h('div', { class: 'bar__fill' });
    const pips = h('div', { class: 'uplate__pips' });
    const broken = h('div', { class: 'uplate__broken', text: 'BROKEN' });
    const weak = h('div', { class: 'uplate__weak' });
    for (const w of u.weaknesses) weak.append(iconEl(w, 14, `weak weak--${w}`));
    if (u.weaknesses.length) weak.dataset.tip = `Weak to ${u.weaknesses.join(', ')} — weakness hits crack shields`;
    const el = h(
      'div',
      { class: `uplate uplate--${u.side}`, attrs: { 'data-uid': u.uid } },
      u.side === 'enemy' ? h('div', { class: 'uplate__row' }, pips, weak) : null,
      h('div', { class: 'uplate__name', text: u.name }),
      h('div', { class: 'bar bar--hp' }, hp),
      h('div', { class: 'bar bar--atb' }, atb),
      u.side === 'hero' ? hpText : null,
      broken,
    );
    this.layer.append(el);
    return { el, hp, hpText, atb, pips, shieldKey: '', broken };
  }

  /** Feed sim events (spawns floating numbers). */
  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit') {
        const cls = `${e.crit ? ' float--crit' : ''}${e.weakness ? ' float--weak' : ''}${e.dot ? ' float--dot' : ''} float--${e.damageType}`;
        this.queue(e.target, String(e.amount) + (e.crit ? '!' : ''), cls);
      } else if (e.type === 'heal' && e.amount > 0) this.queue(e.target, `+${e.amount}`, ' float--heal');
      else if (e.type === 'break') this.queue(e.target, 'BREAK!', ' float--break');
      else if (e.type === 'action_start' && e.telegraph) this.queue(e.actor, e.telegraph, ' float--bark', 0);
      else if (e.type === 'phase' && e.line) this.queue(e.target, e.line, ' float--bark', 0);
      else if (e.type === 'skip') this.queue(e.actor, 'stunned', ' float--dot', 0);
    }
  }

  private queue(uid: string, text: string, cls: string, delay = FLOAT_DELAY): void {
    if (this.pending.length > 60) this.pending.shift();
    this.pending.push({ at: this.clock + delay + Math.random() * 0.05, uid, text, cls });
  }

  setSpeed(s: number): void {
    this.speedBtns.forEach((b, i) => b.classList.toggle('btn--on', [1, 2][i] === s));
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.pauseEl.classList.toggle('pause--on', p);
  }

  update(dt: number, s: BattleSnapshot, canIgnite: boolean, consumables: readonly string[]): void {
    this.clock += dt;
    const gmax = BALANCE.gauge.max;
    const placed: Placed[] = [];
    for (const u of s.units) {
      const p = this.plates.get(u.uid);
      if (!p) continue;
      const at = this.pos(u.uid, 'top');
      const vis = !!at && u.alive;
      p.el.style.display = vis ? '' : 'none';
      if (!vis || !at) continue;
      const feet = this.pos(u.uid, 'feet');
      // back-row heroes stand by the wagon lantern and behind the front row: their plates go under their feet
      placed.push({ p, x: at.x, y: at.y, feet: feet ? feet.y : at.y, prefer: u.side === 'hero' && u.row === 'back' ? 'below' : 'above' });
      p.hp.style.width = `${(100 * u.hp) / Math.max(1, u.maxHp)}%`;
      p.atb.style.width = `${Math.min(100, (100 * u.gauge) / gmax)}%`;
      if (u.side === 'hero') p.hpText.textContent = `${Math.ceil(u.hp)}/${u.maxHp}`;
      p.broken.style.display = u.broken ? '' : 'none';
      p.el.classList.toggle('uplate--isbroken', u.broken);
      const key = `${u.shield}/${u.maxShield}`;
      if (key !== p.shieldKey && u.side === 'enemy') {
        p.shieldKey = key;
        let html = '';
        for (let i = 0; i < u.maxShield; i++) html += `<span class="pip${i < u.shield ? ' pip--on' : ''}"></span>`;
        p.pips.innerHTML = html;
        p.pips.dataset.tip = `Shield ${u.shield}/${u.maxShield}: at 0 the enemy is Broken`;
      }
    }
    this.layoutPlates(placed);
    const frac = Math.min(1, s.emberMeter / Math.max(1, s.emberMax));
    this.emberFill.style.width = `${frac * 100}%`;
    this.emberText.textContent = `EMBER ${Math.floor(s.emberMeter)}/${s.emberMax}`;
    this.igniteBtn.disabled = !canIgnite;
    this.igniteBtn.classList.toggle('ignite--ready', canIgnite);
    this.renderItems(consumables);
    // floating numbers
    if (this.pending.length) {
      const due = this.pending.filter((f) => f.at <= this.clock);
      this.pending = this.pending.filter((f) => f.at > this.clock);
      for (const f of due) this.spawn(f);
    }
  }

  /**
   * Collision-free plate layout. Each plate tries, in order: its preferred spot
   * (above the head, or under the feet for back-row heroes; a plate pushed to the other spot stays there
   * until the preferred one is clearly free), the other spot; if both collide it is
   * stacked above the plate it hits. All sizes are read before any transform is written.
   */
  private layoutPlates(placed: Placed[]): void {
    const boxes = placed
      .map((e) => ({ ...e, w: e.p.el.offsetWidth, h: e.p.el.offsetHeight, top: 0 }))
      .sort((a, b) => a.x - b.x);
    const done: typeof boxes = [];
    const hitAt = (b: (typeof boxes)[number], top: number, m = 2) =>
      done.find((o) => Math.abs(o.x - b.x) < (o.w + b.w) / 2 + m && top < o.top + o.h + m && top + b.h > o.top - m);
    for (const b of boxes) {
      const topOf = (sp: Spot): number => (sp === 'above' ? b.y - b.h : b.feet + 4);
      const other: Spot = b.prefer === 'above' ? 'below' : 'above';
      // return to the preferred spot only once it is clear by a wider margin (no flicker while units lunge)
      const back = b.p.spot === other && !hitAt(b, topOf(b.prefer), 14);
      const order: Spot[] = b.p.spot === other && !back ? [other, b.prefer] : [b.prefer, other];
      let spot = order.find((sp) => !hitAt(b, topOf(sp)));
      if (!spot) {
        spot = 'above';
        b.top = topOf('above');
        for (let guard = 0; guard < 6; guard++) {
          const hit = hitAt(b, b.top);
          if (!hit) break;
          b.top = hit.top - b.h - 3;
        }
      } else b.top = topOf(spot);
      b.p.spot = spot;
      done.push(b);
      b.p.el.style.transform = `translate(${Math.round(b.x - b.w / 2)}px, ${Math.round(b.top)}px)`;
    }
  }

  private renderItems(list: readonly string[]): void {
    const usable = list.filter((id) => CONSUMABLE_BY_ID[id]?.usableIn.includes('battle'));
    const key = usable.join(',');
    if (key === this.itemsKey) return;
    this.itemsKey = key;
    this.items.replaceChildren(
      ...usable.map((id) => {
        const d = CONSUMABLE_BY_ID[id];
        const b = h('button', { class: 'item', attrs: { type: 'button' }, tip: d ? `${d.name} — ${d.description}` : id, onClick: () => this.act.useItem(id) });
        b.innerHTML = iconSvg('potion', 20);
        return b;
      }),
    );
  }

  private spawn(f: Float): void {
    const at = this.pos(f.uid, f.cls.includes('bark') ? 'top' : 'center');
    if (!at) return;
    const el = h('div', { class: `float${f.cls}`, text: f.text });
    const jitter = f.cls.includes('bark') ? 0 : (Math.random() - 0.5) * 40;
    el.style.left = `${Math.round(at.x + jitter)}px`;
    el.style.top = `${Math.round(at.y - (f.cls.includes('bark') ? 40 : 0))}px`;
    this.floats.append(el);
    window.setTimeout(() => el.remove(), f.cls.includes('bark') ? 1800 : 1000);
  }

  dispose(): void {
    this.el.remove();
  }
}
