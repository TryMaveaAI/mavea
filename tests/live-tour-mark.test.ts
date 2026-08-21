import { describe, it, expect } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';

const RESP = {
  title: 'T',
  narration: 'N',
  blocks: [
    { type: 'insight', props: { title: 'A', stat: '$1,950' } },
    { type: 'breakdown', props: { title: 'B', rows: [{ name: 'Seattle', val: '1', pct: 50 }] } },
  ],
};

describe('tour marks — the model names what Mavéa draws on', () => {
  it('keeps a valid mark, display-side and capped', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        {
          index: 0,
          say: 'The headline is [[$1,950|nineteen fifty dollars]].',
          mark: { kind: 'underline', at: '[[$1,950|nineteen fifty dollars]]' },
        },
        { index: 1, say: 'Seattle leads.', mark: { kind: 'circle', at: 'Seattle' } },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.tour![0].mark).toEqual({ kind: 'underline', at: '$1,950' });
    expect(r!.tour![1].mark).toEqual({ kind: 'circle', at: 'Seattle' });
  });

  it('drops junk kinds, empty targets, and malformed marks — the stop survives', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        { index: 0, say: 'a', mark: { kind: 'squiggle', at: 'x' } },
        { index: 1, say: 'b', mark: { kind: 'circle' } },
      ],
    });
    expect(r!.tour![0].mark).toBeUndefined();
    expect(r!.tour![0].say).toBe('a');
    expect(r!.tour![1].mark).toBeUndefined();
  });

  it('a mark can ride a say-less stop, and over-long targets are truncated', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [{ index: 0, mark: { kind: 'point', at: 'x'.repeat(200) } }],
    });
    expect(r!.tour![0].mark!.kind).toBe('point');
    expect(r!.tour![0].mark!.at.length).toBe(80);
  });

  it('keeps SEVERAL marks on one block (marks[]), de-duped and capped, with mark mirroring the first', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        {
          index: 0,
          say: 'price, fees, total',
          marks: [
            { kind: 'underline', at: '$1,950' },
            { kind: 'underline', at: '$1,950' }, // exact dup → dropped
            { kind: 'circle', at: 'Seattle' },
            { kind: 'point', at: 'a' },
            { kind: 'point', at: 'b' },
            { kind: 'point', at: 'c' }, // dup removed → 5 unique marks (cap is 6)
          ],
        },
      ],
    });
    const stop = r!.tour![0];
    expect(stop.marks).toHaveLength(5);
    expect(stop.marks!.map((m) => m.at)).toEqual(['$1,950', 'Seattle', 'a', 'b', 'c']);
    // `mark` mirrors the first so the single-gesture code paths still work.
    expect(stop.mark).toEqual({ kind: 'underline', at: '$1,950' });
  });

  it('a single mark does not get a marks[] array (back-compat shape preserved)', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [{ index: 1, say: 'Seattle leads.', mark: { kind: 'circle', at: 'Seattle' } }],
    });
    expect(r!.tour![0].mark).toEqual({ kind: 'circle', at: 'Seattle' });
    expect(r!.tour![0].marks).toBeUndefined();
  });

  it('the prompt teaches the gesture vocabulary + multi-point marks', async () => {
    const { liveSystemPrompt } = await import('../src/engine/liveSchema');
    const prompt = liveSystemPrompt('frontier');
    expect(prompt).toContain('DRAWN GESTURE');
    expect(prompt).toContain('"mark"');
    expect(prompt).toContain('"marks"');
    // Multi-mark guidance: one gesture per datum the line mentions
    expect(prompt).toContain('one gesture per datum the line mentions');
  });

  it('every one of the fifteen kinds carries a worked example — the debias, pinned', async () => {
    // Measured across the repo's baked corpora, three kinds were 76.6% of all ink — and the four
    // kinds the model never once authored were exactly the ones the addendum never showed it. An
    // example is the cheapest teaching there is, so every kind gets one and keeps it.
    const { liveSystemPrompt, MARK_KINDS } = await import('../src/engine/liveSchema');
    const prompt = liveSystemPrompt('frontier');
    for (const kind of MARK_KINDS) {
      expect(prompt, `"${kind}" has no worked JSON example`).toContain(`{"kind":"${kind}"`);
    }
  });

  it('the judgment-ink teaching rides the gesture addendum — never the small-model prompt', async () => {
    const { liveSystemPrompt } = await import('../src/engine/liveSchema');
    const frontier = liveSystemPrompt('frontier');
    expect(frontier).toContain('JUDGMENT INK');
    for (const kind of ['"strike"', '"question"', '"star"', '"check"', '"frame"', '"brace"']) {
      expect(frontier).toContain(kind);
    }
    // Small models get the base prompt only — the schema enum may name the kinds, but the
    // teaching (and the temptation to sprinkle them) never ships to a tier that can't be
    // trusted with it. 'brief' asks drop the whole tour addendum on every tier.
    expect(liveSystemPrompt('small')).not.toContain('JUDGMENT INK');
    expect(liveSystemPrompt('frontier', 'brief')).not.toContain('JUDGMENT INK');
  });
});

