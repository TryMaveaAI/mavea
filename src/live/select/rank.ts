// rank.ts — choose the handful of components this turn should offer the model.
//
// This is the "rank" half of retrieve-then-rank and the one public entry of the brain.
// Given the question and the model tier it classifies the data shapes, then DRAWS a
// varied menu from the catalog and hands back the three things the generation path needs
// — the type enum, the prompt menu, and the validator gate. It ALWAYS includes the base
// floor so there is a coercible option no matter what, and it never throws: any failure
// resolves to the SAFE_SET, so a selector bug can only ever fall back to today's behavior.
//
// Why a WEIGHTED RANDOM DRAW instead of a deterministic top-K: with a fixed score the
// same high-"wow" types won the menu every single turn (and for a vague ask, where shape
// fit is zero for everything, the menu collapsed to the identical pure-wow top-K). So of
// 269 components only ~10–15 ever appeared. Sampling proportional to a weight that is
// biased toward the cooler / more advanced / not-recently-shown components keeps the menu
// fitting and impressive while making it DIFFERENT every turn — the same question asked
// twice reaches for different cool visuals, and the long tail finally gets surfaced. The
// model still makes the final semantic pick, and the base floor is always present, so a
// novel-but-ill-fitting candidate can never break or empty the canvas.
import type { ComponentMeta, ItemSpec } from '../../canvas/blocks/catalog/meta';
import type { ComponentFacts } from '../../canvas/blocks/catalog/facts';
import { catalogMeta } from '../../canvas/blocks/catalog/lookup';
import { ensureDetails } from '../../canvas/blocks/catalog/details';
import type { ChatMessage } from '../providers/types';
import { detectShapes, detectRequested, type ShapeVector } from './shapes';
import type { AskComplexity } from './complexity';
import { ensureExamples, exampleFor } from './examples';
import {
  ARCHETYPE_BASE,
  BASE_FLOOR,
  SAFE_SET,
  COERCIBLE_TYPES,
  tierPool,
  type ModelTier,
} from './catalog';
import { detectDomains, domainFitsOrNeutral, blockDomainsOf, isCrisis } from './domains';
import { detectSpecialists } from './specialists';
import { analyzeIntent, intentTokens } from './intent';
import { contentBudgetPromptClause } from '../../canvas/blocks/catalog/contentBudget';

export interface SelectionResult {
  /** The component types exposed this turn → the adapter's blockTypes enum. */
  types: string[];
  /** The compact "you may also use these" menu appended to the system prompt. */
  promptSnippet: string;
  /** The gate validateLiveResponse uses — exactly the types we exposed. */
  allowed: ReadonlySet<string>;
  /** The strongest data-shape fit among the candidates (0 = the ask matched no shape any
   *  component is built for). The synthesis trigger reads this to decide whether to offer
   *  on-the-fly composition when nothing registered fits. */
  bestFit: number;
}

// How many RICH components to draw on top of the always-present base floor. A rich ask
// gets a generous, varied menu (the model picks the fitting few); a lean ask (trivial
// fact / arithmetic) gets a small focused one so a one-line answer isn't padded out.
//
// SIZED BY MEASUREMENT, not generosity. At 30 heroes the menu ran 25-31k chars — over half the
// entire request, all of it OUTSIDE the provider's cached prefix, so every turn re-paid ~7k
// tokens of prompt processing for lines the model read once and mostly ignored (a canvas builds
// ~9 blocks). 16 keeps the variety mandate real — the base floor rides on top, pins and strong
// fits are unaffected — while cutting the single largest slice of time-to-first-token.
// mid keeps its proven 24: the reachability suite shows 18 stops the battery from ever surfacing
// the quieter status/display visuals, and mid models are not the latency path measured above.
const K_BY_TIER: Record<ModelTier, number> = { small: 8, mid: 24, frontier: 18 };
const LEAN_K = 3;
/** Keep the menu broad across the library: at most this many picks from any one family… */
const FAMILY_CAP = 2;
/** …and at most this many sharing an ARCHETYPE — the visual form a component takes (table, trend,
 *  map, steps…). Clustering on the form rather than on the primary data shape is what stops a menu
 *  of five near-identical tables: `datatable`, `receipt`, `invoice`, and `pricingtable` are one
 *  form wearing four names, and the model reading four overlapping descriptions picks worse, not
 *  better. It also frees genuinely-different forms that happen to share a shape — a trend line, a
 *  bar chart, and a scatter all render `series`, yet each says something the others can't — so the
 *  menu spans real visual contrast instead of collapsing on the data's type. */
const ARCHETYPE_CAP = 2;

