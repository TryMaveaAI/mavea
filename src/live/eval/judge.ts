// judge.ts — an LLM judge that grades a Live answer on the things the structural
// scorer (score.ts) cannot see.
//
// score.ts asserts an answer is well-FORMED: valid JSON, the right block TYPE for the
// data shape, honest confidence labels, a sane count. None of that tells us whether the
// answer is actually GOOD — a `chart` of the correct type can still carry wrong numbers,
// two thin rows, or a boring layout. The judge closes that gap by scoring eight qualities
// a person feels but a rule can't measure: accuracy, completeness, fill-depth,
// component-fit, "wow", intent-fit, coherence, and pedagogy (does it actually TEACH). Run
// together, the structural pass is the fast gate and the judge is the quality signal — the
// artifact that lets a prompt change be proven, not eyeballed.
//
// Pure except for an injected `JudgeGenerate` (the same seam as runEval's GenerateFn), so
// the prompt builder, parser, and aggregation are unit-tested with a stub; the live run
// (tests/live-eval-judge.test.ts) supplies a real, cheap model. The judge MUST use a
// JSON-mode provider (Gemini / OpenAI json_object) — NOT Anthropic, whose adapter
// tool-forces the canvas schema and so can't emit a free-form score object.
import type { LiveResponse } from '../../engine/liveSchema';

/** The eight quality dimensions, each graded 1 (poor) … 5 (excellent). `rationale` is one
 *  short line kept for the failure report. A dimension is 0 only when the judge failed to
 *  return a usable number for it (treated as "unscored", never a real grade). */
export interface JudgeScores {
  /** Are the facts and figures correct (vs the reference, or plausibly true)? */
  accuracy: number;
  /** Does it actually and fully ANSWER the question, not a thin or partial reply? */
  completeness: number;
  /** Are the blocks richly filled with real content, or thin / half-empty / placeholder? */
  fillDepth: number;
  /** Do the chosen block TYPES fit the data shape, or are they forced / mismatched? */
  fit: number;
  /** Would a person be genuinely impressed — varied, designed, delightful — or generic? */
  wow: number;
  /** Did the answer give what was asked, in the FORM (table/diagram/code…) and at the DEPTH
   *  (short vs deep) the user wanted? Distinct from `fit` (type↔data-shape). */
  intentFit: number;
  /** Do the blocks form ONE coherent answer in a sensible order — a lead that frames it,
   *  supporting blocks that build on it — or a random grab-bag of unrelated/out-of-order
   *  cards? This is the dimension that catches the "random set of UIs" failure. */
  coherence: number;
  /** Does the answer actually TEACH, not just list correct facts? Opens with a hook/anchor,
   *  builds the mechanism visually (a diagram/sequence that assembles, not a wall of prose),
   *  carries at least one worked example all the way to a result, and closes with a
   *  check-understanding beat — in a followable order. This is the dimension that catches a
   *  factually flawless answer that never actually teaches anything. */
  pedagogy: number;
  /** Did the answer COMMIT to the actual ask — lead with the substance — or deflect, hedge, bury
   *  the lead, or ask back instead of answering? Distinct from completeness (coverage) and intentFit
   *  (form/depth match): this is about whether it ANSWERED at all vs stalled. A `blanks` block
   *  ALONGSIDE a real answer (a genuinely personal unknown) is correct and NEVER penalized here. */
  directness: number;
  rationale: string;
}

export const JUDGE_DIMENSIONS = [
  'accuracy',
  'completeness',
  'fillDepth',
  'fit',
  'wow',
  'intentFit',
  'coherence',
  'pedagogy',
  'directness',
] as const;

/** The judge's instruction. Deliberately strict — a generous judge can't catch a
 *  regression. Asks for ONLY a compact JSON object so the parser stays simple. */
