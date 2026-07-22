// gemini-smoke.mts — a deliberately MINIMAL real-Gemini check. Free-tier-safe:
//   step 1: ONE probe (lists models — free) to confirm the key + that the model exists.
//   step 2: ONLY if asked (RUN_TURN=1), ONE generateContent turn through the real pipeline.
// Never loops, never batches, only ever touches gemini-3.1-flash-lite. Reads the key from
// the repo-root .env. Run: npx tsx scripts/gemini-smoke.mts   (add RUN_TURN=1 for the turn).
import { readFileSync } from 'node:fs';
import { geminiAdapter } from '../src/live/providers/gemini';
import { generateLive } from '../src/live/generateLive';
import type { ModelConfig } from '../src/types/mavea';

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

async function main(): Promise<void> {
  // Step 1 — probe (free). Confirms the key works and the model is available.
  console.log(`[1/2] probing ${MODEL} …`);
  const probe = await geminiAdapter.probe(cfg);
  console.log('      probe:', JSON.stringify(probe));
  if (!probe.ok) {
    console.error('      ✗ key/endpoint not reachable — stopping (no turn spent).');
    process.exit(1);
  }
  if (!probe.model) {
    console.error(`      ✗ ${MODEL} not listed for this key — stopping (no turn spent).`);
    process.exit(1);
  }
  console.log('      ✓ key valid, model available.');

  // Cache proof: two turns sharing a big, identical prefix (a real Live system prompt).
  // Implicit caching is automatic on Gemini 2.5+; the 2nd call should report cachedInput > 0
  // (those tokens bill at ~10% of normal). Spends exactly TWO calls.
  if (process.env.CACHE_TEST === '1') {
    const { liveSystemPrompt } = await import('../src/engine/liveSchema');
    const { selectComponents } = await import('../src/live/select');
    const sel = selectComponents({ userText: 'overview of New Jersey', tier: 'frontier' });
    const system = `${liveSystemPrompt('frontier')}\n\n${sel.promptSnippet}`;
    const baseReq = {
      system,
      history: [],
      user: 'Give a quick overview of New Jersey.',
      blockTypes: sel.types,
      maxTokens: 1200,
      thinkingLevel: 'minimal' as const,
    };
    console.log(`\n[cache] system prompt ≈ ${Math.round(system.length / 4)} tokens (rough)`);
    for (const label of ['cold (1st)', 'warm (2nd, same prefix)']) {
      const out = await geminiAdapter.generate(baseReq, cfg);
      const u = out.usage;
      console.log(
        `      ${label}: input=${u?.input ?? '?'} cached=${u?.cachedInput ?? 0} output=${u?.output ?? '?'}`,
      );
    }
    console.log(
      '\nIf "warm" cached > 0, implicit caching is saving money (cached tokens bill ~10%).',
    );
    return;
  }

  if (process.env.RUN_TURN !== '1') {
    console.log('\n[2/2] skipped the generation turn (set RUN_TURN=1 to spend ONE call).');
    return;
  }

  const ask = process.env.ASK || 'Give me a quick overview of the water cycle.';

  // Optional diagnostic: print the RAW adapter output (one call) to see exactly what the
  // model emitted before validation — used to debug why blocks might drop.
  if (process.env.DUMP_RAW === '1') {
    console.log(`\n[raw] one turn — "${ask}"`);
    const out = await geminiAdapter.generate(
      {
        system:
          'You are Mavea. Reply with ONLY a JSON object {"narration","title","sub","blocks":[{"type","props"}],"chips"}. Use block types: insight, chart, kpi, bars, compare, timeline. Give 6+ blocks.',
        history: [],
        user: ask,
        blockTypes: ['insight', 'chart', 'kpi', 'bars', 'compare', 'timeline'],
        maxTokens: 1800,
      },
      cfg,
    );
    const raw = typeof out.raw === 'string' ? out.raw : JSON.stringify(out.raw);
    console.log(raw.slice(0, 2000));
    return;
  }

  // Step 2 — exactly ONE real turn through the full pipeline. repair:false so a hiccup can't
  // trigger a second call; no search/tools so no grounded-query billing.
  console.log(`\n[2/2] one turn — "${ask}"`);
  const t0 = Date.now();
  let firstDeltaMs = 0;
  const res = await generateLive(
    ask,
    [],
    cfg,
    () => {
      if (!firstDeltaMs) firstDeltaMs = Date.now() - t0;
    },
    { repair: false },
  );
  const totalMs = Date.now() - t0;

  console.log('      narration:', JSON.stringify(res.narration));
  console.log('      title    :', JSON.stringify(res.spec.title));
  console.log(
    '      blocks   :',
    res.spec.blocks.length,
    '→',
    res.spec.blocks.map((b) => b.type).join(', '),
  );
  console.log(
    '      chips    :',
    (res.spec.suggests ?? []).map((c) => c.label).join(' | ') || '(none)',
  );
  console.log(`      timing   : TTFT ${firstDeltaMs}ms · total ${totalMs}ms`);
  // A valid turn has a spoken line and at least one block. (A lean ask like "1+1" rightly
  // returns just a block or two — only a substantive ask should fill the screen.)
  const ok = res.spec.blocks.length >= 1 && !!res.narration;
  console.log(ok ? '\n✓ real turn rendered a valid canvas.' : '\n✗ turn failed — inspect above.');
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
