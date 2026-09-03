// build-demo-corpus.mts — bake the landing demos' REAL sessions into committed fixtures.
//
// Every demo persona's script (src/demo/scripts.ts) runs through the ACTUAL generateLive
// pipeline, turn by turn, with the real accumulated history — so augment/refine follow-ups
// merge exactly as they would live (the shared settleTurn step guarantees it). Each persona's
// settled TurnFrames are written to src/demo/corpus/<persona>.generated.json; the demo then
// replays fully offline (no key) on the real Live surface.
//
//   GEMINI_API_KEY=… npx vite-node scripts/build-demo-corpus.mts            # bake everyone
//   ONLY=cfo,student … build-demo-corpus.mts                                # whole personas only
//   DEMO_MODEL=gemini-3.1-flash-lite DELAY=6500 RETRIES=1 …                 # model / RPM / retry
//   DEMO_PROVIDER=openai …                                                  # bake on another real
//                             provider (its default model + <PROVIDER>_API_KEY); each shard
//                             records the model that made it, and the replay chip shows it
//
// ONLY re-bakes whole personas, never single steps — a session is a chain (each turn's history
// and canvas feed the next), so a mid-chain refresh would splice answers that never saw each
// other. A persona that fails mid-chain keeps its existing shard on disk and is reported; the
// script exits non-zero so a broken bake can't slip into a commit unnoticed.
//
// Honesty: every ask in scripts.ts is publicly answerable, pure math on numbers the persona
// states, or planning/advice — the model never has to invent anyone's private data.
import { readFileSync, writeFileSync } from 'node:fs';
import { generateLive } from '../src/live/generateLive';
import { settleTurn } from '../src/live/settleTurn';
import type { TurnSnapshot } from '../src/live/lifecycle';
import type { Block } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import { DEMO_SCRIPTS, turnSteps, type DemoScript, type DemoStep } from '../src/demo/scripts';
import { DEMO_CAST } from '../src/demo/cast';
import type { DemoConversation } from '../src/demo/corpus/types';
import type { ModelConfig } from '../src/types/mavea';
import { providerInfo } from '../src/live/providers/info';

