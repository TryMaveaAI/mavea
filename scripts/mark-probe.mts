// mark-probe.mts — a frugal, rate-limit-aware probe for drawn-gesture authoring.
//
// Runs a small battery of real questions through the ACTUAL generateLive pipeline against
// gemini-3.1-flash-lite and reports, per turn: did the model author a tour, how many stops,
// how many gestures those stops carry, and whether each one's `at` text actually appears in
// the named block's data (a mark that can't be located draws nothing, so a low locate rate is
// a prompt problem worth knowing about).
//
// It also prints a PER-KIND histogram, which is the number that matters. The aggregate hides the
// failure mode entirely: measured across this repo's baked corpora, 91% of tour stops carried a
// mark — a healthy-looking funnel — while three of the fifteen kinds accounted for 77% of all ink
// and four had never been authored once. An average cannot see a vocabulary collapsing, and the
// earlier version of this probe counted only `t.mark` (the mirror of the FIRST gesture on a stop),
// so it could not have seen it either. Watch the silent-kinds line.
//
// Sequential with a delay to respect free-tier RPM. ONE generate call per question — this spends
// real tokens on the key in the repo-root .env, so it is a deliberate, on-demand instrument.
//
//   npx tsx scripts/mark-probe.mts
//   QS="compare X and Y|how does Z work" npx tsx scripts/mark-probe.mts
//   DELAY=7000 npx tsx scripts/mark-probe.mts
//   JSON=1 npx tsx scripts/mark-probe.mts     # also emit a machine-readable baseline
import { readFileSync } from 'node:fs';
import { MARK_KINDS } from '../src/engine/liveSchema';
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
  let stopsMarked = 0;
  let marked = 0;
  let locatable = 0;
  // Per-kind, because the aggregate hid the whole problem: with 91% of stops marked the funnel
  // reads healthy, while three kinds carry 77% of the ink and four have never been authored at all.
  const authored = new Map<string, number>();
  const located = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);

  for (let i = 0; i < battery.length; i++) {
    const ask = battery[i];
    try {
      const res = await generateLive(ask, [], cfg, () => {}, { repair: false });
      const tour = res.tour ?? [];
      if (tour.length > 0) toured++;
      stops += tour.length;
      // Every gesture on every stop — `marks[]` is the real payload; `mark` only mirrors the first,
      // so counting it alone under-reports any stop that draws more than one.
      const marks = tour.flatMap((t) =>
        (t.marks ?? (t.mark ? [t.mark] : [])).map((mark) => ({ mark, index: t.index })),
      );
      stopsMarked += tour.filter((t) => (t.marks ?? (t.mark ? [t.mark] : [])).length > 0).length;
      marked += marks.length;
      let hereLocated = 0;
      for (const { mark, index } of marks) {
        bump(authored, mark.kind);
        if (blockCarries(res.spec.blocks[index], mark.at)) {
          bump(located, mark.kind);
          hereLocated++;
        }
      }
      locatable += hereLocated;
      console.log(`━━━ Q${i + 1}: ${ask}`);
      console.log(
        `  blocks ${res.spec.blocks.length} · tour ${tour.length} stops · marks ${marks.length} (${hereLocated} locatable)`,
      );
      for (const { mark, index } of marks) {
        const hit = blockCarries(res.spec.blocks[index], mark.at) ? '✓' : '✗';
        console.log(`    ${hit} stop ${index} ${mark.kind} @ ${JSON.stringify(mark.at)}`);
      }
    } catch (e) {
      console.log(`━━━ Q${i + 1}: ${ask}\n  ✗ ${(e as Error).message}`);
    }
    if (i < battery.length - 1) await sleep(DELAY);
  }

  console.log(
    `\nTOTALS: ${toured}/${battery.length} turns toured · ${stopsMarked}/${stops} stops marked · ${marked} marks · ${locatable}/${marked || 1} locatable`,
  );
  console.log('\nPER KIND (authored · locatable · share of all ink)');
  const bar = (n: number, of: number): string => '█'.repeat(Math.round((n / (of || 1)) * 28));
  const top = Math.max(1, ...[...authored.values()]);
  for (const kind of MARK_KINDS) {
    const a = authored.get(kind) ?? 0;
    const l = located.get(kind) ?? 0;
    const share = marked ? ((a / marked) * 100).toFixed(1) : '0.0';
    const flag = a === 0 ? '  ← never authored' : '';
    console.log(
      `  ${kind.padEnd(10)} ${String(a).padStart(3)} ${String(l).padStart(4)}  ${share.padStart(5)}%  ${bar(a, top)}${flag}`,
    );
  }
  const silent = [...MARK_KINDS].filter((k) => !authored.get(k));
  console.log(
    `\n${MARK_KINDS.size - silent.length}/${MARK_KINDS.size} kinds authored at least once.` +
      (silent.length ? ` Silent: ${silent.join(', ')}` : ''),
  );
  if (process.env.JSON) {
    const rows = [...MARK_KINDS].map((k) => [k, authored.get(k) ?? 0, located.get(k) ?? 0]);
    console.log(
      `\n${JSON.stringify({ model: MODEL, asks: battery.length, toured, stops, stopsMarked, marked, locatable, byKind: Object.fromEntries(rows.map(([k, a, l]) => [k, { authored: a, locatable: l }])) }, null, 2)}`,
    );
  }
}

void main();
