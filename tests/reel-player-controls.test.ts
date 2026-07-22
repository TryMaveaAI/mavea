// Play/pause + replay controls for the reel preview:
// - ReelPlayer's controlled `paused` prop (ShareModal drives it; the gallery still doesn't pass one,
//   so uncontrolled behavior — covered in reel-keyboard.test.ts — must stay untouched).
// - `togglePause` funnels the space-bar shortcut through the SAME path a future button uses, so the
//   two can never drift out of sync — verified from both the controlled and uncontrolled side.
// - audioTrack's pause/resume offset bookkeeping. A real AudioContext can't run in jsdom, so the
//   elapsed/clamp math is pulled out as pure functions and unit-tested directly; makePreviewAudio's
//   wiring is then exercised against a hand-rolled fake context, the same shape/spirit as the
//   sharedAudioContext mock in tests/voice-output-mute.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';

// A hand-rolled fake AudioContext — same shape/spirit as the sharedAudioContext mock in
// tests/voice-output-mute.test.ts. audioTrack.ts never calls it except from inside makePreviewAudio,
// so mocking it here has no bearing on the ReelPlayer tests below.
type FakeSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
let fakeNow = 0;
let fakeState: 'running' | 'suspended' = 'running';
const fakeSources: FakeSource[] = [];
const fakeResume = vi.fn(async () => {
  fakeState = 'running';
});

vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => ({
    get currentTime() {
      return fakeNow;
    },
    get state() {
      return fakeState;
    },
    resume: fakeResume,
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    createBufferSource: () => {
      const node: FakeSource = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      fakeSources.push(node);
      return node;
    },
  }),
}));

import { ReelPlayer } from '../src/clip/reel/ReelPlayer';
import type { ReelScript, ReelSlide } from '../src/clip/reel/reelScript';
import { elapsedOffset, clampResumeOffset, makePreviewAudio } from '../src/clip/reel/audioTrack';

class InertResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
let RealResizeObserver: typeof ResizeObserver | undefined;
beforeEach(() => {
  RealResizeObserver = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', InertResizeObserver as unknown as typeof ResizeObserver);
});
afterEach(() => {
  vi.stubGlobal('ResizeObserver', RealResizeObserver);
});

function oneBeatScript(): ReelScript {
  const slides: ReelSlide[] = [
    {
      id: 'a1',
      content: 'quote',
      template: 'spotlightQuote',
      slots: { quote: 'a1' },
      caption: 'a1',
      voiceover: 'a1',
      durationMs: 4000,
    } as ReelSlide,
  ];
  return {
    topic: 'Topic',
    question: 'Q?',
    palette: 'aurora',
    vibe: 'clean',
    seed: 0,
    slides,
    durationMs: slides.reduce((a, s) => a + s.durationMs, 0),
  };
}

/** The active progress segment's fill bar, whose `animationPlayState` is the real freeze mechanism
 *  (the pause badge is purely decorative). */
function activeFill(container: HTMLElement): HTMLElement {
  const bars = Array.from(container.querySelectorAll<HTMLElement>('.reel-seg > i'));
  const active = bars.find((el) => el.style.animation.includes('reel-seg-fill'));
  if (!active) throw new Error('no active segment found');
  return active;
}

describe('ReelPlayer — controlled paused prop', () => {
  it('reflects a controlled paused=true through to the visual freeze, with no internal drift', () => {
    const script = oneBeatScript();
    const { container, rerender } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        paused: false,
      }),
    );
    expect(activeFill(container).style.animationPlayState).toBe('running');

    rerender(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        paused: true,
      }),
    );
    expect(activeFill(container).style.animationPlayState).toBe('paused');
    expect(container.querySelector('.reel-pause-badge')?.getAttribute('data-show')).toBe('true');

    rerender(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        paused: false,
      }),
    );
    expect(activeFill(container).style.animationPlayState).toBe('running');
  });

  it('space bar calls onPausedChange with the flipped value instead of pausing itself', () => {
    const script = oneBeatScript();
    const onPausedChange = vi.fn();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        paused: false,
        onPausedChange,
      }),
    );
    const reel = container.querySelector('.reel')!;
    fireEvent.keyDown(reel, { key: ' ' });
    expect(onPausedChange).toHaveBeenCalledTimes(1);
    expect(onPausedChange).toHaveBeenCalledWith(true);
    // Controlled: the parent never fed the new value back (as ShareModal always would via its own
    // state setter), so the visual must NOT flip on its own — that would mean keyboard and the prop
    // could disagree about the reel's pause state.
    expect(activeFill(container).style.animationPlayState).toBe('running');
  });

  it('without a paused prop, space bar still pauses itself and never calls onPausedChange', () => {
    const script = oneBeatScript();
    const onPausedChange = vi.fn();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        onPausedChange, // present but inert — paused is undefined, so uncontrolled mode wins
      }),
    );
    const reel = container.querySelector('.reel')!;
    expect(activeFill(container).style.animationPlayState).toBe('running');
    fireEvent.keyDown(reel, { key: ' ' });
    expect(activeFill(container).style.animationPlayState).toBe('paused');
    expect(onPausedChange).not.toHaveBeenCalled();
  });
});

