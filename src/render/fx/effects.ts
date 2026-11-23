// Combat one-shot effects: projectiles (arrow streak, fire orb, holy beam),
// a pooled set of PointLights (never added/removed at runtime, so no shader
// recompiles), and a camera-attached full-screen flash quad.
import * as THREE from 'three';

const LIGHTS = 4;

interface LightSlot {
  light: THREE.PointLight;
  t: number;
  dur: number;
  peak: number;
  follow?: THREE.Object3D;
}

/** Pool of short-lived coloured PointLights. */
export class FlashLights {
  readonly group = new THREE.Group();
  private readonly slots: LightSlot[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 7, 1.6);
      this.group.add(light);
      this.slots.push({ light, t: 1, dur: 1, peak: 0 });
    }
  }

  fire(pos: THREE.Vector3, color: THREE.ColorRepresentation, peak: number, dur: number, follow?: THREE.Object3D): void {
    const s = this.slots[this.next]!;
    this.next = (this.next + 1) % LIGHTS;
    s.light.color.set(color);
    s.light.position.copy(pos);
    s.t = 0;
    s.dur = dur;
    s.peak = peak;
    s.follow = follow;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      s.t += dt;
      const k = Math.max(0, 1 - s.t / s.dur);
      s.light.intensity = s.peak * k * k;
      if (s.follow && k > 0) s.light.position.copy(s.follow.position);
    }
  }
}

export type ProjectileKind = 'arrow' | 'orb' | 'beam';

interface Projectile {
  kind: ProjectileKind;
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
}

const ARROW_COLOR = new THREE.Color('#fff2cf').multiplyScalar(2.2);
const ORB_COLOR = new THREE.Color('#ff8a2a').multiplyScalar(5);
const BEAM_COLOR = new THREE.Color('#ffd76a').multiplyScalar(3.5);

/** Travelling projectiles and beams. Flight times are returned to the caller. */
export class Projectiles {
  readonly group = new THREE.Group();
  private readonly live: Projectile[] = [];
  private readonly arrowGeo = new THREE.BoxGeometry(0.62, 0.035, 0.035);
  private readonly orbGeo = new THREE.SphereGeometry(0.15, 12, 8);
  private readonly beamGeo = new THREE.PlaneGeometry(1, 1);

  constructor(private readonly lights: FlashLights) {}

  static flightTime(kind: ProjectileKind, dist: number): number {
    if (kind === 'beam') return 0.06;
    if (kind === 'orb') return 0.18 + dist * 0.035;
    return 0.1 + dist * 0.022;
  }

  launch(kind: ProjectileKind, from: THREE.Vector3, to: THREE.Vector3): number {
    const dist = from.distanceTo(to);
    const dur = Projectiles.flightTime(kind, dist);
    let mesh: THREE.Mesh;
    if (kind === 'arrow') {
      mesh = new THREE.Mesh(this.arrowGeo, new THREE.MeshBasicMaterial({ color: ARROW_COLOR, fog: false, toneMapped: false }));
    } else if (kind === 'orb') {
      mesh = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color: ORB_COLOR, fog: false, toneMapped: false }));
      this.lights.fire(from, '#ff7a28', 26, dur + 0.25, mesh);
    } else {
      mesh = new THREE.Mesh(
        this.beamGeo,
        new THREE.MeshBasicMaterial({
          color: BEAM_COLOR,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
          toneMapped: false,
        }),
      );
      // stretch a quad from source to target
      const mid = from.clone().add(to).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.scale.set(dist, 0.22, 1);
      mesh.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
      this.lights.fire(to, '#ffd36a', 30, 0.45);
    }
    mesh.renderOrder = 6;
    mesh.position.copy(kind === 'beam' ? mesh.position : from);
    this.group.add(mesh);
    this.live.push({ kind, mesh, from: from.clone(), to: to.clone(), t: 0, dur: kind === 'beam' ? 0.35 : dur, arc: kind === 'arrow' ? 0.35 : 0.15 });
    return dur;
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      if (p.kind === 'beam') {
        mat.opacity = Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k * 0.5);
        p.mesh.scale.y = 0.22 * (1 - k) + 0.04;
      } else {
        const prev = p.mesh.position.clone();
        p.mesh.position.lerpVectors(p.from, p.to, k);
        p.mesh.position.y += Math.sin(Math.PI * k) * p.arc * p.from.distanceTo(p.to) * 0.08;
        if (p.kind === 'arrow' && k > 0) {
          const d = p.mesh.position.clone().sub(prev);
          p.mesh.rotation.z = Math.atan2(d.y, d.x);
        }
        if (p.kind === 'orb') p.mesh.scale.setScalar(1 + Math.sin(p.t * 40) * 0.12);
      }
      if (p.t >= p.dur) {
        this.group.remove(p.mesh);
        mat.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.live) (p.mesh.material as THREE.Material).dispose();
    this.live.length = 0;
    this.arrowGeo.dispose();
    this.orbGeo.dispose();
    this.beamGeo.dispose();
  }
}

/** Full-screen colour flash: additive (light) and normal-blend (dark pulse) quads on the camera. */
export class ScreenFlash {
  private readonly add: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly dark: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private addT = 1;
  private addDur = 1;
  private addPeak = 0;
  private darkT = 1;
  private darkDur = 1;
  private darkPeak = 0;

  constructor(private readonly camera: THREE.Camera) {
    const quad = (blending: THREE.Blending) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 4),
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0,
          blending,
          depthTest: false,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        }),
      );
      m.position.z = -0.3;
      m.renderOrder = 100;
      m.frustumCulled = false;
      m.visible = false;
      camera.add(m);
      return m;
    };
    this.add = quad(THREE.AdditiveBlending);
    this.dark = quad(THREE.NormalBlending);
    this.dark.material.color.set('#05020a');
  }

  flash(color: THREE.ColorRepresentation, peak: number, dur: number): void {
    this.add.material.color.set(color);
    this.addT = 0;
    this.addDur = dur;
    this.addPeak = peak;
  }

  darkPulse(peak: number, dur: number): void {
    this.darkT = 0;
    this.darkDur = dur;
    this.darkPeak = peak;
  }

  update(dt: number): void {
    this.addT += dt;
    this.darkT += dt;
    const a = Math.max(0, 1 - this.addT / this.addDur);
    this.add.material.opacity = this.addPeak * a * a;
    this.add.visible = this.add.material.opacity > 0.002;
    const d = Math.max(0, 1 - this.darkT / this.darkDur);
    // dark pulse eases in quickly then out
    this.dark.material.opacity = this.darkPeak * Math.sin(Math.PI * Math.min(1, (1 - d) * 1.0)) ;
    this.dark.visible = this.darkT < this.darkDur;
  }

  dispose(): void {
    for (const m of [this.add, this.dark]) {
      this.camera.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
