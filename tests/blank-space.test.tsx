import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  validateLiveResponse,
  ALLOWED_BLOCK_TYPES,
  FRONTIER_BLOCK_TYPES,
} from '../src/engine/liveSchema';
import { buildFilledBlankContext } from '../src/live/generateLive';
import { routeBlankVoice, transcriptToFill, looksLikeNewQuestion } from '../src/live/blankVoice';
import { reducer, INITIAL } from '../src/live/useLiveTurn';
import { BlankSlot, BlankFillContext } from '../src/canvas/lib';
import type { Blank, ConversationSpec, FillValue } from '../src/data/conversation';

// "The Blank Space" — Mavéa turns a value only the user can give into a fillable hole instead of
// guessing it (the visual half of the real-data-only rule). These lock the two failure modes that
// matter: the schema must never let a fabricated value ride in on a blank, and a filled hole must
// commit cleanly.

const blanksResponse = (slots: unknown[]) => ({
  title: 'Decision',
  sub: 'S',
  narration: 'N',
  blocks: [
    { type: 'insight', props: { title: 'A real answer' } },
    { type: 'blanks', props: { title: 'Only you can answer', slots } },
  ],
});

const goodSlots = [
  { key: 'deadline', label: 'Real deadline', prompt: 'When must this ship?', kind: 'date' },
  {
    key: 'energy',
    label: 'Energy',
    prompt: 'How much capacity now?',
    kind: 'choice',
    options: ['Low', 'High'],
  },
];