describe('ReelPlayer — keyboard focus on mount', () => {
  // The ← → ↑ ↓ / space shortcuts live on the `.reel` node, so they only fire while it (or a child)
  // holds focus. An interactive player must take that focus itself on mount — it remounts (via the
  // caller's React key) on every format switch, Remix, and timing sync, so this is also what keeps
  // the shortcuts alive after those without a stray click. Regression guard for "you have to click
  // the reel to move."
  it('an interactive player focuses its own root on mount', () => {
    const { container } = render(
      createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: true }),
    );
    expect(document.activeElement).toBe(container.querySelector('.reel'));
  });

  it('a non-interactive player (gallery tile) never steals focus', () => {
    // Focus a sentinel first so "didn't move" is a real assertion, not just "body by default".
    const sentinel = document.createElement('button');
    document.body.appendChild(sentinel);
    sentinel.focus();
    render(createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: false }));
    expect(document.activeElement).toBe(sentinel);
    sentinel.remove();
  });

  it('each fresh mount re-grabs focus — the remount path a format switch / Remix takes', () => {
    const first = render(
      createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: true }),
    );
    expect(document.activeElement).toBe(first.container.querySelector('.reel'));
    first.unmount();
    // A keyed remount is a brand-new instance; a second mount must focus again.
    const second = render(
      createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: true }),
    );
    expect(document.activeElement).toBe(second.container.querySelector('.reel'));
  });
});

describe('audioTrack — elapsedOffset / clampResumeOffset (pure bookkeeping)', () => {
  it('elapsedOffset adds however much context-clock time has passed since the source started', () => {
    expect(elapsedOffset(10, 0, 12.5)).toBeCloseTo(2.5, 5);
    expect(elapsedOffset(10, 3, 12.5)).toBeCloseTo(5.5, 5); // resumed mid-buffer, then more time passed
  });

  it('elapsedOffset never goes backward even if `now` is stale/equal (clock jitter)', () => {
    expect(elapsedOffset(10, 1, 10)).toBe(1);
    expect(elapsedOffset(10, 1, 9)).toBe(1);
  });

  it('clampResumeOffset passes through an offset still inside the buffer', () => {
    expect(clampResumeOffset(2, 5)).toBe(2);
    expect(clampResumeOffset(0, 5)).toBe(0);
  });

  it('clampResumeOffset returns null at/past the end, or for a degenerate duration', () => {
    expect(clampResumeOffset(5, 5)).toBeNull();
    expect(clampResumeOffset(6, 5)).toBeNull();
    expect(clampResumeOffset(0, 0)).toBeNull();
    expect(clampResumeOffset(1, NaN)).toBeNull();
  });
});

describe('audioTrack — makePreviewAudio pause/resume', () => {
  afterEach(() => {
    fakeNow = 0;
    fakeState = 'running';
    fakeSources.length = 0;
    fakeResume.mockClear();
  });

  it('pause() stops the live source; resume() starts a fresh one at the elapsed offset', () => {
    const buffer = { duration: 5 } as unknown as AudioBuffer;
    const audio = makePreviewAudio(buffer);
    expect(audio).not.toBeNull();

    audio!.play();
    expect(fakeSources).toHaveLength(1);
    expect(fakeSources[0].start).toHaveBeenCalledWith(0, 0);

    fakeNow = 2; // 2s of narration has played
    audio!.pause();
    expect(fakeSources[0].stop).toHaveBeenCalledTimes(1);

    fakeNow = 2.4; // more time passes while paused — must NOT count toward the resumed offset
    audio!.resume();
    expect(fakeSources).toHaveLength(2);
    expect(fakeSources[1].start).toHaveBeenCalledWith(0, 2);
  });

  it('resume() past the buffer end is a safe no-op — no new source, no throw', () => {
    const buffer = { duration: 3 } as unknown as AudioBuffer;
    const audio = makePreviewAudio(buffer);
    audio!.play();
    fakeNow = 5; // already past the 3s buffer when paused
    audio!.pause();
    expect(() => audio!.resume()).not.toThrow();
    expect(fakeSources).toHaveLength(1); // only the original play() source — resume declined
  });

  it('pausing twice in a row is a no-op the second time (no extra stop calls)', () => {
    const buffer = { duration: 5 } as unknown as AudioBuffer;
    const audio = makePreviewAudio(buffer);
    audio!.play();
    fakeNow = 1;
    audio!.pause();
    audio!.pause();
    expect(fakeSources[0].stop).toHaveBeenCalledTimes(1);
  });

  it('play() always restarts fresh from 0, even mid-pause (replay-from-start semantics)', () => {
    const buffer = { duration: 5 } as unknown as AudioBuffer;
    const audio = makePreviewAudio(buffer);
    audio!.play();
    fakeNow = 2;
    audio!.pause();
    audio!.play();
    expect(fakeSources).toHaveLength(2);
    expect(fakeSources[1].start).toHaveBeenCalledWith(0, 0);
  });
});
