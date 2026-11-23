import '@fontsource/pixelify-sans/400.css';
import '@fontsource/silkscreen/400.css';
import './style.css';
import './ui/ui.css';
import * as THREE from 'three';
import { Diorama } from './render/diorama';
import { DioramaCamera } from './render/camera';
import { PostFX } from './render/postfx';
import type { RenderContext } from './render/context';
import { App, randomSeed } from './game/app';
import { startDevDemo, type Loop } from './game/devDemo';

// Query params: ?seed=<n> (game) · ?demo=combat|diorama (dev demos) · ?quality=high|low
const params = new URLSearchParams(location.search);
const root = document.getElementById('app') ?? document.body;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.append(renderer.domElement);

const scene = new THREE.Scene();
const cam = new DioramaCamera(window.innerWidth / window.innerHeight);
const diorama = new Diorama(scene);
const postfx = new PostFX(renderer, scene, cam.camera);
const ctx: RenderContext = { renderer, scene, cam, diorama, postfx };
window.__debug = { scene, diorama, postfx, renderer };

const q = params.get('quality');
if (q === 'high' || q === 'low') {
  postfx.autoQuality = false;
  postfx.setQuality(q);
}

let loop: Loop;
const demo = params.get('demo');
if (demo === 'combat' || demo === 'diorama') loop = startDevDemo(ctx, root, params);
else {
  const seedParam = Number(params.get('seed'));
  const app = new App(ctx, root, Number.isFinite(seedParam) && seedParam > 0 ? seedParam : randomSeed());
  loop = { update: (dt) => (app.update(dt), dt), onResize: () => app.onResize() };
}

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  cam.setAspect(w / h);
  diorama.layout(w / h);
  postfx.setSize(w, h);
  loop.onResize();
}
window.addEventListener('resize', onResize);
onResize();

let last = performance.now();
let elapsed = 0;
function frame(now: number): void {
  const dtRaw = Math.min((now - last) / 1000, 0.1);
  last = now;
  const dt = loop.update(dtRaw);
  elapsed += dt;
  cam.update(elapsed);
  diorama.update(dt, elapsed);
  postfx.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
