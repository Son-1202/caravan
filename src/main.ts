import '@fontsource/pixelify-sans/400.css';
import '@fontsource/silkscreen/400.css';
import './style.css';
import * as THREE from 'three';
import { Diorama } from './render/diorama';
import { DioramaCamera } from './render/camera';
import { PostFX, type Quality } from './render/postfx';
import { createDemoCast } from './render/demoScene';
import { REGION_IDS, getRegion, isRegionId, type RegionId } from './render/regions';
import { DemoHud } from './ui/hud';

// Query params (demo/QA): ?region=frostspire&quality=high|low&scroll=1.5
const params = new URLSearchParams(location.search);
const app = document.getElementById('app') ?? document.body;

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.append(renderer.domElement);

const scene = new THREE.Scene();
const cam = new DioramaCamera(window.innerWidth / window.innerHeight);
const diorama = new Diorama(scene);
const cast = createDemoCast(diorama.actors);
const postfx = new PostFX(renderer, scene, cam.camera);
const hud = new DemoHud(app);

const forcedQuality = params.get('quality');
if (forcedQuality === 'high' || forcedQuality === 'low') {
  postfx.autoQuality = false;
  postfx.setQuality(forcedQuality);
}

function hint(q: Quality): string {
  return `1-4 region · Q quality (${q}) · C chroma pulse · Space scroll`;
}
postfx.onQualityChange = (q) => hud.setHint(hint(q));
hud.setHint(hint(postfx.quality));

function setRegion(id: RegionId): void {
  diorama.setRegion(id);
  postfx.setGrade(getRegion(id).grade);
  hud.setRegion(getRegion(id).name);
}

const startRegion = params.get('region') ?? 'whisperpine';
setRegion(isRegionId(startRegion) ? startRegion : 'whisperpine');

const baseScroll = Number(params.get('scroll') ?? 1.2);
let scrolling = true;
diorama.setScroll(baseScroll);

window.addEventListener('keydown', (e) => {
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  if (idx >= 0) setRegion(REGION_IDS[idx]);
  else if (e.key === 'q' || e.key === 'Q') {
    postfx.autoQuality = false;
    postfx.setQuality(postfx.quality === 'high' ? 'low' : 'high');
  } else if (e.key === 'c' || e.key === 'C') {
    postfx.pulseChromatic();
    cast.ember.surge = 1;
  } else if (e.key === ' ') {
    scrolling = !scrolling;
    diorama.setScroll(scrolling ? baseScroll : 0);
  }
});

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  cam.setAspect(w / h);
  diorama.layout(w / h);
  postfx.setSize(w, h);
}
window.addEventListener('resize', onResize);
onResize();

window.__debug = { scene, diorama, postfx, setRegion, renderer };

let last = performance.now();
let elapsed = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;
  cam.update(elapsed);
  diorama.update(dt, elapsed);
  cast.update(elapsed, dt);
  postfx.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
