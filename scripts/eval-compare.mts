// eval-compare.mts — the A/B gate for a Live prompt change.
//
// Compares one or more BASELINE judge artifacts against one or more VARIANT artifacts (written by
// tests/live-eval-judge.test.ts as eval-out/judge-<label>.json). Pairs by case id, pools reps per
// side, and applies a strict decision rule: a prompt change is only ACCEPTed when quality did not
// regress AND efficiency actually improved AND cost did not rise. Prints per-dimension paired
// deltas + token/cost deltas and exits non-zero on REJECT, so it can gate a merge.
//
// Run (from app/):
//   pnpm eval:compare eval-out/judge-baseline-r1.json,eval-out/judge-baseline-r2.json \
//                     eval-out/judge-cand-r1.json,eval-out/judge-cand-r2.json
//
// Never accept from a single run or a smoke subset — see docs/BENCHMARK.md for the run matrix and
// the noise floor these thresholds are calibrated against.
import { readFileSync } from 'node:fs';
import type { Scorecard, CaseScore } from '../src/live/eval/score';
import { JUDGE_DIMENSIONS, type JudgeScores, type JudgeAggregate } from '../src/live/eval/judge';
import { costUSD, priceFor } from '../src/live/eval/cost';

interface Artifact {
  label: string;
  answerModel: string;
  judgeModel: string;
  mode: string;
  set: string;
  judgeTokens: { in: number; out: number; cached: number; calls: number };
  scorecard: Scorecard;
  judgeAggregate: JudgeAggregate;
  cases: { id: string; structural: CaseScore; judge: JudgeScores | null }[];
}

/** The eight no-regression quality dims. `directness` is the IMPROVEMENT target (a change may aim
 *  to raise it), so it's excluded from the "must not drop" set — but the 0.3 hard floor below still
 *  applies to every dim including it, so a change can't tank directness while claiming to help it. */
const QUALITY_DIMS = JUDGE_DIMENSIONS.filter((d) => d !== 'directness');

// Decision-rule thresholds. Calibrated to the measured noise floor (single-run dim means carry
// ±0.2–0.26; pairing by case id + pooling ≥2 reps a side tightens to ≈±0.15).
const MAX_DIM_DROP = 0.15; // no quality-dim mean may drop more than this (pooled)
const HARD_FLOOR = 0.3; // no dim — incl. directness — may drop more than this under any view
const MAX_OVERALL_DROP = 0.1; // the headline `overall` may not fall more than this
const MAX_PASS_DROP_RATE = 0.037; // structural passRate: ≈2 cases out of 54
const MAX_PER_CASE_REGRESSIONS = 3; // cases where any quality dim fell ≥2 pts vs its own baseline
const TOK_OUT_WIN = 0.1; // efficiency: avg output tokens down ≥10%…
const TOK_IN_WIN = 0.15; // …or avg input tokens down ≥15%…
const DIRECTNESS_WIN = 0.2; // …or directness up ≥0.2

function load(paths: string): Artifact[] {
  return paths
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => JSON.parse(readFileSync(p, 'utf8')) as Artifact);
}

/** Every scored value of one dim across all reps of a side (only cases the judge actually scored). */
function pooledDim(side: Artifact[], dim: (typeof JUDGE_DIMENSIONS)[number]): number[] {
  const xs: number[] = [];
  for (const a of side)
    for (const c of a.cases) if (c.judge && c.judge[dim] > 0) xs.push(c.judge[dim]);
  return xs;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0);
const r2 = (v: number): number => Math.round(v * 100) / 100;
const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Per-case-id mean of a dim across a side's reps — the paired unit. */
function perCaseDim(side: Artifact[], dim: (typeof JUDGE_DIMENSIONS)[number]): Map<string, number> {
  const byId = new Map<string, number[]>();
  for (const a of side)
    for (const c of a.cases)
      if (c.judge && c.judge[dim] > 0) {
        const xs = byId.get(c.id) ?? [];
        xs.push(c.judge[dim]);
        byId.set(c.id, xs);
      }
  const out = new Map<string, number>();
  for (const [id, xs] of byId) out.set(id, mean(xs));
  return out;
}

/** Pooled structural passRate across a side (all rep×case instances). */
function passRate(side: Artifact[]): number {
  let pass = 0;
  let n = 0;
  for (const a of side)
    for (const c of a.cases) {
      n += 1;
      if (c.structural.pass) pass += 1;
    }
  return n ? pass / n : 0;
}

