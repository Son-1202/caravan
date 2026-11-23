// Tiny DOM helpers for the overlay UI.
type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  tip?: string;
  attrs?: Record<string, string>;
  style?: Partial<Record<string, string>>;
  onClick?: (e: Event) => void;
  disabled?: boolean;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.tip) el.dataset.tip = props.tip;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.style) for (const [k, v] of Object.entries(props.style)) if (v !== undefined) el.style.setProperty(k, v);
  if (props.onClick) el.addEventListener('click', props.onClick);
  if (props.disabled && 'disabled' in el) (el as HTMLButtonElement).disabled = true;
  for (const c of children) if (c) el.append(c);
  return el;
}

export function button(label: string, onClick: () => void, cls = '', disabled = false): HTMLButtonElement {
  return h('button', { class: `btn ${cls}`.trim(), text: label, onClick: () => onClick(), disabled, attrs: { type: 'button' } });
}

/** Shared hover / tap tooltip for any element with data-tip. */
/** Returns a function that hides the tooltip (call on screen changes). */
export function installTooltips(root: HTMLElement): () => void {
  const tip = h('div', { class: 'tip' });
  root.append(tip);
  let owner: HTMLElement | null = null;
  const show = (el: HTMLElement): void => {
    owner = el;
    tip.textContent = el.dataset.tip ?? '';
    tip.classList.add('tip--on');
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const x = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    const above = r.top > tip.offsetHeight + 16;
    tip.style.left = `${x}px`;
    tip.style.top = `${above ? r.top - tip.offsetHeight - 8 : r.bottom + 8}px`;
  };
  const hide = (): void => {
    owner = null;
    tip.classList.remove('tip--on');
  };
  const find = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>('[data-tip]') : null);
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = find(e.target);
    if (el) show(el);
    else if (owner) hide();
  });
  root.addEventListener('pointerdown', (e) => {
    const el = find(e.target);
    if (e.pointerType === 'mouse') return;
    if (el && el !== owner) show(el);
    else hide();
  });
  root.addEventListener('pointerleave', hide);
  return hide;
}
