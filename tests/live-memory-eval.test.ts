// live-memory-eval.test.ts — proves the MEMORY lift, in two parts:
//  1. PURE tests (always run): the memory-judge parser, the judge-message builder, dataset
//     integrity, AND a DETERMINISTIC plumbing test of the A/B harness with a fake model — the
//     ON run (memory injected) must out-score the OFF run, with no network.
//  2. A LIVE run (EVAL_LIVE=1 EVAL_MEMORY=1): each session's probe is answered memory-ON vs OFF
//     through the real adapter, scored by a real JSON-mode judge, and the mean personalizationFit
//     lift is printed — the reproducible analog of Brain's "+25% on seen tasks".
//
// Live, e.g. (answer = Gemini flash-lite, judge = Gemini flash; EVAL_JUDGE_DELAY dodges the 15 rpm cap):
//   EVAL_LIVE=1 EVAL_MEMORY=1 EVAL_PROVIDER=gemini EVAL_KEY=AIza... EVAL_JUDGE_DELAY=4000 pnpm eval
import { describe, it, expect } from 'vitest';
import {
  runMemoryEval,
  parseMemoryJudge,
  buildMemoryJudgeMessage,
  knownContext,
  type MemoryEvalDeps,
  type RawOut,
} from '../src/live/eval/runMemory';
import { MEMORY_SESSIONS } from '../src/live/eval/memoryGolden';
import { getAdapter, providerInfo } from '../src/live/providers';
import type { ModelConfig, ProviderId } from '../src/types/mavea';

/* ------------------------------------------------------------------ *
 * 1) Pure tests — always run, no network.
 * ------------------------------------------------------------------ */

describe('memory judge — parser', () => {
  it('parses a clean JSON object and clamps 1..5', () => {
    const s = parseMemoryJudge('{"personalizationFit":7,"groundedness":4,"rationale":"ok"}');
    expect(s).not.toBeNull();
    expect(s!.personalizationFit).toBe(5); // clamped
    expect(s!.groundedness).toBe(4);
    expect(s!.rationale).toBe('ok');
  });

  it('extracts JSON embedded in prose', () => {
    const s = parseMemoryJudge('Grade: {"personalizationFit":2,"groundedness":5} done');
    expect(s!.personalizationFit).toBe(2);
    expect(s!.groundedness).toBe(5);
  });

  it('returns null when neither score is present', () => {
    expect(parseMemoryJudge('{"note":"nope"}')).toBeNull();
    expect(parseMemoryJudge('not json')).toBeNull();
  });
});

describe('memory judge — message + context', () => {
  const s = MEMORY_SESSIONS[0];
  it('renders known context, the question, the bar, and the answer', () => {
    const known = knownContext(s);
    const msg = buildMemoryJudgeMessage(known, s, {
      title: 't',
      sub: '',
      narration: 'Here is a vegetarian plan.',
      blocks: [{ type: 'list', props: { title: 'Dinners', items: ['a'] } }],
    } as never);
    expect(msg).toContain('KNOWN CONTEXT');
    expect(msg).toContain(s.probe);
    expect(msg).toContain('WHAT GOOD LOOKS LIKE');
    expect(msg).toContain('vegetarian plan');
  });
});

describe('memory sessions — integrity', () => {
  it('every session has a unique id, a probe, an expectApply, and at least one seed', () => {
    const seen = new Set<string>();
    for (const s of MEMORY_SESSIONS) {
      expect(seen.has(s.id), `duplicate id ${s.id}`).toBe(false);
      seen.add(s.id);
      expect(s.probe.length, `${s.id}: empty probe`).toBeGreaterThan(0);
      expect(s.expectApply.length, `${s.id}: empty expectApply`).toBeGreaterThan(0);
      const seeds =
        (s.facts?.length ?? 0) + (s.preferences?.length ?? 0) + (s.corrections?.length ?? 0);
      expect(seeds, `${s.id}: no seeded context`).toBeGreaterThan(0);
    }
  });
});

