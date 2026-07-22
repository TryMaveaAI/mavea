// live-eval-judge.test.ts — the quality half of the eval, on top of the structural one.
//
// Two parts in one file:
//  1. PURE unit tests (always run in the normal suite): the judge prompt builder, the
//     tolerant score parser, the aggregation math, and the integrity of the extra golden
//     set. No network — these guard the judge's own logic.
//  2. A LIVE run, gated behind EVAL_JUDGE=1 (so it never fires in CI / the default suite):
//     it sends every golden case through the connected ANSWER model, scores each answer
//     structurally (score.ts) AND with a cheap LLM JUDGE (judge.ts), and prints both
//     scorecards — the artifact that lets a prompt change be proven on accuracy / fill /
//     fit / wow, not eyeballed.
//
// The file name contains "live-eval" so `pnpm eval` (vitest run live-eval) discovers it
// with no package.json change; the live run still needs EVAL_JUDGE on top of EVAL_LIVE.
//
// Run, e.g. (answer = Gemini flash-lite, judge = Gemini flash):
//   EVAL_JUDGE=1 EVAL_PROVIDER=gemini EVAL_KEY=AIza... pnpm eval
//   EVAL_JUDGE=1 EVAL_PROVIDER=gemini EVAL_KEY=AIza... EVAL_JUDGE_MODEL=gemini-2.5-flash pnpm eval
// The JUDGE must be a JSON-mode provider (gemini / openai). Anthropic's adapter tool-forces
// the canvas schema and cannot emit a free-form score object — it is rejected below.
import { select as selectComponents } from './helpers/select';
import {
  LIVE_SYSTEM_PROMPT,
  liveSystemPrompt,
  validateLiveResponse,
  type LiveResponse,
} from '../src/engine/liveSchema';
// Import from the direct source modules, not the select/ barrel — the barrel pulls in the
// whole selection subsystem and forms an init cycle under the test transform that leaves
// these bindings undefined at call time.

import { classifyAsk, isTeachingAsk } from '../src/live/select/complexity';
import { detectRequested, formRequestDirective } from '../src/live/select/shapes';
import { targetBlockCount, countDirective } from '../src/live/screen';
import { teachingArcDirective } from '../src/live/generateLive';
import { autoFix } from '../src/live/verify';
import { GOLDEN } from '../src/live/eval/golden';
import { GOLDEN_EXTRA, type JudgeCase } from '../src/live/eval/goldenExtra';
import {
  aggregate,
  scoreCase,
  formatScorecard,
  heroUsage,
  type CaseScore,
} from '../src/live/eval/score';
import {
  judgeAnswer,
  judgeUserMessage,
  parseJudge,
  aggregateJudge,
  formatJudge,
  JUDGE_DIMENSIONS,
  JUDGE_SYSTEM,
  type JudgeScores,
  type JudgeLessonContext,
} from '../src/live/eval/judge';
import { getAdapter, providerInfo } from '../src/live/providers';
import { costUSD, priceFor } from '../src/live/eval/cost';
import type { ModelConfig, ProviderId } from '../src/types/mavea';
import type { TokenUsage } from '../src/live/providers/types';
import { writeFileSync, mkdirSync } from 'node:fs';

/* ------------------------------------------------------------------ *
 * 1) Pure unit tests — always run, no network.
 * ------------------------------------------------------------------ */

/** A real, typed LiveResponse built through the validation core (no casts). */
function sampleAnswer() {
  const resp = validateLiveResponse({
    title: 'Prime numbers',
    sub: 'The building blocks of the integers',
    narration: 'A prime has exactly two divisors: one and itself.',
    blocks: [
      {
        type: 'insight',
        props: {
          title: 'A prime has exactly two divisors',
          summary: 'Divisible only by 1 and itself.',
        },
      },
      { type: 'list', props: { title: 'The first primes', items: ['2', '3', '5', '7', '11'] } },
    ],
  });
  if (!resp) throw new Error('fixture failed to validate');
  return resp;
}

