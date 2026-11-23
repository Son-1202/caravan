// One combatant on the stage: pixel sprite (Nearest, alpha-tested) on a body
// group that procedural tweens move (breathe, lunge, recoil, jump, squash),
// a blob shadow, a hit-flash via material emissive, and a dissolve on death.
import * as THREE from 'three';
import { makeFigureTexture, makeShadowTexture } from './placeholders';
import { ease } from './layout';

/** Texture pixels per world unit: a 96 px hero is 1.5 units tall. */
export const PX_PER_UNIT = 64;

export interface CombatUnitOpts {
  uid: string;
  side: 'hero' | 'enemy';
  url: string | null;
  /** placeholder size (world units) until / unless a sprite loads */
  width: number;
  height: number;
  color: string;
  flipX?: boolean;
}

let shadowTex: THREE.Texture | null = null;
const loader = new THREE.TextureLoader();

interface Lunge {
  to: THREE.Vector3;
  t: number;
  dur: number;
}

export class CombatUnit {
  readonly uid: string;
  readonly side: 'hero' | 'enemy';
  readonly group = new THREE.Group();
  /** moved by tweens; the sprite hangs off this */
  readonly body = new THREE.Group();
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly flip: number;
  width: number;
  height: number;
  alive = true;
  broken = false;
  /** Fired when the unit lands (end of a lunge or jump): dust puffs etc. */
  onLand?: (u: CombatUnit) => void;
  private readonly phase: number;
  private time = 0;
  private flashK = 0;
  private flashColor = new THREE.Color('#ffffff');
  private glowK = 0;
  private lunge: Lunge | null = null;
  private recoilK = 0;
  private recoilDir = 1;
  private squashK = 0;
  private jumpT = -1;
  private jumpDur = 0.55;
  private dissolveT = -1;
  private brokenK = 0;
  private readonly baseColor = new THREE.Color('#ffffff');

