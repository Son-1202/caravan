// Sky backdrop: code gradient shader (top -> horizon -> glow) with optional
// aurora (with an occasional shimmer of curtain rays) and twinkling stars.
// Region particles live in ambient.ts.
import * as THREE from 'three';
import type { RegionConfig } from './regions';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow;
uniform float uTime; uniform float uAurora; uniform float uStars; uniform float uScroll;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float y = vUv.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.25, 0.95, y));
  col = mix(col, uGlow, pow(1.0 - smoothstep(0.15, 0.5, y), 2.0) * 0.85);
  vec2 sp = vec2(vUv.x + uScroll, vUv.y) * vec2(220.0, 120.0);
  vec2 cell = floor(sp);
  float h = hash(cell);
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
  float star = step(1.0 - 0.012 * uStars, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * tw;
  col += vec3(star) * smoothstep(0.35, 0.8, y);
  if (uAurora > 0.5) {
    float x = vUv.x + uScroll * 0.5;
    float band = sin(x * 9.0 + uTime * 0.25) * 0.05 + sin(x * 23.0 - uTime * 0.4) * 0.02 + 0.68;
    float a = exp(-pow((y - band) * 14.0, 2.0)) * (0.55 + 0.45 * sin(x * 40.0 + uTime));
    // occasional shimmer (~every 13 s): brighter, with flickering vertical curtain rays
    float shimmer = pow(max(0.0, sin(uTime * 0.48 + 1.7)), 10.0);
    float rays = 0.5 + 0.5 * sin(x * 160.0 + uTime * 2.6 + sin(x * 19.0 + uTime * 0.7) * 5.0);
    float curtain = exp(-pow((y - band - 0.05) * 7.0, 2.0)) * rays * shimmer;
    a = a * (1.0 + shimmer * 0.9) + curtain * 0.6;
    col += a * mix(vec3(0.1, 0.9, 0.6), vec3(0.5, 0.3, 0.9), smoothstep(0.6, 0.8, y)) * 0.7;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uTime: { value: 0 },
      uAurora: { value: 0 },
      uStars: { value: 0 },
      uScroll: { value: 0 },
    },
  });
}

export function applySky(mat: THREE.ShaderMaterial, cfg: RegionConfig): void {
  const u = mat.uniforms;
  (u.uTop.value as THREE.Color).set(cfg.sky.top);
  (u.uHorizon.value as THREE.Color).set(cfg.sky.horizon);
  (u.uGlow.value as THREE.Color).set(cfg.sky.glow);
  u.uAurora.value = cfg.sky.aurora ? 1 : 0;
  u.uStars.value = cfg.sky.stars;
}
