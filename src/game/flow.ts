// Screen selection from Run state (T-09). Pure: the App renders whatever this returns.
import type { RunStatus } from '../sim';

export type Screen =
  | 'start' | 'story' | 'map' | 'formation' | 'battle' | 'reward' | 'camp' | 'merchant' | 'event' | 'won' | 'lost';

export interface FlowFlags {
  /** the start screen has been dismissed */
  started: boolean;
  /** a Battle is live in the battle controller */
  battleLive: boolean;
  /** an event outcome is on screen and waits for "Continue" (it may have queued a fight) */
  eventOutcomeShown: boolean;
}

export function screenFor(status: RunStatus, f: FlowFlags): Screen {
  if (!f.started) return 'start';
  if (f.eventOutcomeShown) return 'event';
  switch (status) {
    case 'battle': return f.battleLive ? 'battle' : 'formation';
    default: return status;
  }
}

export const NODE_LABEL: Record<string, string> = {
  fight: 'Fight', elite: 'Elite', camp: 'Camp', merchant: 'Merchant', event: 'Event', boss: 'Boss',
};
