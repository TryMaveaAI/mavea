import { afterEach, describe, expect, it } from 'vitest';
import {
  isQuietHour,
  quietHoursEnabled,
  setQuietHoursEnabled,
  WHISPER_GAIN,
} from '../src/live/whisper/quietHours';
import { setVoiceGain } from '../src/voice/streamTts';

// Whisper mode: the clock window is exactly 22:00–06:00, it stays OFF until the user opts in
// (an unexplained late-night dim reads as broken sound), and the ember gain is a real
// reduction that the TTS setter accepts.

afterEach(() => setQuietHoursEnabled(false));

describe('quiet hours', () => {
  it('runs 22:00 through 05:59 and nowhere else', () => {
    expect(isQuietHour(22)).toBe(true);
    expect(isQuietHour(2)).toBe(true);
    expect(isQuietHour(5)).toBe(true);
    expect(isQuietHour(6)).toBe(false);
    expect(isQuietHour(12)).toBe(false);
    expect(isQuietHour(21)).toBe(false);
  });

  it('is off by default; opting in persists and opting back out clears it', () => {
    expect(quietHoursEnabled()).toBe(false);
    setQuietHoursEnabled(true);
    expect(quietHoursEnabled()).toBe(true);
    setQuietHoursEnabled(false);
    expect(quietHoursEnabled()).toBe(false);
  });

  it('the whisper gain is a real, sane reduction', () => {
    expect(WHISPER_GAIN).toBeGreaterThan(0.1);
    expect(WHISPER_GAIN).toBeLessThan(0.8);
    expect(() => setVoiceGain(WHISPER_GAIN)).not.toThrow();
    setVoiceGain(1);
  });
});