export const JUDGE_SYSTEM = `You are a strict design-and-accuracy critic for an AI that answers questions with a canvas of data-visualization "blocks" (charts, comparisons, breakdowns, timelines, diagrams, etc.). You are given the user's QUESTION and the ANSWER the AI produced — its spoken line plus the blocks (as {type, props}). Grade the ANSWER on nine dimensions, each an INTEGER from 1 to 5 (1 = poor, 3 = acceptable, 5 = excellent):
- accuracy: are the facts and figures correct? If a REFERENCE is given, check against it; otherwise judge plausibility and penalize anything that looks invented or made up.
- completeness: does it actually and FULLY answer the question — every part, in real detail — rather than a thin or partial reply?
- fillDepth: are the blocks richly filled with real content (units, several rows/items, meaningful labels, takeaways), or thin, half-empty, or placeholder?
- fit: do the chosen block TYPES match the data (a trend → a time chart; a split → a breakdown/donut; a ranking → bars; a decision → a compare), or are they forced or mismatched? A "chart" block is ONLY for values changing OVER TIME — using it for a ranking, a composition, or a static process is a fit error, even if the content is correct.
- wow: would a real person be impressed — varied, well-composed, delightful — or is it the generic chatbot default?
- intentFit: did the answer match WHAT THE USER ASKED FOR — both the FORM and the DEPTH? If they explicitly asked for a specific form (a table / diagram / timeline / code / checklist / step-by-step / comparison / map / quiz / flashcards), did the answer LEAD with that exact form (5) or ignore it and answer in some other shape (1)? If they asked for a SHORT / one-line / tl;dr answer, did it stay tight (5) or bury them in a full dashboard (1)? If they asked to go deep / in detail, did it (5) or stay shallow (1)? When the ask named no specific form or depth, judge whether the chosen form and length suit the question (a neutral 3–4 is fine). This is about matching the REQUEST; "fit" above is only about type↔data-shape.
- coherence: do the blocks read as ONE deliberate answer that flows in a sensible ORDER and tells a single story — a lead block that frames it, supporting blocks that build on it — or a random grab-bag of cards that don't clearly belong together (5 = every block earns its place in a logical order; 1 = a pile of unrelated or out-of-order visuals)? Penalize a tacked-on block that doesn't fit the question, a derived figure shown before the data it comes from, and two blocks that contradict each other.
- pedagogy: does the answer actually TEACH, or does it just list correct facts? A genuine teaching answer (5) opens with a hook or concrete anchor before the abstraction, makes the mechanism VISUALLY BUILT — a diagram, sequence, or worked structure that assembles step by step, not a wall of prose — carries at least one worked example all the way through to a real result, and closes with a check-understanding beat (a question, quiz, or self-check), all in a followable order. A wall of correct facts with no arc — even if factually flawless, richly filled, and well-typed — scores LOW (1-2) on this dimension specifically; do not let a high accuracy or fillDepth score pull this one up. When a LESSON CONTEXT block is given below, also judge whether the answer actually addresses THAT lesson's own objectives (not the whole course) and, when a recap was expected, whether it briefly connected to the prior lesson before moving into new material — factor a missed objective or a skipped/overlong recap into this score.
- directness: did the answer COMMIT to the actual ask? 5 = the opening line and lead block deliver the substance of what was asked, immediately, with no unnecessary throat-clearing and no unnecessary questions back. Penalize: answering a different, easier question than the one asked; hedging so much no usable answer remains; burying the answer beneath preamble or setup blocks; or bouncing the ask back as clarifying questions INSTEAD of answering (3 = answers but hedged or with a buried lead; 1 = deflects, refuses without cause, or only asks back). IMPORTANT EXCEPTION: this AI may legitimately include a "blanks" block — input holes for 1-3 genuinely PERSONAL unknowns (the user's own deadline, budget, energy) that no AI could know — ALONGSIDE a real answer. Blanks or questions placed NEXT TO a substantive answer are correct and must NOT lower this score; only penalize holes or questions that stand IN PLACE of an answer the AI could have given, or probing when the ask was answerable outright.
Be demanding: reserve 5 for genuinely excellent and give a low score whenever it is warranted. Reply with ONLY this JSON object and nothing else: {"accuracy":n,"completeness":n,"fillDepth":n,"fit":n,"wow":n,"intentFit":n,"coherence":n,"pedagogy":n,"directness":n,"rationale":"one short sentence"}`;

/** Compact, judge-readable rendering of one answer: the spoken envelope plus each block's
 *  type and props (capped so a verbose block can't blow the judge's context or cost). */