/** Mean of a numeric scorecard field across a side's reps (token means, cache rate). */
function meanCard(side: Artifact[], sel: (s: Scorecard) => number): number {
  const xs = side.map((a) => sel(a.scorecard)).filter((v) => v > 0);
  return mean(xs);
}

/** Answer-side $/case for a side, from its pooled token totals and the model's price. */
function costPerCase(side: Artifact[]): number | null {
  const model = side[0]?.answerModel.split(':').pop() ?? '';
  const price = priceFor(model);
  if (!price) return null;
  let tin = 0;
  let tout = 0;
  let tcached = 0;
  let n = 0;
  for (const a of side) {
    tin += a.scorecard.tokensInTotal;
    tout += a.scorecard.tokensOutTotal;
    tcached += a.scorecard.tokensCachedTotal;
    n += a.scorecard.usageN;
  }
  if (!n) return null;
  return costUSD({ in: tin, out: tout, cached: tcached }, price) / n;
}

function main(): void {
  const [basePaths, varPaths] = process.argv.slice(2);
  if (!basePaths || !varPaths) {
    console.error(
      'usage: pnpm eval:compare <baseline.json[,more...]> <variant.json[,more...]>\n' +
        '  each side may pool several reps (comma-separated). Never gate on a single run.',
    );
    process.exit(2);
  }
  const base = load(basePaths);
  const variant = load(varPaths);

  // An A/B is only valid with the judge, prompt-menu mode, and case set held fixed.
  const pin = (a: Artifact) => `${a.judgeModel}|${a.mode}|${a.set}`;
  const pins = new Set([...base, ...variant].map(pin));
  if (pins.size > 1) {
    console.error(
      `REFUSED: artifacts differ in judge model / mode / set — not comparable:\n  ${[...pins].join('\n  ')}`,
    );
    process.exit(2);
  }
  if (base.length < 2 || variant.length < 2) {
    console.warn(
      `⚠ pooling ${base.length} baseline + ${variant.length} variant rep(s). The gate needs ≥2 a side to clear noise; treat a 1-rep verdict as directional only.`,
    );
  }

  const failures: string[] = [];
  console.log(
    `\n━━━ A/B: baseline (${base.map((a) => a.label).join(', ')})  vs  variant (${variant.map((a) => a.label).join(', ')}) ━━━`,
  );
  console.log(`  judge ${base[0].judgeModel}   mode ${base[0].mode}   set ${base[0].set}`);
  console.log(`\n  dim            baseline  variant   Δ(pooled)  Δ(paired)`);

  for (const dim of JUDGE_DIMENSIONS) {
    const bMean = r2(mean(pooledDim(base, dim)));
    const vMean = r2(mean(pooledDim(variant, dim)));
    const pooledDelta = r2(vMean - bMean);
    // Paired delta: average, over case ids present on both sides, of (variant per-id mean − baseline).
    const bById = perCaseDim(base, dim);
    const vById = perCaseDim(variant, dim);
    const paired: number[] = [];
    for (const [id, v] of vById) if (bById.has(id)) paired.push(v - bById.get(id)!);
    const pairedDelta = r2(mean(paired));
    const flag = pooledDelta < 0 ? (dim === 'directness' ? '' : '↓') : '';
    console.log(
      `  ${dim.padEnd(13)} ${bMean.toFixed(2).padStart(7)}  ${vMean.toFixed(2).padStart(7)}   ${pairedDeltaStr(pooledDelta)}  ${pairedDeltaStr(pairedDelta)} ${flag}`,
    );

    // Hard floor applies to EVERY dim (incl. directness); the tighter 0.15 only to quality dims.
    if (pooledDelta < -HARD_FLOOR)
      failures.push(`${dim} dropped ${pooledDelta} (> hard floor ${HARD_FLOOR})`);
    else if (QUALITY_DIMS.includes(dim as never) && pooledDelta < -MAX_DIM_DROP)
      failures.push(`${dim} dropped ${pooledDelta} (> ${MAX_DIM_DROP})`);
  }

  // Headline overall.
  const bOverall = mean(base.map((a) => a.judgeAggregate.overall));
  const vOverall = mean(variant.map((a) => a.judgeAggregate.overall));
  console.log(
    `\n  overall        ${bOverall.toFixed(2)}  →  ${vOverall.toFixed(2)}   (Δ ${r2(vOverall - bOverall)})`,
  );
  if (vOverall - bOverall < -MAX_OVERALL_DROP)
    failures.push(`overall dropped ${r2(vOverall - bOverall)} (> ${MAX_OVERALL_DROP})`);

  // Structural pass rate.
  const bPass = passRate(base);
  const vPass = passRate(variant);
  console.log(`  passRate       ${pct(bPass)}  →  ${pct(vPass)}   (Δ ${pct(vPass - bPass)})`);
  if (bPass - vPass > MAX_PASS_DROP_RATE)
    failures.push(`passRate dropped ${pct(bPass - vPass)} (> ~2 cases)`);

  // Per-case catastrophic-regression guard: any quality dim down ≥2 pts vs the same case's baseline.
  const regressed = new Set<string>();
  for (const dim of QUALITY_DIMS) {
    const bById = perCaseDim(base, dim);
    const vById = perCaseDim(variant, dim);
    for (const [id, v] of vById) if (bById.has(id) && bById.get(id)! - v >= 2) regressed.add(id);
  }
  console.log(
    `  per-case ≥2 regressions: ${regressed.size}${regressed.size ? ` [${[...regressed].join(', ')}]` : ''}`,
  );
  if (regressed.size > MAX_PER_CASE_REGRESSIONS)
    failures.push(
      `${regressed.size} cases regressed ≥2 pts on a dim (> ${MAX_PER_CASE_REGRESSIONS})`,
    );

  // Efficiency — at least one must clear its bar, or the change bought nothing.
  const bIn = meanCard(base, (s) => s.avgTokensIn);
  const vIn = meanCard(variant, (s) => s.avgTokensIn);
  const bOut = meanCard(base, (s) => s.avgTokensOut);
  const vOut = meanCard(variant, (s) => s.avgTokensOut);
  const bCache = meanCard(base, (s) => s.cacheHitRate);
  const vCache = meanCard(variant, (s) => s.cacheHitRate);
  const inDrop = bIn ? (bIn - vIn) / bIn : 0;
  const outDrop = bOut ? (bOut - vOut) / bOut : 0;
  const directnessGain =
    mean(pooledDim(variant, 'directness')) - mean(pooledDim(base, 'directness'));
  console.log(
    `\n  tokens/case    in ${Math.round(bIn)}→${Math.round(vIn)} (${pct(inDrop)}↓)   out ${Math.round(bOut)}→${Math.round(vOut)} (${pct(outDrop)}↓)   cache ${pct(bCache)}→${pct(vCache)}`,
  );
  const efficiencyWin =
    outDrop >= TOK_OUT_WIN || inDrop >= TOK_IN_WIN || directnessGain >= DIRECTNESS_WIN;
  if (bIn || bOut) {
    if (!efficiencyWin)
      failures.push(
        `no efficiency win (out ${pct(outDrop)}<${pct(TOK_OUT_WIN)}, in ${pct(inDrop)}<${pct(TOK_IN_WIN)}, directness +${r2(directnessGain)}<${DIRECTNESS_WIN})`,
      );
  } else {
    console.log(
      '  ⚠ no token usage in these artifacts — efficiency + cost gates skipped (run with a usage-reporting provider).',
    );
  }

  // Cost must not rise.
  const bCost = costPerCase(base);
  const vCost = costPerCase(variant);
  if (bCost != null && vCost != null) {
    console.log(`  cost/case      $${bCost.toFixed(5)}  →  $${vCost.toFixed(5)}`);
    if (vCost > bCost * 1.001)
      failures.push(`cost/case rose $${bCost.toFixed(5)} → $${vCost.toFixed(5)}`);
  }

  console.log('\n' + '─'.repeat(50));
  if (failures.length) {
    console.log('  ✗ REJECT');
    for (const f of failures) console.log(`    · ${f}`);
    process.exit(1);
  }
  console.log('  ✓ ACCEPT — quality held and efficiency improved.');
}

/** Signed 2-dp delta, padded, with a leading + so a gain reads clearly. */
function pairedDeltaStr(v: number): string {
  const s = (v >= 0 ? '+' : '') + v.toFixed(2);
  return s.padStart(7);
}

main();