  constructor(opts: CombatUnitOpts) {
    this.uid = opts.uid;
    this.side = opts.side;
    this.width = opts.width;
    this.height = opts.height;
    this.flip = opts.flipX ? -1 : 1;
    this.phase = (hash(opts.uid) % 1000) / 1000 * Math.PI * 2;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const placeholder = makeFigureTexture(opts.color, opts.side);
    const mat = new THREE.MeshStandardMaterial({
      map: placeholder,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.95,
      metalness: 0,
      emissive: new THREE.Color('#000000'),
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    shadowTex ??= makeShadowTexture();
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.body.add(this.mesh);
    this.group.add(this.shadow, this.body);
    this.applySize();
    if (opts.url) {
      loader.load(opts.url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        const img = tex.image as { width: number; height: number };
        this.width = img.width / PX_PER_UNIT;
        this.height = img.height / PX_PER_UNIT;
        mat.map = tex;
        mat.needsUpdate = true;
        placeholder.dispose();
        this.applySize();
      });
    }
  }

  private applySize(): void {
    this.mesh.scale.set(this.width * this.flip, this.height, 1);
    const sw = Math.max(0.9, this.width * 0.95);
    this.shadow.scale.set(sw, sw * 0.38, 1);
  }

  /** World position of a point on the unit: 0 = feet, 1 = top of head. */
  worldPoint(frac: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(0, this.height * frac, 0);
    return this.body.localToWorld(out);
  }

  /** Home (stage) position of the feet. */
  get home(): THREE.Vector3 {
    return this.group.position;
  }

  /** Step toward `target` and back; returns the time (s) of the impact. */
  lungeTo(target: THREE.Vector3, dur = 0.42): number {
    const dir = target.clone().sub(this.group.position);
    dir.y = 0;
    const dist = dir.length();
    const reach = Math.max(0, dist - 1.1);
    this.lunge = { to: dir.normalize().multiplyScalar(reach * 0.85), t: 0, dur };
    return dur * 0.42;
  }

  private land(): void {
    this.squashK = 1;
    if (this.alive) this.onLand?.(this);
  }

  recoil(fromX: number): void {
    this.recoilDir = Math.sign(this.group.position.x - fromX) || (this.side === 'hero' ? -1 : 1);
    this.recoilK = 1;
  }

  flash(color: THREE.ColorRepresentation = '#ffffff', k = 1): void {
    this.flashColor.set(color);
    this.flashK = Math.max(this.flashK, k);
  }

  glow(k = 1): void {
    this.glowK = Math.max(this.glowK, k);
  }

  jump(dur = 0.55): void {
    this.jumpT = 0;
    this.jumpDur = dur;
  }

  setBroken(b: boolean): void {
    this.broken = b;
  }

  dissolve(): void {
    this.alive = false;
    this.dissolveT = 0;
    this.mesh.material.transparent = true;
  }

  revive(): void {
    this.alive = true;
    this.dissolveT = -1;
    this.mesh.visible = true;
    this.shadow.visible = true;
    this.mesh.material.transparent = false;
    this.mesh.material.opacity = 1;
    this.mesh.material.alphaTest = 0.5;
    this.mesh.material.needsUpdate = true;
  }

  /** 0..1 dissolve progress (1 = gone). */
  get dissolveProgress(): number {
    return this.dissolveT < 0 ? 0 : Math.min(1, this.dissolveT / 0.9);
  }

  update(dt: number): void {
    this.time += dt;
    const b = this.body;
    b.position.set(0, 0, 0);
    let sx = 1;
    let sy = 1;
    // idle breathing (weaker while broken: slumped)
    if (this.alive) {
      const s = Math.sin(this.time * 2.2 + this.phase);
      sy += s * 0.022;
      sx -= s * 0.01;
    }
    // lunge
    if (this.lunge) {
      const l = this.lunge;
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      const out = k < 0.42 ? ease.outCubic(k / 0.42) : 1 - ease.inOutSine((k - 0.42) / 0.58);
      b.position.addScaledVector(l.to, out);
      b.position.y += Math.sin(Math.PI * Math.min(1, k / 0.42)) * 0.18 * (k < 0.42 ? 1 : 0);
      if (k >= 1) {
        this.lunge = null;
        this.land();
      }
    }
    // recoil
    if (this.recoilK > 0) {
      b.position.x += this.recoilDir * 0.22 * this.recoilK;
      b.rotation.z = -this.recoilDir * 0.08 * this.recoilK;
      this.recoilK = Math.max(0, this.recoilK - dt * 4.5);
    } else b.rotation.z = 0;
    // jump (ultimate)
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const k = this.jumpT / this.jumpDur;
      b.position.y += ease.hump(k) * 0.9;
      if (k < 0.12) sy *= 1 - 0.15 * ease.hump(k / 0.12);
      if (k >= 1) {
        this.jumpT = -1;
        this.land();
      }
    }
    // landing squash: squash hard, then a small overshoot stretch before settling
    if (this.squashK > 0) {
      const k = this.squashK;
      const wave = k > 0.45 ? (k - 0.45) / 0.55 : -(0.45 - k) / 0.45 * 0.35;
      sy *= 1 - 0.2 * wave;
      sx *= 1 + 0.14 * wave;
      this.squashK = Math.max(0, this.squashK - dt * 4.2);
    }
    // broken: lean back + cold tint
    this.brokenK += ((this.broken ? 1 : 0) - this.brokenK) * Math.min(1, dt * 8);
    b.rotation.z += (this.side === 'enemy' ? 1 : -1) * 0.12 * this.brokenK;
    this.mesh.scale.set(this.width * this.flip * sx, this.height * sy, 1);
    // shadow follows the feet, shrinks when airborne
    this.shadow.position.x = b.position.x;
    this.shadow.position.z = b.position.z;
    const air = Math.max(0, b.position.y);
    const ss = 1 / (1 + air * 0.9);
    const sw = Math.max(0.9, this.width * 0.95) * ss;
    this.shadow.scale.set(sw, sw * 0.38, 1);
    this.updateMaterial(dt);
  }

  private updateMaterial(dt: number): void {
    const m = this.mesh.material;
    this.flashK = Math.max(0, this.flashK - dt * 6);
    this.glowK = Math.max(0, this.glowK - dt * 1.4);
    const e = m.emissive;
    e.copy(this.flashColor).multiplyScalar(this.flashK * 1.6);
    if (this.glowK > 0) e.add(new THREE.Color('#ff8a3a').multiplyScalar(this.glowK * 1.2));
    m.color.copy(this.baseColor).lerp(new THREE.Color('#7f9ccf'), this.brokenK * 0.45);
    if (this.dissolveT >= 0) {
      this.dissolveT += dt;
      const k = this.dissolveProgress;
      m.color.multiplyScalar(1 - 0.75 * Math.min(1, k * 2));
      m.opacity = 1 - k;
      m.alphaTest = 0.01;
      this.shadow.material.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        this.mesh.visible = false;
        this.shadow.visible = false;
      }
    } else {
      this.shadow.material.opacity = 0.85;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