// Weight = fitFactor · wowPull · advancedBoost · noveltyPenalty. Tuned so FIT LEADS: a
// clearly shape-fitting component dominates the draw, and a flashy component that fits the
// content stays likely — but a flashy component that fits NOTHING can no longer outrank a
// plain one that does. (Audit finding: with W_FIT=1, WOW_EXP=1.4 a wow≈1 zero-fit block beat
// a good-fit wow≈0.4 block ~4×, so on a shaped ask the model was handed striking-but-wrong
// visuals. Raising the fit multiplier and softening the wow exponent flips that ordering.)
const W_FIT = 1.6; //          each matched shape point multiplies the weight up (fit leads)
const WOW_EXP = 1.2; //        wow still pulls, but no longer steamrolls a real fit
// INTENT FIT — the join the selector was missing. A vague-but-purposeful ask ("is this friendship
// draining?", "should I take the job?", "best laptop for college") often trips NO data shape, so
// shape fit is 0 and the draw collapses to wow-random (the "slot machine" on ~half of real traffic).
// But analyzeIntent DOES read the user's need (reflect / decide / compare / plan…), and 140 of the
// catalog's components are tagged with the intents they serve. Folding that overlap into the fit
// score ANCHORS those asks on components built for the need — without any data shape, model call, or
// added latency. INTENT_FIT_W counts each matched intent toward the relevance score (pins + no-fit
// damp + menu order); INTENT_DRAW_W additionally biases the random draw toward intent-matching
// components. A truly open ask ("surprise me") carries no intent, so it stays fully varied.
// Checked against learned weights, not just intuition: a logistic RankSVM fit on 288 judged pairs
// (`pnpm weights:selection`) recovers intentPts/shapeFit ≈ 0.58 against the 1.0 used here, but it
// overfits — 58.6% train vs 48.5% holdout agreement, worse than these constants' 55.2%. So the
// hand-tuned values stay until there are enough labels to separate them honestly. Re-run the fitter
// before changing them; adopt only on a ≥2-point holdout win plus a green accuracy battery.
const INTENT_FIT_W = 1.0;
const INTENT_DRAW_W = 0.6;
// SEMANTIC FIT — the on-device embedder's cosine for the components it judged most relevant (the map
// is already the top-K above the embedder's noise floor). It catches the vague/novel asks that trip
// no shape or intent keyword (a guitar-chord ask → chorddiagram, "explain how a black hole works" →
// a teaching diagram). Static-embedding cosines are modest (≈0.2–0.7) and a touch noisy, so it is a
// BOUNDED, ADDITIVE boost only: SEM_FIT_W scales a cosine into the same units as a shape point (so a
// 0.5 match ≈ one shape point of relevance), and it never pins as the sole lead nor removes a real
// shape/intent fit. Absent (cold/weak device) → zero, i.e. exactly today's behaviour.
const SEM_FIT_W = 2.0;
const SEM_DRAW_W = 0.8;
const ADV_TIER: Record<string, number> = { base: 1.0, frontier: 1.3, cutting: 1.6 };
const ADV_INTERACTIVE = 1.2; // nudge interactive CONTENT components (tabs, quiz, datatable, geomap)
const RECENT_PENALTY = 0.3; //  a NO-FIT type shown in the last turn(s) is far less likely to recur
// A learned per-user lesson (opt-in memory) nudges the weighted draw: a block type the user
// preferred is likelier, one they corrected away from is rarer. ADVISORY ONLY — it multiplies the
// random draw, never the guaranteed pins (strong shape fit + explicit requests) nor the always-
// merged base floor, so a lesson can never override a real fit or empty the canvas.
const PREFER_BOOST = 2.5;
const AVOID_DAMP = 0.3;
// Shared empty lesson set — the default when weightFor is called without an opt-in lesson (e.g. tests).
const NO_LESSON: ReadonlySet<string> = new Set();
// When the ask HAS a clear data shape (some component genuinely fits), a cool component that
// fits NOTHING is damped to this fraction of its weight — so the menu the model reads is mostly
// relevant and it stops leading with a striking-but-nonsensical visual (a candlestick for a
// recipe, a sports pitch for rehab). It's a damp, not a ban: the long tail still surfaces, just
// less often. A VAGUE ask (nothing fits anything) keeps full randomness, so variety is preserved
// exactly where there's no fit to honor. This is the menu-side complement to the catalog's
// "Never for …" redirects (the model-side guard). Tightened (was 0.4): on a shaped ask the menu
// should be dominated by relevant components, with only the occasional off-shape flourish.
// Exported so the "fit beats flash" invariant (a fitting plain block outranks a flashy off-shape
// one once this damp applies) can be unit-tested at the exact weight the selector uses.
export const NOFIT_DAMP_WHEN_FITS_EXIST = 0.2;

// TEACHING KIT — the small set of learn-family specialists a shaped lesson arc leans on: a
// growing-figure diagram for the mechanism beat, a worked problem carried to a result, a recall
// check, and (for vocab/fact-heavy subjects) flip cards. Pinned into the menu via the SAME
// guaranteed-pin mechanism as an explicit format request or a content specialist — see `teaching`
// on SelectionInput. Exact catalog type-ids, confirmed against catalog/families/learn.ts.
export const TEACHING_KIT: readonly string[] = [
  'teachdiagram',
  'workedexample',
  'quiz',
  'flashcard',
];
// A small nudge to the learn family's draw weight on a teaching turn — enough that its
// specialists compete harder for the budget beyond the guaranteed kit pins above, without
// overriding a genuine shape/intent fit elsewhere (WOW_EXP/W_FIT still dominate).
const TEACH_FAMILY_BOOST = 1.4;

// App-construction widget families — navigation, form inputs, pickers, and overlays. They build
// UIs; they are almost never the right way to EXPLAIN an informational answer, yet a model pushed
// to add variety will jam a `sidenav`, `select`, or `modal` into a recipe (measured: the variety
// gate, maximizing component COUNT, dragged in exactly this chrome). Excluded from the Live hero
// pool so the menu offers explanatory visuals — charts, diagrams, tables, maps — not UI furniture.
// The catalog keeps them for the gallery and any future "design me a screen" ask.
const CHROME_FAMILIES = new Set(['nav', 'forms', 'pickers', 'overlays']);

/** The few genuine UI WIDGETS that live in otherwise-CONTENT families (display / status / layout):
 *  keyboard hints, loading spinners + skeletons, slider / range / rating INPUTS, segmented toggles,
 *  toasts, empty-state placeholders, and bare separators. Listed by TYPE, not family: nearly every
 *  display/status member is flagged `interactive`, so a family+interactive rule wrongly swept up the
 *  real explanatory visuals (progressbar, stepindicator, statustimeline, healthgrid, notification,
 *  badgeset, avatar…) those carry real data shapes and ship in demos, so they STAY reachable. Only
 *  true furniture is named here. (Genuinely-new chrome almost always lands in a CHROME_FAMILIES
 *  family and is excluded automatically; this short list covers the content-family strays.) */
