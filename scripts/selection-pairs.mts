// selection-pairs.mts — collect pairwise preference data for the selector's relevance score.
//
// The ranking weights in rank.ts (how much an intent match is worth against a data-shape match) were
// hand-tuned. Hand-tuned visualization-ranking weights are a known weak spot: Draco measured them at
// ~65% pairwise agreement against ~93% for weights learned from labeled preferences. This script
// produces those labels — for a spread of asks it takes the candidates the selector actually scores,
// samples pairs across and within its near-tie bands, and asks a model which component is the better
// visualization for that question. The output feeds fit-selection-weights.mts.
//
// It is a DEV script: it never runs in the app, it costs real API calls, and its output is advisory
// until the fitted weights pass the accuracy battery. One batched call per ask keeps the bill small.
//
//   node --env-file=.env --import tsx scripts/selection-pairs.mts > eval-out/selection-pairs.jsonl
import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { COERCIBLE_TYPES, BASE_FLOOR } from '../src/live/select/catalog';
import { detectShapes } from '../src/live/select/shapes';
import { analyzeIntent, intentTokens } from '../src/live/select/intent';
import { combinedFit, shapeFitOf } from '../src/live/select/rank';
import type { ComponentMeta } from '../src/canvas/blocks/catalog/meta';

const MODEL = 'gemini-3.1-flash-lite';
const PAIRS_PER_ASK = 12;
/** Gemini's free tier throttles around 15 rpm, and pacing right at the cap makes it hang rather than
 *  reject — so sit well under it and let the operator slow down further if the run starts timing out. */
const CALL_DELAY_MS = Number(process.env.CALL_DELAY_MS ?? 8_000);

/** A spread of asks across shape × intent × domain — the same distribution the accuracy battery
 *  covers, so the learned weights are fitted on the traffic we actually care about. */
const ASKS = [
  'where is the eiffel tower',
  "what's near the riverwalk in chicago",
  'plan a three day trip to rome with the sights on a map',
  'show me the python code for quicksort',
  'how do i reverse a linked list in javascript',
  'write the sql to find duplicate rows',
  'make me a table of the planets and their masses',
  'put the quarterly revenue in a spreadsheet',
  'give me a recipe for chocolate chip cookies',
  'how do i change a flat tire step by step',
  'walk me through filing a tax extension',
  'how has bitcoin changed over the past year',
  'plot global temperature over the last century',
  'where does my monthly budget go',
  'break down the macronutrients in an avocado',
  'compare the iphone 15 and the pixel 8',
  'should i take the train or fly to boston',
  "what's the best budget laptop",
  'rank the top 5 fastest marathon times',
  'which countries have the largest populations',
  'give me a timeline of world war 2',
  'plan an hour by hour itinerary for a day in paris',
  'what is the population of japan',
  'how close am i to my savings goal of 10000',
  'show the distribution of household incomes',
  'is there a correlation between sleep and productivity',
  'explain the process and feedback loop as a state machine diagram',
  'where do users drop off in our signup funnel',
  'show the org chart for a startup',
  'build me a weekly workout plan',
  'when should i take my medication',
  'show me photos of the northern lights',
  'show me the bitcoin whitepaper',
  'quiz me on state capitals',
  'what does ephemeral mean',
  'teach me how photosynthesis works',
  'should i take the job offer',
  'is this friendship draining me',
  'help me plan my week',
  'how does a bill become a law',
  'what changed between these two versions of the file',
  'show the project schedule with dependencies',
  'what does the spread of response times look like',
  'how does price affect demand',
  'break 360 into its prime factors',
  'what is the taxonomy of the great white shark',
  'graph y equals x squared minus 4',
  'show me the structure of caffeine',
  'conjugate the verb hablar',
  'top grossing films of all time',
  'how is the federal budget allocated',
  'am i drinking enough water each day',
];

interface Features {
  shapeFit: number;
  intentPts: number;
  wow: number;
  advTier: number;
  interactive: number;
}

const ADV_TIER: Record<string, number> = { base: 1.0, frontier: 1.3, cutting: 1.6 };

function featuresFor(meta: ComponentMeta, ask: string): Features {
  const shapes = detectShapes(ask, undefined);
  const askIntents = new Set(intentTokens(analyzeIntent(ask, undefined)));
  let intentPts = 0;
  for (const i of meta.intents ?? []) if (askIntents.has(i)) intentPts += 1;
  return {
    shapeFit: shapeFitOf(meta, shapes),
    intentPts,
    wow: meta.wowWeight,
    advTier: ADV_TIER[meta.tier] ?? 1,
    interactive: meta.interactive ? 1 : 0,
  };
}

/** A deterministic shuffle so a rerun of this script produces the same pairs (and so the same
 *  spend). Seeded by the ask, not the clock. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CANDIDATES = RAW_CATALOG.filter(
  (m) => COERCIBLE_TYPES.has(m.type) && !BASE_FLOOR.includes(m.type),
);

/** Pairs worth labeling: the ones the selector currently finds close. A pair whose scores are far
 *  apart teaches the fitter nothing (any positive weight orders it right); the information lives in
 *  the near-ties and in the few cross-band pairs that check the ordering is not inverted. */
