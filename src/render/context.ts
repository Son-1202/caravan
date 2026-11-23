// The bundle of render objects a view needs. main.ts builds it once.
import type * as THREE from 'three';
import type { DioramaCamera } from './camera';
import type { Diorama } from './diorama';
import type { PostFX } from './postfx';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: DioramaCamera;
  diorama: Diorama;
  postfx: PostFX;
}