const CHROME_TYPES = new Set([
  'kbd',
  'spinner',
  'skeleton',
  'sliderinput',
  'rangefilter',
  'ratinginput',
  'emptystate',
  'segmented',
  'toaststack',
  'divider',
  'spacer',
]);

/** True when a component is UI chrome rather than an explanatory visual for a Live answer. */
function isChrome(m: ComponentFacts): boolean {
  return CHROME_FAMILIES.has(m.family) || CHROME_TYPES.has(m.type);
}

/** How strongly a component's data shapes match the ones detected in the ask. */
export function shapeFitOf(meta: ComponentFacts, shapes: ShapeVector): number {
  let sum = 0;
  for (const shape of meta.dataShapes) sum += shapes[shape] ?? 0;
  return sum;
}

/** The three relevance signals the selector combines into one score. Broken out so the offline
 *  weight-fitter (scripts/fit-selection-weights.mts) learns the coefficients of the SAME formula the
 *  selector evaluates — the two can never silently drift apart. */
export interface FitFeatures {
  /** Data-shape overlap between the ask and the component. */
  shapeFit: number;
  /** How many of the ask's intents (reflect / decide / compare / plan…) the component serves. */
  intentPts: number;
  /** The on-device embedder's cosine, 0 when it hasn't loaded or didn't rank this component. */
  semFit: number;
}

/** The COMBINED relevance score — linear in its features, which is what makes it learnable from
 *  pairwise preferences (a logistic fit on feature differences) and what makes the near-tie band
 *  meaningful: two components with the same score are genuinely equally apt. */
export function combinedFit(f: FitFeatures): number {
  return f.shapeFit + INTENT_FIT_W * f.intentPts + SEM_FIT_W * f.semFit;
}

/** The draw weight for one component — strictly positive so every coercible component
 *  keeps a chance, but heavily biased toward fitting + cool + advanced + unseen. Exported so the
 *  fit-gated novelty rule (FIT dominates RECENCY) can be unit-tested directly. `preferred`/`avoided`
 *  are the opt-in per-user lesson (default empty) — an advisory nudge that never overrides a fit.
 *  `teaching` (default off) is the same gate `chooseComponents` uses for the kit pins — a small
 *  multiplier on the learn family only, never a new scoring dimension. */
export function weightFor(
  meta: ComponentFacts,
  shapes: ShapeVector,
  recent: ReadonlySet<string>,
  preferred: ReadonlySet<string> = NO_LESSON,
  avoided: ReadonlySet<string> = NO_LESSON,
  teaching = false,
): number {
  const fitPts = shapeFitOf(meta, shapes);
  const fit = 1 + W_FIT * fitPts;
  const wow = Math.pow(Math.max(0, meta.wowWeight), WOW_EXP);
  const adv = (ADV_TIER[meta.tier] ?? 1) * (meta.interactive ? ADV_INTERACTIVE : 1);
  // FIT DOMINATES RECENCY. A recently-shown type is damped ONLY when it also fits NOTHING this
  // turn — that's the lazy-default that drives the "same ten components" collapse. A component
  // that genuinely fits the data keeps full weight even if it recurred, so the right tool is
  // never passed over for a fresher, worse-fitting one. (Vague asks fit nothing, so every recent
  // type is still damped there — variety is preserved exactly where there's no fit to honor.)
  const novelty = recent.has(meta.type) && fitPts === 0 ? RECENT_PENALTY : 1;
  // The opt-in per-user lesson nudges the draw (advisory only — multiplies, never overrides a pin).
  const lesson = preferred.has(meta.type) ? PREFER_BOOST : avoided.has(meta.type) ? AVOID_DAMP : 1;
  const teach = teaching && meta.family === 'learn' ? TEACH_FAMILY_BOOST : 1;
  return fit * wow * adv * novelty * lesson * teach;
}

/** A small, fast, seedable PRNG (mulberry32) so the draw is RANDOM across turns yet fully
 *  reproducible for a given (question, rotation) — which keeps the brain unit-testable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One scored candidate as the draw sees it. */
interface Candidate {
  meta: ComponentFacts;
  fit: number;
  weight: number;
}

/** The running per-family / per-archetype tallies a draw honors. Shared across the fitting and
 *  leftover stages so the caps bound the whole menu, not each stage separately. */
interface Caps {
  family: Map<string, number>;
  archetype: Map<string, number>;
}

/** A binary indexed tree over the pool's weights, supporting the two things a draw without
 *  replacement needs: pick the candidate a uniform point lands on, and take a candidate out.
 *
 *  Both are O(log n) against the O(n) a plain scan-and-splice pays. That matters because a draw
 *  does NOT stop at `budget` picks: a candidate whose family or archetype is already full is
 *  discarded and the draw goes again, so a menu of 30 routinely costs five times that many rounds
 *  once the late picks are landing in filled families — and each of those rounds re-summed,
 *  re-scanned and re-spliced the whole pool. The cost tracked the library instead of the answer,
 *  which is the one thing this module sets out not to do. */
class WeightedPool {
  private readonly tree: Float64Array;
  private readonly size: number;
  private readonly highBit: number;
  total = 0;
  live: number;

  constructor(private readonly pool: readonly Candidate[]) {
    this.size = pool.length;
    this.live = pool.length;
    this.tree = new Float64Array(this.size + 1);
    for (let i = 0; i < this.size; i++) {
      this.add(i, pool[i].weight);
      this.total += pool[i].weight;
    }
    this.highBit = this.size > 0 ? 1 << (31 - Math.clz32(this.size)) : 0;
  }

  private add(index: number, delta: number): void {
    for (let x = index + 1; x <= this.size; x += x & -x) this.tree[x] += delta;
  }