describe('judgment ink — rare by construction, honest by the validator', () => {
  it('keeps a valid strike, check, and frame; junk kinds still drop', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        {
          index: 0,
          say: 'not this one',
          marks: [
            { kind: 'strike', at: '$1,950' },
            { kind: 'check', at: '$1,950' },
            { kind: 'frame', at: '$1,950' },
            { kind: 'wiggle', at: '$1,950' },
          ],
        },
      ],
    });
    expect(r!.tour![0].marks!.map((m) => m.kind)).toEqual(['strike', 'check', 'frame']);
  });

  it('a colorless strike defaults to the cool/negative ink; an explicit color survives', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        { index: 0, say: 'a', mark: { kind: 'strike', at: '$1,950' } },
        { index: 1, say: 'b', mark: { kind: 'strike', at: 'Seattle', color: 'warm' } },
      ],
    });
    expect(r!.tour![0].mark!.color).toBe('cool');
    expect(r!.tour![1].mark!.color).toBe('warm');
  });

  it('strikes cap at two per turn — a wall of red lines is noise, not judgment', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        {
          index: 0,
          say: 'a',
          marks: [
            { kind: 'strike', at: '$1,950' },
            { kind: 'strike', at: 'A' },
            { kind: 'strike', at: 'B' },
          ],
        },
      ],
    });
    expect(r!.tour![0].marks!.filter((m) => m.kind === 'strike')).toHaveLength(2);
  });

  it('the star is forced to the key ink and capped at ONE across the whole turn', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        { index: 0, say: 'a', mark: { kind: 'star', at: '$1,950', color: 'cool' } },
        { index: 1, say: 'b', mark: { kind: 'star', at: 'Seattle' } },
      ],
    });
    expect(r!.tour![0].mark).toEqual({ kind: 'star', at: '$1,950', color: 'key' });
    expect(r!.tour![1].mark).toBeUndefined();
  });

  it('a question mark only rides a block whose own conf declares an estimate', () => {
    const base = {
      title: 'T',
      narration: 'N',
      blocks: [
        { type: 'insight', props: { title: 'A', stat: '$1,950', conf: 'inferred' } },
        { type: 'kpi', props: { title: 'B', items: [{ label: 'x', value: '2' }] } },
      ],
    };
    const r = validateLiveResponse({
      ...base,
      tour: [
        { index: 0, say: 'roughly', mark: { kind: 'question', at: '$1,950' } },
        // The kpi block carries no conf — the pen may not hedge a confident block.
        { index: 1, say: 'b', mark: { kind: 'question', at: '2' } },
      ],
    });
    expect(r!.tour![0].mark!.kind).toBe('question');
    expect(r!.tour![1].mark).toBeUndefined();
  });

  it('questions cap at one per turn even across estimate blocks', () => {
    const r = validateLiveResponse({
      title: 'T',
      narration: 'N',
      blocks: [
        { type: 'insight', props: { title: 'A', stat: '1', conf: 'inferred' } },
        {
          type: 'chart',
          props: {
            title: 'B',
            labels: ['a'],
            series: [{ name: 's', color: 'var(--presence)', data: [1] }],
            conf: 'partial',
          },
        },
      ],
      tour: [
        { index: 0, say: 'a', mark: { kind: 'question', at: '1' } },
        { index: 1, say: 'b', mark: { kind: 'question', at: 'a' } },
      ],
    });
    const questions = r!.tour!.filter((s) => s.mark?.kind === 'question');
    expect(questions).toHaveLength(1);
  });

  it('a brace needs its far row — grouping one item is not a group', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        { index: 1, say: 'a', mark: { kind: 'brace', at: 'Seattle' } },
        { index: 0, say: 'b', mark: { kind: 'brace', at: 'A', to: 'B', label: 'fixed costs' } },
      ],
    });
    expect(r!.tour![0].mark).toBeUndefined();
    expect(r!.tour![1].mark).toEqual({
      kind: 'brace',
      at: 'A',
      to: 'B',
      label: 'fixed costs',
    });
  });
});

