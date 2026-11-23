// Larger particle presets used by CombatView (kept separate to keep the view small).
import * as THREE from 'three';
import type { Bursts } from './bursts';
import type { CombatUnit } from '../combatUnit';

export function impactSparks(bursts: Bursts, p: THREE.Vector3, c: string, crit: boolean, weak: boolean): void {
  bursts.burst({
    pos: p,
    count: crit ? 26 : weak ? 18 : 12,
    color: c,
    hdr: 2.5,
    speed: crit ? 4.5 : 3.2,
    gravity: 5,
    drag: 3,
    life: 0.4,
    size: 0.07,
    soft: 0,
    radius: 0.15,
  });
}

export function healMotes(bursts: Bursts, u: CombatUnit): void {
  bursts.burst({
    pos: u.home,
    box: new THREE.Vector3(u.width * 0.45, u.height, 0.2),
    count: 18,
    color: '#c8ff7a',
    hdr: 2.2,
    jitter: 0.5,
    speed: 0.25,
    drift: new THREE.Vector3(0, 1.1, 0),
    drag: 0.5,
    life: 1.1,
    size: 0.09,
  });
}

export function ashDissolve(bursts: Bursts, u: CombatUnit): void {
  bursts.burst({
    pos: u.home,
    box: new THREE.Vector3(u.width * 0.4, u.height, 0.15),
    count: Math.round(30 * u.height),
    color: '#6b5a52',
    hdr: 1,
    jitter: 0.6,
    speed: 0.4,
    drift: new THREE.Vector3(0.15, 0.9, 0),
    drag: 0.6,
    life: 1.8,
    size: 0.07,
    soft: 0,
  });
}
