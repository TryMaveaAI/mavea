// score.ts — pure grading of a Live answer against a GoldenCase.
//
// No I/O. Given a case and the validated LiveResponse (or null when the model's
// output was unsalvageable), produce a CaseScore. Aggregate many into a
// Scorecard. This is the artifact that lets us SAY "accurate" with a number
// instead of a vibe — it is unit-tested in score.test.ts and consumed by the
// live runner (run.ts).
import { FRONTIER_BLOCK_TYPES, type LiveResponse } from '../../engine/liveSchema';
import type { GoldenCase } from './golden';
import { catalogFacts } from '../../canvas/blocks/catalog';

/** The eight base types every tier fills; everything else counts as "rich" vocabulary. */
const BASE_TYPES = new Set([
  'insight',
  'chart',
  'breakdown',
  'list',
  'timeline',
  'compare',
  'kpi',
  'ring',
]);

/** The always-on standard dozen (base eight + the frontier cousins bars/stack/donut/gauge). A
 *  block OUTSIDE this set is a "specialized" component — the hand-built-demo visuals the library
 *  exists for. This is the STRICT counterpart to BASE_TYPES: it matches the verify.ts variety
 *  floor, so the eval's specialized metrics speak the same language as the runtime gate. */
const STANDARD_TYPES: ReadonlySet<string> = FRONTIER_BLOCK_TYPES;

/** A specialized component for the diversity metrics — the same definition the runtime variety
 *  gate uses (verify.ts): outside the standard dozen, and not the non-visual `action` button. */
function isSpecialized(t: string): boolean {
  return !STANDARD_TYPES.has(t) && t !== 'action';
}

/** The grade for one case. `pass` is the headline: all hard invariants hold. */
export interface CaseScore {
  id: string;
  domain: string;
  /** validateLiveResponse returned a renderable response (not null). */
  valid: boolean;
  /** Block count within the case's [min,max] (defaults 2..5). */
  countOk: boolean;
  /** At least one expected block type is present. */
  expectedPresent: boolean;
  /** No forbidden block type is present (e.g. chart for a category split). */
  noForbidden: boolean;
  /** Honest labeling: for estimate-only asks, no unsourced conf:'strong'. */
  honest: boolean;
  /** No block type repeated. INFORMATIONAL ONLY — a repeat is NOT a defect: reusing the best-fit
   *  component for two distinct pieces of content (two timelines, two comparisons) is correct.
   *  Tracked only to spot a degenerate all-one-type answer, never gated. */
  noRepeat: boolean;
  /** The block types the model actually produced, in order (for the report). */
  produced: string[];
  /** Distinct block types in the answer (variety). */
  varietyCount: number;
  /** Blocks beyond the base eight — reach into the rich vocabulary. */
  richCount: number;
  /** Blocks beyond the standard DOZEN (base eight + bars/stack/donut/gauge) — the specialized
   *  components a generic chatbot never reaches for. Stricter than richCount; matches the gate. */
  specializedCount: number;
  /** Blocks whose component is interactive (tabs, pickers, sliders…). */
  interactiveCount: number;
  /** Overall hard pass: valid && countOk && expectedPresent && noForbidden && honest. */
  pass: boolean;
  /** Wall-clock for the whole turn, ms. Set by the runner, not derivable here. */
  latencyMs?: number;
  /** Time to first token / first spoken word, ms. The number that decides "feels real-time". */
  ttftMs?: number;
  /** Token usage for the ANSWER call, when the adapter reported it (gemini + OpenAI-style
   *  providers do; others leave these undefined). Set by the runner, like latencyMs — the
   *  numbers that let a prompt change prove it saved cost, not just "felt leaner". */
  tokensIn?: number;
  tokensOut?: number;
  /** Input tokens billed at the cheap cached rate (prefix caching). 0 = cold, undefined = unreported. */
  tokensCached?: number;
}

const DEFAULT_MIN = 2;
const DEFAULT_MAX = 5;

/**
 * How well the model USED the specialized hero components the selector offered — the gap between
 * selection-as-designed and answer-as-rendered (a perfect selector is wasted if the model ignores it).
 * `offered` is the per-turn menu's types; `produced` is the answer's block types. Returns the count of
 * DISTINCT offered heroes (non-standard-dozen) that made it into the answer and the rate over what was
 * offered — 0 when none were offered (e.g. a lean ask). A low rate across a run means good menus,
 * stubborn model: the lever is the prompt, not the selector.
 */
export function heroUsage(
  offered: readonly string[],
  produced: readonly string[],
): { offered: number; used: number; rate: number } {
  const heroes = new Set(offered.filter(isSpecialized));
  if (heroes.size === 0) return { offered: 0, used: 0, rate: 0 };
  const prod = new Set(produced);
  let used = 0;
  for (const h of heroes) if (prod.has(h)) used += 1;
  return { offered: heroes.size, used, rate: Math.round((used / heroes.size) * 1000) / 1000 };
}

