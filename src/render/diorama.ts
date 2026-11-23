// Region diorama: layered planes at fixed depths (sky -30, far -15, mid -6,
// actors 0, fg +4) plus a ground strip. Each layer takes an ART texture if
// present (assets registry) or a procedural placeholder. setScroll() drives
// parallax via texture offsets (RepeatWrapping), so depth gives the parallax.
import * as THREE from 'three';
import { LAYER_Z, getRegion, type LayerName, type RegionConfig, type RegionId } from './regions';
import { regionLayerUrl } from './assets';
import { makeLayerTexture } from './placeholders';
import { GROUND_SELF_LIGHT, GroundDressing, makeRegionGroundTexture } from './ground';
import { applySky, createSkyMaterial } from './sky';
import { addHeatHaze, hazeUniforms, Particles } from './ambient';
import { CAMERA_BASE, CAMERA_TARGET, frustumAt, verticalFovFor } from './camera';
import { coverUv } from './layout';

const MARGIN = 1.25; // oversize layers so sway/tilt never shows edges
const SKY_SCROLL = 0.004; // sky barely moves
// ground ends a little behind the stage so painted mid-layer floors show
const GROUND = { zNear: 17, zFar: -3, repeat: 3 };

interface Layer {
  name: LayerName;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  width: number;
  /** aspect of the loaded ART image (0 = procedural placeholder) */
  imgAspect: number;
}

/** Vertical crop anchor per painted layer: keep the ground line of mid/fg. */
const ANCHOR_Y: Record<LayerName, number> = { far: 0.5, mid: 0.1, fg: 0 };
/** Emissive self-light for painted layers (fg stays darker = silhouette). */
const PAINT_SELF_LIGHT: Record<LayerName, number> = { far: 0.7, mid: 0.6, fg: 0.35 };
/**
 * The fg is a floor-framing layer: it never draws in the upper part of the frame.
 * Painted fg art can carry tall props (Whisperpine's tree canopy, Frostspire's dead
 * branch) whose trunks end up cropped off by the cover-fit/MARGIN, leaving a dark
 * block floating over the stage. Everything above `clipTop` (fraction of the screen
 * height from the top) is hidden, fading back in over `FG_CLIP_FADE` below it.
 */
export const FG_CLIP_MARCH = 0.28;
const FG_CLIP_FADE = 0.1;

const loader = new THREE.TextureLoader();

/** Last scroll speed set on any diorama (march mode); props like the wagon wheels follow it. */
let liveScroll = 0;
export function currentScrollSpeed(): number {
  return liveScroll;
}

export class Diorama {
  readonly root = new THREE.Group();
  readonly actors = new THREE.Group();
  region: RegionConfig = getRegion('whisperpine');
  private readonly sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly layers: Layer[] = [];
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly particles = new Particles();
  private readonly dressing = new GroundDressing();
  private readonly dusk = new THREE.DirectionalLight('#ffffff', 1);
  private readonly ambient = new THREE.HemisphereLight('#ffffff', '#000000', 0.5);
  private readonly fog = new THREE.Fog('#000000', 20, 60);
  private scrollSpeed = 0;
  /** Lower the fg layer by this fraction of its height (combat keeps the stage clear). */
  private fgDrop = 0;
  /** fg hidden above this screen fraction (0 = top). See FG_CLIP_MARCH. */
  private fgClipTop = FG_CLIP_MARCH;
  /** plane-v (0 bottom .. 1 top) where the fg is fully hidden / fully shown */
  private readonly fgClip = { uHide: { value: 2 }, uShow: { value: 2 } };
  private aspect = 16 / 9;

  constructor(private readonly scene: THREE.Scene) {
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createSkyMaterial());
    this.sky.position.z = LAYER_Z.sky;
    this.sky.renderOrder = -10;
    this.root.add(this.sky);

    for (const name of ['far', 'mid', 'fg'] as const) {
      const mat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.02, roughness: 1, depthWrite: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.position.z = LAYER_Z[name];
      if (name === 'far') addHeatHaze(mat);
      if (name === 'fg') {
        // fg sits in front of the ground strip; draw it last, over everything
        mat.depthTest = false;
        mat.depthWrite = false;
        mesh.renderOrder = 10;
        clipFg(mat, this.fgClip);
      }
      this.layers.push({ name, mesh, width: 1, imgAspect: 0 });
      this.root.add(mesh);
    }

