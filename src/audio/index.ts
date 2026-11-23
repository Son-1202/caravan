// Audio facade (T-12): procedural WebAudio only, no files. Silent until the first user gesture.
import type { SimEvent } from '../sim';
import { AudioEngine } from './engine';
import { Music } from './music';
import { Sfx } from './sfx';

export type { MusicMode } from './music';
export type { UiSound } from './sfx';

export class GameAudio {
  readonly engine = new AudioEngine();
  readonly sfx = new Sfx(this.engine);
  readonly music = new Music(this.engine);

  /** Unlock on the first pointer / key gesture anywhere. */
  installUnlock(target: EventTarget = window): void {
    const go = (): void => {
      this.engine.unlock();
      if (this.engine.ready) for (const ev of EVENTS) target.removeEventListener(ev, go, true);
    };
    for (const ev of EVENTS) target.addEventListener(ev, go, true);
  }

  setVolume(v: number): void {
    this.engine.setVolume(v);
  }

  /** Battle sim events -> sfx. */
  onSimEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': this.sfx.hit(e.damageType, e.crit || e.weakness, !!e.dot); break;
        case 'break': this.sfx.break(); break;
        case 'ignite': this.sfx.ignite(); break;
        case 'heal': this.sfx.heal(); break;
        case 'death': this.sfx.death(); break;
        case 'shield': this.sfx.shield(); break;
        case 'end': if (e.outcome === 'win') this.sfx.victory(); else this.sfx.defeat(); break;
        default: break;
      }
    }
  }

  update(dt: number): void {
    this.music.update(dt);
  }
}

const EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;