/** Grade one case. `resp === null` means the model output was unsalvageable. */
export function scoreCase(c: GoldenCase, resp: LiveResponse | null): CaseScore {
  const produced = resp ? resp.blocks.map((b) => b.type) : [];
  const valid = resp !== null;

  const min = c.minBlocks ?? DEFAULT_MIN;
  const max = c.maxBlocks ?? DEFAULT_MAX;
  const countOk = valid && produced.length >= min && produced.length <= max;

  const expectedPresent = produced.some((t) => c.expectBlock.includes(t));
  const forbid = c.forbidBlock ?? [];
  const noForbidden = !produced.some((t) => forbid.includes(t));

  // Honesty: an estimate-only answer must never present a number as a verified
  // fact. The schema rule is "no conf:'strong' without a backing source".
  let honest = true;
  if (c.estimateOnly && resp) {
    const strongUnsourced = resp.blocks.some(
      (b) =>
        b.type === 'insight' &&
        b.props.conf === 'strong' &&
        !(b.props.sources && b.props.sources.length > 0),
    );
    honest = !strongUnsourced;
  }

  const seen = new Set<string>();
  let noRepeat = true;
  for (const t of produced) {
    if (seen.has(t)) {
      noRepeat = false;
      break;
    }
    seen.add(t);
  }

  // Richness — reported, NOT gated (pass stays the five hard invariants above).
  const varietyCount = new Set(produced).size;
  const richCount = produced.filter((t) => !BASE_TYPES.has(t)).length;
  const specializedCount = produced.filter(isSpecialized).length;
  const interactiveCount = produced.filter((t) => catalogFacts(t)?.interactive).length;

  const pass = valid && countOk && expectedPresent && noForbidden && honest;

  return {
    id: c.id,
    domain: c.domain,
    valid,
    countOk,
    expectedPresent,
    noForbidden,
    honest,
    noRepeat,
    produced,
    varietyCount,
    richCount,
    specializedCount,
    interactiveCount,
    pass,
  };
}

/** Aggregate metrics across a model's run. Rates are 0..1. */
export interface Scorecard {
  model: string;
  n: number;
  validRate: number;
  countRate: number;
  selectionRate: number; // expectedPresent && noForbidden
  honestRate: number;
  noRepeatRate: number;
  passRate: number;
  /** Mean distinct block types per answer (variety). Reported, not gated. */
  avgVariety: number;
  /** Fraction of answers that used at least one rich (non-base) component. */
  richRate: number;
  /** Mean specialized (non-standard-dozen) components per answer. */
  avgSpecialized: number;
  /** Fraction of answers that reached at least one specialized component. */
  specializedRate: number;
  /** LIBRARY SPREAD — the count of DISTINCT specialized components used ACROSS THE WHOLE RUN.
   *  This is the headline answer to "we have 269 components but only ever use ten": a higher
   *  number means the run toured more of the library instead of collapsing to the same few. */
  librarySpread: number;
  /** Fraction of answers that used at least one interactive component. */
  interactiveRate: number;
  /** Latency percentiles (ms) across cases that reported timing. 0 if none did. */
  ttftP50: number;
  ttftP95: number;
  totalP50: number;
  totalP95: number;
  /** Cases that reported token usage — the denominator for the token means. 0 = no usage captured
   *  (e.g. an anthropic-only run before the adapter reported it, or a provider that never does). */
  usageN: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  tokensCachedTotal: number;
  /** Mean tokens per case over the cases that reported usage; 0 when none did. */
  avgTokensIn: number;
  avgTokensOut: number;
  /** Fraction of input tokens billed at the cached rate across the run (0..1) — the cache payoff. */
  cacheHitRate: number;
  byDomain: Record<string, { n: number; pass: number }>;
  cases: CaseScore[];
}