function summarizeAnswer(resp: LiveResponse): string {
  const blocks = resp.blocks.map((b, i) => {
    const props = JSON.stringify(b.props);
    const capped = props.length > 600 ? `${props.slice(0, 600)}…` : props;
    return `  [${i}] ${b.type}: ${capped}`;
  });
  return [
    `title: ${resp.title}`,
    `sub: ${resp.sub}`,
    `narration: ${resp.narration}`,
    `blocks (${resp.blocks.length}):`,
    ...blocks,
  ].join('\n');
}

/** Extra context for a COURSE-LESSON turn, so the judge can grade progression quality — this
 *  lesson's own objectives, and whether it should have recapped the lesson before it — rather
 *  than just single-answer quality. Optional: only course-lesson eval cases build one; every
 *  ordinary case omits it and the judge prompt is unchanged. Shaped after lessonSpine.ts's own
 *  directive fields (objectives, recap) so a caller can build this straight from a TopicLesson
 *  without inventing new terms. */
export interface JudgeLessonContext {
  /** This lesson's own objectives, verbatim — what THIS turn (not the whole course) must cover. */
  objectives: string[];
  /** True when a brief recap of the immediately-prior lesson was expected (false for lesson 1). */
  expectRecap: boolean;
  /** Optional "Lesson 2 of 5"-style label, for a readable prompt. */
  position?: string;
}

/** The user message handed to the judge: the question, an optional ground-truth reference for
 *  accuracy, an optional lesson context for a course turn, and the rendered answer. */
export function judgeUserMessage(
  ask: string,
  resp: LiveResponse,
  reference?: string,
  lesson?: JudgeLessonContext,
): string {
  const lessonBlock = lesson
    ? [
        `LESSON CONTEXT: ${lesson.position ? `${lesson.position}. ` : ''}this turn is one lesson inside a course — judge it against THIS lesson's own scope, not the whole course.`,
        `THIS LESSON'S OBJECTIVES: ${lesson.objectives.join('; ')}`,
        lesson.expectRecap
          ? 'A brief recap connecting to the lesson immediately before this one was expected before moving into new material — check whether the answer opens with one, briefly, without re-teaching it in full.'
          : 'This is the first lesson of the course — no recap should be expected.',
      ].join('\n')
    : '';
  return [
    `QUESTION: ${ask}`,
    reference ? `REFERENCE (ground-truth facts to check accuracy against):\n${reference}` : '',
    lessonBlock,
    'ANSWER:',
    summarizeAnswer(resp),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Clamp a model-supplied score to an integer in [1,5]; 0 marks an unusable value so a
 *  garbled field can't masquerade as a real grade. */
function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Parse the judge's raw output into clamped scores, or null when nothing usable came
 *  back. Tolerant: accepts a JSON object embedded in surrounding prose/fences and the
 *  common `fill_depth` / `fill` spellings of fillDepth. */
export function parseJudge(raw: string | object): JudgeScores | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;

  const scores: JudgeScores = {
    accuracy: clampScore(obj.accuracy),
    completeness: clampScore(obj.completeness),
    fillDepth: clampScore(obj.fillDepth ?? obj.fill_depth ?? obj.fill),
    fit: clampScore(obj.fit),
    wow: clampScore(obj.wow),
    // intentFit is newer than the other five; a legacy judge run omits it (→ 0 = unscored). The
    // all-zero guard below still keeps such a run usable (its other five dims are non-zero), and
    // aggregateJudge averages each dim over only its scored cases, so a 0 never skews the mean.
    intentFit: clampScore(obj.intentFit ?? obj.intent_fit ?? obj.intent),
    // coherence is newer than the original six; a judge that omits it scores 0 (= unscored),
    // excluded from aggregation exactly like a legacy intentFit, so an old run stays usable.
    coherence: clampScore(obj.coherence ?? obj.coherent ?? obj.story),
    // pedagogy is the newest dimension; accept the "teach"/"teaching" spellings a model might
    // reach for instead of the exact key name. Same 0-means-unscored back-compat as the others.
    pedagogy: clampScore(obj.pedagogy ?? obj.teach ?? obj.teaching ?? obj.teaches),
    // directness is the newest dimension; accept the spellings a model may reach for. Same
    // 0-means-unscored back-compat as the others, so a legacy 8-dim run stays usable.
    directness: clampScore(
      obj.directness ?? obj.direct ?? obj.answeredDirectly ?? obj.answered_directly,
    ),
    rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 280) : '',
  };
  // If every dimension failed to parse, the judge produced nothing usable.
  if (JUDGE_DIMENSIONS.every((d) => scores[d] === 0)) return null;
  return scores;
}

