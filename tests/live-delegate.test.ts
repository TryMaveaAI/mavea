import { describe, it, expect, vi } from 'vitest';
import {
  negotiate,
  parseMove,
  violatedBoundary,
  standingOffer,
  parseBoundaries,
  DEFAULT_MAX_ROUNDS,
  type NegotiationBrief,
  type NegotiationEvent,
} from '../src/live/delegate/negotiate';

const BRIEF: NegotiationBrief = {
  counterpart: 'Priya',
  goal: 'a raise to $95k, up from $82k, this cycle',
  mine: 'I led the billing migration and can mentor two juniors',
  theirs: 'Budget is tight this quarter; she values retention and hates setting precedents',
  boundaries: ['weekends'],
};

/** A scripted transport: each call pops the next canned reply. */
function scripted(replies: string[]) {
  const calls: { system: string; user: string }[] = [];
  const fn = vi.fn(async (system: string, user: string) => {
    calls.push({ system, user });
    return replies.shift() ?? '{"say":"done","offer":null,"decision":"pass"}';
  });
  return { fn, calls };
}

const move = (say: string, offer: string | null, decision: string) =>
  JSON.stringify({ say, offer, decision });

describe('parseMove — lenient extraction from model replies', () => {
  it('reads fenced and prose-wrapped JSON', () => {
    expect(parseMove('```json\n{"say":"hi","offer":null,"decision":"pass"}\n```')?.say).toBe('hi');
    expect(
      parseMove('Sure! {"say":"x","offer":"$90k flat","decision":"offer"} hope that helps')?.offer,
    ).toBe('$90k flat');
  });
  it('returns null for junk — the engine never invents a move', () => {
    expect(parseMove('I cannot do that')).toBeNull();
    expect(parseMove('{"offer": "no say field"}')).toBeNull();
  });
});

describe('violatedBoundary — deterministic, format-proof', () => {
  it('catches a boundary item across spacing and case', () => {
    expect(violatedBoundary('I could work WEEKENDS to bridge it', ['weekends'])).toBe('weekends');
    expect(violatedBoundary('$88k now with a six-month review', ['weekends'])).toBeNull();
  });
});

describe('parseBoundaries — the enforced set the user sees is what gets checked', () => {
  it('splits on commas, semicolons and newlines, trimming empties', () => {
    expect(parseBoundaries('working weekends, a title bump; equity\nrelocation')).toEqual([
      'working weekends',
      'a title bump',
      'equity',
      'relocation',
    ]);
    expect(parseBoundaries('   ')).toEqual([]);
  });
  it('de-duplicates case-insensitively but keeps the first spelling', () => {
    expect(parseBoundaries('Weekends, weekends ,  WEEKENDS')).toEqual(['Weekends']);
  });
  it('keeps a thousands-separator comma intact instead of shattering it into a stray "000"', () => {
    // "going above $15,000" must survive as ONE boundary — splitting on the comma inside the
    // number would leave a bare "000" behind, which then false-trips on any offer whose amount
    // happens to contain three zeros (the exact bug the "Buy a used car" seed hit in practice).
    expect(parseBoundaries('going above $15,000, financing through them')).toEqual([
      'going above $15,000',
      'financing through them',
    ]);
    expect(
      violatedBoundary('$14,000 out the door', ['going above $15,000', 'financing through them']),
    ).toBeNull();
  });
});

describe('standingOffer — the proposal currently on the table', () => {
  it('is null before anyone has tabled an offer', () => {
    expect(standingOffer([])).toBeNull();
    expect(standingOffer([{ side: 'yours', kind: 'pass', say: 'No thanks.' }])).toBeNull();
  });
  it('returns the most recent real offer and who put it there', () => {
    const events: NegotiationEvent[] = [
      { side: 'yours', kind: 'offer', say: 'a', offer: '$88k now' },
      { side: 'engine', kind: 'boundary', say: 'withheld' },
      { side: 'theirs', kind: 'counter', say: 'b', offer: '$90k flat' },
      { side: 'yours', kind: 'pass', say: 'thinking' },
    ];
    // the pass and the engine boundary do not change what's on the table
    expect(standingOffer(events)).toEqual({ offer: '$90k flat', by: 'theirs' });
  });
});

