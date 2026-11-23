// Cold rim outline for pixel sprites (bosses): a plane behind the sprite that
// draws a crisp 2-texel edge plus a soft halo wherever the sprite's alpha ends.
// Child of the sprite mesh, so it follows flip, squash, lunges and dissolve.
import * as THREE from 'three';

export interface Outline {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  setMap(tex: THREE.Texture, w: number, h: number): void;
  /** 0..1 overall opacity (dissolve) */
  setFade(k: number): void;
  dispose(): void;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
uniform vec3 color;
uniform float fade;
varying vec2 vUv;
float ring(float r) {
  float n = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    n = max(n, texture2D(map, vUv + vec2(cos(a), sin(a)) * texel * r).a);
  }
  return n;
}
void main() {
  float self = texture2D(map, vUv).a;
  if (self > 0.5) discard;
  float edge = step(0.5, ring(1.0)) + step(0.5, ring(2.0));
  float halo = ring(4.0);
  float a = max(min(1.0, edge) * 0.65, halo * 0.22) * fade;
  if (a < 0.02) discard;
  gl_FragColor = vec4(color, a);
}`;

export function createOutline(tex: THREE.Texture, color: string): Outline {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      texel: { value: new THREE.Vector2(1 / (img?.width || 64), 1 / (img?.height || 96)) },
      color: { value: new THREE.Color(color) },
      fade: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = -0.01; // just behind the sprite
  mesh.renderOrder = 1;
  return {
    mesh,
    setMap(t, w, h) {
      mat.uniforms.map.value = t;
      (mat.uniforms.texel.value as THREE.Vector2).set(1 / w, 1 / h);
    },
    setFade(k) {
      mat.uniforms.fade.value = k;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