describe('judge — score parser', () => {
  it('parses a clean JSON object and clamps to 1..5', () => {
    const s = parseJudge(
      '{"accuracy":7,"completeness":3,"fillDepth":4,"fit":5,"wow":2,"rationale":"ok"}',
    );
    expect(s).not.toBeNull();
    expect(s!.accuracy).toBe(5); // 7 clamped
    expect(s!.completeness).toBe(3);
    expect(s!.fit).toBe(5);
    expect(s!.rationale).toBe('ok');
  });

  it('extracts JSON embedded in prose or code fences', () => {
    const s = parseJudge(
      'Here is my grade:\n```json\n{"accuracy":4,"completeness":4,"fillDepth":3,"fit":5,"wow":4}\n```',
    );
    expect(s).not.toBeNull();
    expect(s!.accuracy).toBe(4);
    expect(s!.wow).toBe(4);
  });

  it('accepts the fill_depth spelling alias', () => {
    const s = parseJudge('{"accuracy":3,"completeness":3,"fill_depth":2,"fit":3,"wow":3}');
    expect(s!.fillDepth).toBe(2);
  });

  it('accepts an already-parsed object', () => {
    const s = parseJudge({ accuracy: 5, completeness: 5, fillDepth: 5, fit: 5, wow: 5 });
    expect(s!.accuracy).toBe(5);
  });

  it('returns null for non-JSON or a score-less object', () => {
    expect(parseJudge('no json here')).toBeNull();
    expect(parseJudge('{"note":"nope"}')).toBeNull();
  });
});

describe('judge — prompt builder', () => {
  it('includes the question, the answer, and the reference when present', () => {
    const msg = judgeUserMessage('What is a prime?', sampleAnswer(), '2,3,5,7 are prime.');
    expect(msg).toContain('QUESTION: What is a prime?');
    expect(msg).toContain('REFERENCE');
    expect(msg).toContain('2,3,5,7 are prime.');
    expect(msg).toContain('ANSWER:');
    expect(msg).toContain('insight'); // a block type is rendered
  });

  it('omits the reference section when none is given', () => {
    const msg = judgeUserMessage('What is a prime?', sampleAnswer());
    expect(msg).not.toContain('REFERENCE');
  });

  it('omits the lesson context section when none is given', () => {
    const msg = judgeUserMessage('What is a prime?', sampleAnswer());
    expect(msg).not.toContain('LESSON CONTEXT');
  });

  it('includes lesson context — objectives and a recap expectation — when given', () => {
    const lesson: JudgeLessonContext = {
      objectives: ['add two vectors', 'scale a vector'],
      expectRecap: true,
      position: 'Lesson 2 of 5',
    };
    const msg = judgeUserMessage('What is a prime?', sampleAnswer(), undefined, lesson);
    expect(msg).toContain('LESSON CONTEXT');
    expect(msg).toContain('Lesson 2 of 5');
    expect(msg).toContain('add two vectors');
    expect(msg).toContain('scale a vector');
    expect(msg).toMatch(/recap/i);
  });

  it('states plainly that no recap is expected for the first lesson', () => {
    const lesson: JudgeLessonContext = {
      objectives: ['see a vector as an arrow'],
      expectRecap: false,
    };
    const msg = judgeUserMessage('What is a vector?', sampleAnswer(), undefined, lesson);
    expect(msg).toMatch(/no recap should be expected/i);
  });
});

describe('judge — aggregation', () => {
  const a: JudgeScores = {
    accuracy: 4,
    completeness: 4,
    fillDepth: 4,
    fit: 4,
    wow: 4,
    intentFit: 4,
    coherence: 4,
    pedagogy: 4,
    directness: 4,
    rationale: '',
  };
  const b: JudgeScores = {
    accuracy: 2,
    completeness: 2,
    fillDepth: 2,
    fit: 2,
    wow: 2,
    intentFit: 2,
    coherence: 2,
    pedagogy: 2,
    directness: 2,
    rationale: '',
  };

  it('averages each dimension and ignores nulls', () => {
    const agg = aggregateJudge([a, null, b]);
    expect(agg.n).toBe(2);
    expect(agg.accuracy).toBe(3);
    expect(agg.intentFit).toBe(3);
    expect(agg.overall).toBe(3);
  });

  it('returns zeros for an empty set', () => {
    const agg = aggregateJudge([null, null]);
    expect(agg.n).toBe(0);
    expect(agg.overall).toBe(0);
  });

  it('excludes a dimension that was not scored (0) from its mean — protects mixed/legacy runs', () => {
    // `b` did score intentFit (2); a legacy-style score with intentFit:0 must not drag it to 1.
    const legacy: JudgeScores = { ...a, intentFit: 0 };
    const agg = aggregateJudge([legacy, b]);
    expect(agg.n).toBe(2);
    expect(agg.intentFit).toBe(2); // only `b` scored intentFit → mean over the one scored case
    expect(agg.accuracy).toBe(3); // both scored accuracy → (4+2)/2
    // overall averages the seven present dimension means; intentFit's mean is 2 here.
    expect(agg.overall).toBeGreaterThan(0);
  });
});

