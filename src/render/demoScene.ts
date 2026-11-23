// T-01 demo cast: 4 hero placeholders (left), 3 enemies (right), the wagon
// carrying the Ember lantern. Replaced by real battle staging later.
import * as THREE from 'three';
import { SpriteActor } from './sprite';
import { EmberLight } from './ember';
import { spriteUrl } from './assets';

export interface DemoCast {
  actors: SpriteActor[];
  ember: EmberLight;
  update(t: number, dt: number): void;
}

const HEROES = [
  { name: 'hero_1', color: '#c0392b', x: -2.6, z: 0.6 },
  { name: 'hero_2', color: '#2e86c1', x: -3.7, z: -0.4 },
  { name: 'hero_3', color: '#27ae60', x: -4.6, z: 0.9 },
  { name: 'hero_4', color: '#8e44ad', x: -5.6, z: -0.2 },
];
const ENEMIES = [
  { name: 'enemy_1', color: '#4a4a5e', x: 2.8, z: 0.4, s: 1 },
  { name: 'enemy_2', color: '#5e3a3a', x: 4.2, z: -0.5, s: 1.35 },
  { name: 'enemy_3', color: '#3a5e4a', x: 5.4, z: 0.8, s: 0.9 },
];

export function createDemoCast(parent: THREE.Object3D): DemoCast {
  const actors: SpriteActor[] = [];
  for (const h of HEROES) {
    const a = new SpriteActor({ width: 1.1, height: 1.65, color: h.color, kind: 'hero', url: spriteUrl(h.name) });
    a.group.position.set(h.x, 0, h.z);
    actors.push(a);
  }
  for (const e of ENEMIES) {
    const a = new SpriteActor({
      width: 1.1 * e.s,
      height: 1.65 * e.s,
      color: e.color,
      kind: 'enemy',
      url: spriteUrl(e.name),
    });
    a.group.position.set(e.x, 0, e.z);
    actors.push(a);
  }
  const wagon = new SpriteActor({
    width: 3.2,
    height: 2,
    color: '#5a3a22',
    kind: 'prop',
    breathe: false,
    url: spriteUrl('wagon'),
  });
  wagon.group.position.set(-7.4, 0, -1.4);
  actors.push(wagon);

  const pole = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.4, 0.08),
    new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 1 }),
  );
  pole.position.set(-6.1, 2.2, -1.3);
  const ember = new EmberLight();
  ember.group.position.set(-6.1, 2.95, -1.2);

  for (const a of actors) parent.add(a.group);
  parent.add(pole, ember.group);

  return {
    actors,
    ember,
    update(t, dt) {
      for (const a of actors) a.update(t);
      ember.update(t, dt);
      // lantern sways on its hook
      ember.group.position.x = -6.1 + Math.sin(t * 1.3) * 0.03;
    },
  };
}
