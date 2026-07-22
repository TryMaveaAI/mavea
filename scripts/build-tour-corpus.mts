// build-tour-corpus.mts — bake the first-run film's REAL conversations into a committed fixture.
//
// The walkthrough replays genuine Mavea answers, not hand-authored mock. This script runs a
// small battery of asks from unrelated domains through the ACTUAL generateLive pipeline
// (default: gemini-3.1-flash-lite), assembles each settled turn into the exact `TurnFrame` the
// live surface persists, and writes them to src/tour/corpus/corpus.generated.json. That fixture
// then replays fully offline (no key) through the existing beat/replay machinery — so a
// first-time visitor watches the real product build a bespoke canvas for each question.
//
//   GEMINI_API_KEY=… npx vite-node scripts/build-tour-corpus.mts          # generate all
//   ONLY=money,space GEMINI_API_KEY=… npx vite-node scripts/build-tour-corpus.mts   # a subset
//   DELAY=7000 …                                                     # ms between calls (free-tier RPM)
//
// Honesty: every ask has a real, non-fabricated answer (math / science / how-to / advice) — we
// deliberately avoid prompts that would force the model to invent someone's private data.
import { readFileSync, writeFileSync } from 'node:fs';
import { generateLive } from '../src/live/generateLive';
import { mergeForMode } from '../src/live/lifecycle';
import { remapTour } from '../src/live/tourRemap';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { TourConversation, TourCorpus } from '../src/tour/corpus/types';
import type { ModelConfig } from '../src/types/mavea';

const MODEL = process.env.TOUR_MODEL ?? 'gemini-3.1-flash-lite';
const DELAY = Number(process.env.DELAY ?? 6500);
const OUT = new URL('../src/tour/corpus/corpus.generated.json', import.meta.url);

/** The battery: one ask per domain, chosen for range (span subjects → span block families) and
 *  for honesty (each has a real answer). `money` is the "deep" one the feature chapters layer on;
 *  it is pure math, so its numbers are provable — the "point at a number, prove it" beat is real. */
interface Ask {
  id: string;
  domain: string;
  emoji: string;
  question: string;
}
const BATTERY: Ask[] = [
  {
    id: 'money',
    domain: 'Money',
    emoji: '💰',
    question:
      'Chart how a $10,000 investment grows at 7% a year for 30 years — show the year-by-year total and break down principal vs. interest earned.',
  },
  {
    // The money answer's own "Keep going" chip, baked as a real follow-up — the tour's chips
    // chapter taps it and this answer plays, so "tap one and Mavea takes it further" is shown live.
    id: 'monthly',
    domain: 'Money',
    emoji: '💰',
    question:
      'Starting from a $10,000 investment growing at 7% a year for 30 years — what if I also added $500 every month? Chart both paths side by side and show how much of the final total comes from the monthly contributions.',
  },
  {
    id: 'space',
    domain: 'Science',
    emoji: '🔭',
    question: 'Explain how a black hole bends light around it',
  },
  {
    id: 'travel',
    domain: 'Travel',
    emoji: '🗾',
    question: 'Plan a 5-day first-timer trip to Japan',
  },
  {
    id: 'fitness',
    domain: 'Health',
    emoji: '🏋️',
    question: 'Design a beginner 3-day-a-week strength routine',
  },
  {
    id: 'code',
    domain: 'Engineering',
    emoji: '🔐',
    question: 'Explain how OAuth login works, step by step',
  },
  {
    id: 'food',
    domain: 'Everyday',
    emoji: '🍝',
    question: 'A fast weeknight pasta from pantry staples',
  },
  // ---- wow-harvest: prompts chosen to elicit the coolest, most varied block families, so we
  //      can cherry-pick only the most impressive interactions for the film. ----
  {
    id: 'ev',
    domain: 'Compare',
    emoji: '🚗',
    question:
      'Compare the top 5 electric cars on range, price, and charging speed in a decision table',
  },
  {
    id: 'budget',
    domain: 'Money',
    emoji: '🏛️',
    question: 'Break down where the US federal budget is spent, by category, as a flow',
  },
  {
    id: 'roadtrip',
    domain: 'Travel',
    emoji: '🛣️',
    question: 'Map a 7-day Pacific Coast Highway road trip from San Francisco to LA',
  },
  {
    id: 'neural',
    domain: 'Science',
    emoji: '🧠',
    question: 'How does a neural network learn? Walk me through it as a labeled diagram',
  },
  {
    id: 'solar',
    domain: 'Money',
    emoji: '☀️',
    question:
      'Chart the 25-year payback of a $20,000 home solar install vs. paying the utility, year by year',
  },
  {
    id: 'photosynthesis',
    domain: 'Science',
    emoji: '🌿',
    question: 'Explain photosynthesis as a step-by-step labeled process diagram',
  },
  {
    id: 'langs',
    domain: 'Engineering',
    emoji: '⚙️',
    question: 'Compare Python, Rust, and Go for a web backend across speed, safety, and ecosystem',
  },
  {
    id: 'url',
    domain: 'Engineering',
    emoji: '🌐',
    question: 'Walk through exactly what happens when you type a URL and press enter, step by step',
  },
  {
    id: 'sleep',
    domain: 'Health',
    emoji: '😴',
    question: 'Give me a 2-week plan to fix my sleep schedule, with a daily timeline',
  },
  {
    id: 'krebs',
    domain: 'Science',
    emoji: '🔬',
    question: 'Explain the Krebs cycle as a diagram of its stages',
  },
  {
    id: 'mortgage',
    domain: 'Money',
    emoji: '🏠',
    question: 'Buy vs. rent a $500,000 home over 10 years — chart the cost and give me a verdict',
  },
  {
    id: 'coffee',
    domain: 'Everyday',
    emoji: '☕',
    question: 'Compare pour-over, espresso, French press, and AeroPress for a home barista',
  },
];