  /** The first candidate whose running weight reaches `point` — the same one a left-to-right scan
   *  subtracting weights would stop on, since both answer "where does this point land". A drawn
   *  candidate's weight is zero, so it can never be the answer again. */
  private locate(point: number): number {
    let index = 0;
    let seen = 0;
    for (let bit = this.highBit; bit > 0; bit >>= 1) {
      const next = index + bit;
      if (next <= this.size && seen + this.tree[next] < point) {
        index = next;
        seen += this.tree[next];
      }
    }
    return Math.min(index, this.size - 1);
  }

  take(point: number): Candidate {
    const index = this.locate(point);
    const picked = this.pool[index];
    this.add(index, -picked.weight);
    this.total -= picked.weight;
    this.live--;
    return picked;
  }
}

/** Draw `budget` components from `pool` proportional to weight, without replacement, honoring the
 *  per-family and per-archetype caps. Deterministic given `rng`. */
function drawWeighted(
  pool: readonly Candidate[],
  budget: number,
  rng: () => number,
  caps: Caps,
): ComponentFacts[] {
  const remaining = new WeightedPool(pool);
  const chosen: ComponentFacts[] = [];
  while (chosen.length < budget && remaining.live > 0) {
    if (remaining.total <= 0) break;
    const meta = remaining.take(rng() * remaining.total).meta;
    const fam = caps.family.get(meta.family) ?? 0;
    if (fam >= FAMILY_CAP) continue;
    const arch = caps.archetype.get(meta.archetype) ?? 0;
    if (arch >= ARCHETYPE_CAP) continue;
    chosen.push(meta);
    caps.family.set(meta.family, fam + 1);
    caps.archetype.set(meta.archetype, arch + 1);
  }
  return chosen;
}

/** How far below a band leader's fit a candidate may sit and still count as "as good as" it —
 *  scaled so a big fit tolerates a proportionally bigger gap, with an absolute floor so the very
 *  small scores near zero don't each become their own band.
 *
 *  The 0.5 floor is not a guess. Against 288 model-judged preference pairs (scripts/selection-pairs
 *  → fit-selection-weights), the scorer agrees with the judge 78% of the time on pairs it separates
 *  by ≥ 0.5, and exactly 50% — pure chance — on the 233 pairs it places closer than that. Inside the
 *  band there is no relevance signal left to exploit, which is precisely why the draw randomizes
 *  there and orders strictly by fit outside it. */
function tieWindow(fit: number): number {
  return Math.max(0.5, 0.15 * fit);
}

/** Candidates best-fit first, ties broken by type so ordering never depends on catalog iteration
 *  order (and so a band's membership is reproducible across runs). */
function ranked(pool: readonly Candidate[]): Candidate[] {
  return [...pool].sort((a, b) => b.fit - a.fit || (a.meta.type < b.meta.type ? -1 : 1));
}

/** At most this many archetype bases are pinned for the leading near-tie band. Bases that already
 *  sit in BASE_FLOOR don't count — they're merged into every menu regardless. */
const ARCHETYPE_BASE_PINS = 2;

/** Draw from the candidates that actually FIT, best-fit first. Randomness survives only INSIDE a
 *  near-tie band — a set of candidates whose fit scores are indistinguishable from the band's
 *  leader — so the menu never offers a worse-fitting component ahead of a better-fitting one just
 *  because the worse one was flashier or luckier. Within a band, where the selector genuinely has
 *  no reason to prefer one over another, the seeded weighted draw still rotates picks, so an
 *  ambiguous ask keeps surfacing different (equally apt) visuals turn to turn. Ties are broken by
 *  type so a band's membership never depends on catalog iteration order. */
function drawFitFirst(
  pool: readonly Candidate[],
  budget: number,
  rng: () => number,
  caps: Caps,
): ComponentFacts[] {
  const sorted = ranked(pool);
  const chosen: ComponentFacts[] = [];
  let i = 0;
  while (i < sorted.length && chosen.length < budget) {
    const lead = sorted[i].fit;
    const floor = lead - tieWindow(lead);
    let j = i;
    while (j < sorted.length && sorted[j].fit >= floor) j++;
    chosen.push(...drawWeighted(sorted.slice(i, j), budget - chosen.length, rng, caps));
    i = j;
  }
  return chosen;
}

/** How many enrichment fields to teach per component. The required props make a block
 *  valid; these optional ones make it look hand-built (footers, units, colors, highlights).
 *  Capped so the menu stays compact — and cache-friendly — however rich the catalog gets. */
const TEACH_OPTIONAL = 5;

/** The exact object shape of each text-bearing item array, e.g. `items[]: {text}`,
 *  with a nested child spelled inline (`groups[]: {label, commands[]: {label}}`). This
 *  is the field that was missing: a component advertised only `needs: title, items`, so
 *  the model guessed the item's field name (`{label}` where the renderer reads `text`)
 *  and the card rendered blank. Teaching the precise key makes the model emit the right
 *  shape; the coercer's synonym-aliasing is only the safety net. */
