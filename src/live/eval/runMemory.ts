// runMemory.ts — the A/B harness that PROVES memory makes answers better. For each session it seeds
// a fresh store with what the user established, then answers the probe TWICE — memory ON vs OFF —
// assembling the ON prompt exactly as generateLive does (ranked memory context + procedural hints +
// the personal-fit line). A dedicated judge scores how well each answer APPLIED the known context
// (personalizationFit) and whether it invented personal facts (groundedness). The mean ON−OFF lift
// on personalizationFit is the headline number; groundedness guards against memory poisoning.
//
// The model + judge are injected, so the same runner powers a deterministic plumbing test (fake
// model, no network) and the real gated EVAL_LIVE+EVAL_MEMORY run.
import {
  liveSystemPrompt,
  validateLiveResponse,
  blockTypesForTier,
  type LiveResponse,
} from '../../engine/liveSchema';
import type { ModelTier } from '../select/catalog';
import { selectComponents } from '../select/rank';
import { classifyAsk } from '../select/complexity';
import { buildMemoryContext } from '../memory/inject';
import { rankForInjection, proceduralHints, personalFitLine } from '../memory/retrieve';
import { forgetAll, getMemoryNodes, mergeNodes } from '../memory/store';
import { correctionUpdate } from '../memory/procedural';
import type { MemorySession } from './memoryGolden';

export type RawOut = string | object;

export interface MemoryEvalDeps {
  /** Answer model: compose system + user (the user already carries any memory context) → raw response. */
  answer: (a: { system: string; user: string; blockTypes?: string[] }) => Promise<RawOut>;
  /** Judge model (JSON-mode): (system, user) → raw. */
  judge: (system: string, user: string) => Promise<RawOut>;
  tier?: ModelTier;
  /** Pause between judge calls — for rate-limited judges (Gemini ~15 rpm). */
  judgeDelayMs?: number;
}

export interface MemoryScore {
  personalizationFit: number;
  groundedness: number;
  rationale: string;
}

export interface SessionResult {
  id: string;
  on: MemoryScore | null;
  off: MemoryScore | null;
  /** personalizationFit(on) − personalizationFit(off). */
  liftPersonalization: number;
  /** OFF already applied the context well → the planted fact wasn't load-bearing; excluded. */
  contaminated: boolean;
}

export interface MemoryEvalReport {
  sessions: SessionResult[];
  /** Mean personalizationFit lift over non-contaminated sessions — the headline "beats Brain" number. */
  meanLift: number;
  /** Mean groundedness of the ON answers — must stay high (no memory poisoning). */
  meanGroundednessOn: number;
  contaminatedIds: string[];
}

export const MEMORY_JUDGE_SYSTEM = `You are grading whether an AI assistant correctly USED what it already knew about a user. You are given: (1) KNOWN CONTEXT the user established earlier, (2) the user's QUESTION this turn, (3) WHAT GOOD LOOKS LIKE, and (4) the ANSWER (its spoken line plus blocks as {type, props}). Grade two INTEGERS from 1 to 5:
- personalizationFit: did the answer correctly APPLY the known context — without the user repeating it this turn? 5 = applied it naturally and correctly throughout; 3 = applied it partially; 1 = ignored or contradicted it.
- groundedness: did the answer AVOID inventing personal facts that were never given? 5 = every personal claim traces to the known context or the question; 1 = fabricated personal facts.
Reply with ONLY this JSON and nothing else: {"personalizationFit":n,"groundedness":n,"rationale":"one short sentence"}`;

/** A human-readable digest of everything the user established earlier — the judge's ground truth. */
export function knownContext(s: MemorySession): string {
  const lines: string[] = [];
  for (const f of s.facts ?? []) lines.push(`- ${f.body}`);
  for (const p of s.preferences ?? []) lines.push(`- (preference) ${p.body}`);
  for (const c of s.corrections ?? [])
    lines.push(`- (correction) ${c.what}: was ${c.was}, corrected to ${c.now}`);
  return lines.join('\n');
}

function renderAnswer(resp: LiveResponse): string {
  const blocks = JSON.stringify(resp.blocks).slice(0, 2400);
  return `Spoken: ${resp.narration}\nBlocks: ${blocks}`;
}

export function buildMemoryJudgeMessage(
  known: string,
  s: MemorySession,
  resp: LiveResponse,
): string {
  return [
    `KNOWN CONTEXT (established earlier — the answer should apply this WITHOUT being told again):\n${known}`,
    `QUESTION: ${s.probe}`,
    `WHAT GOOD LOOKS LIKE: ${s.expectApply}`,
    `ANSWER:\n${renderAnswer(resp)}`,
  ].join('\n\n');
}

function clamp(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(1, Math.min(5, Math.round(v)));
}