function pairsFor(ask: string): [ComponentMeta, ComponentMeta][] {
  const scored = CANDIDATES.map((meta) => {
    const f = featuresFor(meta, ask);
    return { meta, f, fit: combinedFit({ ...f, semFit: 0 }) };
  }).sort((a, b) => b.fit - a.fit);

  const rng = seeded(hash(ask));
  const top = scored.slice(0, 16);
  const tail = scored.slice(16).filter(() => rng() < 0.02);
  const out: [ComponentMeta, ComponentMeta][] = [];
  for (let i = 0; i < top.length - 1 && out.length < PAIRS_PER_ASK - 2; i += 2) {
    out.push([top[i].meta, top[i + 1].meta]);
  }
  // Two cross-band pairs: a leader against something the selector ranks far below it.
  for (let i = 0; i < 2 && i < tail.length; i++) out.push([top[i].meta, tail[i].meta]);
  return out;
}

const JUDGE_PREAMBLE = [
  'You are choosing the better VISUALIZATION for answering a question.',
  'For each numbered pair, decide which component would produce the more useful, more honest answer',
  'to the question. Prefer the component whose form matches the data the answer would contain.',
  'A striking visual used for data it was not designed for is WRONG, not impressive.',
  'If both are equally apt, answer "tie".',
  'Reply with ONLY a JSON array: [{"id":1,"winner":"a"|"b"|"tie"}, ...]. No prose.',
].join('\n');

/** A hard ceiling on model calls, including retries — this script spends real money, so the budget
 *  is enforced in code rather than trusted to the operator. */
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 40);
/** Asks already labeled in a previous (possibly interrupted) run, so a resume never re-buys them. */
const RESUME_FILE = process.env.RESUME_FILE ?? '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let calls = 0;

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set (run with `node --env-file=.env`)');
  // A transient network blip should not throw away the calls already paid for; retry twice with
  // backoff, and count every attempt against the budget.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (calls >= MAX_CALLS) throw new Error(`call budget exhausted (${MAX_CALLS})`);
    calls += 1;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // JSON mode, not a response schema: an empty-properties schema makes Gemini return nothing.
            // The verdict is a few dozen tokens, so cap the output and skip thinking — an unbounded
            // generation is what turns a throttled call into a minute-long hang.
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0,
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(90_000),
        },
      );
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    } catch (err) {
      lastErr = err;
      process.stderr.write(`  retry ${attempt + 1} after ${String(err)}\n`);
      await sleep(CALL_DELAY_MS * (attempt + 2));
    }
  }
  throw lastErr;
}

async function judge(ask: string, pairs: [ComponentMeta, ComponentMeta][]): Promise<string[]> {
  const lines = pairs.map(
    ([a, b], i) =>
      `${i + 1}. QUESTION: "${ask}"\n   a) ${a.type} — ${a.blurb}\n   b) ${b.type} — ${b.blurb}`,
  );
  const prompt = `${JUDGE_PREAMBLE}\n\n${lines.join('\n\n')}`;
  process.stderr.write(`  prompt ${prompt.length} chars, ${pairs.length} pairs\n`);
  const text = await callGemini(prompt);
  // A truncated or chatty reply must degrade to "no signal", never abort a run that has already been
  // paid for: an unparseable verdict simply yields ties, which the caller drops.
  let parsed: { id: number; winner: string }[] = [];
  try {
    parsed = JSON.parse(text) as { id: number; winner: string }[];
  } catch {
    process.stderr.write(`  unparseable verdict (${text.length} chars) — counted as ties\n`);
  }
  const byId = new Map(parsed.map((p) => [p.id, p.winner]));
  return pairs.map((_, i) => byId.get(i + 1) ?? 'tie');
}

const alreadyDone = new Set<string>();
if (RESUME_FILE) {
  const { readFileSync, existsSync } = await import('node:fs');
  if (existsSync(RESUME_FILE)) {
    for (const line of readFileSync(RESUME_FILE, 'utf8').split('\n')) {
      if (line.trim()) alreadyDone.add((JSON.parse(line) as { ask: string }).ask);
    }
  }
}

let asked = 0;
for (const ask of ASKS) {
  if (alreadyDone.has(ask)) continue;
  if (calls >= MAX_CALLS) {
    process.stderr.write(`\nstopping: call budget ${MAX_CALLS} reached\n`);
    break;
  }
  const pairs = pairsFor(ask);
  if (!pairs.length) continue;
  const winners = await judge(ask, pairs);
  asked += 1;
  pairs.forEach(([a, b], i) => {
    const winner = winners[i];
    if (winner !== 'a' && winner !== 'b') return; // ties carry no ordering information
    process.stdout.write(
      `${JSON.stringify({
        ask,
        a: a.type,
        b: b.type,
        fa: featuresFor(a, ask),
        fb: featuresFor(b, ask),
        winner,
      })}\n`,
    );
  });
  process.stderr.write(`[${asked}] ${ask} (${calls} calls spent)\n`);
  await sleep(CALL_DELAY_MS);
}
process.stderr.write(`\ndone — ${calls} model calls, ${asked} asks labeled\n`);
