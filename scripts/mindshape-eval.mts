// mindshape-eval.mts — Phase 0 quality gate for Watch Me Think.
// For each of the ~12 ramble fixtures: localExtract → settleMindShape (model + validate +
// grounding) → LLM judge (Gemini) → scorecard. Reads keys from repo-root .env.
//
// PASS CRITERION: mean resonance ≥ 4, mean fidelity ≥ 4, mean emergence ≥ 4, restraint never < 4.
// emergence = themes named from the person's own words, no generic categories imposed.
// Report the scorecard to the user before starting Phase 1.
//
// Run: pnpm eval:mindshape   (VERBOSE=1 for per-fixture detail)
import { readFileSync } from 'node:fs';
import { geminiAdapter } from '../src/live/providers/gemini';
import { localExtract } from '../src/live/mindshape/localExtract';
import { settleMindShape } from '../src/live/mindshape/modelRefine';
import {
  judgeMindShape,
  aggregateMindShapeJudge,
  type MindShapeJudgeScores,
} from '../src/live/mindshape/eval/judge';
import { FIXTURES } from '../src/live/mindshape/eval/fixtures';
import type { ModelConfig } from '../src/types/mavea';
import type { MindShapeSpec } from '../src/live/mindshape/types';

// gemini-3.1-flash-lite for extraction (fast, cheap); step up to the app's own suggested Flash for
// judging. There is no plain `gemini-3.1-flash` — the Flash line skips from 3.1-flash-lite to 3.5.
const REFINE_MODEL = 'gemini-3.1-flash-lite';
const JUDGE_MODEL = 'gemini-3.8-flash';
const DIRECT_BASE = 'https://generativelanguage.googleapis.com';

