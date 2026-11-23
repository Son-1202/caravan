// Ignite cinematic overlay, attached to the camera: letterbox bars that slide
// in and out, and a warm radial flash centred on the Ember's screen position.
import * as THREE from 'three';

const D = 0.31; // distance in front of the camera (just past the ScreenFlash quads)
const BAR = 0.11; // bar height as a fraction of the screen height
const SLIDE = 0.22; // s

const flashVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const flashFrag = /* glsl */ `
uniform vec2 uCenter; uniform float uAspect; uniform float uK; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float r = length(d);
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * 2.2) * 0.45;
  gl_FragColor = vec4(uColor * (core * 1.6 + halo) * uK, 1.0);
}`;

export class IgniteCinematic {
  private readonly top: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly bottom: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private barT = 0;
  private barUntil = -1;
  private now = 0;
  private flashT = 1;
  private flashDur = 1;
  private readonly ndc = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    const barMat = () =>
      // transparent so it sorts after the (transparent) painted layers by renderOrder
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    this.top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMat());
    this.bottom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMat());
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: flashVert,
        fragmentShader: flashFrag,
        uniforms: {
          uCenter: { value: new THREE.Vector2(0.2, 0.5) },
          uAspect: { value: 16 / 9 },
          uK: { value: 0 },
          uColor: { value: new THREE.Color('#ffa24a').multiplyScalar(1.3) },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    for (const [m, order] of [[this.glow, 99], [this.top, 101], [this.bottom, 101]] as const) {
      m.renderOrder = order;
      m.frustumCulled = false;
      m.visible = false;
      m.position.z = -D;
      camera.add(m);
    }
  }

  /** Slide the bars in now and keep them up for `hold` seconds (then slide out). */
  bars(hold: number): void {
    this.barUntil = Math.max(this.barUntil, this.now + hold);
  }

  /** Warm radial flash centred on a world point (the Ember). */
  flash(world: THREE.Vector3, dur = 0.9): void {
    this.ndc.copy(world).project(this.camera);
    (this.glow.material.uniforms.uCenter!.value as THREE.Vector2).set(this.ndc.x * 0.5 + 0.5, this.ndc.y * 0.5 + 0.5);
    this.flashT = 0;
    this.flashDur = dur;
  }

  /** True while the bars are visible. */
  get active(): boolean {
    return this.barT > 0;
  }

  update(dtReal: number): void {
    this.now += dtReal;
    const h = 2 * D * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const w = h * this.camera.aspect;
    // bars
    const target = this.now < this.barUntil ? 1 : 0;
    this.barT = THREE.MathUtils.clamp(this.barT + (target ? dtReal : -dtReal) / SLIDE, 0, 1);
    const k = this.barT * this.barT * (3 - 2 * this.barT);
    const bh = h * BAR;
    for (const [m, s] of [[this.top, 1], [this.bottom, -1]] as const) {
      m.visible = k > 0;
      m.scale.set(w * 1.05, bh, 1);
      m.position.y = s * (h / 2 + bh / 2 - bh * k);
    }
    // radial flash: fast attack, slow warm fade
    this.flashT += dtReal;
    const f = this.flashT / this.flashDur;
    const u = this.glow.material.uniforms;
    u.uK!.value = f < 1 ? Math.min(1, f * 8) * (1 - f) * (1 - f) : 0;
    u.uAspect!.value = this.camera.aspect;
    this.glow.scale.set(w, h, 1);
    this.glow.visible = (u.uK!.value as number) > 0.002;
  }

  dispose(): void {
    for (const m of [this.top, this.bottom, this.glow]) {
      this.camera.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
