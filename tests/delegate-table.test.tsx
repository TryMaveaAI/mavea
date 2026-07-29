import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DelegatePanel } from '../src/live/delegate/DelegatePanel';
import type { ModelConfig } from '../src/live/providers/types';

// The Rehearsal's negotiation-seat panel test: two real jellies seat at the table (distinct gradient ids, the
// stand-in ghosted), the terminal emotion wiring reflects the real outcome, the debrief renders
// only real cited excerpts, Stop skips the automatic debrief without skipping the manual one,
// "Adjust the brief" round-trips the form, and "Bring this into the conversation" hands Live a
// grounded instruction — never a network call itself.

const generate = vi.fn();
vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({ generate: (...a: unknown[]) => generate(...a) }),
}));

const cfg = { provider: 'gemini', model: 'gemini-3.1-flash-lite' } as unknown as ModelConfig;

const move = (say: string, offer: string | null, decision: string): string =>
  JSON.stringify({ say, offer, decision });

const debriefReply = (): string =>
  JSON.stringify({
    moved: [{ point: 'Led with the migration win', turn: 1 }],
    exposed: [{ point: 'No answer on timeline', turn: 2 }],
    openers: ['Let’s pick this up at $88k.'],
  });

function startFromSeed(): void {
  fireEvent.click(screen.getByText('Ask for a raise'));
  fireEvent.click(screen.getByText('Start the negotiation'));
}

beforeEach(() => {
  generate.mockReset();
});
afterEach(cleanup);

