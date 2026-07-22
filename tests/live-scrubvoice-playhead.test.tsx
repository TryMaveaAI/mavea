// Playback keeps the walking playhead LOCAL to the scrubber. Routing every rAF tick through
// onSeek used to re-render the entire Live surface at 60fps for the length of the replay — the
// parent only needs the boundaries. Locks: play commits once at start, the frames in between
// move the slider without a single onSeek, pause commits the resting position, and a drag is
// still parent-driven (building=true) so the un-build path is untouched.
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnAudio } from '../src/live/scrubvoice/recorder';

vi.mock('../src/voice/voiceEnergy', () => ({
  sharedAudioContext: () => ({}) as AudioContext, // playback gate: pretend WebAudio exists
  voiceEnergyTap: () => () => {},
}));
vi.mock('../src/live/scrubvoice/wav', () => ({
  pcmToWavBlobUrl: () => 'blob:fake-wav',
}));

import { VoiceScrubber } from '../src/live/scrubvoice/VoiceScrubber';

const audio: TurnAudio = {
  pcm: new Float32Array(800).fill(0.3),
  sampleRate: 16000,
  duration: 4,
  spans: [],
  marks: [],
};

// A hand-cranked rAF plus a fake <audio> whose currentTime we advance between frames.
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

beforeEach(() => {
  rafQueue = [];
  fakeEl = new FakeAudio();
  // `new Audio(url)` must construct — a plain arrow mock throws under `new`.
  vi.stubGlobal('Audio', function Audio() {
    return fakeEl;
  } as unknown as typeof globalThis.Audio);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: vi.fn(), createObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function tick(time: number): void {
  fakeEl.currentTime = time;
  const cbs = rafQueue;
  rafQueue = [];
  act(() => cbs.forEach((cb) => cb(performance.now())));
}

describe('VoiceScrubber — playback playhead stays local', () => {
  it('play commits once, frames advance the slider with no further onSeek, pause commits the rest', () => {
    const seeks: Array<{ t: number | null; building?: boolean }> = [];
    render(
      <VoiceScrubber
        audio={audio}
        t={null}
        onSeek={(t, building) => seeks.push({ t, building })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    // One boundary commit at start (settles any un-built preview), nothing per frame after.
    expect(seeks).toEqual([{ t: 0, building: undefined }]);

    tick(1.0);
    tick(1.5);
    tick(2.0);
    expect(seeks).toHaveLength(1); // the 60fps walk never reached the parent
    const slider = screen.getByRole('slider', { name: /scrub/i });
    expect(slider.getAttribute('aria-valuenow')).toBe('2'); // …but the strip itself moved

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(seeks).toHaveLength(2);
    expect(seeks.at(-1)).toEqual({ t: 2.0, building: undefined }); // pause hands the position back
  });

  it('playing out to the end settles back to the live canvas (one null commit)', () => {
    const seeks: Array<number | null> = [];
    render(<VoiceScrubber audio={audio} t={null} onSeek={(t) => seeks.push(t)} />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    tick(3.9);
    tick(4.0); // hits duration — the loop ends the replay
    expect(seeks).toEqual([0, null]);
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy(); // back to Play
  });

  it('a drag mid-playback stops the replay and goes parent-driven with building=true', () => {
    const seeks: Array<{ t: number | null; building?: boolean }> = [];
    render(
      <VoiceScrubber
        audio={audio}
        t={null}
        onSeek={(t, building) => seeks.push({ t, building })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    tick(1.0);
    fireEvent.pointerDown(screen.getByRole('slider', { name: /scrub/i }), { clientX: 5 });
    expect(seeks.at(-1)?.building).toBe(true); // the rewind request reached the parent
  });
});
