import { describe, expect, it, vi } from 'vitest';
import { DemoNarration, demoNarrationUrl } from '../src/demo/narration';

function audioStub(): HTMLAudioElement {
  return {
    preload: '',
    addEventListener: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
  } as unknown as HTMLAudioElement;
}

describe('recorded demo narration', () => {
  it('uses one predictable, encoded public asset per persona turn', () => {
    expect(demoNarrationUrl('traveler', 1)).toBe('/demo-assets/narration/traveler-2.webm');
    expect(demoNarrationUrl('A/B', 0)).toBe('/demo-assets/narration/A%2FB-1.webm');
  });

  it('starts by default and stops cleanly when the listener mutes', async () => {
    const audio = audioStub();
    const AudioMock = vi.fn(
      class {
        constructor(_url: string) {
          return audio;
        }
      },
    );
    vi.stubGlobal('Audio', AudioMock);
    try {
      const narration = new DemoNarration(true);
      narration.play('pm', 0, false);
      expect(AudioMock).toHaveBeenCalledWith('/demo-assets/narration/pm-1.webm');
      expect(narration.isPlaying()).toBe(true);

      narration.stop();
      expect(narration.isPlaying()).toBe(false);
      expect(audio.pause).toHaveBeenCalledOnce();
      expect(audio.load).toHaveBeenCalledOnce();
      await expect(audio.play).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not construct audio when muted', () => {
    const AudioMock = vi.fn();
    vi.stubGlobal('Audio', AudioMock);
    try {
      new DemoNarration(true).play('dev', 0, true);
      expect(AudioMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