describe('judge — intentFit + coherence dimensions', () => {
  it('JUDGE_DIMENSIONS includes intentFit and coherence', () => {
    expect(JUDGE_DIMENSIONS).toContain('intentFit');
    expect(JUDGE_DIMENSIONS).toContain('coherence');
  });

  it('parses a full seven-dimension object', () => {
    const s = parseJudge(
      '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":2,"coherence":5,"rationale":"ok"}',
    );
    expect(s).not.toBeNull();
    expect(s!.intentFit).toBe(2);
    expect(s!.coherence).toBe(5);
  });

  it('marks coherence unscored (0) for a judge that omits it, staying usable', () => {
    const s = parseJudge(
      '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":2}',
    );
    expect(s).not.toBeNull();
    expect(s!.coherence).toBe(0);
  });

  it('accepts the intent_fit spelling alias', () => {
    const s = parseJudge(
      '{"accuracy":3,"completeness":3,"fillDepth":3,"fit":3,"wow":3,"intent_fit":5}',
    );
    expect(s!.intentFit).toBe(5);
  });

  it('stays usable for a LEGACY five-dimension judge response (intentFit unscored = 0)', () => {
    // Back-compat: an old judge that returns only the original five must NOT become null; its
    // intentFit is marked unscored (0) and excluded from aggregation, never a fake grade.
    const s = parseJudge('{"accuracy":5,"completeness":5,"fillDepth":5,"fit":5,"wow":5}');
    expect(s).not.toBeNull();
    expect(s!.intentFit).toBe(0);
    expect(s!.accuracy).toBe(5);
  });
});

describe('judge — pedagogy dimension', () => {
  it('JUDGE_DIMENSIONS includes pedagogy (nine dimensions)', () => {
    expect(JUDGE_DIMENSIONS).toContain('pedagogy');
    expect(JUDGE_DIMENSIONS.length).toBe(9);
  });

  it('JUDGE_SYSTEM tells the judge a wall of facts with no arc scores low', () => {
    expect(JUDGE_SYSTEM).toMatch(/pedagogy/i);
    expect(JUDGE_SYSTEM).toMatch(/wall of correct facts.*no arc.*low/i);
  });

  it('parses a full eight-dimension object including pedagogy', () => {
    const s = parseJudge(
      '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":4,"coherence":4,"pedagogy":2,"rationale":"listy, no arc"}',
    );
    expect(s).not.toBeNull();
    expect(s!.pedagogy).toBe(2);
  });

  it('marks pedagogy unscored (0) for a judge that omits it, staying usable', () => {
    const s = parseJudge(
      '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":4,"coherence":4}',
    );
    expect(s).not.toBeNull();
    expect(s!.pedagogy).toBe(0);
  });

  it('accepts the "teach" spelling alias the task calls out explicitly', () => {
    const s = parseJudge('{"accuracy":3,"completeness":3,"fillDepth":3,"fit":3,"wow":3,"teach":5}');
    expect(s!.pedagogy).toBe(5);
  });

  it('accepts the "teaching" spelling alias too', () => {
    const s = parseJudge(
      '{"accuracy":3,"completeness":3,"fillDepth":3,"fit":3,"wow":3,"teaching":1}',
    );
    expect(s!.pedagogy).toBe(1);
  });

  it('stays usable for a LEGACY seven-dimension judge response (pedagogy unscored = 0)', () => {
    const s = parseJudge(
      '{"accuracy":5,"completeness":5,"fillDepth":5,"fit":5,"wow":5,"intentFit":5,"coherence":5}',
    );
    expect(s).not.toBeNull();
    expect(s!.pedagogy).toBe(0);
    expect(s!.accuracy).toBe(5);
  });

  it('rides the same single judge call — the pedagogy dimension adds no extra generate() invocation', async () => {
    let calls = 0;
    const generate = async () => {
      calls += 1;
      return '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":4,"coherence":4,"pedagogy":3,"rationale":"ok"}';
    };
    const scores = await judgeAnswer(generate, 'What is a prime?', sampleAnswer());
    expect(calls).toBe(1);
    expect(scores?.pedagogy).toBe(3);
  });

  it('aggregateJudge and formatJudge carry pedagogy through to the headline overall', () => {
    const scores: JudgeScores = {
      accuracy: 5,
      completeness: 5,
      fillDepth: 5,
      fit: 5,
      wow: 5,
      intentFit: 5,
      coherence: 5,
      pedagogy: 1,
      directness: 5,
      rationale: 'accurate but never teaches',
    };
    const agg = aggregateJudge([scores]);
    expect(agg.pedagogy).toBe(1);
    expect(agg.overall).toBeLessThan(5); // one low dimension pulls the headline down
    const report = formatJudge('test-model', agg);
    expect(report).toMatch(/pedagogy\s+1\.00 \/ 5/);
  });
});

