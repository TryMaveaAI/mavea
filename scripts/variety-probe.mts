// variety-probe.mts — measure how many SPECIALIZED components the model actually RENDERS.
//
// Selection already offers ~188/200 specialized across a session (see select-coverage.mts), so
// the "same ten components" collapse is the model's staple-bias, not the menu. This probe runs
// the REAL generateLive pipeline over a small battery and reports, per turn, how many distinct
// specialized (non-standard-dozen) components survived into the rendered canvas — plus the
// session "library spread" (their union). Run it with the new prompt, then with the old one
// reverted, to A/B the prompt change. repair is OFF so we measure the model's FIRST pass only
// (the gate/repair lift is unit-tested separately) and spend exactly ONE call per turn.
//
// Sequential with a delay to respect a 5 RPM free tier (default 13s between calls).
//   LABEL=new npx tsx scripts/variety-probe.mts
//   DELAY=13000 LABEL=old npx tsx scripts/variety-probe.mts
import { readFileSync } from 'node:fs';
import { generateLive } from '../src/live/generateLive';
import { FRONTIER_BLOCK_TYPES } from '../src/engine/liveSchema';
import type { ModelConfig } from '../src/types/mavea';

const MODEL = 'gemini-3.1-flash-lite';
const DELAY = Number(process.env.DELAY ?? 13_000);
const LABEL = process.env.LABEL ?? 'run';

function readKey(): string {
  const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('GEMINI_API_KEY='));
  if (!line) throw new Error('GEMINI_API_KEY not found in repo-root .env');
  return line.slice('GEMINI_API_KEY='.length).trim();
}

const cfg: ModelConfig = {
  provider: 'gemini',
  model: MODEL,
  apiKey: readKey(),
  baseUrl: 'https://generativelanguage.googleapis.com',
};

const BATTERY = process.env.QS
  ? process.env.QS.split('|').map((s) => s.trim())
  : [
      'give me a detailed recipe for chicken biryani',
      'compare electric vs gas cars for a daily commuter',
      'explain how a neural network learns',
      'plan a 5-day trip to Lisbon',
      'how does a four-stroke car engine work',
      'teach me the basics of the periodic table',
    ];

const isSpecialized = (t: string) => !FRONTIER_BLOCK_TYPES.has(t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The length of a block's primary content array — how densely it's FILLED (a demo-grade
 *  timeline has ~6 events, not 2). Phase 2c lifts this via richer few-shot examples. */
function depthOf(props: Record<string, unknown>): number {
  for (const k of [
    'lines',
    'steps',
    'events',
    'rows',
    'items',
    'bars',
    'segments',
    'rings',
    'options',
    'criteria',
    'cats',
    'points',
    'pins',
    'kpis',
    'cells',
    'nodes',
    'data',
    'series',
    'columns',
  ]) {
    const v = props[k];
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

async function main(): Promise<void> {
  console.log(
    `\n=== variety probe [${LABEL}] — ${BATTERY.length} questions, ${MODEL}, delay ${DELAY}ms ===\n`,
  );
  const sessionSpecialized = new Set<string>();
  const used = new Set<string>();
  let totalSpecialized = 0;
  let totalBlocks = 0;
  let depthSum = 0;
  let depthBlocks = 0;
  let specDepthSum = 0;
  let specDepthBlocks = 0;

  for (let i = 0; i < BATTERY.length; i++) {
    const ask = BATTERY[i];
    try {
      const res = await generateLive(ask, [], cfg, () => {}, {
        repair: process.env.REPAIR === '1',
        rotation: i,
        recentTypes: [...used],
      });
      const blocks = res.spec.blocks as { type: string; props?: Record<string, unknown> }[];
      const types = blocks.map((b) => b.type);
      const spec = [...new Set(types.filter(isSpecialized))];
      const depths = blocks.map((b) => depthOf(b.props ?? {})).filter((d) => d > 0);
      // Specialized-only depth isolates the dense-example effect (the lead-hero examples target
      // SPECIALIZED blocks; averaging the staples in dilutes the signal).
      const specDepths = blocks
        .filter((b) => isSpecialized(b.type))
        .map((b) => depthOf(b.props ?? {}))
        .filter((d) => d > 0);
      const turnDepth = depths.length ? depths.reduce((a, d) => a + d, 0) / depths.length : 0;
      depthSum += depths.reduce((a, d) => a + d, 0);
      depthBlocks += depths.length;
      specDepthSum += specDepths.reduce((a, d) => a + d, 0);
      specDepthBlocks += specDepths.length;
      totalSpecialized += spec.length;
      totalBlocks += types.length;
      for (const t of types) used.add(t);
      for (const t of spec) sessionSpecialized.add(t);
      console.log(
        `  Q${i + 1} ${ask.slice(0, 38).padEnd(38)} ${types.length} blk · ${spec.length} spec · depth ${turnDepth.toFixed(1)} → union ${sessionSpecialized.size}`,
      );
      console.log(`       [${types.join(', ')}]`);
    } catch (e) {
      console.log(`  Q${i + 1} ✗ ${e instanceof Error ? e.message : e}`);
    }
    if (i < BATTERY.length - 1) await sleep(DELAY);
  }

  const n = BATTERY.length;
  console.log('');
  console.log(
    `  [${LABEL}] avg ${(totalSpecialized / n).toFixed(1)} specialized/turn · ${(totalBlocks / n).toFixed(1)} blocks/turn`,
  );
  console.log(
    `  [${LABEL}] avg FILL DEPTH ${(depthBlocks ? depthSum / depthBlocks : 0).toFixed(1)} items per content block (all)`,
  );
  console.log(
    `  [${LABEL}] avg SPECIALIZED depth ${(specDepthBlocks ? specDepthSum / specDepthBlocks : 0).toFixed(1)} items per specialized block (n=${specDepthBlocks})`,
  );
  console.log(
    `  [${LABEL}] LIBRARY SPREAD ${sessionSpecialized.size} distinct specialized rendered across the session`,
  );
  console.log(`  [${LABEL}] specialized used: [${[...sessionSpecialized].sort().join(', ')}]\n`);
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
