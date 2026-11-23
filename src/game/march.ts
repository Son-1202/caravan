// "March" mode for the map screen: the four heroes walk on the spot in front of the
// wagon while the diorama layers scroll (parallax). Built from public render pieces.
import * as THREE from 'three';
import { HEROES } from '../data';
import { SpriteActor } from '../render/sprite';
import { createWagon, type Wagon } from '../render/wagon';
import { spriteUrl } from '../render/assets';
import { PX_PER_UNIT } from '../render/combatUnit';
import { STAGE } from '../render/layout';
import type { Diorama } from '../render/diorama';

const HERO_H = 96 / PX_PER_UNIT;
const MARCH_X = [-1.6, -2.9, -4.2, -5.5];
const MARCH_SCROLL = 1.2;

export class MarchCast {
  readonly group = new THREE.Group();
  private readonly heroes: SpriteActor[] = [];
  private readonly wagon: Wagon;
  private t = 0;
  private shown = false;

  constructor(private readonly diorama: Diorama) {
    HEROES.forEach((h, i) => {
      const a = new SpriteActor({ width: HERO_H * 0.7, height: HERO_H, kind: 'hero', url: spriteUrl(`heroes/${h.id}`), breathe: false });
      a.group.position.set(MARCH_X[i] ?? -2, 0, i % 2 === 0 ? 0.6 : -0.3);
      this.heroes.push(a);
      this.group.add(a.group);
    });
    this.wagon = createWagon();
    this.wagon.group.position.set(STAGE.wagon.x, 0, STAGE.wagon.z);
    this.group.add(this.wagon.group);
  }

  show(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    if (on) {
      this.diorama.actors.add(this.group);
      this.diorama.setScroll(MARCH_SCROLL);
    } else {
      this.diorama.actors.remove(this.group);
      this.diorama.setScroll(0);
    }
  }

  update(dt: number): void {
    if (!this.shown) return;
    this.t += dt;
    this.heroes.forEach((a, i) => {
      // walk on the spot: a quick step bob with a slight lean
      const ph = this.t * 7 + i * 1.7;
      a.mesh.position.y = Math.abs(Math.sin(ph)) * 0.09;
      a.mesh.rotation.z = Math.sin(ph) * 0.03;
    });
    this.wagon.group.position.y = Math.abs(Math.sin(this.t * 3.5)) * 0.04;
    this.wagon.update(this.t, dt);
  }
}