describe('judge — directness dimension', () => {
  it('JUDGE_DIMENSIONS includes directness (nine dimensions)', () => {
    expect(JUDGE_DIMENSIONS).toContain('directness');
    expect(JUDGE_DIMENSIONS.length).toBe(9);
  });

  it('JUDGE_SYSTEM defines directness and carves out the blanks-alongside-answer exception', () => {
    expect(JUDGE_SYSTEM).toMatch(/directness/i);
    expect(JUDGE_SYSTEM).toMatch(/blanks/i);
    expect(JUDGE_SYSTEM).toMatch(/alongside/i);
    // The load-bearing distinction: penalize a deflection that stands IN PLACE OF an answer,
    // never a blank/question placed next to one.
    expect(JUDGE_SYSTEM).toMatch(/in place of|instead of/i);
  });

  it('parses a full nine-dimension object including directness', () => {
    const s = parseJudge(
      '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":4,"coherence":4,"pedagogy":4,"directness":2,"rationale":"buried the lead"}',
    );
    expect(s).not.toBeNull();
    expect(s!.directness).toBe(2);
  });

  it('marks directness unscored (0) for a legacy eight-dimension judge, staying usable', () => {
    const s = parseJudge(
      '{"accuracy":5,"completeness":5,"fillDepth":5,"fit":5,"wow":5,"intentFit":5,"coherence":5,"pedagogy":5}',
    );
    expect(s).not.toBeNull();
    expect(s!.directness).toBe(0);
    expect(s!.accuracy).toBe(5);
  });

  it('accepts the direct / answered_directly spelling aliases', () => {
    const a = parseJudge(
      '{"accuracy":3,"completeness":3,"fillDepth":3,"fit":3,"wow":3,"direct":5}',
    );
    expect(a!.directness).toBe(5);
    const b = parseJudge(
      '{"accuracy":3,"completeness":3,"fillDepth":3,"fit":3,"wow":3,"answered_directly":1}',
    );
    expect(b!.directness).toBe(1);
  });

  it('rides the same single judge call — directness adds no extra generate() invocation', async () => {
    let calls = 0;
    const generate = async () => {
      calls += 1;
      return '{"accuracy":4,"completeness":4,"fillDepth":4,"fit":4,"wow":4,"intentFit":4,"coherence":4,"pedagogy":4,"directness":2,"rationale":"ok"}';
    };
    const scores = await judgeAnswer(
      generate,
      'How do I compute a batting average?',
      sampleAnswer(),
    );
    expect(calls).toBe(1);
    expect(scores?.directness).toBe(2);
  });

  it('aggregateJudge and formatJudge carry directness through to the headline', () => {
    const scores: JudgeScores = {
      accuracy: 5,
      completeness: 5,
      fillDepth: 5,
      fit: 5,
      wow: 5,
      intentFit: 5,
      coherence: 5,
      pedagogy: 5,
      directness: 1, // deflected the ask
      rationale: 'never actually answered',
    };
    const agg = aggregateJudge([scores]);
    expect(agg.directness).toBe(1);
    expect(agg.overall).toBeLessThan(5);
    expect(formatJudge('test-model', agg)).toMatch(/directness\s+1\.00 \/ 5/);
  });
});

