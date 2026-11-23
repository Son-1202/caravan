// The caravan wagon: a procedural low-poly wooden covered wagon (plank canvas
// texture, canvas canopy, 4 spoked wheels that roll with the diorama scroll),
// and a lantern post carrying the Ember (point light + HDR core + flame sprite).
// Stands behind the heroes, facing right (the direction of travel).
import * as THREE from 'three';
import { EmberLight } from './ember';
import { makeShadowTexture } from './placeholders';
import { currentScrollSpeed } from './diorama';
import { mulberry32 } from '../sim/rng';

export interface Wagon {
  group: THREE.Group;
  ember: EmberLight;
  /** Wheel ground speed (world units/s). null = follow the diorama scroll (march). */
  speed: number | null;
  update(t: number, dt: number): void;
  dispose(): void;
}

const WHEEL_R = 0.46;
const POST = { x: 1.35, top: 2.75 };

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** Horizontal weathered planks with grain, gaps and nail heads (pixel-art scale). */
function plankTexture(): THREE.CanvasTexture {
  const rng = mulberry32(42);
  return canvasTex(64, 32, (c) => {
    const rows = 4;
    const ph = 32 / rows;
    const tones = ['#6b4528', '#5e3c22', '#74502f', '#583820'];
    for (let r = 0; r < rows; r++) {
      c.fillStyle = tones[r % tones.length]!;
      c.fillRect(0, r * ph, 64, ph);
      // grain streaks
      for (let i = 0; i < 6; i++) {
        c.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,170,0.08)';
        c.fillRect(Math.floor(rng() * 56), r * ph + 1 + Math.floor(rng() * (ph - 2)), 4 + Math.floor(rng() * 14), 1);
      }
      // gap + butt joint
      c.fillStyle = '#2a170c';
      c.fillRect(0, r * ph + ph - 1, 64, 1);
      const jx = Math.floor(10 + rng() * 44);
      c.fillRect(jx, r * ph, 1, ph);
      c.fillStyle = '#c9a36a';
      c.fillRect(jx - 2, r * ph + 2, 1, 1);
      c.fillRect(jx + 2, r * ph + ph - 3, 1, 1);
    }
  });
}

/** Weathered canvas canopy: off-white with dusty stripes and patches. */
function canopyTexture(): THREE.CanvasTexture {
  const rng = mulberry32(7);
  return canvasTex(64, 32, (c) => {
    c.fillStyle = '#cbb894';
    c.fillRect(0, 0, 64, 32);
    for (let x = 0; x < 64; x += 8) {
      c.fillStyle = 'rgba(80,50,20,0.12)';
      c.fillRect(x, 0, 1, 32);
    }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = rng() > 0.5 ? 'rgba(90,60,30,0.12)' : 'rgba(255,255,240,0.1)';
      c.fillRect(Math.floor(rng() * 64), Math.floor(rng() * 32), 2 + Math.floor(rng() * 3), 1);
    }
    c.fillStyle = '#a8916a';
    c.fillRect(40, 10, 8, 7); // patch
    c.fillStyle = 'rgba(40,20,10,0.35)';
    c.fillRect(0, 30, 64, 2); // grimy hem
  });
}

/** Soft teardrop flame for the lantern (additive sprite). */
function flameTexture(): THREE.CanvasTexture {
  const t = canvasTex(32, 48, (c) => {
    const g = c.createRadialGradient(16, 32, 1, 16, 30, 16);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.35, 'rgba(255,190,90,0.9)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(16, 2);
    c.quadraticCurveTo(30, 28, 16, 46);
    c.quadraticCurveTo(2, 28, 16, 2);
    c.fill();
  });
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
}

function makeWheel(wood: THREE.Material, iron: THREE.Material, geos: THREE.BufferGeometry[]): THREE.Group {
  const w = new THREE.Group();
  const rim = new THREE.TorusGeometry(WHEEL_R, 0.055, 4, 14);
  const tyre = new THREE.TorusGeometry(WHEEL_R + 0.03, 0.025, 3, 14);
  const spoke = new THREE.BoxGeometry(0.05, WHEEL_R * 2, 0.04);
  const hub = new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8);
  hub.rotateX(Math.PI / 2);
  geos.push(rim, tyre, spoke, hub);
  w.add(new THREE.Mesh(rim, wood), new THREE.Mesh(tyre, iron), new THREE.Mesh(hub, iron));
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(spoke, wood);
    s.rotation.z = (i * Math.PI) / 4;
    w.add(s);
  }
  return w;
}

