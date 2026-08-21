// The document briefing must not talk over itself.
//
// Every beat used to advance on a wall-clock estimate of how long its caption takes to READ
// (~17 characters a second, capped at 7s) while the next beat opened by cancelling the current
// line. Any beat past the cap — or any voice slower than 1× — was cut off mid-word, which is what
// made the briefing sound like it kept interrupting itself. Voiced, a beat now ends when its
// narration ends. Bounded in both directions: a voice that never arrives falls back to the silent
// pacing, and one that never finishes cannot stall the flight.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, act } from '@testing-library/react';
import { BriefingPlayer } from '../src/live/prism/briefing/BriefingPlayer';
import type { BriefingBeat } from '../src/live/prism/briefing/types';
import type { SpokenLine } from '../src/voice/tts';

function beats(): BriefingBeat[] {
  return [
    {
      id: 'b1',
      kind: 'open',
      claimIds: [],
      caption: 'The case rests here.',
      spoken: 'The case rests here.',
      dwellMs: 2600,
    },
    {
      id: 'b2',
      kind: 'tension',
      claimIds: [],
      caption: 'But two figures disagree.',
      spoken: 'But two figures disagree.',
      dwellMs: 2600,
    },
  ];
}

/** A line the test finishes by hand, so "how long the audio ran" is under the test's control. */
function pendingLine(): { line: SpokenLine; end: () => void } {
  let end!: () => void;
  const finished = new Promise<boolean>((r) => {
    end = () => r(true);
  });
  return { line: { started: Promise.resolve(true), finished }, end };
}

function mount(
  speak: (t: string) => Promise<SpokenLine | null>,
  audioDefault = true,
  cancelSpeak = vi.fn(),
) {
  const view = render(
    <BriefingPlayer
      beats={beats()}
      onBeat={() => {}}
      onExit={() => {}}
      speak={speak}
      cancelSpeak={cancelSpeak}
      audioDefault={audioDefault}
    />,
  );
  return { view, cancelSpeak };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // jsdom has no matchMedia; the player reads prefers-reduced-motion on mount.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});
afterEach(() => vi.useRealTimers());

describe('a voiced beat ends when its narration ends', () => {
  it('does not advance while the line is still speaking, however long it runs', async () => {
    const { end, line } = pendingLine();
    mount(() => Promise.resolve(line));

    // Far past the beat's own dwell estimate, and past the 7s ceiling that used to cut it.
    await act(async () => void (await vi.advanceTimersByTimeAsync(12_000)));
    expect(screen.getByText('The case rests here.')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await act(async () => {
      end();
      await vi.advanceTimersByTimeAsync(1_500); // the anti-flash floor
    });
    expect(screen.getByText('But two figures disagree.')).toBeInTheDocument();
  });

  it('advances on the silent estimate when no line ever comes back', async () => {
    mount(() => Promise.resolve(null));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3_000)));
    expect(screen.getByText('But two figures disagree.')).toBeInTheDocument();
  });

  it('does not stall when the voice module never resolves at all', async () => {
    mount(() => new Promise<SpokenLine | null>(() => {}));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(screen.getByText('But two figures disagree.')).toBeInTheDocument();
  });
});

describe('the tour keeps its silent flight', () => {
  it('still paces off the caption estimate with audio off', async () => {
    const speak = vi.fn(() => Promise.resolve(null));
    mount(speak, false);
    await act(async () => void (await vi.advanceTimersByTimeAsync(3_000)));
    expect(screen.getByText('But two figures disagree.')).toBeInTheDocument();
    // The first-run tour narrates over the top of its own flight; two voices at once is worse
    // than either, so it opts out and nothing here is ever spoken.
    expect(speak).not.toHaveBeenCalled();
  });
});

// Source-inspection, in the same spirit as walk-barrier-order: the per-beat handler lives inside
// PrismOverlay, whose full mount needs a settled world, a laid-out camera and a document surface —
// so the ORDERING rule is asserted where it is written instead.
describe('a briefing shows the document it is talking about', () => {
  const overlay = readFileSync(join(__dirname, '../src/live/prism/PrismOverlay.tsx'), 'utf8');
  const onBriefBeat =
    /const onBriefBeat = useCallback\(([\s\S]*?)\n {2}\);/.exec(overlay)?.[1] ?? '';

  it('opens the beat’s claim on EVERY beat, not only under the pen or the tour', () => {
    expect(onBriefBeat).toContain('setOpenId(beat.claimIds[0] ?? null)');
    // The old form gated the page open on those two, so an ordinary briefing narrated a document
    // the reader could not see — the page is the proof the map is grounded in it.
    expect(onBriefBeat).not.toMatch(/if \(penOn \|\| autoBriefing\) setOpenId/);
  });

  it('still frames the camera on the beat and glows its cards', () => {
    expect(onBriefBeat).toContain('setBriefingIds(new Set(beat.claimIds))');
    expect(onBriefBeat).toContain('frameClaimIds(beat.claimIds)');
  });

  it('closes the page again when the briefing ends', () => {
    const exit = /const exitBriefing = useCallback\(([\s\S]*?)\n {2}\);/.exec(overlay)?.[1] ?? '';
    expect(exit).toContain('setOpenId(null)');
  });

  it('keeps the tour silent while a briefing the reader asked for speaks', () => {
    expect(overlay).toContain('audioDefault={!autoBriefing}');
  });
});
