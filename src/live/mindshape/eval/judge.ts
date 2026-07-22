// judge.ts — LLM judge for mindshape quality.
// Six dimensions: fidelity, coverage, tension, restraint, resonance, emergence.
// The judge MUST be Gemini or OpenAI (not Anthropic — its adapter tool-forces the canvas
// schema and cannot emit a free-form score object). Same seam as live/eval/judge.ts.
import type { MindShapeSpec } from '../types';

export interface MindShapeJudgeScores {
  /** Does every atom trace to something actually said? (anti-hallucination gate) */
  fidelity: number;
  /** Did it catch the key people/options/fears/open-loops a careful listener would notice? */
  coverage: number;
  /** Did it find and mark the real contradiction or tradeoff (tensions link)? */
  tension: number;
  /** No clinical language, no invented motives, unsaid properly hedged as 'maybe'? */
  restraint: number;
  /** Would the speaker say "yeah, that's the shape of it"? Is the center question right? */
  resonance: number;
  /** Are the themes named from the person's own words, with no generic categories imposed? */
  emergence: number;
  rationale: string;
}

export const MINDSHAPE_JUDGE_DIMENSIONS = [
  'fidelity',
  'coverage',
  'tension',
  'restraint',
  'resonance',
  'emergence',
] as const;

export const MINDSHAPE_JUDGE_SYSTEM = `You are a strict judge evaluating an AI that extracts the "shape" of someone's spoken thought while they think aloud. You are given the TRANSCRIPT (what the person said) and the SHAPE the AI extracted.

Grade on six dimensions, each an INTEGER 1–5 (1=poor, 3=acceptable, 5=excellent):

- fidelity: Does every atom trace to something actually said in the transcript? Penalize any atom that feels invented, over-interpreted, or not clearly grounded in the words. 5 = every atom has an obvious source.
- coverage: Did it catch the key people, options, fears, constraints, and open questions a careful listener would notice? Penalize missing obvious elements. 5 = nothing important is missing.
- tension: Did it find and label the genuine contradiction or tradeoff? Is there a real "tensions" link that captures what actually pulls against what? 1 = no tension found despite obvious conflict. 5 = the key tension is named and linked precisely.
- restraint: Is it free of clinical/diagnostic language (anxiety disorder, trauma, attachment style, codependency, narcissism, etc.)? Does it avoid inventing motives not in the words? Is "unsaid" hedged as "maybe"? A single clinical term = score of 2 or below. 5 = completely clean.
- resonance: Would the person who spoke those words say "yeah, that's the shape of it"? Is the center question specific and right for this particular person, not a generic restatement? Is the unsaid something they'd recognize? 5 = genuinely captures the shape.
- emergence: Are the cluster/theme labels drawn from THIS person's own words and specifics ("the move to Seattle", "Maya", "is it the right time")? Penalize HARD any generic, imposed category name — "People", "Options", "Worries", "Constraints", "Trade-offs" — that reads like a pre-printed form rather than their thought. 1 = themes are generic buckets. 5 = themes are unmistakably this person's own, nothing imposed.

Be demanding. Reserve 5 for genuinely excellent. A restraint violation is concrete, not an opinion.

If a REFERENCE SHAPE is provided, use it to calibrate fidelity, coverage, and emergence (it shows what a human would identify and how the themes would be named). Otherwise judge holistically from the transcript.

Reply with ONLY this JSON and nothing else:
{"fidelity":n,"coverage":n,"tension":n,"restraint":n,"resonance":n,"emergence":n,"rationale":"one short sentence"}`;

function summarizeMindShape(spec: MindShapeSpec): string {
  const atomLines = spec.atoms.map((a) => `  [${a.kind}] "${a.label}" ← "${a.quote}"`).join('\n');
  const linkLines = spec.links
    .map((l) => `  ${l.from} --${l.kind}${l.label ? ` (${l.label})` : ''}--> ${l.to}`)
    .join('\n');
  const clusters = spec.clusters ?? [];
  const clusterLines = clusters.map((c) => `  "${c.label}" {${c.atomIds.join(', ')}}`).join('\n');
  return [
    `center: "${spec.center}"`,
    `themes (${clusters.length}):`,
    clusterLines || '  (none)',
    `atoms (${spec.atoms.length}):`,
    atomLines || '  (none)',
    `links (${spec.links.length}):`,
    linkLines || '  (none)',
    spec.unsaid
      ? `unsaid: "${spec.unsaid.label}" — ${spec.unsaid.why} [${spec.unsaid.confidence}]`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export type MindShapeJudgeGenerate = (system: string, user: string) => Promise<string | object>;

export function mindShapeJudgeUserMessage(
  transcript: string,
  spec: MindShapeSpec,
  reference?: Partial<MindShapeSpec>,
): string {
  return [
    `TRANSCRIPT:\n${transcript}`,
    reference
      ? `REFERENCE SHAPE (what a human would identify):\n${JSON.stringify(reference, null, 2)}`
      : '',
    `EXTRACTED SHAPE:\n${summarizeMindShape(spec)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

export function parseMindShapeJudge(raw: string | object): MindShapeJudgeScores | null {
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
  if (!obj) return null;

  const scores: MindShapeJudgeScores = {
    fidelity: clampScore(obj.fidelity),
    coverage: clampScore(obj.coverage),
    tension: clampScore(obj.tension),
    restraint: clampScore(obj.restraint),
    resonance: clampScore(obj.resonance),
    emergence: clampScore(obj.emergence),
    rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 300) : '',
  };

  if (MINDSHAPE_JUDGE_DIMENSIONS.every((d) => scores[d] === 0)) return null;
  return scores;
}

/** Grade one mindshape. Never throws — network/parse failure resolves to null. */
export async function judgeMindShape(
  generate: MindShapeJudgeGenerate,
  transcript: string,
  spec: MindShapeSpec,
  reference?: Partial<MindShapeSpec>,
): Promise<MindShapeJudgeScores | null> {
  try {
    const user = mindShapeJudgeUserMessage(transcript, spec, reference);
    const raw = await generate(MINDSHAPE_JUDGE_SYSTEM, user);
    return parseMindShapeJudge(raw);
  } catch {
    return null;
  }
}

export interface MindShapeJudgeAggregate {
  n: number;
  fidelity: number;
  coverage: number;
  tension: number;
  restraint: number;
  resonance: number;
  emergence: number;
  overall: number;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function aggregateMindShapeJudge(
  scores: readonly (MindShapeJudgeScores | null)[],
): MindShapeJudgeAggregate {
  const valid = scores.filter((s): s is MindShapeJudgeScores => s !== null);
  const n = valid.length;
  const mean = (sel: (s: MindShapeJudgeScores) => number) =>
    n === 0 ? 0 : round2(valid.reduce((a, s) => a + sel(s), 0) / n);
  const fidelity = mean((s) => s.fidelity);
  const coverage = mean((s) => s.coverage);
  const tension = mean((s) => s.tension);
  const restraint = mean((s) => s.restraint);
  const resonance = mean((s) => s.resonance);
  const emergence = mean((s) => s.emergence);
  const overall = round2((fidelity + coverage + tension + restraint + resonance + emergence) / 6);
  return { n, fidelity, coverage, tension, restraint, resonance, emergence, overall };
}
