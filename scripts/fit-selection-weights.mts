// fit-selection-weights.mts — learn the selector's relevance weights from pairwise preferences.
//
// rank.ts scores a candidate with `combinedFit` — a linear blend of data-shape overlap, intent
// overlap and semantic cosine — and the coefficients were chosen by hand. Hand-tuned visualization
// ranking weights sit near chance on pairwise agreement (Draco: ~65% hand-tuned vs ~93% learned), so
// this script fits them properly: a logistic regression on FEATURE DIFFERENCES, which is exactly
// RankSVM's pairwise formulation and needs no dependencies.
//
//   pnpm pairs:selection > eval-out/selection-pairs.jsonl   # collect labels (costs API calls)
//   pnpm weights:selection                                  # fit + report; prints a constants block
//
// Nothing here ships. The output is a RECOMMENDATION: adopt it only if it beats the current weights
// on a held-out split AND the accuracy battery stays green afterwards. Weights land as a constants-
// only edit to rank.ts, never as runtime learning.
import { readFileSync } from 'node:fs';

const PAIRS_FILE = process.env.PAIRS_FILE ?? 'eval-out/selection-pairs.jsonl';
/** Below this many labeled pairs a fit is noise dressed up as science. Draco's own threshold. */
const MIN_PAIRS = 250;
/** Held-out share, split BY ASK so no ask contributes to both train and test (pairs from one ask
 *  share a shape vector and would leak). */
const HOLDOUT_FRACTION = 0.25;
const L2 = 0.05;
const EPOCHS = 4_000;
const LR = 0.05;

/** The features the selector could plausibly rank on. `shapeFit` is the reference scale — every
 *  other coefficient is reported relative to it, because a ranking score is scale-invariant. */
const FEATURES = ['shapeFit', 'intentPts', 'wow', 'advTier', 'interactive'] as const;
type Feature = (typeof FEATURES)[number];
type Vec = Record<Feature, number>;

interface Pair {
  ask: string;
  a: string;
  b: string;
  fa: Vec;
  fb: Vec;
  winner: 'a' | 'b';
}

const rows: Pair[] = readFileSync(PAIRS_FILE, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Pair);

if (rows.length < MIN_PAIRS) {
  console.error(
    `refusing to fit: ${rows.length} pairs < ${MIN_PAIRS}. Collect more with \`pnpm pairs:selection\`.`,
  );
  process.exit(1);
}

/** x = features(a) − features(b); y = 1 when the judge preferred a. The sign of w·x is the model's
 *  prediction, so training this classifier trains the ranker. */
