// Legacy dev demos kept for QA scripts: ?demo=combat (T-07 CombatView) and ?demo=diorama (T-01 cast).
// Query: region=<id> quality=high|low scroll=<n>; keys 1-4 region, Q quality, C chroma, Space scroll.
import { createDemoCast } from '../render/demoScene';
import { REGION_IDS, getRegion, isRegionId, type RegionId } from '../render/regions';
import { startCombatDemo } from '../render/devCombatDemo';
import type { RenderContext } from '../render/context';
import { DemoHud } from '../ui/hud';

export interface Loop {
  update(dt: number): number;
  onResize(): void;
}

export function startDevDemo(ctx: RenderContext, parent: HTMLElement, params: URLSearchParams): Loop {
  const { diorama, postfx } = ctx;
  const combatMode = params.get('demo') === 'combat';
  const cast = combatMode ? null : createDemoCast(diorama.actors);
  const hud = new DemoHud(parent);
  hud.setHint('1-4 region · Q quality · C chroma pulse · Space scroll');
  const setRegion = (id: RegionId): void => {
    diorama.setRegion(id);
    postfx.setGrade(getRegion(id).grade);
    hud.setRegion(getRegion(id).name);
  };
  const start = params.get('region') ?? 'whisperpine';
  setRegion(isRegionId(start) ? start : 'whisperpine');
  const combat = combatMode ? startCombatDemo(ctx, params) : null;
  if (combat) hud.setRegion(`${getRegion(diorama.region.id).name} · combat demo`);
  const baseScroll = combatMode ? 0 : Number(params.get('scroll') ?? 1.2);
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
      if (cast) cast.ember.surge = 1;
    } else if (e.key === ' ') {
      scrolling = !scrolling;
      diorama.setScroll(scrolling ? baseScroll : 0);
    }
  });
  Object.assign(window.__debug, { setRegion, combat });
  let t = 0;
  return {
    update(dtRaw) {
      combat?.update(dtRaw);
      const dt = combat?.frozen ? 0 : dtRaw;
      t += dt;
      cast?.update(t, dt);
      return dt;
    },
    onResize() {
      combat?.view.onResize();
    },
  };
}