/** The judge transport seam: given a system + user prompt, return the model's raw output.
 *  Mirrors runEval's GenerateFn so the live runner can bind any JSON-mode adapter. */
export type JudgeGenerate = (system: string, user: string) => Promise<string | object>;

/** Grade one answer. Never throws — a network/parse failure resolves to null (unscored),
 *  exactly like the structural scorer treats an unsalvageable response. `lesson`, when the case
 *  is a course-lesson turn, rides the SAME judge call — it only changes the prompt, not the
 *  number of calls made. */
export async function judgeAnswer(
  generate: JudgeGenerate,
  ask: string,
  resp: LiveResponse,
  reference?: string,
  lesson?: JudgeLessonContext,
): Promise<JudgeScores | null> {
  try {
    const raw = await generate(JUDGE_SYSTEM, judgeUserMessage(ask, resp, reference, lesson));
    return parseJudge(raw);
  } catch {
    return null;
  }
}

/** Mean of each dimension across the scored cases, plus an overall mean of the five. */
export interface JudgeAggregate {
  /** Cases that received a usable judge score (nulls are excluded from every mean). */
  n: number;
  accuracy: number;
  completeness: number;
  fillDepth: number;
  fit: number;
  wow: number;
  intentFit: number;
  coherence: number;
  pedagogy: number;
  directness: number;
  /** Mean of the (present) dimension means — the single headline quality number. */
  overall: number;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function aggregateJudge(scores: readonly (JudgeScores | null)[]): JudgeAggregate {
  const valid = scores.filter((s): s is JudgeScores => s !== null);
  const n = valid.length;
  // Average each dimension over only the cases that actually SCORED it (>0). A 0 means the judge
  // didn't return that field (e.g. a legacy run with no intentFit), so excluding it keeps a mixed
  // run honest and protects every dimension from a single garbled field skewing the mean.
  const mean = (sel: (s: JudgeScores) => number) => {
    const xs = valid.map(sel).filter((v) => v > 0);
    return xs.length === 0 ? 0 : round2(xs.reduce((a, v) => a + v, 0) / xs.length);
  };
  const accuracy = mean((s) => s.accuracy);
  const completeness = mean((s) => s.completeness);
  const fillDepth = mean((s) => s.fillDepth);
  const fit = mean((s) => s.fit);
  const wow = mean((s) => s.wow);
  const intentFit = mean((s) => s.intentFit);
  const coherence = mean((s) => s.coherence);
  const pedagogy = mean((s) => s.pedagogy);
  const directness = mean((s) => s.directness);
  const present = [
    accuracy,
    completeness,
    fillDepth,
    fit,
    wow,
    intentFit,
    coherence,
    pedagogy,
    directness,
  ].filter((v) => v > 0);
  const overall = present.length ? round2(present.reduce((a, v) => a + v, 0) / present.length) : 0;
  return {
    n,
    accuracy,
    completeness,
    fillDepth,
    fit,
    wow,
    intentFit,
    coherence,
    pedagogy,
    directness,
    overall,
  };
}

/** Render a judge aggregate as a compact console block, to sit beneath the structural
 *  scorecard from score.ts. */
export function formatJudge(model: string, agg: JudgeAggregate): string {
  const s = (v: number) => v.toFixed(2);
  return [
    `\n━━━ Live quality (LLM judge): ${model}  (n=${agg.n} scored) ━━━`,
    `  accuracy      ${s(agg.accuracy)} / 5`,
    `  completeness  ${s(agg.completeness)} / 5`,
    `  fill depth    ${s(agg.fillDepth)} / 5`,
    `  component fit ${s(agg.fit)} / 5`,
    `  wow           ${s(agg.wow)} / 5`,
    `  intent fit    ${s(agg.intentFit)} / 5`,
    `  coherence     ${s(agg.coherence)} / 5`,
    `  pedagogy      ${s(agg.pedagogy)} / 5`,
    `  directness    ${s(agg.directness)} / 5`,
    `  ─────────────────────────`,
    `  OVERALL       ${s(agg.overall)} / 5`,
  ].join('\n');
}
