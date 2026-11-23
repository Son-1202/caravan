// The Ember lantern: warm flickering PointLight + HDR emissive core (so the
// bloom pass catches it). Flicker = layered 1D value noise.
import * as THREE from 'three';

function valueNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export class EmberLight {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly core: THREE.Mesh;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly baseIntensity: number;
  /** 0..1 extra brightness, e.g. for ignite moments. Decays automatically. */
  surge = 0;

  constructor(intensity = 22, color = '#ff9a3c') {
    this.baseIntensity = intensity;
    this.light = new THREE.PointLight(color, intensity, 13, 1.7);
    this.light.position.set(0, 0, 0.6);
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(4), fog: false });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), this.coreMat);
    const cage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 0.42, 6, 1, true),
      new THREE.MeshStandardMaterial({ color: '#2a1a10', wireframe: true }),
    );
    this.group.add(this.light, this.core, cage);
  }

  update(t: number, dt: number): void {
    const n = valueNoise(t * 7) * 0.55 + valueNoise(t * 17 + 9) * 0.3 + valueNoise(t * 2.3 + 3) * 0.15;
    const flick = 0.75 + n * 0.5;
    this.surge = Math.max(0, this.surge - dt * 0.8);
    const k = flick * (1 + this.surge * 1.5);
    this.light.intensity = this.baseIntensity * k;
    this.coreMat.color.setRGB(1, 0.62, 0.3).multiplyScalar(3 + 2.5 * k);
    this.core.scale.setScalar(0.9 + 0.2 * k);
  }
}
