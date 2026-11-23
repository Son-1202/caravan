// Persistent save (T-12): best runs, total wins, hard-mode unlock, settings.
// Pure logic + an injectable Storage so it is unit-testable; every storage access is try/catch'd.

export type QualitySetting = 'auto' | 'high' | 'low';

export interface Settings {
  quality: QualitySetting;
  /** master volume 0..1 */
  volume: number;
  /** default battle speed (1 or 2) */
  speed: number;
}

export interface RunRecord {
  won: boolean;
  hard: boolean;
  seed: number;
  /** wall-clock seconds of the run */
  time: number;
  /** regions cleared (0..4) */
  regions: number;
  regionName: string;
  fights: number;
  breaks: number;
  ignites: number;
  damage: number;
  relics: string[];
  /** epoch ms */
  date: number;
}

export interface SaveData {
  version: 1;
  bestRuns: RunRecord[];
  totalWins: number;
  totalRuns: number;
  hardUnlocked: boolean;
  settings: Settings;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const SAVE_KEY = 'coe.save.v1';
export const MAX_BEST = 5;

export function defaultSettings(): Settings {
  return { quality: 'auto', volume: 0.7, speed: 1 };
}

export function defaultSave(): SaveData {
  return { version: 1, bestRuns: [], totalWins: 0, totalRuns: 0, hardUnlocked: false, settings: defaultSettings() };
}

function browserStorage(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const num = (v: unknown, d: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;

function sanitizeSettings(s: unknown): Settings {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  const o = s as Partial<Settings>;
  const quality = o.quality === 'high' || o.quality === 'low' || o.quality === 'auto' ? o.quality : d.quality;
  const speed = o.speed === 2 ? 2 : 1;
  return { quality, volume: num(o.volume, d.volume, 0, 1), speed };
}

function sanitizeRecord(r: unknown): RunRecord | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Partial<RunRecord>;
  if (typeof o.won !== 'boolean' || typeof o.time !== 'number') return null;
  return {
    won: o.won,
    hard: !!o.hard,
    seed: num(o.seed, 0, 0, 2 ** 32),
    time: num(o.time, 0, 0, 1e9),
    regions: num(o.regions, 0, 0, 4),
    regionName: typeof o.regionName === 'string' ? o.regionName : '',
    fights: num(o.fights, 0, 0, 1e6),
    breaks: num(o.breaks, 0, 0, 1e6),
    ignites: num(o.ignites, 0, 0, 1e6),
    damage: num(o.damage, 0, 0, 1e12),
    relics: Array.isArray(o.relics) ? o.relics.filter((x): x is string => typeof x === 'string') : [],
    date: num(o.date, 0, 0, 1e15),
  };
}

export function loadSave(store: KV | null = browserStorage()): SaveData {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const o = JSON.parse(raw) as Partial<SaveData>;
    const best = Array.isArray(o.bestRuns) ? o.bestRuns.map(sanitizeRecord).filter((x): x is RunRecord => !!x) : [];
    const totalWins = num(o.totalWins, 0, 0, 1e9);
    return {
      version: 1,
      bestRuns: sortRuns(best).slice(0, MAX_BEST),
      totalWins,
      totalRuns: num(o.totalRuns, 0, 0, 1e9),
      hardUnlocked: !!o.hardUnlocked || totalWins > 0,
      settings: sanitizeSettings(o.settings),
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData, store: KV | null = browserStorage()): boolean {
  try {
    if (!store) return false;
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Best first: wins before losses; wins by faster time (hard first on ties); losses by regions cleared, then time. */
export function compareRuns(a: RunRecord, b: RunRecord): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (!a.won && a.regions !== b.regions) return b.regions - a.regions;
  if (a.time !== b.time) return a.won ? a.time - b.time : b.time - a.time;
  if (a.hard !== b.hard) return a.hard ? -1 : 1;
  return a.date - b.date;
}

export function sortRuns(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort(compareRuns);
}

/** Returns a new SaveData with the run recorded (does not write). */
export function recordRun(data: SaveData, rec: RunRecord): SaveData {
  const totalWins = data.totalWins + (rec.won ? 1 : 0);
  return {
    ...data,
    bestRuns: sortRuns([...data.bestRuns, rec]).slice(0, MAX_BEST),
    totalWins,
    totalRuns: data.totalRuns + 1,
    hardUnlocked: data.hardUnlocked || rec.won,
  };
}

export function withSettings(data: SaveData, patch: Partial<Settings>): SaveData {
  return { ...data, settings: sanitizeSettings({ ...data.settings, ...patch }) };
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
