// The caravan wagon with the Ember lantern on its pole (stands behind the heroes).
import * as THREE from 'three';
import { SpriteActor } from './sprite';
import { EmberLight } from './ember';
import { spriteUrl } from './assets';

export interface Wagon {
  group: THREE.Group;
  ember: EmberLight;
  update(t: number, dt: number): void;
  dispose(): void;
}

export function createWagon(): Wagon {
  const group = new THREE.Group();
  const body = new SpriteActor({
    width: 3.2,
    height: 2,
    color: '#5a3a22',
    kind: 'prop',
    breathe: false,
    url: spriteUrl('props/wagon'),
  });
  const pole = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.4, 0.08),
    new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 1 }),
  );
  pole.position.set(1.3, 2.2, 0.1);
  const ember = new EmberLight();
  ember.group.position.set(1.3, 2.95, 0.2);
  group.add(body.group, pole, ember.group);
  return {
    group,
    ember,
    update(t, dt) {
      ember.update(t, dt);
      ember.group.position.x = 1.3 + Math.sin(t * 1.3) * 0.03;
    },
    dispose() {
      body.material.map?.dispose();
      body.material.dispose();
      pole.geometry.dispose();
      (pole.material as THREE.Material).dispose();
    },
  };
}
