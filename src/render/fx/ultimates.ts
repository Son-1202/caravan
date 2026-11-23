// Hero ultimate VFX played during the Ignite cinematic, one look per hero:
//   Bram  - golden shield dome over the party (fresnel shell + scan bands)
//   Lysa  - arrow rain streaking down onto the enemy line
//   Oren  - a fire pillar erupting under each enemy
//   Kit   - crimson dash-slash streaks crossing the target
// Each effect owns its meshes and disposes them when done.
import * as THREE from 'three';
import type { Bursts } from './bursts';
import type { FlashLights } from './effects';

interface Live {
  t: number;
  dur: number;
  update(t: number, k: number): void;
  dispose(): void;
}

const fresnelVert = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vY;
void main() {
  vUv = uv; vY = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const domeFrag = /* glsl */ `
uniform vec3 uColor; uniform float uK; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
  float bands = smoothstep(0.75, 1.0, sin(vY * 22.0 - uTime * 9.0));
  float a = fres * 1.3 + 0.08 + bands * 0.35 * (0.3 + fres);
  gl_FragColor = vec4(uColor * a * uK, 1.0);
}`;

const fireFrag = /* glsl */ `
uniform float uK; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  float facing = abs(dot(vN, vV));
  float flick = 0.55 + 0.45 * sin(vUv.x * 31.4 + uTime * 5.0 + sin(vUv.y * 9.0 - uTime * 14.0) * 2.5);
  float tongue = smoothstep(1.0, 0.25, vUv.y + (1.0 - flick) * 0.35);
  float core = pow(facing, 1.5);
  float i = tongue * (0.35 + core * 0.9) * flick;
  vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.45), clamp(i * 1.2 - 0.2, 0.0, 1.0));
  gl_FragColor = vec4(col * i * 3.0 * uK, 1.0);
}`;

function additive(o: THREE.ShaderMaterialParameters): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    ...o,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

const outCubic = (t: number) => 1 - (1 - t) ** 3;

export class UltimateFx {
  readonly group = new THREE.Group();
  private readonly live: Live[] = [];

  constructor(
    private readonly bursts: Bursts,
    private readonly lights: FlashLights,
  ) {}

  /** Bram: golden dome over the party centred at `c` (feet level). */
  shieldDome(c: THREE.Vector3, radius: number): void {
    const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = additive({
      vertexShader: fresnelVert,
      fragmentShader: domeFrag,
      uniforms: { uColor: { value: new THREE.Color('#ffcf5a').multiplyScalar(1.6) }, uK: { value: 0 }, uTime: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(c);
    mesh.renderOrder = 7;
    this.group.add(mesh);
    this.lights.fire(c.clone().setY(2), '#ffd36a', 40, 1.2);
    this.bursts.burst({ pos: c, box: new THREE.Vector3(radius, 0.1, 0.8), count: 50, color: '#ffd76a', hdr: 3, speed: 0.4, drift: new THREE.Vector3(0, 2.2, 0), life: 1, size: 0.08 });
    this.add(1.7, mesh, (t, k) => {
      const grow = outCubic(Math.min(1, t / 0.28));
      mesh.scale.set(radius * grow, radius * 0.8 * grow, radius * 0.55 * grow);
      mat.uniforms.uTime!.value = t;
      mat.uniforms.uK!.value = (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25) * (1 + 0.15 * Math.sin(t * 18));
    });
  }

  /** Lysa: arrows rain from the sky over the enemy line x0..x1. */
  arrowRain(x0: number, x1: number, zc: number): void {
    const N = 40;
    const geo = new THREE.BoxGeometry(0.035, 0.75, 0.035);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0c0').multiplyScalar(2.6), fog: false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    const arrows = Array.from({ length: N }, (_, i) => ({
      t0: (i / N) * 0.55 + Math.random() * 0.06,
      x: x0 + Math.random() * (x1 - x0),
      z: zc + (Math.random() * 2 - 1) * 1.1,
      landed: false,
    }));
    const FALL = 0.26;
    const SLANT = 1.4; // arrows come in from the left (Lysa's side)
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(SLANT, 7));
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    this.group.add(mesh);
    this.add(1.1, mesh, (t) => {
      for (let i = 0; i < N; i++) {
        const a = arrows[i]!;
        const k = (t - a.t0) / FALL;
        const shown = k >= 0 && k <= 1.25;
        if (k > 1 && !a.landed) {
          a.landed = true;
          if (i % 2 === 0) this.bursts.burst({ pos: p.set(a.x, 0.1, a.z), count: 5, color: '#ffe8a8', hdr: 2.5, speed: 2.2, gravity: 6, life: 0.3, size: 0.05, soft: 0 });
        }
        const kk = Math.min(1, Math.max(0, k));
        p.set(a.x - SLANT * (1 - kk), 0.35 + 7 * (1 - kk), a.z);
        s.setScalar(shown ? 1 : 0);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /** Oren: a fire pillar under a target. */
  firePillar(at: THREE.Vector3, delay = 0): void {
    const H = 4.6;
    const geo = new THREE.CylinderGeometry(0.55, 0.38, H, 18, 1, true);
    geo.translate(0, H / 2, 0);
    const mat = additive({ vertexShader: fresnelVert, fragmentShader: fireFrag, uniforms: { uK: { value: 0 }, uTime: { value: 0 } } });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at);
    mesh.renderOrder = 7;
    mesh.visible = false;
    this.group.add(mesh);
    let lit = false;
    this.add(1.35 + delay, mesh, (t) => {
      const u = t - delay;
      if (u < 0) return;
      if (!lit) {
        lit = true;
        mesh.visible = true;
        this.lights.fire(at.clone().setY(1.2), '#ff6a20', 34, 1);
        this.bursts.burst({ pos: at, box: new THREE.Vector3(0.5, 0.2, 0.3), count: 30, color: '#ff8a3a', hdr: 3, speed: 1.2, drift: new THREE.Vector3(0, 4, 0), drag: 1, life: 0.9, size: 0.08 });
      }
      const k = u / 1.35;
      const rise = outCubic(Math.min(1, u / 0.18));
      mesh.scale.set(1 + 0.08 * Math.sin(u * 30), rise, 1 + 0.08 * Math.sin(u * 30));
      mat.uniforms.uTime!.value = u;
      mat.uniforms.uK!.value = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    });
  }

  /** Kit: four crossing dash-slash streaks through `at`, plus a dash trail from fromX. */
  dashSlash(at: THREE.Vector3, fromX: number): void {
    const geo = new THREE.PlaneGeometry(1, 1);
    const streaks: Array<{ mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; t0: number; len: number }> = [];
    const angles = [0.35, -0.5, 0.9, -0.08];
    angles.forEach((ang, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(i === 3 ? '#ffffff' : '#ff3a3a').multiplyScalar(i === 3 ? 4 : 3),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(at).setZ(at.z + 0.6);
      mesh.rotation.z = ang;
      mesh.renderOrder = 8;
      mesh.visible = false;
      this.group.add(mesh);
      streaks.push({ mesh, t0: i * 0.07, len: i === 3 ? 5 : 3.2 });
    });
    // dash trail along the ground line from Kit to the target
    const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a4a').multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const trail = new THREE.Mesh(geo, trailMat);
    const dx = at.x - fromX;
    trail.position.set(fromX + dx / 2, at.y, at.z + 0.5);
    trail.scale.set(Math.abs(dx), 0.05, 1);
    trail.renderOrder = 8;
    this.group.add(trail);
    this.bursts.burst({ pos: at, count: 40, color: '#ff4a3a', hdr: 3.5, speed: 6, drag: 3, life: 0.45, size: 0.07, soft: 0, zScale: 0.3 });
    this.lights.fire(at, '#ff4030', 30, 0.5);
    this.add(0.75, trail, (t) => {
      trailMat.opacity = Math.max(0, 1 - t / 0.25);
      trail.scale.y = 0.05 + t * 0.2;
      for (const s of streaks) {
        const u = (t - s.t0) / 0.32;
        s.mesh.visible = u >= 0 && u <= 1;
        if (!s.mesh.visible) continue;
        s.mesh.scale.set(s.len * outCubic(Math.min(1, u * 3)), 0.09 * (1 - u) + 0.01, 1);
        s.mesh.material.opacity = 1 - u * u;
      }
    }, () => {
      for (const s of streaks) {
        this.group.remove(s.mesh);
        s.mesh.material.dispose();
      }
    });
  }

  /** Shield Break: an expanding gold ring around the breaking unit. */
  breakRing(at: THREE.Vector3, size: number): void {
    const geo = new THREE.RingGeometry(0.82, 1, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffcf5a').multiplyScalar(3.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at).setZ(at.z + 0.3);
    mesh.renderOrder = 7;
    this.group.add(mesh);
    this.add(0.45, mesh, (_t, k) => {
      const r = size * (0.3 + outCubic(k) * 1.1);
      mesh.scale.set(r, r, 1);
      mat.opacity = (1 - k) * (1 - k);
    });
  }

  private add(dur: number, obj: THREE.Mesh, update: (t: number, k: number) => void, extra?: () => void): void {
    this.live.push({
      t: 0,
      dur,
      update,
      dispose: () => {
        this.group.remove(obj);
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
        extra?.();
      },
    });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      l.t += dt;
      l.update(l.t, Math.min(1, l.t / l.dur));
      if (l.t >= l.dur) {
        l.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const l of this.live) l.dispose();
    this.live.length = 0;
  }
}