describe('goldenExtra — integrity', () => {
  const DOMAINS = new Set(['money', 'health', 'travel', 'decision', 'howto', 'business', 'learn']);

  it('has unique ids that do not collide with the base golden set', () => {
    const baseIds = new Set(GOLDEN.map((c) => c.id));
    const seen = new Set<string>();
    for (const c of GOLDEN_EXTRA) {
      expect(baseIds.has(c.id), `extra id "${c.id}" collides with golden`).toBe(false);
      expect(seen.has(c.id), `duplicate extra id "${c.id}"`).toBe(false);
      seen.add(c.id);
    }
  });

  it('every case has a valid domain, a non-empty expectBlock, and a sane count window', () => {
    for (const c of GOLDEN_EXTRA) {
      expect(DOMAINS.has(c.domain), `${c.id}: bad domain ${c.domain}`).toBe(true);
      expect(c.expectBlock.length, `${c.id}: empty expectBlock`).toBeGreaterThan(0);
      const min = c.minBlocks ?? 2;
      const max = c.maxBlocks ?? 5;
      expect(min, `${c.id}: min>max`).toBeLessThanOrEqual(max);
    }
  });

  it('forbidBlock never overlaps expectBlock', () => {
    for (const c of GOLDEN_EXTRA) {
      for (const f of c.forbidBlock ?? []) {
        expect(c.expectBlock.includes(f), `${c.id}: ${f} both expected and forbidden`).toBe(false);
      }
    }
  });

  it('factual (not estimate-only) cases carry a ground-truth reference', () => {
    for (const c of GOLDEN_EXTRA) {
      if (c.estimateOnly === false) {
        expect(c.reference, `${c.id}: factual case needs a reference`).toBeTruthy();
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2) Live run — EVAL_JUDGE=1 only. Answer + judge through real adapters.
 * ------------------------------------------------------------------ */

const RUN_JUDGE = !!process.env.EVAL_JUDGE;

// Direct API bases (no proxy in Node), mirroring the structural eval. Override via EVAL_BASE_URL.
const DIRECT_BASE: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai',
  grok: 'https://api.x.ai',
};

describe.skipIf(!RUN_JUDGE)('live quality eval (structural + LLM judge)', () => {
  it('scores the connected model on accuracy / completeness / fill / fit / wow', async () => {
    // The model being graded (reuses the structural eval's env knobs).
    const answerProvider = (process.env.EVAL_PROVIDER ?? 'gemini') as ProviderId;
    const answerModel = process.env.EVAL_MODEL || providerInfo(answerProvider).defaultModel;
    const answerCfg: ModelConfig = {
      provider: answerProvider,
      model: answerModel,
      apiKey: process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_BASE_URL ?? DIRECT_BASE[answerProvider],
    };
    const answerAdapter = getAdapter(answerProvider);

    // The judge — a separate, cheap JSON-mode model (default Gemini flash).
    const judgeProvider = (process.env.EVAL_JUDGE_PROVIDER ?? 'gemini') as ProviderId;
    if (judgeProvider === 'anthropic')
      throw new Error(
        'Judge cannot be anthropic (its adapter tool-forces the canvas schema). Use gemini or openai.',
      );
    const judgeModel = process.env.EVAL_JUDGE_MODEL || providerInfo(judgeProvider).defaultModel;
    const judgeCfg: ModelConfig = {
      provider: judgeProvider,
      model: judgeModel,
      apiKey: process.env.EVAL_JUDGE_KEY || process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_JUDGE_BASE_URL ?? DIRECT_BASE[judgeProvider],
    };
    const judgeAdapter = getAdapter(judgeProvider);
    // Accumulate the judge model's own token spend (it's a real cost too) so the artifact and the
    // console line can report answer-side and judge-side cost separately.
    const judgeTokens = { in: 0, out: 0, cached: 0, calls: 0 };
    const judgeGenerate = async (system: string, user: string) => {
      // Retry a transient judge failure (free-tier 503 "overloaded" / 429 rate limit) a couple of
      // times with backoff, so a blip doesn't silently leave the case unscored and skew the means —
      // a genuine error (bad key, 400) still surfaces after the retries and resolves to null.
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await judgeAdapter.generate({ system, history: [], user }, judgeCfg);
          if (r.usage) {
            judgeTokens.in += r.usage.input;
            judgeTokens.out += r.usage.output;
            judgeTokens.cached += r.usage.cachedInput;
            judgeTokens.calls += 1;
          }
          return r.raw;
        } catch (e) {
          lastErr = e;
          if (!/50[0-3]|429|RESOURCE_EXHAUSTED|UNAVAILABLE|overload/i.test(String(e))) throw e;
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        }
      }
      throw lastErr;
    };

    // Case set: base golden + the weak-domain extras (or a subset for a cheap smoke run).
    const set = process.env.EVAL_JUDGE_SET ?? 'all';
    const all: JudgeCase[] =
      set === 'golden' ? GOLDEN : set === 'extra' ? GOLDEN_EXTRA : [...GOLDEN, ...GOLDEN_EXTRA];
    // EVAL_JUDGE_ONLY=id1,id2 runs just those ids — a representative, domain-spanning subset
    // that fits under a rate-limited key (mirrors the structural eval's EVAL_ONLY).
    const only = process.env.EVAL_JUDGE_ONLY
      ? new Set(process.env.EVAL_JUDGE_ONLY.split(','))
      : null;
    const picked = only ? all.filter((c) => only.has(c.id)) : all;
    const limit = process.env.EVAL_JUDGE_LIMIT ? Number(process.env.EVAL_JUDGE_LIMIT) : undefined;
    const cases = limit ? picked.slice(0, limit) : picked;
    // EVAL_JUDGE_DELAY=ms waits between cases so a free-tier key's requests-per-minute limit
    // (Gemini flash-lite trips RESOURCE_EXHAUSTED ~15 rpm) doesn't abort the run. Default 0.
    const delayMs = process.env.EVAL_JUDGE_DELAY ? Number(process.env.EVAL_JUDGE_DELAY) : 0;

    const structural: CaseScore[] = [];
    const quality: (JudgeScores | null)[] = [];
    // The validated answers, kept so the JSON artifact can carry them — a future judge-only
    // re-score can replay these instead of paying for generation again.
    const responses: (LiveResponse | null)[] = [];
    // Hero usage: did the model actually pick from the specialized heroes the selector offered? Only
    // meaningful in menu-aware mode (where heroes are offered); reported below as the answer-vs-design gap.
    const heroUses: { offered: number; used: number; rate: number }[] = [];
    const report: string[] = [];
    const dump = !!process.env.EVAL_DUMP;
    // EVAL_MENU mirrors production: feed the per-turn specialized-component menu + the tier
    // prompt, so the eval measures whether the model actually reaches into the ~190-component
    // library — not just the base 8 the bare prompt teaches. Without it, rich-vocab usage is
    // structurally impossible (the model is never told the other types exist).
    const useMenu = !!process.env.EVAL_MENU;
    // process.stdout.write bypasses vitest's console interception, so the report survives a
    // piped / non-TTY run; a plain console.log is swallowed there and the scorecard is lost.
    const log = (line: string) => {
      report.push(line);
      process.stdout.write(`${line}\n`);
    };
    log(
      `  mode: ${useMenu ? 'menu-aware (frontier tier + per-turn component menu)' : 'base prompt only (base 8 + frontier 4)'}`,
    );

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      let resp: LiveResponse | null;
      let rawStr: string;
      let offeredTypes: string[] = []; // the per-turn menu (hoisted so hero-usage can read it below)
      let usage: TokenUsage | undefined; // the answer call's token usage, when the adapter reports it
      const started = performance.now();
      try {
        let system = LIVE_SYSTEM_PROMPT;
        let blockTypes: string[] | undefined;
        let allowed: ReadonlySet<string> | undefined;
        if (useMenu) {
          const complexity = classifyAsk(c.ask);
          const sel = selectComponents({ userText: c.ask, tier: 'frontier', complexity });
          // Mirror the live path's per-turn directives so the eval measures the SAME prompt the app
          // sends. Without them the bare static prompt forces ~10 blocks and ignores format pins, so
          // brevity (G3) and explicit-form (G2) behavior would be structurally untestable here.
          const requestedForms = detectRequested(c.ask).filter((t) => sel.allowed.has(t));
          // A learning ask gets the SHAPED-LESSON arc directive (hook → mechanism → worked example →
          // check-quiz) and the teaching block-count boost, exactly as generateLive injects them —
          // without this the judge grades teaching answers against a prompt that never asked for the
          // check-understanding beat pedagogy scores on, understating the real product.
          const teaching = complexity === 'rich' && isTeachingAsk(c.ask);
          const perTurn = [
            countDirective(complexity, targetBlockCount(complexity, { teaching })),
            formRequestDirective(requestedForms),
            teaching ? teachingArcDirective('standard') : '',
          ]
            .filter(Boolean)
            .join('\n\n');
          system =
            liveSystemPrompt('frontier') +
            (sel.promptSnippet ? `\n\n${sel.promptSnippet}` : '') +
            (perTurn ? `\n\n${perTurn}` : '');
          blockTypes = sel.types;
          allowed = sel.allowed;
          offeredTypes = sel.types;
        }
        const out = await answerAdapter.generate(
          { system, history: [], user: c.ask, blockTypes },
          answerCfg,
        );
        usage = out.usage;
        rawStr = typeof out.raw === 'string' ? out.raw : JSON.stringify(out.raw);
        const validated = validateLiveResponse(out.raw, allowed);
        resp = validated ? autoFix(validated) : null;
      } catch (err) {
        resp = null;
        rawStr = `ERROR: ${String(err)}`;
      }
      const s = scoreCase(c, resp);
      // This inline loop (unlike run.ts) never set latency/tokens before — wire them now so the
      // scorecard's speed + token blocks are populated and the artifact carries per-case cost.
      s.latencyMs = Math.round(performance.now() - started);
      if (usage) {
        s.tokensIn = usage.input;
        s.tokensOut = usage.output;
        s.tokensCached = usage.cachedInput;
      }
      structural.push(s);
      responses.push(resp);
      heroUses.push(heroUsage(offeredTypes, s.produced));
      const j = resp ? await judgeAnswer(judgeGenerate, c.ask, resp, c.reference, c.lesson) : null;
      quality.push(j);
      const dims = j ? JUDGE_DIMENSIONS.map((d) => `${d[0]}${j[d]}`).join(' ') : 'judge:—';
      log(
        `  [${i + 1}/${cases.length}] ${s.pass ? '✓' : '✗'} ${c.id}  [${s.produced.join(', ')}]  ${dims}${j ? `  — ${j.rationale}` : ''}`,
      );
      if (dump) log(`      raw: ${rawStr.slice(0, 700)}`);
      if (delayMs && i < cases.length - 1) await new Promise((r) => setTimeout(r, delayMs));
    }

    const scorecard = aggregate(`${answerProvider}:${answerModel}`, structural);
    const judgeAgg = aggregateJudge(quality);
    log(formatScorecard(scorecard));
    log(formatJudge(`judged by ${judgeProvider}:${judgeModel}`, judgeAgg));
    // Hero usage — the answer-vs-design gap: of the specialized heroes the selector OFFERED, how many
    // did the model actually render? A low rate means the menu is good but the model ignores it.
    const withHeroes = heroUses.filter((h) => h.offered > 0);
    if (withHeroes.length) {
      const meanRate = withHeroes.reduce((a, h) => a + h.rate, 0) / withHeroes.length;
      const usedAny = withHeroes.filter((h) => h.used > 0).length / withHeroes.length;
      log(
        `\n  hero usage   ${(meanRate * 100).toFixed(1)}% of offered heroes rendered   ` +
          `(${(usedAny * 100).toFixed(1)}% of answers used ≥1)   ← selection→answer gap`,
      );
    }

    // Cost — the honest price of this run, answer side and judge side, from EVAL_PRICES. Unpriced
    // models (a bespoke id not in the table) just skip their line rather than invent a number.
    const answerPrice = priceFor(answerModel);
    if (scorecard.usageN && answerPrice) {
      const answerCost = costUSD(
        {
          in: scorecard.tokensInTotal,
          out: scorecard.tokensOutTotal,
          cached: scorecard.tokensCachedTotal,
        },
        answerPrice,
      );
      log(
        `\n  answer cost  $${answerCost.toFixed(4)} total   $${(answerCost / scorecard.usageN).toFixed(5)}/case   ` +
          `(${scorecard.usageN}/${cases.length} cases reported tokens)`,
      );
    }
    const judgePrice = priceFor(judgeModel);
    if (judgeTokens.calls && judgePrice) {
      const judgeCost = costUSD(
        { in: judgeTokens.in, out: judgeTokens.out, cached: judgeTokens.cached },
        judgePrice,
      );
      log(
        `  judge cost   $${judgeCost.toFixed(4)} total over ${judgeTokens.calls} calls   in ${judgeTokens.in}  out ${judgeTokens.out}`,
      );
    }

    // Lowest-quality cases, with the judge's reason — the worklist for the next prompt pass.
    const worst = cases
      .map((c, i) => ({ c, j: quality[i] }))
      .filter((x): x is { c: JudgeCase; j: JudgeScores } => x.j !== null)
      .map((x) => ({
        id: x.c.id,
        overall: JUDGE_DIMENSIONS.reduce((a, d) => a + x.j[d], 0) / JUDGE_DIMENSIONS.length,
        why: x.j.rationale,
      }))
      .sort((a, b) => a.overall - b.overall)
      .slice(0, 8);
    if (worst.length) {
      log('\n  weakest answers (judge):');
      for (const w of worst) log(`    ${w.overall.toFixed(1)}  ${w.id.padEnd(24)} ${w.why}`);
    }

    // Persist the whole report so a piped/CI run never loses it (vitest swallows console).
    try {
      writeFileSync('/tmp/mavea-eval-judge.txt', report.join('\n'));
    } catch {
      /* best-effort — the stdout copy above is the primary output */
    }

    // Machine-readable artifact for A/B comparison (scripts/eval-compare.mts). EVAL_LABEL names it
    // so baseline and variant runs sit side by side; resp[] lets a future judge-only re-score
    // replay the stored answers instead of paying to regenerate them. Default label is a timestamp
    // so an unlabeled run never silently clobbers a previous one.
    const label = process.env.EVAL_LABEL ?? new Date().toISOString().replace(/[:.]/g, '-');
    try {
      mkdirSync('eval-out', { recursive: true });
      writeFileSync(
        `eval-out/judge-${label}.json`,
        JSON.stringify(
          {
            label,
            date: new Date().toISOString(),
            answerModel: `${answerProvider}:${answerModel}`,
            judgeModel: `${judgeProvider}:${judgeModel}`,
            mode: useMenu ? 'menu' : 'base',
            set,
            judgeTokens,
            scorecard,
            judgeAggregate: judgeAgg,
            cases: cases.map((c, i) => ({
              id: c.id,
              structural: structural[i],
              judge: quality[i],
              resp: responses[i],
            })),
          },
          null,
          2,
        ),
      );
      log(`\n  artifact → eval-out/judge-${label}.json`);
    } catch {
      /* best-effort — the stdout + /tmp copy above are the primary output */
    }

    expect(structural.length).toBe(cases.length);
    // 30 min: a full 54-case judged run is ~108 calls plus the inter-case rate-limit delay
    // (EVAL_JUDGE_DELAY, ~7.5s each) — comfortably over the old 10-min cap. Env-gated, never in CI.
  }, 1_800_000);
});
