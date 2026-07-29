import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  counterpartReply,
  coachTake,
  debriefAsk,
  type RehearsalSetup,
} from '../src/live/delegate/rehearse';
import { DelegatePanel } from '../src/live/delegate/DelegatePanel';
import type { MemoryNode } from '../src/live/memory/store';
import type { ModelConfig } from '../src/live/providers/types';

// The Rehearsal's take-the-seat mode: the persona is grounded ONLY
// in supplied context (and told not to invent the real person), replies/coach parse loose JSON
// and fail to nothing, and the panel walks brief → take → coach with the counterpart's words
// on screen — while the default seat keeps the full negotiation brief untouched.

const generate = vi.fn();
// A plain throw outside the spy: vitest's spy bookkeeping flags a rejection thrown INSIDE
// a vi.fn as an unhandled test error even when the caller catches it.
let networkDown = false;
vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    generate: (...a: unknown[]) => {
      if (networkDown) throw new Error('network');
      return generate(...a);
    },
  }),
}));

const cfg = { provider: 'gemini', model: 'gemini-3.1-flash-lite' } as unknown as ModelConfig;
const setup: RehearsalSetup = {
  scenario: 'asking for the raise',
  counterpart: 'my manager',
  context: 'She defers to budget freezes.',
};

/** Switch the brief to the take-the-seat seat and fill its two required fields. */
function briefTakeSeat(scenario: string, counterpart: string): void {
  fireEvent.click(screen.getByText('Take the seat yourself'));
  fireEvent.change(screen.getByPlaceholderText('Priya, my manager'), {
    target: { value: counterpart },
  });
  fireEvent.change(screen.getByPlaceholderText('A raise to $95k, up from $82k, this cycle'), {
    target: { value: scenario },
  });
  fireEvent.click(screen.getByText('Start take 1'));
}

beforeEach(() => {
  generate.mockReset();
  networkDown = false;
});
afterEach(cleanup);

describe('take-the-seat engine', () => {
  it('grounds the persona ONLY in the supplied context and forbids invention', async () => {
    generate.mockResolvedValue({ raw: '{"reply":"Budgets are locked until Q3."}' });
    const out = await counterpartReply(
      setup,
      [{ who: 'you', text: 'I want to talk about my compensation.' }],
      cfg,
      new AbortController().signal,
    );
    expect(out).toBe('Budgets are locked until Q3.');
    const req = generate.mock.calls[0][0] as { system: string; user: string };
    expect(req.system).toContain('She defers to budget freezes.');
    expect(req.system).toContain('never invent specific facts');
    expect(req.user).toBe('I want to talk about my compensation.');
  });

  it('fails to empty/null instead of throwing', async () => {
    generate.mockResolvedValue({ raw: 'no json here' });
    expect(
      await counterpartReply(
        setup,
        [{ who: 'you', text: 'hi' }],
        cfg,
        new AbortController().signal,
      ),
    ).toBe('');
    networkDown = true;
    expect(
      await coachTake(
        setup,
        [{ who: 'you', text: 'hi' }],
        1,
        null,
        cfg,
        new AbortController().signal,
      ),
    ).toBeNull();
  });

  it('the coach judges the real transcript and needs both note and tip', async () => {
    generate.mockResolvedValue({ raw: '{"note":"You held firm.","tip":"Lead with the 31%."}' });
    const card = await coachTake(
      setup,
      [
        { who: 'you', text: 'My scope grew 31% this year.' },
        { who: 'them', text: 'Budgets are locked.' },
      ],
      2,
      'You hedged in take 1.',
      cfg,
      new AbortController().signal,
    );
    expect(card).toEqual({ note: 'You held firm.', tip: 'Lead with the 31%.' });
    const req = generate.mock.calls[0][0] as { user: string };
    expect(req.user).toContain('My scope grew 31% this year.');
    expect(req.user).toContain('You hedged in take 1.');
    // A take with no user line gets no coach — nothing to judge.
    expect(await coachTake(setup, [], 1, null, cfg, new AbortController().signal)).toBeNull();
  });

  it('debriefAsk quotes the rehearsed scenario', () => {
    expect(debriefAsk(setup)).toContain('asking for the raise');
  });
});

