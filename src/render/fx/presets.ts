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

/** Shield Break: a big spray of crisp ice-blue shards with a gold rim of sparks. */
export function breakShatter(bursts: Bursts, p: THREE.Vector3): void {
  // heavy shards: fall and bounce on the ground
  bursts.burst({ pos: p, count: 90, color: '#a8dcff', hdr: 3, speed: 7, gravity: 8, drag: 1.8, life: 1.1, size: 0.12, soft: 0, radius: 0.4, zScale: 0.7 });
  // fine glitter
  bursts.burst({ pos: p, count: 40, color: '#e8f6ff', hdr: 4, speed: 4, gravity: 2, drag: 2.5, life: 0.6, size: 0.06, soft: 0, radius: 0.3 });
  // gold rim sparks: fast, bright, short
  bursts.burst({ pos: p, count: 44, color: '#ffc94a', hdr: 4.5, speed: 9, drag: 4, life: 0.45, size: 0.07, soft: 0, radius: 0.5, zScale: 0.2 });
  // core pop
  bursts.burst({ pos: p, count: 18, color: '#ffffff', hdr: 4, speed: 3, life: 0.35, size: 0.18, radius: 0.2 });
}

/** Landing puff: a low ring of dust at the feet (after lunges / jumps). */
export function landingDust(bursts: Bursts, feet: THREE.Vector3, color: string, width: number): void {
  bursts.burst({
    pos: feet,
    box: new THREE.Vector3(width * 0.4, 0.05, 0.15),
    count: 10,
    color,
    hdr: 0.9,
    jitter: 0.4,
    speed: 1.4,
    drift: new THREE.Vector3(0, 0.35, 0),
    drag: 4,
    life: 0.45,
    size: 0.09,
    zScale: 0.2,
  });
}
