import { describe, it, expect, vi } from 'vitest';
import {
  buildDebriefPrompt,
  buildPrepInstruction,
  numberedTranscript,
  parseDebrief,
  prepLabel,
  runDebrief,
} from '../src/live/delegate/debrief';
import type { NegotiationBrief, NegotiationEvent } from '../src/live/delegate/negotiate';

// debrief.ts turns a real transcript into a payoff without ever letting the model fabricate a
// quote: it cites a turn NUMBER, and the panel (not tested here) looks up that event's actual
// `say` line. These tests pin the parser's leniency and honesty guards, the prompt/instruction
// shape, and that a transport failure degrades to null rather than throwing.

const BRIEF: NegotiationBrief = {
  counterpart: 'Priya',
  goal: 'a raise to $95k, up from $82k, this cycle',
  mine: 'I led the billing migration and can mentor two juniors',
  theirs: 'Budget is tight this quarter; she values retention and hates setting precedents',
  boundaries: ['weekends'],
};

const EVENTS: NegotiationEvent[] = [
  { side: 'yours', kind: 'offer', say: 'Opening at $92k.', offer: '$92k' },
  { side: 'engine', kind: 'boundary', say: 'Withheld — "weekends" is outside your boundary.' },
  { side: 'theirs', kind: 'counter', say: 'We can do $88k with a review.', offer: '$88k' },
  { side: 'yours', kind: 'accept', say: 'Deal.', offer: '$88k' },
];

const debriefJson = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    moved: [{ point: 'Led with a concrete migration win', turn: 1 }],
    exposed: [{ point: 'No answer when pushed on timeline', turn: 3 }],
    openers: ['I want to pick up where we left off at $88k.'],
    ...over,
  });

describe('numberedTranscript / buildDebriefPrompt', () => {
  it('numbers every event, including referee withhold lines, and labels each speaker', () => {
    const t = numberedTranscript(EVENTS, BRIEF);
    expect(t).toContain('1. YOUR SIDE: Opening at $92k. [standing offer: $92k]');
    expect(t).toContain('2. REFEREE: Withheld — "weekends" is outside your boundary.');
    // Mirrors negotiate.ts's own transcript() labeling verbatim (the counterpart's name as
    // typed, not upper-cased) — the two logs must read identically.
    expect(t).toContain("3. Priya'S SIDE: We can do $88k with a review. [standing offer: $88k]");
  });

  it('the prompt carries the brief, the full numbered transcript, and the outcome', () => {
    const { user } = buildDebriefPrompt(BRIEF, EVENTS, '$88k with a review');
    expect(user).toContain(BRIEF.goal);
    expect(user).toContain(BRIEF.mine);
    expect(user).toContain('4. YOUR SIDE: Deal. [standing offer: $88k]');
    expect(user).toContain('OUTCOME: They agreed: $88k with a review.');
  });

  it('a no-deal outcome reads honestly, not as a fabricated agreement', () => {
    const { user } = buildDebriefPrompt(BRIEF, EVENTS, null);
    expect(user).toContain('OUTCOME: No deal was reached.');
  });
});

describe('parseDebrief — lenient, honest, never invents', () => {
  it('reads a fenced reply and resolves real turn citations', () => {
    const d = parseDebrief('```json\n' + debriefJson() + '\n```', EVENTS.length);
    expect(d?.moved).toEqual([{ point: 'Led with a concrete migration win', turn: 1 }]);
    expect(d?.exposed).toEqual([{ point: 'No answer when pushed on timeline', turn: 3 }]);
    expect(d?.openers).toEqual(['I want to pick up where we left off at $88k.']);
  });

  it('an out-of-range citation keeps the point but drops the turn — no dangling quote', () => {
    const d = parseDebrief(debriefJson({ moved: [{ point: 'A real point', turn: 99 }] }), 4);
    expect(d?.moved).toEqual([{ point: 'A real point', turn: null }]);
  });

  it('a non-numeric or missing turn also resolves to null, not a guess', () => {
    const d = parseDebrief(debriefJson({ moved: [{ point: 'x', turn: 'first' }] }), 4);
    expect(d?.moved[0].turn).toBeNull();
  });

  it('caps each of moved/exposed at 2 entries', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ point: `p${i}`, turn: 1 }));
    const d = parseDebrief(debriefJson({ moved: many }), 4);
    expect(d?.moved).toHaveLength(2);
  });

  it('caps openers at 3 and drops blank ones without padding to a fixed count', () => {
    const d = parseDebrief(debriefJson({ openers: ['a', '', 'b', 'c', 'd'] }), 4);
    expect(d?.openers).toEqual(['a', 'b', 'c']);
  });

  it('returns null for junk, and null when every section is empty — never a fabricated fallback', () => {
    expect(parseDebrief('I cannot do that', 4)).toBeNull();
    expect(parseDebrief(debriefJson({ moved: [], exposed: [], openers: [] }), 4)).toBeNull();
  });
});

describe('runDebrief — never throws', () => {
  it('resolves the parsed debrief on a clean reply', async () => {
    const call = vi.fn(async () => debriefJson());
    const d = await runDebrief(BRIEF, EVENTS, '$88k', call);
    expect(d?.moved[0].point).toBe('Led with a concrete migration win');
  });

  it('a rejected transport resolves to null instead of rejecting', async () => {
    const call = vi.fn(async () => {
      throw new Error('network down');
    });
    await expect(runDebrief(BRIEF, EVENTS, null, call)).resolves.toBeNull();
  });

  it('an already-aborted signal short-circuits without calling the transport', async () => {
    const call = vi.fn(async () => debriefJson());
    const ac = new AbortController();
    ac.abort();
    const d = await runDebrief(BRIEF, EVENTS, null, call, ac.signal);
    expect(d).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('buildPrepInstruction / prepLabel — the honest hand-off to Live', () => {
  it('carries the real transcript verbatim, the brief, the outcome, and the never-sent disclosure', () => {
    const instruction = buildPrepInstruction(BRIEF, EVENTS, '$88k with a review');
    expect(instruction).toContain('Nothing was sent to anyone');
    expect(instruction).toContain(BRIEF.goal);
    expect(instruction).toContain("3. Priya'S SIDE: We can do $88k with a review.");
    expect(instruction).toContain('Outcome: They agreed: $88k with a review.');
    expect(instruction).toContain('invent nothing about Priya');
  });

  it('prepLabel is short and truncates a long goal rather than overflowing the scrubber', () => {
    expect(prepLabel('a raise')).toBe('Negotiation prep: a raise');
    const long = 'a'.repeat(80);
    const label = prepLabel(long);
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label.endsWith('…')).toBe(true);
  });
});
