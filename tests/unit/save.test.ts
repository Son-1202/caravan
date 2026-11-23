// T-12: save module (localStorage mock).
import { describe, expect, it } from 'vitest';
import { defaultSave, formatTime, loadSave, MAX_BEST, recordRun, SAVE_KEY, withSettings, writeSave, type KV, type RunRecord } from '../../src/game/save';

class MemStore implements KV {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

const throwing: KV = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceeded');
  },
};

const rec = (o: Partial<RunRecord>): RunRecord => ({
  won: false, hard: false, seed: 1, time: 100, regions: 0, regionName: 'Whisperpine Woods', fights: 1, breaks: 0, ignites: 0, damage: 10, relics: [], date: 1, ...o,
});

describe('save', () => {
  it('returns defaults when empty, corrupt or throwing', () => {
    const s = new MemStore();
    expect(loadSave(s)).toEqual(defaultSave());
    s.setItem(SAVE_KEY, '{not json');
    expect(loadSave(s)).toEqual(defaultSave());
    expect(loadSave(throwing)).toEqual(defaultSave());
    expect(loadSave(null)).toEqual(defaultSave());
    expect(writeSave(defaultSave(), throwing)).toBe(false);
  });

  it('round-trips through storage', () => {
    const s = new MemStore();
    let d = recordRun(defaultSave(), rec({ won: true, time: 900 }));
    d = withSettings(d, { volume: 0.3, quality: 'low', speed: 2 });
    expect(writeSave(d, s)).toBe(true);
    const back = loadSave(s);
    expect(back).toEqual(d);
    expect(back.hardUnlocked).toBe(true);
    expect(back.totalWins).toBe(1);
    expect(back.settings).toEqual({ volume: 0.3, quality: 'low', speed: 2 });
  });

  it('keeps the top 5, wins first then fastest', () => {
    let d = defaultSave();
    d = recordRun(d, rec({ won: false, regions: 3, time: 50, date: 1 }));
    d = recordRun(d, rec({ won: true, time: 1200, date: 2 }));
    d = recordRun(d, rec({ won: false, regions: 1, time: 40, date: 3 }));
    d = recordRun(d, rec({ won: true, time: 800, date: 4 }));
    d = recordRun(d, rec({ won: false, regions: 3, time: 90, date: 5 }));
    d = recordRun(d, rec({ won: false, regions: 0, time: 10, date: 6 }));
    d = recordRun(d, rec({ won: true, time: 1000, date: 7 }));
    expect(d.bestRuns).toHaveLength(MAX_BEST);
    expect(d.bestRuns.map((r) => r.date)).toEqual([4, 7, 2, 5, 1]);
    expect(d.totalRuns).toBe(7);
    expect(d.totalWins).toBe(3);
  });

  it('losses do not unlock hard mode; sanitizes bad settings', () => {
    const d = recordRun(defaultSave(), rec({ won: false }));
    expect(d.hardUnlocked).toBe(false);
    const s = new MemStore();
    s.setItem(SAVE_KEY, JSON.stringify({ settings: { volume: 9, quality: 'ultra', speed: 7 }, bestRuns: [{ bogus: 1 }], totalWins: 2 }));
    const back = loadSave(s);
    expect(back.settings).toEqual({ volume: 1, quality: 'auto', speed: 1 });
    expect(back.bestRuns).toEqual([]);
    expect(back.hardUnlocked).toBe(true);
  });

  it('formats time', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(754.4)).toBe('12:34');
  });
});
