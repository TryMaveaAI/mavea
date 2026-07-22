import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VoiceScrubber } from '../src/live/scrubvoice/VoiceScrubber';
import type { TurnAudio } from '../src/live/scrubvoice/recorder';

// The voice scrubber exposes an explicit play/pause control alongside the draggable waveform.
// jsdom has no AudioContext, so playback no-ops — we assert the control + slider render and that
// pressing play (or the slider) doesn't throw.

afterEach(cleanup);

const audio: TurnAudio = {
  pcm: new Float32Array(800).fill(0.3),
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