describe('DelegatePanel — take the seat', () => {
  it('the seat choice reshapes the brief: no offer/boundary fields, memory opt-in appears', () => {
    const nodes = [{ body: 'Prefers written proposals' }] as unknown as MemoryNode[];
    render(<DelegatePanel cfg={cfg} memoryNodes={nodes} onClose={vi.fn()} />);
    // Default seat: the full negotiation brief.
    expect(screen.getByText("What you'll put on the table")).toBeTruthy();
    expect(
      screen.getByPlaceholderText('working weekends, a title bump instead of pay'),
    ).toBeTruthy();
    expect(screen.getByText('Start the negotiation')).toBeTruthy();
    expect(screen.queryByText(/what Mavéa remembers/)).toBeNull();
    // Take the seat: practice needs no offer and no code-enforced line.
    fireEvent.click(screen.getByText('Take the seat yourself'));
    expect(screen.queryByText("What you'll put on the table")).toBeNull();
    expect(
      screen.queryByPlaceholderText('working weekends, a title bump instead of pay'),
    ).toBeNull();
    expect(screen.getByText('Start take 1')).toBeTruthy();
    expect(screen.getByText(/what Mavéa remembers \(1 concept\)/)).toBeTruthy();
  });

  it('a seed fills the shared fields for both seats', () => {
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Ask for a raise'));
    fireEvent.click(screen.getByText('Take the seat yourself'));
    expect(screen.getByDisplayValue('Priya')).toBeTruthy();
    expect(screen.getByDisplayValue('A raise to $95k, up from $82k, this cycle')).toBeTruthy();
  });

  it('walks brief → take: the counterpart answers in character on screen', async () => {
    generate.mockResolvedValue({ raw: '{"reply":"Can we revisit in Q3?"}' });
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    briefTakeSeat('the raise conversation', 'my manager');
    fireEvent.change(screen.getByLabelText('Your line'), {
      target: { value: 'I want to settle this now.' },
    });
    fireEvent.click(screen.getByText('Say it'));
    await waitFor(() => expect(screen.getByText('Can we revisit in Q3?')).toBeTruthy());
    expect(screen.getByText('I want to settle this now.')).toBeTruthy();
  });

  it('shows normal spelling but speaks the native-oriented twin', async () => {
    const speak = vi.fn();
    generate.mockResolvedValue({
      raw: '{"reply":"Let’s discuss [[Omakase|oh-mah-kah-seh]]."}',
    });
    render(<DelegatePanel cfg={cfg} speak={speak} onClose={vi.fn()} />);
    briefTakeSeat('dinner plans', 'my friend');
    fireEvent.change(screen.getByLabelText('Your line'), { target: { value: 'Where?' } });
    fireEvent.click(screen.getByText('Say it'));
    await waitFor(() => expect(screen.getByText('Let’s discuss Omakase.')).toBeTruthy());
    expect(speak).toHaveBeenCalledWith('Let’s discuss [[Omakase|oh-mah-kah-seh]].');
  });

  it('End take shows the coach card and starts the next take clean', async () => {
    generate
      .mockResolvedValueOnce({ raw: '{"reply":"Budgets are locked."}' })
      .mockResolvedValueOnce({
        raw: '{"note":"No hedging this time.","tip":"Lead with the 31%."}',
      });
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    briefTakeSeat('the raise', 'her');
    fireEvent.change(screen.getByLabelText('Your line'), { target: { value: 'About my raise.' } });
    fireEvent.click(screen.getByText('Say it'));
    await waitFor(() => expect(screen.getByText('Budgets are locked.')).toBeTruthy());
    fireEvent.click(screen.getByText('End take · get coached'));
    await waitFor(() => expect(screen.getByText('COACH — BETWEEN TAKES')).toBeTruthy());
    expect(screen.getByText('No hedging this time.')).toBeTruthy();
    expect(screen.getByText('Take 2')).toBeTruthy();
    expect(screen.queryByText('Budgets are locked.')).toBeNull(); // fresh take
  });

  it('Debrief hands the scenario-quoting ask back to Live', () => {
    const onDebrief = vi.fn();
    render(<DelegatePanel cfg={cfg} onDebrief={onDebrief} onClose={vi.fn()} />);
    briefTakeSeat('the raise', 'her');
    fireEvent.click(screen.getByText('Debrief the real one'));
    expect(onDebrief).toHaveBeenCalledWith(expect.stringContaining('the raise'));
  });

  it('Adjust the brief returns to the form with the fields preserved', () => {
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    briefTakeSeat('the raise', 'her');
    fireEvent.click(screen.getByText('Adjust the brief'));
    expect(screen.getByDisplayValue('her')).toBeTruthy();
    expect(screen.getByDisplayValue('the raise')).toBeTruthy();
    expect(screen.getByText('Start take 1')).toBeTruthy();
  });
});