describe('blanks — schema & gating', () => {
  it('is frontier-only: dropped on the base tier, surfaced on frontier', () => {
    const base = validateLiveResponse(blanksResponse(goodSlots), ALLOWED_BLOCK_TYPES);
    expect(base!.blocks.some((b) => b.type === 'blanks')).toBe(false);
    expect(base!.awaiting).toBeUndefined();

    const fr = validateLiveResponse(blanksResponse(goodSlots), FRONTIER_BLOCK_TYPES);
    expect(fr!.blocks.some((b) => b.type === 'blanks')).toBe(true);
  });

  it('surfaces spec-level blanks + awaiting from the block slots', () => {
    const r = validateLiveResponse(blanksResponse(goodSlots), FRONTIER_BLOCK_TYPES);
    expect(r!.awaiting).toBe(true);
    expect(r!.blanks?.map((b) => b.key)).toEqual(['deadline', 'energy']);
    expect(r!.blanks?.find((b) => b.key === 'energy')?.options).toEqual(['Low', 'High']);
  });

  it('finds a hole nested inside a composite (inline-feel via composition)', () => {
    const resp = {
      title: 'Budget',
      sub: 'S',
      narration: 'N',
      blocks: [
        {
          type: 'composite',
          props: {
            title: 'Your budget',
            regions: [
              { block: { type: 'insight', props: { title: 'Half goes to needs' } } },
              {
                block: {
                  type: 'blanks',
                  props: {
                    title: 'One thing from you',
                    slots: [
                      {
                        key: 'runway',
                        label: 'Runway',
                        prompt: 'How many months of savings?',
                        kind: 'number',
                        unit: 'mo',
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    };
    // Live exposes `composite` via the synthesis menu (added to the allowed set per-turn), so mirror that.
    const r = validateLiveResponse(resp, new Set([...FRONTIER_BLOCK_TYPES, 'composite']));
    expect(r!.awaiting).toBe(true);
    expect(r!.blanks?.map((b) => b.key)).toEqual(['runway']);
  });

  it('drops slots missing a key/label/prompt, dedupes keys, caps the count', () => {
    const messy = [
      { label: 'No key', prompt: 'P', kind: 'text' }, // no key → dropped
      { key: 'a', prompt: 'P', kind: 'text' }, // no label → dropped
      { key: 'dup', label: 'First', prompt: 'P', kind: 'text' },
      { key: 'dup', label: 'Second', prompt: 'P', kind: 'text' }, // dupe key → dropped
      { key: 'b', label: 'B', prompt: 'P', kind: 'text' },
      { key: 'c', label: 'C', prompt: 'P', kind: 'text' },
      { key: 'd', label: 'D', prompt: 'P', kind: 'text' },
      { key: 'e', label: 'E', prompt: 'P', kind: 'text' }, // over the cap of 4
    ];
    const r = validateLiveResponse(blanksResponse(messy), FRONTIER_BLOCK_TYPES);
    const keys = r!.blanks?.map((b) => b.key);
    expect(keys).toEqual(['dup', 'b', 'c', 'd']);
    expect(r!.blanks!.find((b) => b.key === 'dup')!.label).toBe('First');
  });

  it('NEVER carries a fabricated value — a blank is empty by construction', () => {
    const sneaky = [
      {
        key: 'deadline',
        label: 'Deadline',
        prompt: 'When?',
        kind: 'date',
        value: '2026-09-01', // a guessed answer the model tried to smuggle in
        answer: 'next Friday',
        default: 'soon',
      },
    ];
    const r = validateLiveResponse(blanksResponse(sneaky), FRONTIER_BLOCK_TYPES);
    const blank = r!.blanks![0];
    expect(Object.keys(blank).sort()).toEqual(['key', 'kind', 'label', 'prompt']);
    expect('value' in blank).toBe(false);
  });
});

describe('buildFilledBlankContext — feeding fills back to complete the answer', () => {
  it('serializes each kind and is empty when nothing is filled', () => {
    expect(buildFilledBlankContext(undefined)).toBe('');
    expect(buildFilledBlankContext({})).toBe('');
    const ctx = buildFilledBlankContext({
      budget: { kind: 'number', key: 'budget', value: 2500, unit: 'USD' },
      energy: { kind: 'choice', key: 'energy', value: 'Low' },
    });
    expect(ctx).toContain('budget = 2500 USD');
    expect(ctx).toContain('energy = Low');
    expect(ctx.toLowerCase()).toContain('do not start over');
  });
});

describe('BlankSlot — committing a fill', () => {
  const textBlank: Blank = { key: 'note', label: 'Note', prompt: 'Anything else?', kind: 'text' };

  it('reports the typed value through the fill context on commit', () => {
    const fill = vi.fn();
    const { getByLabelText } = render(
      <BlankFillContext.Provider value={{ values: {}, activeKey: null, fill }}>
        <BlankSlot blank={textBlank} />
      </BlankFillContext.Provider>,
    );
    const input = getByLabelText('Anything else?') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Friday' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fill).toHaveBeenCalledWith({ kind: 'text', key: 'note', value: 'Friday' });
  });

  it('falls back to local state when there is no fill context (the Demo path)', () => {
    const { getByLabelText, getByText } = render(<BlankSlot blank={textBlank} />);
    const input = getByLabelText('Anything else?') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Local' } });
    fireEvent.blur(input);
    getByText('Local');
  });
});

describe('transcriptToFill — coercing a spoken reply by hole kind', () => {
  const b = (over: Partial<Blank>): Blank => ({
    key: 'k',
    label: 'L',
    prompt: 'P',
    kind: 'text',
    ...over,
  });

  it('pulls a number (with the hole unit) out of loose speech, or gives up', () => {
    expect(transcriptToFill(b({ kind: 'number', unit: 'USD' }), 'around 2,500 a year')).toEqual({
      kind: 'number',
      key: 'k',
      value: 2500,
      unit: 'USD',
    });
    expect(transcriptToFill(b({ kind: 'number' }), 'a lot, honestly')).toBeNull();
  });

  it('matches a choice option case-insensitively, else null', () => {
    const choice = b({ kind: 'choice', options: ['Low', 'High'] });
    expect(transcriptToFill(choice, 'honestly pretty low right now')).toEqual({
      kind: 'choice',
      key: 'k',
      value: 'Low',
    });
    expect(transcriptToFill(choice, 'somewhere in the middle')).toBeNull();
  });

  it('takes date/text holes verbatim and refuses a card (it cannot be spoken)', () => {
    expect(transcriptToFill(b({ kind: 'date' }), '2026-09-01')).toEqual({
      kind: 'date',
      key: 'k',
      value: '2026-09-01',
    });
    expect(transcriptToFill(b({ kind: 'text' }), 'no relocation help')).toEqual({
      kind: 'text',
      key: 'k',
      value: 'no relocation help',
    });
    expect(transcriptToFill(b({ kind: 'card' }), 'the budget card')).toBeNull();
  });
});

describe('routeBlankVoice — the voice gate (fill the hole vs. start a new turn)', () => {
  const blanks: Blank[] = [
    {
      key: 'energy',
      label: 'Energy',
      prompt: 'How much?',
      kind: 'choice',
      options: ['Low', 'High'],
    },
  ];
  const ctx = (over: Partial<Parameters<typeof routeBlankVoice>[0]> = {}) => {
    const fill = vi.fn();
    return {
      fill,
      ctx: { phase: 'awaiting_input' as const, activeKey: 'energy', blanks, fill, ...over },
    };
  };

  it('does nothing when not gathering (passes through to a normal turn)', () => {
    const { fill, ctx: c } = ctx({ phase: 'normal' });
    expect(routeBlankVoice(c, 'low')).toBe(false);
    expect(fill).not.toHaveBeenCalled();
  });

  it('fills the active hole on a fitting answer', () => {
    const { fill, ctx: c } = ctx();
    expect(routeBlankVoice(c, 'low energy')).toBe(true);
    expect(fill).toHaveBeenCalledWith({ kind: 'choice', key: 'energy', value: 'Low' });
  });

  it('lets a real new question escape to a new turn', () => {
    const { fill, ctx: c } = ctx();
    expect(routeBlankVoice(c, 'what should I pack?')).toBe(false);
    expect(fill).not.toHaveBeenCalled();
    expect(looksLikeNewQuestion('what should I pack?')).toBe(true);
  });

  it('swallows a non-fitting, non-question utterance (re-prompt, never a stray turn)', () => {
    const { fill, ctx: c } = ctx();
    expect(routeBlankVoice(c, 'umm somewhere in between maybe')).toBe(true);
    expect(fill).not.toHaveBeenCalled();
  });
});

describe('reducer — the Blank Space state machine', () => {
  const specWithBlanks = (): ConversationSpec =>
    ({
      id: 'live',
      workspace: 'Live',
      title: 'T',
      sub: '',
      opener: '',
      context: [],
      blocks: [],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
      awaiting: true,
      blanks: [
        { key: 'a', label: 'A', prompt: 'pa', kind: 'text' },
        { key: 'b', label: 'B', prompt: 'pb', kind: 'text' },
      ],
    }) as ConversationSpec;

  const awaiting = () => ({
    ...INITIAL,
    spec: specWithBlanks(),
    phase: 'awaiting_input' as const,
    activeBlank: 'a',
  });

  it('a fill records the value and advances to the next empty hole', () => {
    const fv: FillValue = { kind: 'text', key: 'a', value: 'Friday' };
    const s = reducer(awaiting(), { type: 'fill', value: fv });
    expect(s.filled).toEqual({ a: fv });
    expect(s.activeBlank).toBe('b');
  });

  it('filling the LAST hole clears the active stop (the tour has nowhere left to point)', () => {
    let s = reducer(awaiting(), { type: 'fill', value: { kind: 'text', key: 'a', value: '1' } });
    s = reducer(s, { type: 'fill', value: { kind: 'text', key: 'b', value: '2' } });
    expect(Object.keys(s.filled)).toEqual(['a', 'b']);
    expect(s.activeBlank).toBeNull();
  });

  it('unfilling a hole re-arms it', () => {
    let s = reducer(awaiting(), { type: 'fill', value: { kind: 'text', key: 'a', value: '1' } });
    s = reducer(s, { type: 'unfill', key: 'a' });
    expect(s.filled).toEqual({});
    expect(s.activeBlank).toBe('a');
  });

  it('a new turn (start) abandons a half-filled Blank Space', () => {
    const filledState = reducer(awaiting(), {
      type: 'fill',
      value: { kind: 'text', key: 'a', value: '1' },
    });
    const s = reducer(filledState, { type: 'start' });
    expect(s.phase).toBe('normal');
    expect(s.filled).toEqual({});
    expect(s.activeBlank).toBeNull();
  });
});