// Per-provider bake targets: Live's own default model for each (read straight from
// providers/info.ts, so a baked demo can't be recorded on a model no reader gets), the key's env
// name, and the DIRECT api origin (this script runs in node, so the browser's same-origin /llm/*
// proxy isn't there — these are the exact hosts that proxy forwards to).
const PROVIDERS = {
  gemini: {
    defaultModel: providerInfo('gemini').defaultModel,
    keyEnv: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  openai: {
    defaultModel: providerInfo('openai').defaultModel,
    keyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com',
  },
  anthropic: {
    defaultModel: providerInfo('anthropic').defaultModel,
    keyEnv: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
  },
} as const;

type BakeProvider = keyof typeof PROVIDERS;
const PROVIDER = (process.env.DEMO_PROVIDER ?? 'gemini') as BakeProvider;
if (!PROVIDERS[PROVIDER]) {
  console.error(
    `unknown DEMO_PROVIDER "${PROVIDER}" — one of: ${Object.keys(PROVIDERS).join(', ')}`,
  );
  process.exit(1);
}
// Default to Live's own default model for the chosen provider, so a replayed demo is what a
// fresh user of that provider would actually get; DEMO_MODEL overrides for other tiers.
const MODEL = process.env.DEMO_MODEL ?? PROVIDERS[PROVIDER].defaultModel;
const DELAY = Number(process.env.DELAY ?? 6500);
const RETRIES = Number(process.env.RETRIES ?? 1);
const OUT_DIR = new URL('../src/demo/corpus/', import.meta.url);

/** Read the provider's key: prefer the environment, else scan the usual .env locations. Never logs it. */
function readKey(): string {
  const keyEnv = PROVIDERS[PROVIDER].keyEnv;
  const fromEnv = process.env[keyEnv]?.trim();
  if (fromEnv) return fromEnv;
  const candidates = ['../../.env', '../../../.env', '../.env'];
  for (const rel of candidates) {
    try {
      const env = readFileSync(new URL(rel, import.meta.url), 'utf8');
      const line = env.split('\n').find((l) => l.startsWith(`${keyEnv}=`));
      if (line) {
        const v = line.slice(keyEnv.length + 1).trim();
        if (v) return v;
      }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(`${keyEnv} not found (set it in the environment or a .env file)`);
}

const cfg: ModelConfig = {
  provider: PROVIDER,
  model: MODEL,
  apiKey: readKey(),
  baseUrl: PROVIDERS[PROVIDER].baseUrl,
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Two lines count as the same spoken answer once trailing punctuation and spacing are set aside
 *  — a re-emitted opener usually comes back with an ellipsis or a full stop swapped in. */
function sameLine(a: string | undefined, b: string | undefined): boolean {
  const norm = (t: string | undefined): string =>
    (t ?? '')
      .replace(/[\s.…]+$/u, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLowerCase();
  const left = norm(a);
  return !!left && left === norm(b);
}

/** One step's bake-time report: what the pipeline decided, and whether it met the script's
 *  expectations. A ✗ is not fatal — it's the signal to re-roll that persona. */
function checkExpectations(step: DemoStep, frame: TurnFrame, prev: TurnFrame | null): string[] {
  const misses: string[] = [];
  // Checked for EVERY step, expectations or not: a follow-up that re-emits the previous answer's
  // opener is spoken aloud under the new question, so the replay answers the wrong ask out loud.
  // It is what an augment turn gets wrong, and nothing else here would catch it.
  if (prev && sameLine(frame.narration, prev.narration)) {
    misses.push('narration repeats the previous turn');
  }
  const e = step.expect;
  if (!e) return misses;
  if (e.minBlocks && frame.spec.blocks.length < e.minBlocks) {
    misses.push(`blocks ${frame.spec.blocks.length} < ${e.minBlocks}`);
  }
  if (e.bend && !frame.spec.bend) misses.push('no bend');
  if (e.suggests && !frame.spec.suggests?.length) misses.push('no suggests');
  return misses;
}

async function bakeTurn(
  sent: string,
  history: ChatMessage[],
): Promise<Awaited<ReturnType<typeof generateLive>>> {
  let lastError = '';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(DELAY);
    const result = await generateLive(sent, history, cfg, () => {}, { repair: false });
    if (!result.error) return result;
    lastError = result.error.message ?? 'model error';
    console.log(`    ↻ attempt ${attempt + 1} failed: ${lastError}`);
  }
  throw new Error(lastError);
}

/** Bake one persona's whole session. Throws on an unrecoverable step — the chain can't
 *  continue past a hole, so the persona is reported and its old shard (if any) kept. */
async function bakePersona(script: DemoScript): Promise<DemoConversation> {
  const steps = turnSteps(script);
  const frames: TurnFrame[] = [];
  let history: ChatMessage[] = [];
  let priorBlocks: Block[] = [];
  let prior: TurnSnapshot | null = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const sent = step.bakeAsk ?? step.ask;
    const result = await bakeTurn(sent, history);
    // The frame shows the punchy ask; the model saw `sent` (recorded faithfully in history).
    const settled = settleTurn(prior, priorBlocks, step.ask, result);
    frames.push(settled.frame);
    history = [
      ...history,
      { role: 'user', content: sent },
      { role: 'assistant', content: result.narration || result.spec.title },
    ];
    priorBlocks = settled.frame.spec.blocks;
    prior = settled.snap;

    const misses = checkExpectations(step, settled.frame, frames[frames.length - 2] ?? null);
    // A chip-arrival step is only honest if the previous canvas really offers that chip.
    if (step.viaChip && i > 0 && !frames[i - 1].spec.suggests?.some((s) => s.label === step.ask)) {
      misses.push(`viaChip: previous turn has no chip "${step.ask}" (driver will type instead)`);
    }
    const types = settled.frame.spec.blocks.map((b) => b.type).join(', ');
    const flag = misses.length ? `✗ ${misses.join('; ')}` : '✓';
    console.log(`    ${i + 1}/${steps.length} ${settled.mode.padEnd(7)} ${flag}`);
    console.log(`      "${step.ask}"`);
    console.log(`      → ${settled.frame.spec.title ?? ''} [${types}]\n`);
    if (i < steps.length - 1) await sleep(DELAY);
  }

  return { v: 1, persona: script.persona, generatedAt: Date.now(), model: MODEL, frames, history };
}

async function main(): Promise<void> {
  const only = process.env.ONLY?.split(',').map((s) => s.trim());
  const scripts = only ? DEMO_SCRIPTS.filter((s) => only.includes(s.persona)) : DEMO_SCRIPTS;
  if (!scripts.length) {
    console.error(`no scripts match ONLY=${process.env.ONLY}`);
    process.exit(1);
  }
  for (const s of scripts) {
    if (!DEMO_CAST.some((c) => c.id === s.persona)) {
      console.error(`script "${s.persona}" has no cast entry — fix src/demo/cast.ts first`);
      process.exit(1);
    }
  }
  console.log(`baking ${scripts.length} demo sessions against ${MODEL} (delay ${DELAY}ms)\n`);

  const failed: string[] = [];
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const member = DEMO_CAST.find((c) => c.id === script.persona);
    console.log(`— ${member?.name ?? script.persona} (${script.persona})`);
    try {
      const convo = await bakePersona(script);
      const out = new URL(`${script.persona}.generated.json`, OUT_DIR);
      writeFileSync(out, JSON.stringify(convo, null, 2) + '\n', 'utf8');
      console.log(`  wrote ${convo.frames.length} turns → ${out.pathname}\n`);
    } catch (e) {
      failed.push(script.persona);
      console.log(
        `  ✗ ${script.persona} aborted: ${e instanceof Error ? e.message : e} — existing shard (if any) kept\n`,
      );
    }
    if (i < scripts.length - 1) await sleep(DELAY);
  }

  if (failed.length) {
    console.error(
      `incomplete personas: ${failed.join(', ')} — re-run with ONLY=${failed.join(',')}`,
    );
    process.exit(1);
  }
  console.log('all sessions baked.');
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
