// Shared render-quality state. PostFX owns the switch (manual toggle or the
// FPS auto-drop); other render systems (ambient particles, VFX density) read
// it each frame, so no extra wiring is needed in main/game code.
export type Quality = 'high' | 'low';

export const renderQuality: { level: Quality } = { level: 'high' };

/** Particle density multiplier for the current quality. */
export function particleDensity(): number {
  return renderQuality.level === 'high' ? 1 : 0.35;
}