function readKey(name: string): string {
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in .env`);
  return line.slice(name.length + 1).trim();
}

/** Pause between calls to respect free-tier rate limits. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const key = readKey('GEMINI_API_KEY');
  const refineCfg: ModelConfig = {
    provider: 'gemini',
    model: REFINE_MODEL,
    apiKey: key,
    baseUrl: DIRECT_BASE,
  };
  const judgeCfg: ModelConfig = {
    provider: 'gemini',
    model: JUDGE_MODEL,
    apiKey: key,
    baseUrl: DIRECT_BASE,
  };

  async function judgeGenerate(system: string, user: string): Promise<string | object> {
    const req = { system, history: [], user, maxTokens: 400, thinkingLevel: 'minimal' as const };
    const out = await geminiAdapter.generate(req, judgeCfg);
    return out.raw;
  }

  console.log('\n━━━ MindShape Phase 0 Eval ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Refine: ${REFINE_MODEL}    Judge: ${JUDGE_MODEL}`);
  console.log(`Fixtures: ${FIXTURES.length}\n`);

  type FixtureResult = {
    id: string;
    name: string;
    localAtomCount: number;
    finalAtomCount: number;
    linkCount: number;
    hasTension: boolean;
    scores: MindShapeJudgeScores | null;
    validated: MindShapeSpec | null;
  };

  const results: FixtureResult[] = [];

  for (const fixture of FIXTURES) {
    process.stdout.write(`[${fixture.id}] ${fixture.name.padEnd(35)} `);

    // Step 1: local heuristic extract (instant, free)
    const localAtoms = localExtract(fixture.transcript);

    // Step 2: model settle — full transcript → validated, grounded shape
    const validated = await settleMindShape(fixture.transcript, refineCfg);
    await delay(400); // brief pause between settle + judge calls

    // Step 3: judge
    let scores: MindShapeJudgeScores | null = null;
    if (validated) {
      scores = await judgeMindShape(
        judgeGenerate,
        fixture.transcript,
        validated,
        fixture.referenceShape,
      );
      await delay(400);
    }

    const hasTension = validated?.links.some((l) => l.kind === 'tensions') ?? false;
    results.push({
      id: fixture.id,
      name: fixture.name,
      localAtomCount: localAtoms.length,
      finalAtomCount: validated?.atoms.length ?? 0,
      linkCount: validated?.links.length ?? 0,
      hasTension,
      scores,
      validated,
    });

    if (scores) {
      const f = scores.fidelity.toFixed(1);
      const c = scores.coverage.toFixed(1);
      const t = scores.tension.toFixed(1);
      const r = scores.restraint.toFixed(1);
      const res = scores.resonance.toFixed(1);
      const emg = scores.emergence.toFixed(1);
      const pass =
        scores.fidelity >= 4 &&
        scores.restraint >= 4 &&
        scores.resonance >= 4 &&
        scores.emergence >= 4;
      const passChar = pass ? '✓' : '✗';
      console.log(
        `${passChar}  fid=${f} cov=${c} ten=${t} rst=${r} res=${res} emg=${emg}  atoms=${validated?.atoms.length ?? 0}(+${localAtoms.length} local) themes=${validated?.clusters?.length ?? 0}`,
      );
    } else if (!validated) {
      console.log('✗  no valid shape produced');
    } else {
      console.log('✗  judge failed (check key / rate limit)');
    }
  }

  // ── Aggregate scorecard ────────────────────────────────────────────────────
  const allScores = results.map((r) => r.scores);
  const agg = aggregateMindShapeJudge(allScores);
  const restraintViolations = results.filter((r) => (r.scores?.restraint ?? 5) < 4);
  const meanPass =
    agg.resonance >= 4 &&
    agg.fidelity >= 4 &&
    agg.emergence >= 4 &&
    restraintViolations.length === 0;

  console.log('\n━━━ Scorecard ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Scored: ${agg.n}/${FIXTURES.length} fixtures`);
  console.log(`  fidelity   ${agg.fidelity.toFixed(2)} / 5   (gate: ≥ 4.0)`);
  console.log(`  coverage   ${agg.coverage.toFixed(2)} / 5`);
  console.log(`  tension    ${agg.tension.toFixed(2)} / 5`);
  console.log(`  restraint  ${agg.restraint.toFixed(2)} / 5   (gate: every fixture ≥ 4)`);
  console.log(`  resonance  ${agg.resonance.toFixed(2)} / 5   (gate: ≥ 4.0)`);
  console.log(`  emergence  ${agg.emergence.toFixed(2)} / 5   (gate: ≥ 4.0)`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  OVERALL    ${agg.overall.toFixed(2)} / 5`);

  if (restraintViolations.length > 0) {
    console.log(
      `\n⚠️  Restraint violations: ${restraintViolations.map((r) => `${r.id} (${r.scores?.restraint})`).join(', ')}`,
    );
  }

  const tensionCount = results.filter((r) => r.hasTension).length;
  console.log(
    `\n  Tensions found: ${tensionCount}/${results.filter((r) => r.validated).length} shapes`,
  );

  // ── Per-fixture details (for iteration) ───────────────────────────────────
  if (process.env.VERBOSE === '1') {
    console.log('\n━━━ Per-fixture details ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const r of results) {
      if (!r.validated) continue;
      console.log(`\n[${r.id}] ${r.name}`);
      console.log(`  center: "${r.validated.center}"`);
      console.log(
        `  themes: ${(r.validated.clusters ?? []).map((c) => `"${c.label}"`).join(' | ') || '(none)'}`,
      );
      console.log(`  atoms: ${r.validated.atoms.map((a) => `${a.kind}:${a.label}`).join(' | ')}`);
      if (r.validated.unsaid) {
        console.log(
          `  unsaid: "${r.validated.unsaid.label}" (${r.validated.unsaid.confidence}) — ${r.validated.unsaid.why}`,
        );
      }
      if (r.scores) {
        console.log(`  rationale: ${r.scores.rationale}`);
      }
    }
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  console.log('\n━━━ Verdict ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (meanPass) {
    console.log('✓ GATE PASSED — Phase 1 (the visual build) is cleared.');
    console.log('  Report these scores to the user before starting Phase 1.\n');
    process.exit(0);
  } else {
    console.log('✗ GATE NOT MET — iterate the prompt or reconsider scope before Phase 1.');
    if (agg.fidelity < 4) console.log(`  → fidelity too low (${agg.fidelity.toFixed(2)} < 4.0)`);
    if (agg.resonance < 4) console.log(`  → resonance too low (${agg.resonance.toFixed(2)} < 4.0)`);
    if (agg.emergence < 4)
      console.log(
        `  → emergence too low (${agg.emergence.toFixed(2)} < 4.0) — themes drifting to generic categories`,
      );
    if (restraintViolations.length > 0)
      console.log(`  → restraint violations: ${restraintViolations.map((r) => r.id).join(', ')}`);
    console.log('  Add VERBOSE=1 for per-fixture detail.\n');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
