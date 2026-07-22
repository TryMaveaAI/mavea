// mark-probe.mts — a frugal, rate-limit-aware probe for drawn-gesture authoring.
//
// Runs a small battery of real questions through the ACTUAL generateLive pipeline against
// gemini-3.1-flash-lite and reports, per turn: did the model author a tour, how many stops,
// and how many stops carry a `mark` (the circle/underline/point gesture request) — plus
// whether each mark's `at` text actually appears in the named block's data (a mark that
// can't be located on screen falls back to the stamped salient node, so a low locate rate
// is a prompt problem worth knowing about). Sequential with a delay to respect free-tier
// RPM. ONE generate call per question. Reads the key from the repo-root .env.
//
//   npx tsx scripts/mark-probe.mts
//   QS="compare X and Y|how does Z work" npx tsx scripts/mark-probe.mts
//   DELAY=7000 npx tsx scripts/mark-probe.mts
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

// Mark-friendly asks: each has an obvious single datum a tutor would point at.
const DEFAULT_BATTERY = [
  'compare the calories in rice, pasta and bread',
  'which planet has the strongest gravity?',
  'how much should I save each month on a $5,000 income?',
  'what are the fastest animals on land?',
  'compare electric vs gas car running costs',
  'how long do the worlds longest bridges span?',
];

/** Normalized containment check — mirrors the runtime matcher's space/comma folding. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s,]/g, '');
}

function blockCarries(block: unknown, at: string): boolean {
  return norm(JSON.stringify(block ?? '')).includes(norm(at));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const battery = process.env.QS ? process.env.QS.split('|').map((s) => s.trim()) : DEFAULT_BATTERY;
  console.log(`mark probe: ${battery.length} questions against ${MODEL} (delay ${DELAY}ms)\n`);

  let toured = 0;
  let stops = 0;
  let marked = 0;
  let locatable = 0;
  for (let i = 0; i < battery.length; i++) {
    const ask = battery[i];
    try {
      const res = await generateLive(ask, [], cfg, () => {}, { repair: false });
      const tour = res.tour ?? [];
      if (tour.length > 0) toured++;
      stops += tour.length;
      const marks = tour.filter((t) => t.mark);
      marked += marks.length;
      const located = marks.filter(
        (t) => t.mark && blockCarries(res.spec.blocks[t.index], t.mark.at),
      );
      locatable += located.length;
      console.log(`━━━ Q${i + 1}: ${ask}`);
      console.log(
        `  blocks ${res.spec.blocks.length} · tour ${tour.length} stops · marks ${marks.length} (${located.length} locatable)`,
      );
      for (const t of marks) {
        const hit = t.mark && blockCarries(res.spec.blocks[t.index], t.mark.at) ? '✓' : '✗';
        console.log(`    ${hit} stop ${t.index} ${t.mark!.kind} @ ${JSON.stringify(t.mark!.at)}`);
      }
    } catch (e) {
      console.log(`━━━ Q${i + 1}: ${ask}\n  ✗ ${(e as Error).message}`);
    }
    if (i < battery.length - 1) await sleep(DELAY);
  }
  console.log(
    `\nTOTALS: ${toured}/${battery.length} turns toured · ${marked}/${stops} stops marked · ${locatable}/${marked || 1} marks locatable`,
  );
}

void main();
