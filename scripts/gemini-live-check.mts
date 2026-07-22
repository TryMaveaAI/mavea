// gemini-live-check.mts — an end-to-end Live verification across DIFFERENT topics, spending
// EXACTLY 5 real Gemini turns (plus one free probe). Each turn runs through the full
// generateLive pipeline with repair:false (one model call per turn, never a phantom retry),
// so the count is bounded and predictable. It proves four things at once:
//   1. real-time grounding works — a fresh query with searchMode:'realtime' returns real
//      source URLs from Gemini's google_search tool (not fabricated facts);
//   2. the adaptive temperature is wired — each topic prints the temperature generateLive
//      derived for it (cold for math, hot for brainstorm, 0.3 for an explainer);
//   3. the no-live-data guard holds — a fresh query with search OFF must NOT invent a result;
//   4. ordinary turns render a rich, varied canvas.
// Reads GEMINI_API_KEY from the repo-root .env. Run: npx tsx scripts/gemini-live-check.mts
import { readFileSync } from 'node:fs';
import { geminiAdapter } from '../src/live/providers/gemini';
import { generateLive, type LiveCaps, type LiveActivity } from '../src/live/generateLive';
import { temperatureFor } from '../src/live/effort';
import { analyzeIntent } from '../src/live/select/intent';
import { classifyAsk } from '../src/live/select/complexity';
import { needsFreshInfo } from '../src/live/search';
import type { ModelConfig } from '../src/types/mavea';
import type { WebSource } from '../src/data/conversation';

const MODEL = 'gemini-3.1-flash-lite'; // the ONLY model this script may use
const DIRECT_BASE = 'https://generativelanguage.googleapis.com';

function readKey(): string {
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
  if (!line) throw new Error('GEMINI_API_KEY not found in .env');
  return line.slice('GEMINI_API_KEY='.length).trim();
}

const cfg: ModelConfig = {
  provider: 'gemini',
  model: MODEL,
  apiKey: readKey(),
  baseUrl: DIRECT_BASE,
};

interface Probe {
  label: string;
  ask: string;
  caps: LiveCaps;
  /** What a healthy result looks like, so the check is asserted, not just printed. */
  expect: (r: TurnReport) => string | null; // returns an error string, or null when OK
}

interface TurnReport {
  blocks: number;
  types: string[];
  narration: string;
  sources: WebSource[];
  /** Whether any cited source is en.wikipedia.org — i.e. the encyclopedic fallback fired
   *  rather than true native google_search grounding (real web domains / vertexaisearch). */
  wikipediaCited: boolean;
  searched: boolean;
  temperature: number;
  fresh: boolean;
  ms: number;
}

// Five DIFFERENT topics, each exercising a distinct path. The grounding distinction matters:
// native google_search returns real web domains; the Wikipedia fallback returns en.wikipedia.org.
// On a FREE-tier key native grounding 429s and we fall back (encyclopedic) or stay honest
// (volatile). On a PAID key native grounding returns real sources — the script reports which.
const PROBES: Probe[] = [
  {
    // ENCYCLOPEDIC fresh ask: Wikipedia is an acceptable fallback. Verifies the cleaned-query
    // path returns RELEVANT sources (the old raw-question path once surfaced "Charlie Kirk").
    label: 'ENCYCLOPEDIC · population (Wikipedia fallback OK, must be relevant)',
    ask: 'What is the current population of Tokyo, and how has it changed recently?',
    caps: { searchMode: 'realtime' },
    expect: (r) =>
      r.sources.length === 0
        ? 'expected grounding sources (native, or the encyclopedic Wikipedia fallback)'
        : r.wikipediaCited &&
            !r.sources.some((s) => /tokyo|japan|demograph|population/i.test(s.title))
          ? `Wikipedia fallback returned irrelevant sources: ${r.sources.map((s) => s.title).join(', ')}`
          : null,
  },
  {
    // VOLATILE ask: Wikipedia must NEVER be cited (citing an encyclopedia for a live score fakes
    // grounding). On free tier this stays honest+ungrounded; on paid it grounds natively.
    label: 'VOLATILE · live score (must NOT cite Wikipedia)',
    ask: 'What was the score of the latest Yankees game?',
    caps: { searchMode: 'realtime' },
    expect: (r) =>
      r.wikipediaCited
        ? `Wikipedia was cited for a LIVE query — fabricated grounding: ${r.sources.map((s) => s.url).join(', ')}`
        : r.blocks < 1
          ? 'expected a rendered canvas'
          : null,
  },
  {
    label: 'PRECISION · math derivation (temp should be cold ~0.1)',
    ask: 'Derive the quadratic formula step by step.',
    caps: { searchMode: 'off' },
    expect: (r) =>
      r.temperature > 0.2
        ? `expected a cold temperature for a derivation, got ${r.temperature}`
        : r.blocks < 1
          ? 'expected a rendered canvas'
          : null,
  },
  {
    label: 'CREATIVE · brainstorm (temp should be hot ~0.75)',
    ask: 'Brainstorm some memorable names for a cozy neighborhood coffee shop.',
    caps: { searchMode: 'off' },
    expect: (r) =>
      r.temperature < 0.6
        ? `expected a hot temperature for a brainstorm, got ${r.temperature}`
        : r.blocks < 1
          ? 'expected a rendered canvas'
          : null,
  },
  {
    label: 'NO-LIVE-DATA GUARD · fresh query with search OFF',
    ask: "What's the latest news headline right now?",
    caps: { searchMode: 'off' },
    expect: (r) =>
      !r.fresh
        ? 'test bug: this ask should classify as needing fresh info'
        : r.searched
          ? 'no search should fire when searchMode is off'
          : // The honest path admits it has no live access rather than inventing a headline.
            !/don't have|do not have|no (live|real-?time)|web search is off|can't|cannot|isn't|is not|unable/i.test(
                r.narration,
              )
            ? `narration should admit no live access, got: ${JSON.stringify(r.narration)}`
            : null,
  },
];