export function createWagon(): Wagon {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const add = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);

  const plank = plankTexture();
  const plankSide = plank.clone();
  plankSide.wrapS = plankSide.wrapT = THREE.RepeatWrapping;
  plankSide.repeat.set(2.5, 1);
  plankSide.needsUpdate = true;
  const canopy = canopyTexture();
  const flameTex = flameTexture();
  texs.push(plank, plankSide, canopy, flameTex);

  const wood = new THREE.MeshStandardMaterial({ map: plankSide, roughness: 1 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#3a2414', roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ color: '#2b2b30', roughness: 0.6, metalness: 0.4 });
  const cloth = new THREE.MeshStandardMaterial({ map: canopy, roughness: 1, side: THREE.DoubleSide });
  mats.push(wood, darkWood, iron, cloth);

  // bed + side boards
  const bed = new THREE.Mesh(add(new THREE.BoxGeometry(2.7, 0.75, 1.3)), wood);
  bed.position.y = 0.88;
  const rail = new THREE.Mesh(add(new THREE.BoxGeometry(2.86, 0.08, 1.4)), darkWood);
  rail.position.y = 1.27;
  const skirt = new THREE.Mesh(add(new THREE.BoxGeometry(2.6, 0.1, 1.1)), darkWood);
  skirt.position.y = 0.48;
  // covered-wagon canopy (half cylinder along X) + hoops
  // theta 0..PI is the top half once the Y axis is laid along X
  const cover = new THREE.Mesh(add(new THREE.CylinderGeometry(0.72, 0.72, 2.3, 7, 1, true, 0, Math.PI)), cloth);
  cover.rotation.z = Math.PI / 2;
  cover.position.set(-0.1, 1.3, 0);
  group.add(bed, rail, skirt, cover);
  const hoop = add(new THREE.TorusGeometry(0.74, 0.035, 3, 10, Math.PI));
  for (const x of [-1.2, -0.1, 1.0]) {
    const h = new THREE.Mesh(hoop, darkWood);
    h.rotation.y = Math.PI / 2;
    h.position.set(x, 1.3, 0);
    group.add(h);
  }
  // tongue (draw pole) toward the direction of travel + driver's bench
  const tongue = new THREE.Mesh(add(new THREE.BoxGeometry(1.4, 0.08, 0.08)), darkWood);
  tongue.position.set(1.95, 0.5, 0.2);
  tongue.rotation.z = -0.12;
  const bench = new THREE.Mesh(add(new THREE.BoxGeometry(0.4, 0.08, 1.1)), darkWood);
  bench.position.set(1.15, 1.42, 0);
  group.add(tongue, bench);

  // wheels: front pair is a touch smaller (classic wagon); far side half hidden
  const wheels: THREE.Group[] = [];
  for (const [x, z, s] of [[-0.85, 0.7, 1], [0.95, 0.7, 0.86], [-0.85, -0.7, 1], [0.95, -0.7, 0.86]] as const) {
    const w = makeWheel(darkWood, iron, geos);
    w.scale.setScalar(s);
    w.position.set(x, WHEEL_R * s, z);
    w.userData.r = WHEEL_R * s;
    wheels.push(w);
    group.add(w);
  }
  const axle = new THREE.Mesh(add(new THREE.BoxGeometry(0.06, 0.06, 1.5)), iron);
  axle.position.set(-0.85, WHEEL_R, 0);
  group.add(axle);

  // lantern post with crossarm + the Ember
  const pole = new THREE.Mesh(add(new THREE.BoxGeometry(0.09, POST.top - 1.2, 0.09)), darkWood);
  pole.position.set(POST.x, 1.2 + (POST.top - 1.2) / 2, 0.45);
  const arm = new THREE.Mesh(add(new THREE.BoxGeometry(0.45, 0.06, 0.06)), darkWood);
  arm.position.set(POST.x + 0.2, POST.top - 0.05, 0.45);
  group.add(pole, arm);
  const ember = new EmberLight();
  const lanternAt = new THREE.Vector3(POST.x + 0.4, POST.top - 0.42, 0.45);
  ember.group.position.copy(lanternAt);
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex,
    color: new THREE.Color('#ffb060').multiplyScalar(3),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  mats.push(flameMat);
  const flame = new THREE.Sprite(flameMat);
  flame.scale.set(0.22, 0.34, 1);
  flame.position.set(0, 0.08, 0.05);
  flame.renderOrder = 4;
  ember.group.add(flame);
  group.add(ember.group);

  // blob shadow
  const shadowTex = makeShadowTexture();
  texs.push(shadowTex);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 });
  mats.push(shadowMat);
  const shadow = new THREE.Mesh(add(new THREE.PlaneGeometry(3.8, 1.9)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== shadow) o.renderOrder = 1;
  });

  const wagon: Wagon = {
    group,
    ember,
    speed: null,
    update(t, dt) {
      ember.update(t, dt);
      // lantern swings on its hook
      const sway = Math.sin(t * 1.3) * 0.05 + Math.sin(t * 3.1) * 0.015;
      ember.group.position.x = lanternAt.x + sway;
      ember.group.rotation.z = -sway * 1.5;
      const k = ember.light.intensity / 22;
      flame.scale.set(0.2 + 0.03 * k, 0.3 + 0.08 * k + Math.sin(t * 23) * 0.015, 1);
      // wheels roll with the ground speed (positive = moving right = clockwise)
      const v = wagon.speed ?? currentScrollSpeed();
      if (v !== 0) for (const w of wheels) w.rotation.z -= (v * dt) / (w.userData.r as number);
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const x of texs) x.dispose();
      (ember.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined)?.geometry.dispose();
    },
  };
  return wagon;
}
