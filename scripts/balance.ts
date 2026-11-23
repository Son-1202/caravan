// Headless balancing harness (T-06): runs N seeded runs per bot and checks the B7 metrics.
// Usage: npm run balance -- [--runs N] [--bot random|greedy|ignite-never] [--seed S] [--out path]
// Always exits 0; writes docs/qa/balance_report.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RELIC_BY_ID, RELICS } from '../src/data';
import { BOT_NAMES, playRun, type BotName, type RunResult } from '../src/sim/bots';

interface Args { runs: number; bots: BotName[]; seed: number; out: string }

function parseArgs(argv: string[]): Args {
  const a: Args = { runs: 5000, bots: [...BOT_NAMES], seed: 1, out: 'docs/qa/balance_report.md' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--runs' && v) { a.runs = Math.max(1, Number.parseInt(v, 10) || a.runs); i++; }
    else if (k === '--bot' && v) {
      if (!(BOT_NAMES as readonly string[]).includes(v)) console.warn(`unknown bot "${v}", using all`);
      else a.bots = [v as BotName];
      i++;
    } else if (k === '--seed' && v) { a.seed = Number.parseInt(v, 10) || 1; i++; }
    else if (k === '--out' && v) { a.out = v; i++; }
  }
  return a;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const avg = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Number.NaN);
const f1 = (x: number): string => (Number.isNaN(x) ? 'n/a' : x.toFixed(1));

interface Row { metric: string; value: string; target: string; pass: boolean | null }

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const results: Partial<Record<BotName, RunResult[]>> = {};
  const timings: Partial<Record<BotName, number>> = {};
  for (const bot of args.bots) {
    const t0 = performance.now();
    const list: RunResult[] = [];
    for (let i = 0; i < args.runs; i++) list.push(playRun(args.seed + i, bot));
    timings[bot] = (performance.now() - t0) / 1000;
    results[bot] = list;
    console.log(`${bot}: ${args.runs} runs in ${timings[bot]?.toFixed(1)} s`);
  }

  const winRate = (b: BotName): number | null => {
    const r = results[b];
    return r ? r.filter((x) => x.won).length / r.length : null;
  };
  const rows: Row[] = [];
  const wr = (b: BotName, lo: number, hi: number): void => {
    const w = winRate(b);
    rows.push({ metric: `Win rate ${b}`, value: w === null ? 'not run' : pct(w), target: `${lo}–${hi}%`, pass: w === null ? null : w >= lo / 100 && w <= hi / 100 });
  };
  wr('random', 20, 35);
  wr('greedy', 65, 85);
  const g = winRate('greedy');
  const n = winRate('ignite-never');
  rows.push({
    metric: 'ignite-never vs greedy',
    value: g === null || n === null ? 'not run' : `${pct(n)} (${((g - n) * 100).toFixed(1)} pts below)`,
    target: '≥ 15 pts below greedy',
    pass: g === null || n === null ? null : g - n >= 0.15,
  });

  // Relic shares among greedy runs (fallback: first bot that ran).
  const relicBot: BotName = results.greedy ? 'greedy' : (args.bots[0] as BotName);
  const rr = results[relicBot] ?? [];
  const share = (runs: readonly RunResult[]): Map<string, number> => {
    const m = new Map<string, number>();
    let total = 0;
    for (const r of runs) for (const id of r.relics) { m.set(id, (m.get(id) ?? 0) + 1); total++; }
    for (const [k, v] of m) m.set(k, v / Math.max(1, total));
    return m;
  };
  const base = share(rr);
  const wins = share(rr.filter((r) => r.won));
  const relicRows = RELICS.map((def) => {
    const b = base.get(def.id) ?? 0;
    const w = wins.get(def.id) ?? 0;
    const ratio = b > 0 ? w / b : Number.NaN;
    return { id: def.id, b, w, ratio, pass: Number.isNaN(ratio) || ratio <= 1.5 };
  });
  const worst = relicRows.filter((r) => !Number.isNaN(r.ratio)).sort((a, b) => b.ratio - a.ratio)[0];
  const winsCount = rr.filter((r) => r.won).length;
  rows.push({
    metric: `Max relic win-share ratio (${relicBot})`,
    value: worst ? `${worst.ratio.toFixed(2)}× (${RELIC_BY_ID[worst.id]?.name ?? worst.id})` : 'n/a',
    target: '≤ 1.5× baseline',
    pass: worst && winsCount > 0 ? relicRows.every((r) => r.pass) : null,
  });

  // Fight durations across all bots that ran.
  const all = Object.values(results).flat() as RunResult[];
  const fights = all.flatMap((r) => r.fights);
  const normal = avg(fights.filter((f) => f.kind === 'normal').map((f) => f.durationSec));
  const boss = avg(fights.filter((f) => f.kind === 'boss' || f.kind === 'final').map((f) => f.durationSec));
  rows.push({ metric: 'Avg normal fight', value: `${f1(normal)} s`, target: '15–35 s', pass: Number.isNaN(normal) ? null : normal >= 15 && normal <= 35 });
  rows.push({ metric: 'Avg boss fight (R1–R3 + HK)', value: `${f1(boss)} s`, target: '45–90 s', pass: Number.isNaN(boss) ? null : boss >= 45 && boss <= 90 });

  const hk = fights.filter((f) => f.kind === 'final');
  for (const ph of [1, 2, 3]) {
    const r = hk.length ? hk.filter((f) => f.bossPhase >= ph).length / hk.length : Number.NaN;
    rows.push({ metric: `Hollow King phase ${ph} triggers`, value: Number.isNaN(r) ? 'n/a' : `${pct(r)} of ${hk.length}`, target: '> 90%', pass: Number.isNaN(r) ? null : r > 0.9 });
  }

  const md = report(args, rows, relicRows, relicBot, results, timings, fights);
  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);

  console.log('\nB7 balance summary');
  for (const r of rows) console.log(`  ${r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.metric}: ${r.value} (target ${r.target})`);
  console.log(`\nreport → ${args.out}`);
}