    const gMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.dressing.patch(gMat);
    this.root.add(this.ground, this.dressing.group);

    this.dusk.position.set(-6, 10, 8);
    this.root.add(this.dusk, this.dusk.target, this.ambient, this.particles.points, this.actors);
    scene.add(this.root);
    scene.fog = this.fog;
    // Apply the initial region now: until setRegion runs, the layers are untextured
    // white planes (fg draws over everything) and the frame washes out to beige.
    this.setRegion(this.region.id);
  }

  /** Resize every layer to cover the frustum at its depth (call on resize). */
  layout(aspect: number): void {
    this.aspect = aspect;
    const fov = verticalFovFor(aspect);
    const dir = new THREE.Vector3().subVectors(CAMERA_TARGET, CAMERA_BASE);
    const place = (mesh: THREE.Mesh, z: number, fill = 1): number => {
      const d = CAMERA_BASE.z - z;
      const { w, h } = frustumAt(d, fov, aspect);
      // y where the view axis crosses this depth
      const y = CAMERA_BASE.y + dir.y * (d / -dir.z);
      mesh.scale.set(w * MARGIN, h * MARGIN * fill, 1);
      mesh.position.y = y - (h * MARGIN * (1 - fill)) / 2;
      return w * MARGIN;
    };
    place(this.sky, LAYER_Z.sky);
    for (const l of this.layers) {
      l.width = place(l.mesh, l.mesh.position.z);
      if (l.name === 'fg') {
        l.mesh.position.y -= this.fgDrop * l.mesh.scale.y;
        // screen fraction f (0 = top) sits at plane-v 0.5 + (0.5 - f) / MARGIN + drop
        const v = (f: number): number => 0.5 + (0.5 - f) / MARGIN + this.fgDrop;
        this.fgClip.uHide.value = v(this.fgClipTop);
        this.fgClip.uShow.value = v(this.fgClipTop + FG_CLIP_FADE);
      }
      this.fitLayer(l);
    }
    const depth = GROUND.zNear - GROUND.zFar;
    const gw = frustumAt(CAMERA_BASE.z - GROUND.zFar, fov, aspect).w * MARGIN;
    this.ground.scale.set(gw, depth, 1);
    this.ground.position.set(0, 0, (GROUND.zNear + GROUND.zFar) / 2);
    const map = this.ground.material.map;
    if (map) map.repeat.set(GROUND.repeat * (gw / depth), GROUND.repeat);
    this.dressing.layout(gw, GROUND.zFar, GROUND.zNear);
  }

  /** Lower the fg by `frac` of its height and hide it above `clipTop` (screen fraction). */
  setFgDrop(frac: number, clipTop = FG_CLIP_MARCH): void {
    this.fgDrop = frac;
    this.fgClipTop = clipTop;
    this.layout(this.aspect);
  }

  setRegion(id: RegionId): void {
    const cfg = getRegion(id);
    this.region = cfg;
    applySky(this.sky.material, cfg);
    for (const l of this.layers) this.setLayerTexture(l, cfg);
    const gm = this.ground.material;
    gm.map?.dispose();
    gm.map = makeRegionGroundTexture(cfg);
    gm.emissiveMap = gm.map;
    gm.emissive.set('#ffffff');
    gm.emissiveIntensity = GROUND_SELF_LIGHT[cfg.id];
    gm.needsUpdate = true;
    const groundUrl = regionLayerUrl(cfg.id, 'ground');
    if (groundUrl) this.loadInto(gm, groundUrl, true);
    this.layout(this.aspect);

    this.dusk.color.set(cfg.dusk.color);
    this.dusk.intensity = cfg.dusk.intensity;
    this.ambient.color.set(cfg.dusk.ambient);
    this.ambient.groundColor.set(cfg.layers.fg);
    this.ambient.intensity = cfg.dusk.ambientIntensity;
    this.fog.color.set(cfg.fog.color);
    this.fog.near = cfg.fog.near;
    this.fog.far = cfg.fog.far;
    this.scene.background = new THREE.Color(cfg.sky.top);
    this.particles.apply(cfg);
    this.dressing.apply(cfg);
    hazeUniforms.uHaze.value = cfg.particles.kind === 'sand' ? 1 : 0;
  }

  private setLayerTexture(l: Layer, cfg: RegionConfig): void {
    const m = l.mesh.material;
    m.map?.dispose();
    m.map = makeLayerTexture(cfg, l.name);
    m.needsUpdate = true;
    l.imgAspect = 0;
    const url = regionLayerUrl(cfg.id, l.name);
    m.emissiveMap = null;
    m.emissive.set('#000000');
    if (url) {
      this.loadInto(m, url, false, (img) => {
        l.imgAspect = img.width / img.height;
        // painted art carries its own lighting: self-lit so dusk light doesn't crush it
        m.emissiveMap = m.map;
        m.emissive.set('#ffffff');
        m.emissiveIntensity = PAINT_SELF_LIGHT[l.name];
        m.needsUpdate = true;
        this.fitLayer(l);
      });
    }
  }

  /** Cover-crop a painted layer to its plane (keeps image aspect, no stretch). */
  private fitLayer(l: Layer): void {
    const map = l.mesh.material.map;
    if (!map || l.imgAspect <= 0) return;
    const uv = coverUv(l.mesh.scale.x / l.mesh.scale.y, l.imgAspect, ANCHOR_Y[l.name]);
    map.repeat.set(uv.repeatX, uv.repeatY);
    map.offset.y = uv.offsetY;
    // painted art does not tile vertically; clamp so mip filtering can't bleed
    map.wrapT = THREE.ClampToEdgeWrapping;
  }

  private loadInto(
    m: THREE.MeshStandardMaterial,
    url: string,
    repeatT: boolean,
    onLoad?: (img: { width: number; height: number }) => void,
  ): void {
    const prev = m.map;
    loader.load(url, (tex) => {
      if (m.map !== prev) return; // region changed meanwhile
      tex.colorSpace = THREE.SRGBColorSpace;
      // painted backgrounds: smooth + mipmapped (sprites stay Nearest)
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      tex.wrapS = THREE.RepeatWrapping;
      if (repeatT) tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.copy(prev?.repeat ?? tex.repeat);
      m.map = tex;
      m.needsUpdate = true;
      prev?.dispose();
      const img = tex.image as { width: number; height: number } | undefined;
      if (img && onLoad) onLoad(img);
    });
  }

  /** Snap every scrolled layer back to its authored framing (battle staging). */
  resetScroll(): void {
    for (const l of this.layers) {
      const map = l.mesh.material.map;
      if (map) map.offset.x = 0;
    }
    const gm = this.ground.material.map;
    if (gm) gm.offset.x = 0;
    this.sky.material.uniforms.uScroll.value = 0;
  }

  /** World units/sec at the actor plane. Perspective turns it into parallax. */
  setScroll(speed: number): void {
    this.scrollSpeed = speed;
    liveScroll = speed;
  }

  update(dt: number, t: number): void {
    const s = this.scrollSpeed * dt;
    const skyU = this.sky.material.uniforms;
    skyU.uTime.value = t;
    hazeUniforms.uHazeTime.value = t;
    skyU.uScroll.value += s * SKY_SCROLL;
    for (const l of this.layers) {
      const map = l.mesh.material.map;
      if (map) map.offset.x += s / l.width;
    }
    const gm = this.ground.material.map;
    if (gm) gm.offset.x += (s / this.ground.scale.x) * gm.repeat.x;
    this.particles.update(dt, t, this.scrollSpeed);
  }
}

/** Fade the fg layer out above a plane-v line (uniforms set by Diorama.layout). */
function clipFg(m: THREE.MeshStandardMaterial, u: { uHide: { value: number }; uShow: { value: number } }): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFgHide = u.uHide;
    shader.uniforms.uFgShow = u.uShow;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vPlaneV;\nvoid main() {\n  vPlaneV = uv.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uFgHide;\nuniform float uFgShow;\nvarying float vPlaneV;\nvoid main() {')
      .replace(
        '#include <alphatest_fragment>',
        'diffuseColor.a *= 1.0 - smoothstep(uFgShow, uFgHide, vPlaneV);\n#include <alphatest_fragment>',
      );
  };
  m.customProgramCacheKey = () => 'fg-clip';
}
