// Billboard sprite helper: pixel-crisp plane (NearestFilter, alphaTest) with a
// blob shadow and procedural idle breathing. Pivot sits at the feet.
import * as THREE from 'three';
import { makeFigureTexture, makeShadowTexture } from './placeholders';

export interface SpriteOptions {
  width: number;
  height: number;
  /** Texture URL (from assets registry). Null/undefined = placeholder. */
  url?: string | null;
  color?: string;
  kind?: 'hero' | 'enemy' | 'prop';
  flipX?: boolean;
  breathe?: boolean;
}

let shadowTex: THREE.Texture | null = null;
const loader = new THREE.TextureLoader();

export class SpriteActor {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly breathe: boolean;

  constructor(opts: SpriteOptions) {
    const geo = new THREE.PlaneGeometry(opts.width, opts.height);
    geo.translate(0, opts.height / 2, 0);
    const placeholder = makeFigureTexture(opts.color ?? '#888888', opts.kind ?? 'hero');
    this.material = new THREE.MeshStandardMaterial({
      map: placeholder,
      alphaTest: 0.5,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
    });
    if (opts.url) {
      loader.load(opts.url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        this.material.map = tex;
        this.material.needsUpdate = true;
        placeholder.dispose();
      });
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    if (opts.flipX) this.mesh.scale.x = -1;
    shadowTex ??= makeShadowTexture();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(opts.width * 1.3, opts.width * 0.5),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.group.add(shadow, this.mesh);
    this.breathe = opts.breathe ?? true;
  }

  update(t: number): void {
    if (!this.breathe) return;
    const s = Math.sin(t * 2.2 + this.phase);
    this.mesh.scale.y = 1 + s * 0.025;
    this.mesh.scale.x = Math.sign(this.mesh.scale.x) * (1 - s * 0.01);
  }
}