describe('negotiate — two real agents, code-enforced boundaries', () => {
  it('alternates sides and resolves a deal on accept', async () => {
    const { fn } = scripted([
      move('$88k now, revisit at the six-month review.', '$88k now with a 6-month review', 'offer'),
      move('$90k flat and we skip the review clause.', '$90k flat, no review clause', 'offer'),
      move('Done — $90k works.', null, 'accept'),
    ]);
    const events: NegotiationEvent[] = [];
    const r = await negotiate(BRIEF, fn, (e) => events.push(e));
    expect(r.deal).toBe('$90k flat, no review clause');
    expect(events.map((e) => e.side)).toEqual(['yours', 'theirs', 'yours']);
    expect(events.map((e) => e.kind)).toEqual(['offer', 'counter', 'accept']);
    // the accepted terms are what standingOffer reports at the end
    expect(standingOffer(events)?.offer).toBe('$90k flat, no review clause');
  });

  it('withholds an offer that names a boundary item and lets the side retry', async () => {
    const { fn, calls } = scripted([
      move('I could work weekends to bridge it.', 'Working weekends for the raise', 'offer'),
      move('Then let’s weigh mentoring instead.', 'Mentor two juniors for the raise', 'offer'),
      move('Not enough for me. No deal.', null, 'pass'),
    ]);
    const events: NegotiationEvent[] = [];
    const r = await negotiate(BRIEF, fn, (e) => events.push(e));
    expect(events[0]).toMatchObject({ side: 'engine', kind: 'boundary' });
    // the retry prompt tells the model exactly why
    expect(calls[1].user).toContain('WITHHELD');
    expect(events[1]).toMatchObject({ side: 'yours', offer: 'Mentor two juniors for the raise' });
    expect(r.deal).toBeNull();
  });

  it('a second violation in a row means the side passes — never ships the offer', async () => {
    const { fn } = scripted([
      move('Weekends it is, then.', 'Working weekends for the raise', 'offer'),
      move('Fine, weekends plus overtime.', 'Working weekends plus overtime', 'offer'),
    ]);
    const events: NegotiationEvent[] = [];
    const r = await negotiate(BRIEF, fn, (e) => events.push(e));
    expect(events.filter((e) => e.kind === 'boundary')).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ kind: 'pass' });
    expect(r.deal).toBeNull();
  });

  it('re-asks for JSON instead of reading a hiccup as a decision (the instant-no-deal bug)', async () => {
    // A truncated or prose reply used to count as "No further moves" and end every run on
    // turn one. A hiccup is not a decision: the engine now nudges once for the bare JSON.
    const { fn, calls } = scripted([
      'Happy to help! Let me think about this negotiation…',
      move('$88k now, six-month review.', '$88k now with a 6-month review', 'offer'),
      move('Done — that works for Priya.', null, 'accept'),
    ]);
    const events: NegotiationEvent[] = [];
    const r = await negotiate(BRIEF, fn, (e) => events.push(e));
    expect(calls[1].user).toContain('ONLY');
    expect(events[0]).toMatchObject({ side: 'yours', kind: 'offer' });
    expect(r.deal).toBe('$88k now with a 6-month review');
  });

  it('nudges a first-move pass into a real move — nobody walks before making one', async () => {
    const { fn, calls } = scripted([
      move('Not worth discussing.', null, 'pass'),
      move('$88k now, review in six months.', '$88k now with a 6-month review', 'offer'),
      move('Deal.', null, 'accept'),
    ]);
    const events: NegotiationEvent[] = [];
    const r = await negotiate(BRIEF, fn, (e) => events.push(e));
    expect(calls[1].user).toContain('too early');
    expect(events[0]).toMatchObject({ side: 'yours', kind: 'offer' });
    expect(r.deal).toBe('$88k now with a 6-month review');
  });

  it('ends honestly when no readable reply ever arrives — never a fake "no further moves"', async () => {
    const { fn } = scripted(['', '', '']);
    const events: NegotiationEvent[] = [];
    const r = await negotiate(BRIEF, fn, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].say).toContain('No reply arrived');
    expect(r.deal).toBeNull();
  });

  it('accept with no standing offer ends as a pass, and rounds are capped', async () => {
    const eager = vi.fn(async () => move('Deal!', null, 'accept'));
    const r1 = await negotiate(BRIEF, eager, () => {});
    expect(r1.deal).toBeNull();
    expect(r1.events[0].kind).toBe('pass');

    const stubborn = vi.fn(async () => move('My number stands.', '$90k flat', 'offer'));
    const r2 = await negotiate({ ...BRIEF, boundaries: [], maxRounds: 4 }, stubborn, () => {});
    expect(r2.deal).toBeNull();
    expect(r2.rounds).toBe(4);

    // with no override the cap is the exported default
    const r3 = await negotiate({ ...BRIEF, boundaries: [] }, stubborn, () => {});
    expect(r3.rounds).toBe(DEFAULT_MAX_ROUNDS);
  });

  it('an unparseable reply is an honest pass; an abort stops cleanly', async () => {
    const garbled = vi.fn(async () => 'as an AI I cannot negotiate');
    const r = await negotiate(BRIEF, garbled, () => {});
    expect(r.deal).toBeNull();
    expect(r.events.at(-1)).toMatchObject({ kind: 'pass' });

    const ac = new AbortController();
    const slow = vi.fn(async () => {
      ac.abort();
      return move('late', '$90k flat', 'offer');
    });
    const r2 = await negotiate(BRIEF, slow, () => {}, ac.signal);
    expect(r2.deal).toBeNull();
  });
});