function design(pairs: Pair[]): { x: number[]; y: number }[] {
  return pairs.map((p) => ({
    x: FEATURES.map((f) => p.fa[f] - p.fb[f]),
    y: p.winner === 'a' ? 1 : 0,
  }));
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Logistic regression with an intercept. The intercept is not part of the ranking score — it exists
 *  purely to ABSORB position bias (a judge's tendency to pick "a" regardless of content). A large
 *  fitted intercept is therefore a warning about the labels, not a weight to ship. */
function fit(data: { x: number[]; y: number }[]): { w: number[]; b: number } {
  const d = FEATURES.length;
  const w = new Array(d).fill(0);
  let b = 0;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (const { x, y } of data) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * x[j];
      const err = sigmoid(z) - y;
      for (let j = 0; j < d; j++) gw[j] += err * x[j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= LR * (gw[j] / data.length + L2 * w[j]);
    b -= LR * (gb / data.length);
  }
  return { w, b };
}

/** Share of pairs a scorer orders the way the judge did. Ties in the score count as half — guessing. */
function accuracy(pairs: Pair[], score: (v: Vec) => number): number {
  let ok = 0;
  for (const p of pairs) {
    const diff = score(p.fa) - score(p.fb);
    const predicted = diff === 0 ? 0.5 : diff > 0 ? 1 : 0;
    const actual = p.winner === 'a' ? 1 : 0;
    ok += predicted === 0.5 ? 0.5 : predicted === actual ? 1 : 0;
  }
  return ok / pairs.length;
}

// Split by ask so a held-out ask is genuinely unseen.
const asks = [...new Set(rows.map((r) => r.ask))].sort();
const cut = Math.floor(asks.length * (1 - HOLDOUT_FRACTION));
const trainAsks = new Set(asks.slice(0, cut));
const train = rows.filter((r) => trainAsks.has(r.ask));
const test = rows.filter((r) => !trainAsks.has(r.ask));

const { w, b } = fit(design(train));
const learned = (v: Vec) => FEATURES.reduce((s, f, j) => s + w[j] * v[f], 0);
/** The weights rank.ts uses today (semantic fit is 0 offline, so it drops out of both sides). */
const current = (v: Vec) => v.shapeFit + 1.0 * v.intentPts;

console.log(`pairs: ${rows.length}  (train ${train.length} / test ${test.length})`);
console.log(
  `asks:  ${asks.length}  (train ${trainAsks.size} / test ${asks.length - trainAsks.size})`,
);
console.log(
  `\nposition-bias intercept: ${b.toFixed(3)}  (|b| > ~0.3 means the labels lean toward "a")`,
);

console.log('\nlearned coefficients (raw):');
FEATURES.forEach((f, j) => console.log(`  ${f.padEnd(12)} ${w[j].toFixed(4)}`));

const shapeCoef = w[FEATURES.indexOf('shapeFit')];
if (Math.abs(shapeCoef) > 1e-6) {
  console.log('\nnormalized to shapeFit = 1 (the form rank.ts uses):');
  FEATURES.forEach((f, j) => console.log(`  ${f.padEnd(12)} ${(w[j] / shapeCoef).toFixed(3)}`));
}

const accCurrentTrain = accuracy(train, current);
const accLearnedTrain = accuracy(train, learned);
const accCurrentTest = accuracy(test, current);
const accLearnedTest = accuracy(test, learned);

console.log('\npairwise agreement with the judge:');
console.log(`  current weights   train ${(accCurrentTrain * 100).toFixed(1)}%   HOLDOUT ${(accCurrentTest * 100).toFixed(1)}%`); // prettier-ignore
console.log(`  learned weights   train ${(accLearnedTrain * 100).toFixed(1)}%   HOLDOUT ${(accLearnedTest * 100).toFixed(1)}%`); // prettier-ignore

// Agreement, split by how far apart the CURRENT scorer already places the two candidates. The pairs
// were sampled adversarially — mostly near-ties — so a middling headline number is expected and says
// little. What matters is the shape: if the current weights order the CLEARLY-separated pairs well
// and only flounder inside the near-tie band, then the band is doing exactly its job (there is no
// signal to exploit there, which is precisely why the selector randomizes within it).
const gap = (p: Pair) => Math.abs(current(p.fa) - current(p.fb));
const NEAR_TIE = 0.5; // the absolute floor of rank.ts's tieWindow()
const nearTies = rows.filter((p) => gap(p) < NEAR_TIE);
const separated = rows.filter((p) => gap(p) >= NEAR_TIE);
console.log('\nagreement by how far apart the current scorer places the pair:');
console.log(`  near-ties  (gap < ${NEAR_TIE})   n=${String(nearTies.length).padStart(3)}   ${(accuracy(nearTies, current) * 100).toFixed(1)}%`); // prettier-ignore
if (separated.length)
  console.log(`  separated  (gap ≥ ${NEAR_TIE})   n=${String(separated.length).padStart(3)}   ${(accuracy(separated, current) * 100).toFixed(1)}%`); // prettier-ignore

const delta = (accLearnedTest - accCurrentTest) * 100;
console.log(`\nholdout delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} points`);
if (delta < 2) {
  console.log(
    'VERDICT: do NOT adopt. The learned weights do not clear the current ones by a meaningful\n' +
      "         margin on unseen asks — the hand-tuned values are already at the data's ceiling,\n" +
      '         or the labels are too few/too noisy to separate them.',
  );
} else {
  console.log(
    'VERDICT: candidate for adoption. Edit the constants in rank.ts, then re-run the accuracy\n' +
      '         battery (tests/selection-accuracy.test.ts) — it must stay ≥90% on the demanding subset.',
  );
}