describe('DelegatePanel — the table', () => {
  it('seats two real jellies with distinct gradient ids, the stand-in ghosted', async () => {
    // The first two calls are deliberately deferred: with every reply pre-resolved, the mocked
    // negotiation can run start-to-finish inside a single microtask flush — a chain of
    // already-resolved promises drains completely before a real waitFor poll (a macrotask)
    // ever gets a look — racing straight past the mid-line "speaking" beat. Holding the SECOND
    // call open (not just the first) gives the test a genuine pause after round one lands.
    let resolveFirst: (v: { raw: string }) => void = () => {};
    let resolveSecond: (v: { raw: string }) => void = () => {};
    generate
      .mockImplementationOnce(
        () =>
          new Promise<{ raw: string }>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ raw: string }>((resolve) => {
            resolveSecond = resolve;
          }),
      )
      .mockResolvedValueOnce({ raw: move('Deal.', null, 'accept') })
      .mockResolvedValueOnce({ raw: debriefReply() });
    const { container } = render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    startFromSeed();
    resolveFirst({ raw: move('Opening at 92k.', '$92k', 'offer') });

    // Right as the first line lands, only the speaker is "speaking" — the invariant that
    // never both seats talk at once, exercised once here (it's exhaustively proven for the
    // pure mapping in delegate-tablelook.test.ts).
    await waitFor(() => {
      expect(screen.getByText('Opening at 92k.')).toBeTruthy();
      expect(
        container.querySelector('.dlg-seat.yours .dlg-jelly .presence')?.getAttribute('data-state'),
      ).toBe('speaking');
    });
    const theirsNow = container.querySelector('.dlg-seat.theirs .dlg-jelly .presence');
    expect(theirsNow?.getAttribute('data-state')).toBe('idle');
    resolveSecond({ raw: move('Counter at 88k.', '$88k', 'offer') });

    // Two real Presence instances, each with its own gradient id (the two-jelly guarantee).
    const jellies = container.querySelectorAll('.dlg-jelly');
    expect(jellies).toHaveLength(2);
    jellies.forEach((el) => expect(el.getAttribute('aria-hidden')).toBe('true'));
    const bellIds = Array.from(
      container.querySelectorAll('.dlg-jelly .presence linearGradient'),
    ).map((el) => el.id);
    expect(bellIds).toHaveLength(2);
    expect(new Set(bellIds).size).toBe(2);
    expect(bellIds.every((id) => /^mascot-bell-\w+$/.test(id))).toBe(true);

    // The stand-in is ghosted, seated on its own side; yours never is.
    expect(container.querySelector('.dlg-seat.theirs .dlg-jelly.ghost')).toBeTruthy();
    expect(container.querySelector('.dlg-seat.yours .dlg-jelly.ghost')).toBeFalsy();

    await waitFor(() => expect(screen.getByText('Deal.')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Both Mavéas agreed')).toBeTruthy());

    // Terminal look: only the deal moment celebrates, and only on your side.
    const [yoursDone, theirsDone] = container.querySelectorAll('.dlg-jelly .presence');
    expect(yoursDone.getAttribute('data-emotion')).toBe('celebrate');
    expect(theirsDone.getAttribute('data-emotion')).toBe('warm');

    // The debrief auto-fires on a natural end with 2+ turns, and every cited excerpt is the
    // real transcript line — never a re-typed quote.
    await waitFor(() => expect(screen.getByText('What moved them')).toBeTruthy());
    expect(screen.getByText('Led with the migration win')).toBeTruthy();
    const quote = container.querySelector('.dlg-debrief-quote');
    expect(quote?.textContent).toBe('Your Mavéa“Opening at 92k.”');
  });

  it('a failed debrief still shows the result, and Try again re-attempts it', async () => {
    generate
      .mockResolvedValueOnce({ raw: move('Opening at 92k.', '$92k', 'offer') })
      .mockResolvedValueOnce({ raw: move('Counter at 84k.', '$84k', 'offer') })
      // A LATER-move pass ends the run honestly (a first-move pass gets nudged now).
      .mockResolvedValueOnce({ raw: move('Too far apart — stopping here.', null, 'pass') })
      .mockResolvedValueOnce({ raw: 'not json' })
      .mockResolvedValueOnce({ raw: debriefReply() });
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    startFromSeed();

    await waitFor(() => expect(screen.getByText('No deal this run')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText('Couldn’t draw a debrief from this run.')).toBeTruthy(),
    );
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('What moved them')).toBeTruthy());
  });

  it('a stale debrief from a superseded run never clobbers the fresh run it landed on', async () => {
    let resolveStaleDebrief: (v: { raw: string }) => void = () => {};
    generate
      .mockResolvedValueOnce({ raw: move('Opening at 92k.', '$92k', 'offer') })
      .mockResolvedValueOnce({ raw: move('Counter at 84k.', '$84k', 'offer') })
      .mockResolvedValueOnce({ raw: move('Too far apart — stopping here.', null, 'pass') })
      .mockImplementationOnce(
        () =>
          new Promise<{ raw: string }>((resolve) => {
            resolveStaleDebrief = resolve;
          }),
      )
      // Run 2: no readable reply ever arrives (every attempt comes back empty), so it ends
      // at one honest line — short enough that it never asks for a debrief of its own.
      .mockResolvedValue({ raw: '' });
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    startFromSeed();

    // Run 1 ends with 3 turns, so its debrief auto-fires — and is left hanging, in flight.
    await waitFor(() => expect(screen.getByText('No deal this run')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Reading back what happened…')).toBeTruthy());

    // Before it resolves, the user starts over. begin() aborts the in-flight debrief and
    // resets to a fresh run.
    fireEvent.click(screen.getByText('Run it again'));
    await waitFor(() => expect(screen.getByText('No deal this run')).toBeTruthy());

    // The superseded call finally resolves — its answer must be discarded, not shown as a
    // failed debrief for the run the user is now looking at (which never asked for one: this
    // second run stopped at 1 turn).
    resolveStaleDebrief({ raw: 'not json' });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Couldn’t draw a debrief from this run.')).toBeNull();
    expect(screen.queryByText('Debrief — drawn from this run')).toBeNull();
  });

  it('Stop skips the automatic debrief and offers it on demand instead', async () => {
    let resolveThird: (v: { raw: string }) => void = () => {};
    generate
      .mockResolvedValueOnce({ raw: move('Opening at 92k.', '$92k', 'offer') })
      .mockResolvedValueOnce({ raw: move('Counter at 88k.', '$88k', 'offer') })
      .mockImplementationOnce(
        () =>
          new Promise<{ raw: string }>((resolve) => {
            resolveThird = resolve;
          }),
      );
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    startFromSeed();

    await waitFor(() => expect(screen.getByText('Counter at 88k.')).toBeTruthy());
    fireEvent.click(screen.getByText('Stop'));
    resolveThird({ raw: move('too late', null, 'offer') });

    await waitFor(() => expect(screen.getByText('Stopped')).toBeTruthy());
    expect(screen.getByText('Debrief what happened')).toBeTruthy();
    // Only the two negotiation calls happened — Stop never triggers the automatic third
    // (debrief) call, even though two turns landed.
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('Adjust the brief returns to the form with every field intact', async () => {
    generate.mockResolvedValueOnce({ raw: move('No deal.', null, 'pass') });
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} />);
    startFromSeed();

    await waitFor(() => expect(screen.getByText('No deal this run')).toBeTruthy());
    fireEvent.click(screen.getByText('Adjust the brief'));
    expect(screen.getByPlaceholderText('Priya, my manager')).toHaveValue('Priya');
    expect(screen.getByPlaceholderText('A raise to $95k, up from $82k, this cycle')).toHaveValue(
      'A raise to $95k, up from $82k, this cycle',
    );
  });

  it('"Bring this into the conversation" hands Live a real, grounded instruction — no call of its own', async () => {
    generate
      .mockResolvedValueOnce({ raw: move('Opening at 92k.', '$92k', 'offer') })
      .mockResolvedValueOnce({ raw: move('No thanks.', null, 'pass') })
      .mockResolvedValueOnce({ raw: debriefReply() });
    const onPrepTurn = vi.fn();
    render(<DelegatePanel cfg={cfg} onClose={vi.fn()} onPrepTurn={onPrepTurn} />);
    startFromSeed();

    await waitFor(() => expect(screen.getByText('No deal this run')).toBeTruthy());
    const callsBefore = generate.mock.calls.length;
    fireEvent.click(screen.getByText('Bring this into the conversation'));

    expect(onPrepTurn).toHaveBeenCalledTimes(1);
    const [instruction, label] = onPrepTurn.mock.calls[0];
    expect(instruction).toContain('Opening at 92k.');
    expect(instruction).toContain('Nothing was sent to anyone');
    expect(label).toContain('Negotiation prep');
    expect(generate.mock.calls.length).toBe(callsBefore); // no extra model call of its own
  });
});
