import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VoiceScrubber } from '../src/live/scrubvoice/VoiceScrubber';
import type { TurnAudio } from '../src/live/scrubvoice/recorder';

// The voice scrubber exposes an explicit play/pause control alongside the draggable waveform.
// jsdom has no AudioContext, so playback no-ops — we assert the control + slider render and that
// pressing play (or the slider) doesn't throw.

afterEach(cleanup);

const audio: TurnAudio = {
  pcm: new Int16Array(800).fill(0.3 * 0x8000),
  sampleRate: 16000,
  duration: 4,
  spans: [],
  marks: [],
};

describe('VoiceScrubber controls', () => {
  it('renders a play button and the scrub slider', () => {
    render(<VoiceScrubber audio={audio} t={null} onSeek={() => {}} />);
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /scrub/i })).toBeTruthy();
  });

  it('keeps the voice strip visible when no audio track was captured', () => {
    render(<VoiceScrubber audio={null} t={null} onSeek={() => {}} unavailable="offline" />);
    expect(screen.getByRole('status', { name: /voice scrub unavailable/i })).toBeTruthy();
    expect(screen.getByText(/voice is off/i)).toBeTruthy();
    expect(screen.queryByRole('slider', { name: /scrub/i })).toBeNull();
  });

  it('clicking play does not scrub or throw (no AudioContext in jsdom)', () => {
    let seeked = 0;
    render(<VoiceScrubber audio={audio} t={null} onSeek={() => (seeked += 1)} />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    // playback can't start without an AudioContext, so the button stays "Play" and nothing seeks
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    expect(seeked).toBe(0);
  });

  it('exposes a speed chip that cycles 1× → 1.25× → 1.5× → 2× → 0.75× → 1×', () => {
    render(<VoiceScrubber audio={audio} t={null} onSeek={() => {}} />);
    const speed = screen.getByRole('button', { name: /^speed/i });
    expect(speed.textContent).toBe('1×'); // defaults to normal speed
    for (const label of ['1.25×', '1.5×', '2×', '0.75×', '1×']) {
      fireEvent.click(speed);
      expect(speed.textContent).toBe(label);
    }
  });

  it('a drag reports an explicit rebuild seek (the canvas only time-travels on a deliberate rewind)', () => {
    // Regression: pressing Play used to un-build the canvas because both drag and playback seeked
    // the same way. A drag is now flagged `building: true` (un-build to this moment); playback
    // passes the default false, so listening never collapses the answer.
    const seeks: Array<{ t: number | null; building?: boolean }> = [];
    render(
      <VoiceScrubber
        audio={audio}
        t={null}
        onSeek={(t, building) => seeks.push({ t, building })}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('slider', { name: /scrub/i }), { clientX: 5 });
    expect(seeks.length).toBeGreaterThan(0);
    expect(seeks.at(-1)?.building).toBe(true);
  });
});

// The waveform is the one thing that has to follow the `audio` prop synchronously: peaks used to
// live in a ref cleared by its own effect, which React runs AFTER the draw effect — so a new turn
// painted the PREVIOUS answer's waveform under the new track's duration and aria values.
// jsdom lays nothing out and has no 2D context, so both are stubbed; the drawn bar heights are
// the only place the bug is visible.
describe('VoiceScrubber waveform', () => {
  const barHeights: number[] = [];
  const ctx = {
    scale: () => {},
    clearRect: () => {},
    // The visible canvas now blits the two pre-baked bar layers instead of filling bars itself —
    // stub it so the blit doesn't throw. The bars themselves are still filled once per layer
    // (see fillRect below), so the assertions below see the same heights either way.
    drawImage: () => {},
    fillStyle: '',
    fillRect: (_x: number, _y: number, _w: number, h: number) => {
      barHeights.push(h);
    },
  };
  const size = (px: number) => ({ configurable: true, get: () => px });
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    barHeights.length = 0;
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', size(320));
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', size(28));
    HTMLCanvasElement.prototype.getContext = (() =>
      ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientWidth');
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientHeight');
  });

  const track = (amp: number, duration: number): TurnAudio => ({
    pcm: new Int16Array(800).fill(amp * 0x8000),
    sampleRate: 16000,
    duration,
    spans: [],
    marks: [],
  });

  it('redraws from the NEW track the moment the audio prop changes', () => {
    const quiet = track(0.2, 4);
    const loud = track(0.9, 9);
    const { rerender } = render(<VoiceScrubber audio={quiet} t={null} onSeek={() => {}} />);
    expect(barHeights.length).toBeGreaterThan(0);
    const quietBar = barHeights[0];

    barHeights.length = 0;
    rerender(<VoiceScrubber audio={loud} t={null} onSeek={() => {}} />);
    expect(barHeights.length).toBeGreaterThan(0);
    // Every bar of the redraw comes from the loud track — not one is the old track's height.
    expect(barHeights.every((h) => h > quietBar * 2)).toBe(true);
    // …and the strip's own numbers moved with it.
    expect(screen.getByRole('slider', { name: /scrub/i }).getAttribute('aria-valuemax')).toBe('9');
  });
});

// The strip is dense, and dense invites shrinking the type past the point of reading. The hint
// under the waveform sat at 8.5px until this guard existed. jsdom parses no stylesheet, so the
// floor is pinned by scanning the source.
describe('VoiceScrubber legibility', () => {
  it('declares no rendered text below the 9px floor', () => {
    const css = readFileSync(join(__dirname, '../src/live/scrubvoice/scrubvoice.css'), 'utf8');
    const sizes = Array.from(css.matchAll(/font(?:-size)?:[^;{}]*?(\d+(?:\.\d+)?)px/g)).map((m) =>
      Number(m[1]),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((px) => px < 9)).toEqual([]);
  });
});
