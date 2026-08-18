// The replay walk used to cost a React commit AND a forced style read (getComputedStyle) on
// every single rAF frame for as long as an answer spoke — the state commit re-rendered the whole
// scrubber, the style read forced a synchronous style flush, both 60×/sec. VoiceScrubber now
// bakes the bar colors once per track and drives the canvas straight from the rAF loop, only
// telling React about the position when the (already-rounded) aria value would actually change.
// This pins both numbers low instead of re-deriving them from scratch on every review.
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnAudio } from '../src/live/scrubvoice/recorder';

vi.mock('../src/voice/voiceEnergy', () => ({
  audioAvailable: () => true, // playback gate: pretend WebAudio exists
  voiceEnergyTap: () => () => {},
}));
vi.mock('../src/live/scrubvoice/wav', () => ({
  pcmToWavBlobUrl: () => 'blob:fake-wav',
}));

import { VoiceScrubber } from '../src/live/scrubvoice/VoiceScrubber';

const audio: TurnAudio = {
  pcm: new Int16Array(800).fill(0.3 * 0x8000),
  sampleRate: 16000,
  duration: 10,
  spans: [],
  marks: [],
};

// A hand-cranked rAF plus a fake <audio> whose currentTime we advance between frames — same
// harness as tests/live-scrubvoice-playhead.test.tsx.
let rafQueue: FrameRequestCallback[] = [];
class FakeAudio {
  currentTime = 0;
  ended = false;
  playbackRate = 1;
  preservesPitch = true;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  addEventListener = vi.fn();
  removeAttribute = vi.fn();
}
let fakeEl: FakeAudio;

// A real canvas backend isn't installed in this repo's test env, so a bare canvas.getContext('2d')
// returns null and the draw path no-ops harmlessly. Stubbing it lets the blit actually run (and
// keeps jsdom's "not implemented" warning out of the test output) without changing what's being
// measured here: style-read count and React commit count, neither of which depends on what the
// canvas draws.
const ctxStub = {
  scale: () => {},
  clearRect: () => {},
  drawImage: () => {},
  fillRect: () => {},
  fillStyle: '',
};
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const size = (px: number) => ({ configurable: true, get: () => px });

beforeEach(() => {
  rafQueue = [];
  fakeEl = new FakeAudio();
  vi.stubGlobal('Audio', function Audio() {
    return fakeEl;
  } as unknown as typeof globalThis.Audio);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: vi.fn(), createObjectURL: vi.fn() });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', size(320));
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', size(28));
  HTMLCanvasElement.prototype.getContext = (() =>
    ctxStub) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientWidth');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientHeight');
  Reflect.deleteProperty(document.documentElement.dataset, 'theme');
});

function tick(time: number): void {
  fakeEl.currentTime = time;
  const cbs = rafQueue;
  rafQueue = [];
  act(() => cbs.forEach((cb) => cb(performance.now())));
}

describe('VoiceScrubber replay — per-frame cost stays off the walk', () => {
  it('does not re-read computed style once playback is under way', () => {
    const styleSpy = vi.spyOn(window, 'getComputedStyle');
    render(<VoiceScrubber audio={audio} t={null} onSeek={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    const baseline = styleSpy.mock.calls.length; // mount + play-start may each bake the track once
    for (let s = 1; s <= 60; s += 1) tick(s * 0.1); // 60 frames walking 6 seconds of audio
    // A per-frame reader (the forced style flush the profiler flagged) would add 60 calls here;
    // the baked layers mean the walk itself reads style zero more times.
    expect(styleSpy.mock.calls.length - baseline).toBe(0);
  });

  it('commits to React on whole-second boundaries, not once a frame', () => {
    let commits = 0;
    const countRender: ProfilerOnRenderCallback = () => {
      commits += 1;
    };
    render(
      <Profiler id="scrubber" onRender={countRender}>
        <VoiceScrubber audio={audio} t={null} onSeek={() => {}} />
      </Profiler>,
    );
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    commits = 0; // ignore mount + the one boundary commit play-start makes
    for (let s = 1; s <= 60; s += 1) tick(s * 0.1); // 60 frames crossing 6 whole seconds (1..6)
    // A per-frame commit would be 60; the aria-rounds-to-seconds throttle lands on exactly 6.
    expect(commits).toBe(6);
  });
});

// Light/dark is a first-class, user-toggleable thing (the topbar toggle flips data-theme on
// <html> via applyTheme) — a waveform that keeps its old colors after a flip is a visible bug,
// not a documented nuance. ensureLayers folds the resolved theme into its cache key, and a
// MutationObserver on <html> repaints a scrubber sitting idle the instant the flip happens
// instead of waiting on some unrelated redraw to notice.
describe('VoiceScrubber replay — reacts to a theme flip', () => {
  it('re-bakes the layers (and repaints) when data-theme changes while at rest', async () => {
    const styleSpy = vi.spyOn(window, 'getComputedStyle');
    render(<VoiceScrubber audio={audio} t={2} onSeek={() => {}} />);
    const afterMount = styleSpy.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0); // baked once for the initial (paused) draw

    await act(async () => {
      document.documentElement.dataset.theme = 'dark';
      await Promise.resolve(); // let the MutationObserver's microtask deliver the mutation record
    });

    // A stale-color bug looks like: nothing re-reads style, so the bars keep the old theme's
    // colors forever. Re-baking means exactly one more getComputedStyle call, not zero.
    expect(styleSpy.mock.calls.length).toBe(afterMount + 1);
  });

  it('does not repaint while the answer is actively playing (the rAF walk already owns it)', async () => {
    const styleSpy = vi.spyOn(window, 'getComputedStyle');
    render(<VoiceScrubber audio={audio} t={null} onSeek={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    const baseline = styleSpy.mock.calls.length;

    await act(async () => {
      document.documentElement.dataset.theme = 'dark';
      await Promise.resolve();
    });

    // The observer bails out under `playing.current` — the very next rAF tick (already covered
    // by the walk's own draw) is what picks up the new theme, not a second, competing repaint.
    expect(styleSpy.mock.calls.length).toBe(baseline);
  });
});
