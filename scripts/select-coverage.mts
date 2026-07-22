// select-coverage.mts — a 0-call diagnostic of the Live SELECTION breadth.
//
// The complaint is "Live only ever uses ~10 of ~200 components". Selection is pure (no model,
// no network), so we can measure — for free — how many DISTINCT specialized components the
// per-turn menu actually OFFERS across a varied, multi-turn session. If this union is already
// large, selection isn't the bottleneck (the model's staple-bias is, which Phase 2 targets);
// if it's small, an exploration quota (Phase 3) is warranted. We measure two ways:
//   independent — each question drawn cold (no session memory)
//   cumulative  — threading the running used-set as `recent`, the way the real app does
//
//   npx tsx scripts/select-coverage.mts
import { selectComponents } from '../src/live/select';
import { classifyAsk } from '../src/live/select';
import { FRONTIER_BLOCK_TYPES } from '../src/engine/liveSchema';

const BATTERY = [
  'give me a detailed recipe for chicken biryani',
  'compare electric vs gas cars for a daily commuter',
  'explain how a neural network learns',
  'what is the population trend of Japan over 50 years',
  'how should I budget a $5,000 monthly income',
  'plan a 5-day trip to Lisbon',
  'what are the main causes of climate change',
  'teach me the basics of the periodic table',
  'how does a four-stroke car engine work',
  'which programming languages should I learn in 2026',
  'explain the water cycle step by step',
  'compare the iPhone and the latest Android flagship',
];

const TIER = 'mid' as const;
const specialized = (types: string[]) => types.filter((t) => !FRONTIER_BLOCK_TYPES.has(t));

function run(): void {
  console.log(`selection coverage over ${BATTERY.length} questions (tier=${TIER})\n`);

  // independent: each question cold.
  const indep = new Set<string>();
  let indepPerTurn = 0;
  for (let i = 0; i < BATTERY.length; i++) {
    const sel = selectComponents({
      userText: BATTERY[i],
      tier: TIER,
      complexity: classifyAsk(BATTERY[i]),
      rotation: i,
    });
    const spec = specialized(sel.types);
    indepPerTurn += spec.length;
    for (const t of spec) indep.add(t);
  }

  // cumulative: thread the running union as `recent` (what the app does with usedTypesRef).
  const used = new Set<string>();
  const cumWords: string[][] = [];
  for (let i = 0; i < BATTERY.length; i++) {
    const sel = selectComponents({
      userText: BATTERY[i],
      tier: TIER,
      complexity: classifyAsk(BATTERY[i]),
      rotation: i,
      recent: [...used],
    });
    const spec = specialized(sel.types);
    cumWords.push(spec);
    for (const t of spec) used.add(t); // approximate: assume the offered specialized get used
    console.log(
      `  Q${String(i + 1).padStart(2)}  offered ${String(spec.length).padStart(2)} specialized → running union ${used.size}`,
    );
  }

  console.log('');
  console.log(
    `  INDEPENDENT  avg ${(indepPerTurn / BATTERY.length).toFixed(1)} specialized offered/turn   union ${indep.size} distinct`,
  );
  console.log(`  CUMULATIVE   union ${used.size} distinct specialized offered across the session`);
  console.log(
    `  (catalog has ~200 specialized; this is the SELECTION ceiling the model picks from)`,
  );
}

run();