function report(
  args: Args, rows: Row[],
  relicRows: Array<{ id: string; b: number; w: number; ratio: number; pass: boolean }>,
  relicBot: BotName, results: Partial<Record<BotName, RunResult[]>>, timings: Partial<Record<BotName, number>>,
  fights: RunResult['fights'],
): string {
  const L: string[] = [];
  L.push('# Balance report (B7)', '');
  L.push(`- Date: ${new Date().toISOString().slice(0, 10)}`);
  L.push(`- Runs per bot: ${args.runs} (seeds ${args.seed}–${args.seed + args.runs - 1})`);
  L.push(`- Bots: ${args.bots.map((b) => `${b} (${timings[b]?.toFixed(1)} s)`).join(', ')}`);
  L.push('- Generated by `npm run balance` (scripts/balance.ts). Fight durations are sim seconds at 1×, pooled over all bots.', '');
  L.push('## Metrics', '', '| Metric | Value | Target | Result |', '|---|---|---|---|');
  for (const r of rows) L.push(`| ${r.metric} | ${r.value} | ${r.target} | ${r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'} |`);
  L.push('', `## Relics (${relicBot})`, '', 'Share = fraction of all held relics. Ratio = share among wins / baseline share among all runs.', '');
  L.push('| Relic | Baseline share | Share in wins | Ratio | Result |', '|---|---|---|---|---|');
  for (const r of relicRows) {
    L.push(`| ${RELIC_BY_ID[r.id]?.name ?? r.id} | ${pct(r.b)} | ${pct(r.w)} | ${Number.isNaN(r.ratio) ? 'n/a' : `${r.ratio.toFixed(2)}×`} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  }
  L.push('', '## Run outcomes per region', '', '| Bot | Won | Died R1 | Died R2 | Died R3 | Died R4 | Avg encounters | Avg relics | Avg battle time |', '|---|---|---|---|---|---|---|---|---|');
  for (const b of args.bots) {
    const rs = results[b] ?? [];
    const died = (reg: number) => pct(rs.filter((r) => !r.won && r.regionReached === reg).length / Math.max(1, rs.length));
    L.push(`| ${b} | ${pct(rs.filter((r) => r.won).length / Math.max(1, rs.length))} | ${died(1)} | ${died(2)} | ${died(3)} | ${died(4)} | ${f1(avg(rs.map((r) => r.encounters)))} | ${f1(avg(rs.map((r) => r.relics.length)))} | ${f1(avg(rs.map((r) => r.totalTime)))} s |`);
  }
  L.push('', '## Fights by kind (all bots)', '', '| Kind | Count | Avg duration | Win rate | Avg ignites | Avg breaks |', '|---|---|---|---|---|---|');
  for (const k of ['normal', 'elite', 'boss', 'final'] as const) {
    const fs = fights.filter((f) => f.kind === k);
    L.push(`| ${k} | ${fs.length} | ${f1(avg(fs.map((f) => f.durationSec)))} s | ${pct(fs.filter((f) => f.won).length / Math.max(1, fs.length))} | ${f1(avg(fs.map((f) => f.ignites)))} | ${f1(avg(fs.map((f) => f.breaks)))} |`);
  }
  L.push('');
  return L.join('\n');
}

main();
