// live-probe.mts — a frugal, rate-limit-aware quality probe for Live answers.
//
// Runs a small battery of real questions through the ACTUAL generateLive pipeline against
// gemini-3.1-flash-lite and prints each answer's DEPTH + TONE, so we can judge whether Live
// is genuinely more useful than plain chat (the bar), not just pretty. Sequential with a
// delay between calls to respect the free-tier RPM limit. Spends ONE generate call per
// question (no probe, no repair retry). Reads the key from the repo-root .env.
//
//   npx tsx scripts/live-probe.mts                  # default battery
//   QS="recipe for biryani|how to change a tire" npx tsx scripts/live-probe.mts
//   DELAY=7000 npx tsx scripts/live-probe.mts       # ms between calls (default 6500)
import { readFileSync } from 'node:fs';
import { generateLive } from '../src/live/generateLive';
import type { ModelConfig } from '../src/types/mavea';

const MODEL = 'gemini-3.1-flash-lite';
const DELAY = Number(process.env.DELAY ?? 6500);

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
  baseUrl: 'https://generativelanguage.googleapis.com',
};

const DEFAULT_BATTERY = [
  'give me a detailed recipe for chicken biryani',
  'how do I change a flat tire',
  'explain how a neural network learns',
  'should I buy or lease a car',
  'tell me about Japan',
  'how do linked lists work',
];

/** The primary content array of a block (whichever it has), to gauge depth. */
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
  ]) {
    const v = props[k];
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const battery = process.env.QS ? process.env.QS.split('|').map((s) => s.trim()) : DEFAULT_BATTERY;
  console.log(`probing ${battery.length} questions against ${MODEL} (delay ${DELAY}ms)\n`);

  for (let i = 0; i < battery.length; i++) {
    const ask = battery[i];
    try {
      const res = await generateLive(ask, [], cfg, () => {}, { repair: false });
      const blocks = res.spec.blocks;
      console.log(`━━━ Q${i + 1}: ${ask}`);
      console.log(`  narration: ${JSON.stringify(res.narration)}`);
      console.log(`  title    : ${res.spec.title} — ${res.spec.sub ?? ''}`);
      const tour = (res as { tour?: { index: number; say?: string }[] }).tour ?? [];
      console.log(
        `  tour(${tour.length}): ${tour.map((t) => `[${t.index}] ${t.say ?? '—'}`).join('  |  ') || '(none)'}`,
      );
      console.log(`  blocks(${blocks.length}):`);
      for (const b of blocks) {
        const props = (b as { props?: Record<string, unknown> }).props ?? {};
        const d = depthOf(props);
        const json = JSON.stringify(props);
        console.log(
          `    • ${b.type.padEnd(12)} depth=${String(d).padStart(2)}  ${json.slice(0, 240)}`,
        );
      }
      console.log('');
    } catch (e) {
      console.log(`━━━ Q${i + 1}: ${ask}\n  ✗ ${e instanceof Error ? e.message : e}\n`);
    }
    if (i < battery.length - 1) await sleep(DELAY);
  }
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