/** Read the Gemini key: prefer the environment, else scan the usual .env locations. Never logs it. */
function readKey(): string {
  const fromEnv = process.env.GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const candidates = ['../../.env', '../../../.env', '../.env'];
  for (const rel of candidates) {
    try {
      const env = readFileSync(new URL(rel, import.meta.url), 'utf8');
      const line = env.split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
      if (line) {
        const v = line.slice('GEMINI_API_KEY='.length).trim();
        if (v) return v;
      }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('GEMINI_API_KEY not found (set it in the environment or a .env file)');
}

const cfg: ModelConfig = {
  provider: 'gemini',
  model: MODEL,
  apiKey: readKey(),
  baseUrl: 'https://generativelanguage.googleapis.com',
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Turn one settled model result into the canonical per-turn snapshot, exactly as the live
 *  surface does for a fresh conversation (first turn ⇒ mode 'replace', identity merge/remap). */
function toFrame(question: string, result: Awaited<ReturnType<typeof generateLive>>): TurnFrame {
  const merge = mergeForMode([], result.spec.blocks, 'replace');
  const spec = { ...result.spec, blocks: merge.blocks };
  const tour = remapTour(result.tour ?? [], result.spec.blocks, merge.blocks);
  return {
    question,
    narration: result.narration,
    mode: 'replace',
    tour,
    spec,
    at: Date.now(),
  };
}

async function main(): Promise<void> {
  const only = process.env.ONLY?.split(',').map((s) => s.trim());
  const battery = only ? BATTERY.filter((a) => only.includes(a.id)) : BATTERY;
  console.log(`baking ${battery.length} real conversations against ${MODEL} (delay ${DELAY}ms)\n`);

  const conversations: TourConversation[] = [];
  for (let i = 0; i < battery.length; i++) {
    const ask = battery[i];
    try {
      const result = await generateLive(ask.question, [], cfg, () => {}, { repair: false });
      if (result.error) throw new Error(result.error.message ?? 'model error');
      const frame = toFrame(ask.question, result);
      const history: ChatMessage[] = [
        { role: 'user', content: ask.question },
        { role: 'assistant', content: result.narration },
      ];
      conversations.push({ ...ask, frames: [frame], history });

      const types = frame.spec.blocks.map((b) => b.type).join(', ');
      console.log(
        `✓ ${ask.emoji} ${ask.id.padEnd(8)} ${frame.spec.blocks.length} blocks · ${frame.tour.length} stops`,
      );
      console.log(`    ${ask.question}`);
      console.log(`    → ${frame.spec.title ?? ''} — ${frame.spec.sub ?? ''}`);
      console.log(`    [${types}]\n`);
    } catch (e) {
      console.log(`✗ ${ask.emoji} ${ask.id}: ${e instanceof Error ? e.message : e}\n`);
    }
    if (i < battery.length - 1) await sleep(DELAY);
  }

  if (!conversations.length) {
    console.error('no conversations generated — nothing written');
    process.exit(1);
  }

  // Merge with any existing corpus so a subset run (ONLY=…) refreshes just those entries and
  // keeps the rest, preserving the film's intended order from BATTERY.
  let existing: TourConversation[] = [];
  try {
    existing = (JSON.parse(readFileSync(OUT, 'utf8')) as TourCorpus).conversations ?? [];
  } catch {
    /* first run — no prior corpus */
  }
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of conversations) byId.set(c.id, c);
  const ordered = BATTERY.map((a) => byId.get(a.id)).filter((c): c is TourConversation => !!c);

  const corpus: TourCorpus = {
    v: 1,
    generatedAt: Date.now(),
    model: MODEL,
    conversations: ordered,
  };
  writeFileSync(OUT, JSON.stringify(corpus, null, 2) + '\n', 'utf8');
  console.log(`wrote ${ordered.length} conversations → ${OUT.pathname}`);
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
