// live-prose-collapse.test.ts — when a model answers in prose, say so.
//
// Measured against OpenRouter's nvidia/nemotron-3.5-lightning:free: 25,092 characters of planning
// notes ("Here's a thinking process: 1. **Analyze User Input**…" … "Block 4: maybe"), the
// response_format:json_object request ignored outright, the whole completion budget spent, and not
// one valid JSON object at any point. The canvas collapsed to "I couldn't put that into a clean
// view just now — try asking again", which reads as a transient hiccup, so the obvious response is
// to retry the same model and wait another two minutes for the same nothing.
//
// This is not a hiccup and it is not fixable by retrying: the model cannot emit the structure the
// canvas is built from. Naming that is the whole fix.
import { describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

const generated = vi.fn();

vi.mock('../src/live/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/providers')>();
  return {
    ...actual,
    getAdapter: () => ({
      id: 'openrouter',
      capabilities: { strengthTier: 'frontier', nativeSearch: false },
      generate: generated,
    }),
  };
});

import { generateLive } from '../src/live/generateLive';

const cfg: ModelConfig = { provider: 'openrouter', model: 'vendor/thinky:free', apiKey: 'k' };

/** The real shape, abbreviated: a planning monologue that never opens the object. */
const PROSE = `Here's a thinking process:

1.  **Analyze User Input**: User asks "Why do onions make you cry?"
2.  **Identify Core Task**: Explain the chemistry in a few blocks.
3.  **Draft the blocks**:

   Block 1: an insight about the enzyme reaction.
   - note: "Cutting ruptures the cells and releases enzymes."
   - section: "Onion chemistry"
   - order: 1

   Block 2: a timeline of what happens, second by second.
   - note: "Each step happens quickly: cut, enzyme reaction, gas formation."
   - section: "Onion chemistry"
   - order: 2

   Block 4: maybe`.repeat(3);

const run = (raw: string | object) => {
  generated.mockReset();
  generated.mockResolvedValue({ raw });
  return generateLive('why do onions make you cry', [], cfg, undefined, { repair: false });
};

const summaryOf = (spec: { blocks: unknown[] }): string =>
  ((spec.blocks[0] as { props?: { summary?: string } })?.props?.summary ?? '').toString();

describe('a model that answers in prose', () => {
  it('names the cause instead of blaming the moment', async () => {
    const { spec } = await run(PROSE);
    expect(summaryOf(spec)).toMatch(/prose instead of the structured answer/i);
    expect(summaryOf(spec)).not.toMatch(/try asking again/i);
  });

  it('points at the only action that helps — a different model', async () => {
    expect(summaryOf((await run(PROSE)).spec)).toMatch(/supports it/i);
  });

  it('never leaks the raw reply onto the card', async () => {
    expect(summaryOf((await run(PROSE)).spec)).not.toContain('Analyze User Input');
  });

  it('does not call a TRUNCATED reply prose — it opened the object and got cut off', async () => {
    const cut = '{"title":"Onions","narration":"They release a gas.","blocks":[{"type":"insi';
    const summary = summaryOf((await run(cut)).spec);
    // The narration it did finish is worth more than any diagnosis, so that is what shows.
    expect(summary).toBe('They release a gas.');
    expect(summary).not.toMatch(/prose instead of/i);
  });

  it('falls back to the ordinary message when a cut-off reply salvaged nothing', async () => {
    const summary = summaryOf((await run('{"title":"Onions","blocks":[{"type":"insi')).spec);
    expect(summary).toMatch(/try asking again/i);
    expect(summary).not.toMatch(/prose instead of/i);
  });

  it('leaves a short empty reply alone — too little to diagnose', async () => {
    expect(summaryOf((await run('hmm')).spec)).toMatch(/try asking again/i);
  });

  it('prefers a real salvaged narration over any diagnosis', async () => {
    const withNarration = `${PROSE}\n"narration": "Onions release a volatile sulfur gas."`;
    expect(summaryOf((await run(withNarration)).spec)).toBe(
      'Onions release a volatile sulfur gas.',
    );
  });
});
