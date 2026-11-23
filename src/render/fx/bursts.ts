// Pooled CPU particle bursts for combat VFX (sparks, shield shards, heal motes,
// ash). One Points draw call; per-particle colour/size/alpha via a tiny shader.
// HDR colours (>1) are picked up by the bloom pass.
import * as THREE from 'three';

export interface BurstOpts {
  pos: THREE.Vector3;
  count: number;
  color: THREE.ColorRepresentation;
  /** HDR multiplier applied to the colour (bloom) */
  hdr?: number;
  /** random brightness jitter 0..1 */
  jitter?: number;
  /** initial speed (world units / s) */
  speed: number;
  /** bias added to every velocity (e.g. upward drift) */
  drift?: THREE.Vector3;
  /** spawn radius around pos */
  radius?: number;
  /** box spawn extents (overrides radius) e.g. a sprite's silhouette */
  box?: THREE.Vector3;
  gravity?: number;
  drag?: number;
  life: number;
  /** world-space size */
  size: number;
  /** 1 = soft round glow, 0 = crisp square pixel */
  soft?: 0 | 1;
  /** fraction of velocity kept in z (flatten bursts toward the camera plane) */
  zScale?: number;
}

const MAX = 2400;

const vert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aSoft;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vSoft = aSoft;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = vSoft > 0.5 ? smoothstep(1.0, 0.2, d) : 1.0;
  if (vAlpha * a < 0.01) discard;
  gl_FragColor = vec4(vColor * vAlpha * a, 1.0);
}`;

export class Bursts {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly soft = new Float32Array(MAX);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private readonly baseSize = new Float32Array(MAX);
  private next = 0;
  private readonly mat: THREE.ShaderMaterial;
  private rngState = 12345;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aSoft', new THREE.BufferAttribute(this.soft, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Pixel scale: viewport height / (2 tan(fov/2)). Call on resize. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.mat.uniforms.uScale!.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  private rand(): number {
    // xorshift: visuals only, kept local so it never touches sim RNG
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / 4294967296;
  }

  burst(o: BurstOpts): void {
    const c = new THREE.Color(o.color).multiplyScalar(o.hdr ?? 1);
    const zs = o.zScale ?? 0.4;
    for (let k = 0; k < o.count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const r = () => this.rand() * 2 - 1;
      let ox: number, oy: number, oz: number;
      if (o.box) {
        ox = r() * o.box.x;
        oy = this.rand() * o.box.y;
        oz = r() * o.box.z;
      } else {
        const rad = o.radius ?? 0.1;
        ox = r() * rad;
        oy = r() * rad;
        oz = r() * rad * 0.5;
      }
      this.pos[i * 3] = o.pos.x + ox;
      this.pos[i * 3 + 1] = o.pos.y + oy;
      this.pos[i * 3 + 2] = o.pos.z + oz;
      // random direction on a sphere, flattened in z
      const u = r();
      const th = this.rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = o.speed * (0.4 + this.rand() * 0.6);
      this.vel[i * 3] = s * Math.cos(th) * sp + (o.drift?.x ?? 0);
      this.vel[i * 3 + 1] = s * Math.sin(th) * sp + (o.drift?.y ?? 0);
      this.vel[i * 3 + 2] = u * sp * zs + (o.drift?.z ?? 0);
      const j = 1 - (o.jitter ?? 0.3) * this.rand();
      this.col[i * 3] = c.r * j;
      this.col[i * 3 + 1] = c.g * j;
      this.col[i * 3 + 2] = c.b * j;
      this.maxLife[i] = o.life * (0.6 + this.rand() * 0.4);
      this.life[i] = this.maxLife[i];
      this.baseSize[i] = o.size * (0.6 + this.rand() * 0.6);
      this.size[i] = this.baseSize[i];
      this.alpha[i] = 1;
      this.soft[i] = o.soft ?? 1;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * 0.3;
      }
      this.alpha[i] = Math.min(1, k * 2.5);
      this.size[i] = this.baseSize[i] * (0.5 + 0.5 * k);
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha', 'aSoft']) {
      (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