describe('"connect" marks — the one gesture that points at a DIFFERENT block', () => {
  it('keeps a valid connect mark naming a real other block', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        { index: 0, say: 'a' },
        {
          index: 1,
          say: 'That matches the headline number.',
          mark: { kind: 'connect', at: 'Seattle', to: '$1,950', onIndex: 0 },
        },
      ],
    });
    expect(r!.tour![1].mark).toEqual({
      kind: 'connect',
      at: 'Seattle',
      to: '$1,950',
      onIndex: 0,
    });
  });

  it('drops a connect mark with no "to", an out-of-range onIndex, or a self-reference', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        { index: 0, say: 'a', mark: { kind: 'connect', at: 'x', onIndex: 1 } }, // no "to"
        { index: 1, say: 'b', mark: { kind: 'connect', at: 'x', to: 'y', onIndex: 9 } }, // OOB
      ],
    });
    expect(r!.tour![0].mark).toBeUndefined();
    expect(r!.tour![1].mark).toBeUndefined();

    const self = validateLiveResponse({
      ...RESP,
      tour: [{ index: 0, say: 'a', mark: { kind: 'connect', at: 'x', to: 'y', onIndex: 0 } }],
    });
    expect(self!.tour![0].mark).toBeUndefined();
  });

  it('caps connect marks at one per stop, even if the model asks for several', () => {
    const r = validateLiveResponse({
      ...RESP,
      tour: [
        {
          index: 0,
          say: 'a',
          marks: [
            { kind: 'connect', at: 'a', to: 'b', onIndex: 1 },
            { kind: 'connect', at: 'c', to: 'd', onIndex: 1 },
          ],
        },
      ],
    });
    const marks = r!.tour![0].marks ?? [r!.tour![0].mark].filter(Boolean);
    expect(marks.filter((m) => m?.kind === 'connect')).toHaveLength(1);
  });

  it('caps connect marks at two per turn, across separate stops', () => {
    const r = validateLiveResponse({
      title: 'T',
      narration: 'N',
      blocks: [
        // Three DISTINCT types — a second/third "insight" here would be dropped by the
        // one-insight rule, leaving too few blocks for the index-2 stop below.
        { type: 'insight', props: { title: 'A', stat: '1' } },
        { type: 'kpi', props: { title: 'B', items: [{ label: 'x', value: '2' }] } },
        { type: 'list', props: { title: 'C', items: ['3', '4'] } },
      ],
      tour: [
        { index: 0, say: 'a', mark: { kind: 'connect', at: '1', to: '2', onIndex: 1 } },
        { index: 1, say: 'b', mark: { kind: 'connect', at: '2', to: '3', onIndex: 2 } },
        { index: 2, say: 'c', mark: { kind: 'connect', at: '3', to: '1', onIndex: 0 } },
      ],
    });
    const connects = r!.tour!.filter((s) => s.mark?.kind === 'connect');
    expect(connects).toHaveLength(2);
  });
});
