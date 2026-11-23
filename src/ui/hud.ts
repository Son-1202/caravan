// Minimal demo HUD (region name + controls hint). Real UI lands later.
export class DemoHud {
  readonly el = document.createElement('div');
  private readonly region = document.createElement('div');
  private readonly hint = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.el.className = 'hud';
    this.region.className = 'hud__region';
    this.hint.className = 'hud__hint';
    this.el.append(this.region, this.hint);
    parent.append(this.el);
  }

  setRegion(name: string): void {
    this.region.textContent = name;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }
}