function itemShapeClause(m: ComponentMeta): string {
  const specs = m.itemShapes ?? [];
  const strs = m.stringItems ?? [];
  if (!specs.length && !strs.length) return '';
  const one = (s: ItemSpec): string => {
    const fields = [
      s.text,
      ...(s.requiredFields ?? []).filter((field) => field !== s.text),
      s.children ? one(s.children) : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    return `${s.prop}[]: {${fields}}`;
  };
  // stringItems are the arrays the renderer reads as PLAIN strings — teach that explicitly,
  // or the model objectifies them ({step: …}) the same way it guesses item field names.
  const parts = [...specs.map(one), ...strs.map((p) => `${p}[]: plain strings`)];
  return ` · ${parts.join(', ')}`;
}

/** One menu line: name — what it's for — the props it NEEDS — the exact item shape for any
 *  item array — the optional fields that make it shine. Teaching the item shape (not just
 *  that an `items` array exists) is what stops blank cards; teaching the optional fields
 *  (not just `requires`) is what lifts a Live answer from "valid" to "demo-grade": the
 *  renderer already accepts them; the model just has to know they exist. Compact on
 *  purpose (a clause each), so the whole menu stays small. */
function propHintsClause(m: ComponentMeta): string {
  const hints = m.propHints;
  if (!hints) return '';
  const entries = Object.entries(hints);
  if (!entries.length) return '';
  return ` · hints: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`;
}

/** How many heroes carry the full `hints:` clause. Measured at 30 heroes, hints were 8.8k
 *  chars/turn — the largest clause on the menu — with 76% of it on ranks the model rarely picks.
 *  The leads keep every hint (the canvas is built around them); the tail keeps the contracts
 *  that prevent a broken card (`needs`, item shapes, required paths) and sheds the guidance. */
const TEACH_HINTS = 6;

function requiredPathsClause(m: ComponentMeta): string {
  return m.requiredPaths?.length ? ` · required nested: ${m.requiredPaths.join(', ')}` : '';
}

/** A blurb clipped to its first sentence — for menu lines past the lead group, where the full
 *  ~270-char blurb was prose the model paid to skim. Never cuts mid-word: a sentence boundary or
 *  the whole blurb. */
function shortBlurb(blurb: string): string {
  const end = blurb.indexOf('. ');
  return end > 20 ? blurb.slice(0, end + 1) : blurb;
}

function describe(m: ComponentMeta, withExample = false, dense = false, lead = true): string {
  const needs = m.requires.length ? m.requires.join(', ') : '—';
  // A concrete, demo-sourced example is the most reliable thing an LLM can copy, so when one
  // exists we lead with it (it conveys the exact nested shape + token idioms a name list
  // can't) and skip the abstract shape clause. Only the LEAD heroes pay for one — the canvas is
  // built around them, so a dense example there earns its tokens, while an example on every hero
  // line was ~5.4k uncached tokens a turn that the model read once and mostly discarded (it
  // builds ~9 blocks from a 30-line menu). The rest keep the thin line: item shapes, hints and
  // optional fields — the parts that actually prevent blank cards.
  const ex = withExample ? exampleFor(m.type, dense) : null;
  if (ex)
    return `- ${m.type} — ${m.blurb} · needs: ${needs}${itemShapeClause(m)}${requiredPathsClause(m)}${contentBudgetPromptClause(m)}${propHintsClause(m)} · example: ${ex}`;
  const extra = m.optional.slice(0, TEACH_OPTIONAL);
  const richer = extra.length ? ` · richer with: ${extra.join(', ')}` : '';
  const blurb = lead ? m.blurb : shortBlurb(m.blurb);
  const hints = lead ? propHintsClause(m) : '';
  return `- ${m.type} — ${blurb} · needs: ${needs}${itemShapeClause(m)}${requiredPathsClause(m)}${contentBudgetPromptClause(m)}${hints}${richer}`;
}

/** The always-present common blocks (the base floor), with their fields taught too, so the
 *  model knows it can reach for the reliable staples alongside the cool ones. */
function commonLines(): string {
  return BASE_FLOOR.map(catalogMeta)
    .filter((m): m is ComponentMeta => !!m)
    .map((m) => describe(m)) // no example: core staples are already taught in the base prompt
    .join('\n');
}

/** The prompt menu. Two labelled groups: the cool, per-turn picks FIRST (sorted most-
 *  impressive first, so the model reads the wow options before the staples), then the
 *  common blocks that are always available. Only the chosen few rich components appear, so
 *  prompt size stays flat as the library grows. Lead with the cool, but use both. */
// The header orders the model to build the canvas AROUND the top 2-3 heroes — give exactly those
// a demo-grade (denser) example so it fills them deeply; the rest stay thin so the menu stays small.
const LEAD_DENSE = 3;

function buildMenu(chosen: ComponentFacts[], fitOf: ReadonlyMap<string, number>): string {
  // The hero lines quote each component's blurb, required props and item shapes — the DETAIL half of
  // the catalog, resident only after `ensureDetails`. A type whose family failed to load simply drops
  // out of the menu (it stays in the type set, coerced generically), so a chunk error degrades the
  // prompt rather than the turn.
  const metas = chosen.map((f) => catalogMeta(f.type)).filter((m): m is ComponentMeta => !!m);
  // Order the heroes the model reads first by FIT, then by wow: a component that genuinely
  // fits the data leads over a flashier one that doesn't, so "build around the first few"
  // points at relevant visuals. Within each group, most-impressive-first still holds.
  const cool = [...metas].sort((a, b) => {
    const fa = (fitOf.get(a.type) ?? 0) > 0 ? 1 : 0;
    const fb = (fitOf.get(b.type) ?? 0) > 0 ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return b.wowWeight - a.wowWeight;
  });
  // Only the leads carry an example (see LEAD_DENSE above); the rest teach shape + hints, thin.
  const heroLines = cool.map((m, i) => describe(m, i < LEAD_DENSE, true, i < TEACH_HINTS));
  const out: string[] = [];
  if (heroLines.length) {
    out.push(
      'HERO COMPONENTS for THIS answer — your most impressive options, best first. Build the',
      'canvas AROUND two or three of these (a demo-grade reply leads with the cool visuals), and',
      'fill in the rest with the common blocks below. Pick only components that genuinely FIT this',
      "answer's content — a striking visual used for data it wasn't meant for reads as a mistake;",
      'when in doubt prefer the clearer block. Use the exact prop NAMES and printed limits shown.',
      'Treat every needs/item-shape/required-nested/hints clause as an executable contract: all',
      'required strings are nonblank, ids are unique, references resolve to an existing id, and',
      'closed values match exactly. If you cannot satisfy a contract, omit that block and use a',
      'simpler offered type; never send a partial or placeholder-shaped component.',
      'The example shows SHAPE and DENSITY, not the answer. Prioritize the highest-value real items',
      'that fit; summarize any remainder and offer it as a follow-up instead of cramming, shrinking,',
      "or overflowing the card. Use the ANSWER'S OWN real values — never copy example values:",
      ...heroLines,
      '',
    );
  }
  out.push(
    'ALWAYS AVAILABLE — the reliable staples. Use these freely alongside the hero components',
    '(every good canvas mixes both); fall back to a plain insight/list/breakdown only when',
    'nothing richer fits:',
    commonLines(),
  );
  return out.join('\n');
}

/** What the sync core decides, before any prompt text exists. */
export interface Choice {
  types: string[];
  chosen: ComponentFacts[];
  fitOf: ReadonlyMap<string, number>;
  allowed: ReadonlySet<string>;
  bestFit: number;
}

/** The turn's selection input. */
export interface SelectionInput {
  /** Types the caller already knows the turn will allow (tier standards, synthesis extras) —
   *  loaded in the same catalog round-trip as the menu's own families. */
  alsoLoad?: readonly string[];
  userText: string;
  history?: ChatMessage[];
  tier: ModelTier;
  recent?: readonly string[];
  rotation?: number;
  complexity?: AskComplexity;
  exclude?: ReadonlySet<string>;
  lessons?: { prefer?: readonly string[]; avoid?: readonly string[] };
  speedTier?: 'fast' | 'standard' | 'slow';
  semanticFit?: ReadonlyMap<string, number>;
  attachments?: readonly { kind: string; name: string }[];
  /** True on a teaching/learning ask (generateLive's `isTeaching`) — pins the teaching kit
   *  (teachdiagram, workedexample, quiz, flashcard) into the menu and gives the learn family a
   *  small draw boost. Ignored on `tier === 'small'`: a local model can't reliably fill
   *  teachdiagram's structured step schema, so it gets the ordinary draw instead. */
  teaching?: boolean;
}

/**
 * Select the components to offer for one turn. `userText` + `history` drive shape
 * detection; `tier` sets the candidate reach and budget; `recent` (types shown in the
 * last turn or two) is down-weighted so successive answers vary; `rotation` (a per-turn
 * counter) seeds the draw so the same vague ask surfaces different cool components each
 * turn; `complexity` shrinks the menu for a trivial ask. `exclude` drops types from the
 * pool entirely (the opt-in generative family when the user hasn't enabled it), so they
 * never reach the menu, the type set, or the gate — and a paid model is never told about
 * them. Returns the exposed type set (always including the base floor), the prompt menu of
 * the rich picks, and the matching validator gate. Never throws — falls back to SAFE_SET.
 */
export function chooseComponents(input: SelectionInput): Choice {
  try {
    const shapes = detectShapes(input.userText, input.history);
    // Attachment signal: steer toward the base that fits what was uploaded. A data file IS a tabular
    // medium (as strong a signal as the user typing "as a table"); a receipt/screenshot image paired
    // with itemize/breakdown wording wants the same. These pin datatable (guaranteed into the menu)
    // and nudge the tabular shape so table-family fit scoring rises.
    const atts = input.attachments ?? [];
    const attachmentPins: string[] = [];
    if (atts.some((a) => a.kind === 'sheet')) attachmentPins.push('datatable');
    else if (
      atts.some((a) => a.kind === 'image') &&
      /\b(receipt|itemi[sz]e|line items?|breakdown|invoice|bill|expenses?|subtotal|totals?|tax)\b/i.test(
        input.userText,
      )
    )
      attachmentPins.push('datatable');
    if (attachmentPins.length) shapes.tabular = (shapes.tabular ?? 0) + 1.2;
    const recent = new Set(input.recent ?? []);
    const preferred = new Set(input.lessons?.prefer ?? []);
    const avoided = new Set(input.lessons?.avoid ?? []);
    const exclude = input.exclude;
    // Credibility / sanity gate: infer the question's real-world domain(s) so a domain-SPECIFIC block
    // is never offered for an absurd domain (an image slider or sports pitch for a math/medical ask).
    // Neutral blocks (no `domains`) and unclassifiable asks pass untouched; an explicit request is
    // never gated; and the base floor is merged in later, so the gate can never empty the canvas.
    const qDomains = detectDomains(input.userText, input.history);
    const requestedTypes = new Set(detectRequested(input.userText));
    // Specialists the CONTENT calls for (a state machine, a risk matrix, a function plot…). Like an
    // explicit format request, a matched specialist bypasses the domain gate and is pinned below, so
    // the purpose-built block is never lost to the weighted draw nor dropped as "off-domain".
    const specialists = detectSpecialists(input.userText);
    for (const s of specialists) requestedTypes.add(s.type);
    // An attachment-driven pin (e.g. datatable for an uploaded sheet) bypasses the domain gate and is
    // pinned below, exactly like an explicit format request.
    for (const t of attachmentPins) requestedTypes.add(t);
    // A teaching turn (generateLive's isTeaching) pins the teaching kit — same bypass, same pin
    // mechanism as an explicit request. Off for a 'small' tier model: it can't reliably fill
    // teachdiagram/workedexample's structured step schema, so it gets the ordinary draw instead.
    const teachingKitOn = !!input.teaching && input.tier !== 'small';
    if (teachingKitOn) for (const t of TEACHING_KIT) requestedTypes.add(t);
    // SAFETY: on an acute-crisis turn, lead with `lifeline` and never offer a reflective/decorative
    // surface — a gentle reframe or a chart is the wrong, even harmful, response to "I don't want to
    // be here". The base floor still merges in, so the canvas is never empty.
    const crisis = isCrisis(input.userText, input.history);
    const SUPPRESS_ON_CRISIS = crisis
      ? new Set(['companionnote', 'reframecard', 'breathpacer', 'copingmenu'])
      : null;
    // INTENT FIT: the user's NEED (reflect / decide / compare / plan…), mapped onto the same
    // vocabulary the components advertise in `meta.intents`. This anchors a vague-but-purposeful ask
    // that trips no data shape — see INTENT_FIT_W. Empty for a truly open ask, so variety is untouched.
    const askIntents = new Set(intentTokens(analyzeIntent(input.userText, input.history)));
    const intentPts = (m: ComponentFacts): number => {
      let n = 0;
      for (const i of m.intents ?? []) if (askIntents.has(i)) n += 1;
      return n;
    };
    // Semantic cosine for a component (0 when the embedder isn't loaded or didn't rank this type).
    const semFit = input.semanticFit;
    const semOf = (m: ComponentFacts): number => semFit?.get(m.type) ?? 0;
    // SMARTER THAN KEYWORDS: shape + intent detection only WEIGHT the draw; they never GATE the pool.
    // The whole reachable, coercible library (minus the always-merged base floor) is eligible, so an
    // impressive component can surface even when the wording tripped no keyword — the model then makes
    // the final, semantic pick. `fit` is the COMBINED relevance: data-shape match plus intent match.
    const candidates = tierPool(input.tier)
      .filter(
        (m) =>
          COERCIBLE_TYPES.has(m.type) &&
          !BASE_FLOOR.includes(m.type) &&
          !isChrome(m) &&
          !(exclude && exclude.has(m.type)) &&
          (requestedTypes.has(m.type) || domainFitsOrNeutral(blockDomainsOf(m), qDomains)) &&
          !(SUPPRESS_ON_CRISIS && SUPPRESS_ON_CRISIS.has(m.type)) &&
          !(m.type === 'lifeline' && !crisis),
      )
      .map((meta) => {
        const ip = intentPts(meta);
        const sem = semOf(meta);
        const fit = combinedFit({ shapeFit: shapeFitOf(meta, shapes), intentPts: ip, semFit: sem });
        return { meta, ip, sem, fit };
      });
    // Does the ask fit ANYTHING (by shape, intent, OR semantic match)? If so, lean the draw toward
    // relevance (damp zero-fit candidates); if not (a truly open ask), leave it fully random so
    // variety is untouched.
    const fitsExist = candidates.some((c) => c.fit > 0);
    const pool = candidates.map(({ meta, ip, sem, fit }) => ({
      meta,
      fit,
      weight:
        weightFor(meta, shapes, recent, preferred, avoided, teachingKitOn) *
        (1 + INTENT_DRAW_W * ip + SEM_DRAW_W * sem) *
        (fitsExist && fit === 0 ? NOFIT_DAMP_WHEN_FITS_EXIST : 1),
    }));

    // A lean fact or an explicitly-brief ask gets a small, focused menu; a rich ask gets the
    // generous tier menu (the model picks the fitting few).
    const tight = input.complexity === 'lean' || input.complexity === 'brief';
    // A measured-slow model reads a smaller hero menu (~45% of the tier's rich budget), so it spends
    // fewer prompt + output tokens and answers sooner. Pins (explicit requests, strong fits, the base
    // floor) are unaffected, so the RIGHT components still surface — there are just fewer cool extras.
    const richBudget =
      input.speedTier === 'slow'
        ? Math.max(6, Math.round(K_BY_TIER[input.tier] * 0.45))
        : K_BY_TIER[input.tier];
    const budget = tight ? LEAN_K : richBudget;
    const seed = (hashStr(input.userText) ^ Math.imul((input.rotation ?? 0) + 1, 0x9e3779b1)) >>> 0;
    const rng = mulberry32(seed);

    // RELEVANCE FIRST, THEN VARIETY. Two kinds of "always include" beat the random draw:
    //  1) EXPLICIT format requests — "show me the paper" must offer a pdfreader, "show photos"
    //     a gallery — pinned whenever the tier can coerce them, so an asked-for medium is never
    //     lost to chance.
    //  2) STRONG shape fits — the obviously-right component for the data (a codeblock for code).
    // Everything else is the weighted-random draw that keeps answers varied and advanced. A
    // vague ask pins nothing, so it stays fully random (the prior behavior).
    const poolByType = new Map(pool.map((p) => [p.meta.type, p.meta]));
    const requested = [...detectRequested(input.userText), ...attachmentPins]
      .map((t) => poolByType.get(t))
      .filter((m): m is ComponentFacts => !!m);
    // Specialist pins, intersected with what the tier can actually produce (a specialist that
    // isn't coercible on this tier simply doesn't pin — the generic still serves the answer).
    const specialistMetas = specialists
      .map((s) => poolByType.get(s.type))
      .filter((m): m is ComponentFacts => !!m);
    const lifeline = crisis ? poolByType.get('lifeline') : undefined;
    // The teaching kit, same guaranteed-pin treatment — intersected with the pool so a kit member
    // some other gate excluded (e.g. an active `exclude` set) simply doesn't pin.
    const teachingKitMetas = teachingKitOn
      ? TEACHING_KIT.map((t) => poolByType.get(t)).filter((m): m is ComponentFacts => !!m)
      : [];
    const pinned = new Set(
      [...requested, ...specialistMetas, ...teachingKitMetas].map((m) => m.type),
    );
    if (lifeline) pinned.add('lifeline');
    // Pinned by FIT ALONE — recency is deliberately NOT consulted here, so the obviously-right
    // component for this data is guaranteed into the menu EVERY turn it fits, even if it led the
    // last answer too. A recurring data shape must keep reaching for its best tool; the draw below
    // still rotates the rest for variety.
    const fitGuaranteed = pool
      .filter((p) => p.fit > 0 && !pinned.has(p.meta.type))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, tight ? 1 : 2)
      .map((p) => p.meta);
    for (const m of fitGuaranteed) pinned.add(m.type);
    // THE LEADING FORMS' BASES ARE ALWAYS OFFERED. Clustering by archetype keeps the menu visually
    // varied, but it can crowd out the plainest member of the very form the ask calls for: on "how
    // do I reverse a linked list", specialized code views (codewalk, terminal) take both `code`
    // slots and the model is left with no ordinary codeblock to answer with. So for every form that
    // leads this ask — the archetypes inside the top near-tie band — its canonical base is pinned
    // outright. A specialist may still win the answer, but the model is never left without the
    // honest, always-fillable version of the right shape, which is the whole premise of covering
    // the long tail with bases plus annotations rather than with ever more components. Bases that
    // are already in the always-merged floor cost nothing to skip; the rest are capped so a wide
    // band can't crowd the menu with bases either.
    const fittingSorted = ranked(pool.filter((p) => p.fit > 0));
    const bandFloor = fittingSorted.length
      ? fittingSorted[0].fit - tieWindow(fittingSorted[0].fit)
      : 0;
    const archBases: ComponentFacts[] = [];
    for (const p of fittingSorted) {
      if (p.fit < bandFloor || archBases.length >= ARCHETYPE_BASE_PINS) break;
      const base = ARCHETYPE_BASE[p.meta.archetype];
      if (!base || BASE_FLOOR.includes(base) || pinned.has(base)) continue;
      const meta = poolByType.get(base);
      if (!meta) continue;
      pinned.add(base);
      archBases.push(meta);
    }
    const guaranteedRaw = [
      ...(lifeline ? [lifeline] : []),
      ...requested,
      ...specialistMetas,
      ...teachingKitMetas,
      ...fitGuaranteed,
      ...archBases,
    ];
    // Dedup by type: a block can be both explicitly requested and content-detected (or a fit pin),
    // and it must appear in the menu only once.
    const seenPin = new Set<string>();
    const guaranteed = guaranteedRaw.filter((m) => {
      if (seenPin.has(m.type)) return false;
      seenPin.add(m.type);
      return true;
    });
    // FIT FIRST, THEN FLASH. Everything that fits is offered in fit order (near-ties rotate); only
    // once the fitting candidates are exhausted — or the budget outlasts them — does the leftover
    // zero-fit pool get its fully-weighted random draw. On a shaped ask the menu is therefore
    // dominated by relevant forms, and on a vague ask (where nothing fits) the draw is untouched:
    // `fitting` is empty and every candidate flows through the same varied leftover draw as before.
    const rest = pool.filter((p) => !pinned.has(p.meta.type));
    const caps: Caps = { family: new Map(), archetype: new Map() };
    const room = Math.max(0, budget - guaranteed.length);
    const fromFit = drawFitFirst(
      rest.filter((p) => p.fit > 0),
      room,
      rng,
      caps,
    );
    const fromRest = drawWeighted(
      rest.filter((p) => p.fit === 0),
      room - fromFit.length,
      rng,
      caps,
    );
    const chosen = [...guaranteed, ...fromFit, ...fromRest];

    const types = Array.from(new Set([...BASE_FLOOR, ...chosen.map((m) => m.type)]));
    const bestFit = pool.reduce((m, p) => Math.max(m, p.fit), 0);
    const fitOf = new Map(pool.map((p) => [p.meta.type, p.fit]));
    return { types, chosen, fitOf, allowed: new Set(types), bestFit };
  } catch {
    return {
      types: [...SAFE_SET],
      chosen: [],
      fitOf: new Map(),
      allowed: new Set(SAFE_SET),
      bestFit: 0,
    };
  }
}