export function parseMemoryJudge(raw: RawOut): MemoryScore | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        obj = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || (obj.personalizationFit === undefined && obj.groundedness === undefined)) return null;
  return {
    personalizationFit: clamp(obj.personalizationFit),
    groundedness: clamp(obj.groundedness),
    rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
  };
}

function seedSession(s: MemorySession): void {
  if (s.facts?.length)
    mergeNodes(
      s.facts.map((f) => ({ concept: f.concept, body: f.body, source: f.source ?? 'user-stated' })),
    );
  if (s.preferences?.length)
    mergeNodes(
      s.preferences.map((p) => ({
        concept: p.concept,
        body: p.body,
        source: 'user-stated' as const,
      })),
    );
  if (s.corrections?.length) mergeNodes(s.corrections.map((c) => correctionUpdate(c)));
}

async function buildPrompt(
  probe: string,
  tier: ModelTier,
  withMemory: boolean,
): Promise<{ system: string; user: string; blockTypes: string[]; allowed: ReadonlySet<string> }> {
  const lessons = withMemory ? proceduralHints(getMemoryNodes(), probe) : undefined;
  const selection = await selectComponents({
    userText: probe,
    tier,
    complexity: classifyAsk(probe),
    lessons: lessons ? { prefer: lessons.prefer, avoid: lessons.avoid } : undefined,
  });
  let system =
    liveSystemPrompt(tier) + (selection.promptSnippet ? `\n\n${selection.promptSnippet}` : '');
  if (lessons) {
    const pl = personalFitLine(lessons);
    if (pl) system += `\n\n${pl}`;
  }
  let user = probe;
  if (withMemory) {
    const ctx = buildMemoryContext(rankForInjection(getMemoryNodes(), probe));
    if (ctx) user = `${ctx}\n\n${probe}`;
  }
  return {
    system,
    user,
    blockTypes: selection.types,
    allowed: new Set([...selection.allowed, ...blockTypesForTier(tier)]),
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function answerAndValidate(
  answer: MemoryEvalDeps['answer'],
  prompt: Awaited<ReturnType<typeof buildPrompt>>,
): Promise<LiveResponse | null> {
  try {
    const raw = await answer({
      system: prompt.system,
      user: prompt.user,
      blockTypes: prompt.blockTypes,
    });
    return validateLiveResponse(raw, prompt.allowed);
  } catch {
    return null;
  }
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Run the memory A/B over the given sessions.
 *
 * ⚠️ DESTRUCTIVE — Node/test only. This seeds and `forgetAll()`s the shared memory store, so in a
 * browser it would WIPE the user's real memory. It must never be reachable from a live UI path; it
 * is invoked solely from the gated eval test. (The store ends cleared; don't rely on its state after.)
 */
export async function runMemoryEval(
  sessions: readonly MemorySession[],
  deps: MemoryEvalDeps,
  onSession?: (r: SessionResult, i: number, n: number) => void,
): Promise<MemoryEvalReport> {
  const tier = deps.tier ?? 'frontier';
  const results: SessionResult[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    forgetAll();
    seedSession(s);
    const known = knownContext(s);

    const onResp = await answerAndValidate(deps.answer, await buildPrompt(s.probe, tier, true));
    const offResp = await answerAndValidate(deps.answer, await buildPrompt(s.probe, tier, false));

    const on = onResp
      ? parseMemoryJudge(
          await deps.judge(MEMORY_JUDGE_SYSTEM, buildMemoryJudgeMessage(known, s, onResp)),
        )
      : null;
    if (deps.judgeDelayMs) await sleep(deps.judgeDelayMs);
    const off = offResp
      ? parseMemoryJudge(
          await deps.judge(MEMORY_JUDGE_SYSTEM, buildMemoryJudgeMessage(known, s, offResp)),
        )
      : null;
    if (deps.judgeDelayMs) await sleep(deps.judgeDelayMs);

    const lift = on && off ? on.personalizationFit - off.personalizationFit : 0;
    // Anti-contamination: if the OFF (no-memory) answer already applied the context well, the
    // planted fact wasn't load-bearing — that session can't prove anything, so it's excluded.
    const contaminated = !!off && off.personalizationFit >= 4;
    const r: SessionResult = { id: s.id, on, off, liftPersonalization: lift, contaminated };
    results.push(r);
    onSession?.(r, i, sessions.length);
  }
  forgetAll();

  const valid = results.filter((r) => r.on && r.off && !r.contaminated);
  return {
    sessions: results,
    meanLift: mean(valid.map((r) => r.liftPersonalization)),
    meanGroundednessOn: mean(results.filter((r) => r.on).map((r) => r.on!.groundedness)),
    contaminatedIds: results.filter((r) => r.contaminated).map((r) => r.id),
  };
}