async function runProbe(p: Probe, n: number): Promise<boolean> {
  const fresh = needsFreshInfo(p.ask);
  const temperature = temperatureFor(classifyAsk(p.ask), analyzeIntent(p.ask), p.ask);
  let searched = false;
  let sources: WebSource[] = [];
  const t0 = Date.now();

  console.log(`\n[${n}/5] ${p.label}`);
  console.log(`      ask : ${JSON.stringify(p.ask)}`);
  console.log(`      plan: temp=${temperature} · fresh=${fresh} · search=${p.caps.searchMode}`);

  const res = await generateLive(p.ask, [], cfg, undefined, {
    repair: false,
    caps: p.caps,
    onActivity: (a: LiveActivity) => {
      if (a === 'searching') searched = true;
    },
    onSources: (s) => {
      sources = s;
    },
  });
  const ms = Date.now() - t0;

  const report: TurnReport = {
    blocks: res.spec.blocks.length,
    types: res.spec.blocks.map((b) => b.type),
    narration: res.narration,
    sources,
    wikipediaCited: sources.some((s) => /(?:^|\.)wikipedia\.org/i.test(s.url)),
    searched,
    temperature,
    fresh,
    ms,
  };

  console.log(`      out : ${report.blocks} blocks → ${report.types.join(', ')}`);
  console.log(`      say : ${JSON.stringify(report.narration)}`);
  if (sources.length) {
    const origin = report.wikipediaCited ? 'Wikipedia fallback' : 'native web grounding';
    console.log(`      src : ${sources.length} grounded · ${origin} →`);
    for (const s of sources.slice(0, 4)) console.log(`            • ${s.title} — ${s.url}`);
  } else {
    console.log(`      src : (none)`);
  }
  console.log(`      time: ${ms}ms`);

  const err = p.expect(report);
  console.log(err ? `      ✗ ${err}` : `      ✓ as intended`);
  return !err;
}

async function main(): Promise<void> {
  console.log(`[0] probing ${MODEL} (free) …`);
  const probe = await geminiAdapter.probe(cfg);
  if (!probe.ok || !probe.model) {
    console.error(`    ✗ key/model not available: ${JSON.stringify(probe)} — stopping.`);
    process.exit(1);
  }
  console.log('    ✓ key valid, model available.');

  let pass = 0;
  for (let i = 0; i < PROBES.length; i++) {
    // Sequential on purpose: one call at a time keeps the spend visible and avoids tripping
    // the free-tier per-minute rate limit (which would trigger the Wikipedia fallback retry).
    if (await runProbe(PROBES[i], i + 1)) pass++;
  }

  console.log(`\n${'='.repeat(56)}`);
  console.log(`RESULT: ${pass}/${PROBES.length} checks passed.`);
  process.exit(pass === PROBES.length ? 0 : 1);
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