/** Render the prompt menu for a choice. Requires the chosen types' details to be resident. */
export function menuFor(choice: Choice): string {
  return choice.chosen.length || BASE_FLOOR.length ? buildMenu(choice.chosen, choice.fitOf) : '';
}

/**
 * Select the components to offer for one turn, and produce the prompt menu for them.
 *
 * The scoring is synchronous over the compact facts index; only the MENU needs the catalog's detail
 * fields (blurbs, required props, item shapes), so this awaits exactly the families the turn reached
 * — plus the always-offered base floor — and nothing else. That is what keeps per-turn cost
 * proportional to the answer instead of to the library, at 600 components or at 10,000.
 */
export async function selectComponents(input: SelectionInput): Promise<SelectionResult> {
  const choice = chooseComponents(input);
  // Only the LEAD_DENSE heroes ever render an example (buildMenu), and their order is computed
  // from the always-resident facts (fit + wow) — so fetch exactly those shards, not one per
  // offered type. At a 30-type menu this was ~26 shard round-trips on the critical path ahead of
  // the first request byte, to render three examples.
  const leads = [...choice.chosen]
    .sort((a, b) => {
      const fa = (choice.fitOf.get(a.type) ?? 0) > 0 ? 1 : 0;
      const fb = (choice.fitOf.get(b.type) ?? 0) > 0 ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.wowWeight - a.wowWeight;
    })
    // +2 margin: buildMenu re-sorts AFTER catalogMeta has filtered, so if a lead's family chunk
    // failed to load the trio shifts down — the margin keeps the replacements' examples resident
    // rather than rendering a lead thin. Two extra shards is the whole cost.
    .slice(0, LEAD_DENSE + 2)
    .map((m) => m.type);
  // One catalog round-trip, not two: the caller's statically-known extras (tier standards,
  // synthesis/generative types) ride the same fetch as the menu's families, so generateLive no
  // longer needs a second `ensureDetails` between selection and the request.
  await Promise.all([
    ensureDetails([...choice.types, ...BASE_FLOOR, ...(input.alsoLoad ?? [])]),
    ensureExamples(leads),
  ]);
  return {
    types: choice.types,
    promptSnippet: menuFor(choice),
    allowed: choice.allowed,
    bestFit: choice.bestFit,
  };
}