function rate(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

/** Nearest-rank percentile over a numeric sample; 0 for an empty sample. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return Math.round(sorted[idx]);
}

export function aggregate(model: string, scores: CaseScore[]): Scorecard {
  const n = scores.length;
  const byDomain: Record<string, { n: number; pass: number }> = {};
  for (const s of scores) {
    const d = (byDomain[s.domain] ??= { n: 0, pass: 0 });
    d.n += 1;
    if (s.pass) d.pass += 1;
  }
  const ttfts = scores.map((s) => s.ttftMs).filter((v): v is number => typeof v === 'number');
  const totals = scores.map((s) => s.latencyMs).filter((v): v is number => typeof v === 'number');
  // The union of every specialized component the run reached — the library-coverage headline.
  const specializedSeen = new Set<string>();
  for (const s of scores) for (const t of s.produced) if (isSpecialized(t)) specializedSeen.add(t);
  // Token totals over only the cases that reported usage, so a mixed run (some providers report,
  // some don't) still gives an honest mean rather than dividing by cases that never had numbers.
  const withUsage = scores.filter((s) => typeof s.tokensIn === 'number');
  const tokensInTotal = withUsage.reduce((a, s) => a + (s.tokensIn ?? 0), 0);
  const tokensOutTotal = withUsage.reduce((a, s) => a + (s.tokensOut ?? 0), 0);
  const tokensCachedTotal = withUsage.reduce((a, s) => a + (s.tokensCached ?? 0), 0);
  return {
    model,
    n,
    validRate: rate(scores.filter((s) => s.valid).length, n),
    countRate: rate(scores.filter((s) => s.countOk).length, n),
    selectionRate: rate(scores.filter((s) => s.expectedPresent && s.noForbidden).length, n),
    honestRate: rate(scores.filter((s) => s.honest).length, n),
    noRepeatRate: rate(scores.filter((s) => s.noRepeat).length, n),
    passRate: rate(scores.filter((s) => s.pass).length, n),
    avgVariety:
      n === 0 ? 0 : Math.round((scores.reduce((a, s) => a + s.varietyCount, 0) / n) * 10) / 10,
    richRate: rate(scores.filter((s) => s.richCount > 0).length, n),
    avgSpecialized:
      n === 0 ? 0 : Math.round((scores.reduce((a, s) => a + s.specializedCount, 0) / n) * 10) / 10,
    specializedRate: rate(scores.filter((s) => s.specializedCount > 0).length, n),
    librarySpread: specializedSeen.size,
    interactiveRate: rate(scores.filter((s) => s.interactiveCount > 0).length, n),
    ttftP50: percentile(ttfts, 50),
    ttftP95: percentile(ttfts, 95),
    totalP50: percentile(totals, 50),
    totalP95: percentile(totals, 95),
    usageN: withUsage.length,
    tokensInTotal,
    tokensOutTotal,
    tokensCachedTotal,
    avgTokensIn: withUsage.length ? Math.round(tokensInTotal / withUsage.length) : 0,
    avgTokensOut: withUsage.length ? Math.round(tokensOutTotal / withUsage.length) : 0,
    cacheHitRate: tokensInTotal ? Math.round((tokensCachedTotal / tokensInTotal) * 1000) / 1000 : 0,
    byDomain,
    cases: scores,
  };
}

/** Render a Scorecard as a compact, human-readable console report. */
export function formatScorecard(card: Scorecard): string {
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`\n━━━ Live accuracy: ${card.model}  (n=${card.n}) ━━━`);
  lines.push(`  valid JSON     ${pct(card.validRate)}`);
  lines.push(`  block count    ${pct(card.countRate)}`);
  lines.push(`  block choice   ${pct(card.selectionRate)}   ← the hard one`);
  lines.push(`  honest labels  ${pct(card.honestRate)}`);
  lines.push(`  no-repeat      ${pct(card.noRepeatRate)}   (info only — fit-driven reuse is fine)`);
  lines.push(`  avg variety    ${card.avgVariety} types/answer`);
  lines.push(`  rich vocab     ${pct(card.richRate)}   interactive ${pct(card.interactiveRate)}`);
  lines.push(
    `  specialized    ${card.avgSpecialized}/answer   ${pct(card.specializedRate)} of answers reach one`,
  );
  lines.push(
    `  library spread ${card.librarySpread} distinct specialized components across the run   ← the "only ten" number`,
  );
  if (card.ttftP50 || card.totalP50) {
    lines.push(`  ─────────────────────────`);
    lines.push(`  speed (feels real-time?)`);
    lines.push(`    first word   p50 ${card.ttftP50}ms   p95 ${card.ttftP95}ms`);
    lines.push(`    full canvas  p50 ${card.totalP50}ms   p95 ${card.totalP95}ms`);
  }
  if (card.usageN) {
    lines.push(`  ─────────────────────────`);
    lines.push(
      `  tokens/case    in ${card.avgTokensIn}   out ${card.avgTokensOut}   cache ${pct(card.cacheHitRate)}   (${card.usageN}/${card.n} reporting)`,
    );
    lines.push(`  tokens total   in ${card.tokensInTotal}   out ${card.tokensOutTotal}`);
  }
  lines.push(`  ─────────────────────────`);
  lines.push(`  OVERALL PASS   ${pct(card.passRate)}`);
  lines.push(`  by domain:`);
  for (const [d, v] of Object.entries(card.byDomain)) {
    lines.push(`    ${d.padEnd(10)} ${v.pass}/${v.n}`);
  }
  const fails = card.cases.filter((c) => !c.pass);
  if (fails.length) {
    lines.push(`  failures:`);
    for (const f of fails) {
      const why: string[] = [];
      if (!f.valid) why.push('invalid');
      if (!f.countOk) why.push(`count=${f.produced.length}`);
      if (!f.expectedPresent) why.push('wrong-type');
      if (!f.noForbidden) why.push('forbidden-type');
      if (!f.honest) why.push('unsourced-strong');
      lines.push(`    ✗ ${f.id.padEnd(22)} [${f.produced.join(', ')}]  ${why.join(', ')}`);
    }
  }
  return lines.join('\n');
}
