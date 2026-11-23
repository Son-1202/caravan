// Diorama camera: narrow FOV (28) for the miniature look, slight downward
// tilt, gentle idle sway.
import * as THREE from 'three';

export const CAMERA_BASE = new THREE.Vector3(0, 2.8, 18);
export const CAMERA_TARGET = new THREE.Vector3(0, 1.2, 0);

export class DioramaCamera {
  readonly camera: THREE.PerspectiveCamera;
  swayAmount = 1;
  /** Extra positional offset (camera shake), set each frame by effects. */
  readonly shake = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(verticalFovFor(aspect), aspect, 0.1, 200);
    this.camera.position.copy(CAMERA_BASE);
    this.camera.lookAt(CAMERA_TARGET);
  }

  /**
   * Narrower than 16:9 (e.g. phones in portrait) widens the vertical FOV so the
   * horizontal stage stays fully in view.
   */
  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = verticalFovFor(aspect);
    this.camera.updateProjectionMatrix();
  }

  update(t: number): void {
    const a = this.swayAmount;
    this.camera.position.set(
      CAMERA_BASE.x + Math.sin(t * 0.21) * 0.18 * a,
      CAMERA_BASE.y + Math.sin(t * 0.33 + 1) * 0.06 * a,
      CAMERA_BASE.z + Math.sin(t * 0.17 + 2) * 0.1 * a,
    );
    this.camera.position.add(this.shake);
    this.camera.lookAt(CAMERA_TARGET.x + Math.sin(t * 0.13) * 0.05 * a, CAMERA_TARGET.y, CAMERA_TARGET.z);
  }
}

export const BASE_FOV = 28;
const MIN_ASPECT = 16 / 9;

export function verticalFovFor(aspect: number): number {
  if (aspect >= MIN_ASPECT) return BASE_FOV;
  const half = Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * (MIN_ASPECT / aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan(half));
}

/** Visible frustum size (world units) of a plane facing the camera at distance d. */
export function frustumAt(d: number, fovDeg: number, aspect: number): { w: number; h: number } {
  const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  return { w: h * aspect, h };
}