describe('memory A/B harness — deterministic plumbing (fake model)', () => {
  it('the memory-ON run out-scores the memory-OFF run', async () => {
    // Fake answer: it "applies" the context only when the memory block was injected into the user
    // prompt (ON). Fake judge: rewards an answer that says it applied the context.
    const fakeAnswer: MemoryEvalDeps['answer'] = async ({ user }) => ({
      title: 'Answer',
      sub: '',
      narration: user.includes('background only')
        ? 'APPLIED the known context.'
        : 'GENERIC answer.',
      blocks: [{ type: 'insight', props: { title: 'Point', summary: 'A real detail goes here.' } }],
    });
    const fakeJudge = async (_system: string, user: string): Promise<RawOut> =>
      JSON.stringify({
        personalizationFit: user.includes('APPLIED') ? 5 : 1,
        groundedness: 5,
        rationale: 'fake',
      });

    const report = await runMemoryEval(MEMORY_SESSIONS.slice(0, 4), {
      answer: fakeAnswer,
      judge: fakeJudge,
      tier: 'frontier',
    });

    expect(report.sessions.length).toBe(4);
    expect(report.meanLift).toBeGreaterThan(0); // ON applied the context; OFF could not
    expect(report.meanGroundednessOn).toBe(5);
    expect(report.contaminatedIds).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 2) Live run — EVAL_LIVE=1 EVAL_MEMORY=1 only. Answer + judge via real adapters.
 * ------------------------------------------------------------------ */

const RUN = !!process.env.EVAL_LIVE && !!process.env.EVAL_MEMORY;

const DIRECT_BASE: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai',
  grok: 'https://api.x.ai',
};

describe.skipIf(!RUN)('live memory lift (personalizationFit ON vs OFF)', () => {
  it('answers each probe with memory on/off and reports the lift', async () => {
    const answerProvider = (process.env.EVAL_PROVIDER ?? 'gemini') as ProviderId;
    const answerModel = process.env.EVAL_MODEL || providerInfo(answerProvider).defaultModel;
    const answerCfg: ModelConfig = {
      provider: answerProvider,
      model: answerModel,
      apiKey: process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_BASE_URL ?? DIRECT_BASE[answerProvider],
    };
    const answerAdapter = getAdapter(answerProvider);
    const tier = answerAdapter.capabilities.strengthTier;

    const judgeProvider = (process.env.EVAL_JUDGE_PROVIDER ?? 'gemini') as ProviderId;
    if (judgeProvider === 'anthropic')
      throw new Error(
        'Judge cannot be anthropic (tool-forces the canvas schema). Use gemini or openai.',
      );
    const judgeModel = process.env.EVAL_JUDGE_MODEL || providerInfo(judgeProvider).defaultModel;
    const judgeCfg: ModelConfig = {
      provider: judgeProvider,
      model: judgeModel,
      apiKey: process.env.EVAL_JUDGE_KEY || process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_JUDGE_BASE_URL ?? DIRECT_BASE[judgeProvider],
    };
    const judgeAdapter = getAdapter(judgeProvider);

    const log = (line: string): void => void process.stdout.write(`${line}\n`);
    const deps: MemoryEvalDeps = {
      tier,
      judgeDelayMs: process.env.EVAL_JUDGE_DELAY ? Number(process.env.EVAL_JUDGE_DELAY) : undefined,
      answer: async ({ system, user, blockTypes }) =>
        (await answerAdapter.generate({ system, history: [], user, blockTypes }, answerCfg)).raw,
      judge: async (system, user) =>
        (await judgeAdapter.generate({ system, history: [], user }, judgeCfg)).raw,
    };

    const report = await runMemoryEval(MEMORY_SESSIONS, deps, (r, i, n) =>
      log(
        `  [${i + 1}/${n}] ${r.id}  on=${r.on?.personalizationFit ?? '—'} off=${r.off?.personalizationFit ?? '—'}  Δ${r.liftPersonalization}${r.contaminated ? '  (contaminated)' : ''}`,
      ),
    );

    log(`\n  mean personalizationFit lift (ON−OFF): ${report.meanLift.toFixed(2)}`);
    log(
      `  mean groundedness (ON): ${report.meanGroundednessOn.toFixed(2)}  [poisoning guard — keep high]`,
    );
    if (report.contaminatedIds.length)
      log(`  excluded (not load-bearing): ${report.contaminatedIds.join(', ')}`);

    // The honest claim: memory must HELP (positive lift) and must NOT poison (groundedness stays high).
    expect(report.sessions.length).toBe(MEMORY_SESSIONS.length);
    expect(report.meanLift).toBeGreaterThan(0);
    expect(report.meanGroundednessOn).toBeGreaterThanOrEqual(4);
  }, 600_000);
});
