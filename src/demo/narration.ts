// Recorded narration for the public demo corpus. The showcase is static: it never asks a
// visitor's browser to synthesize speech, so each replay reads its pre-rendered Opus track.
import { IS_SHOWCASE } from '../lib/runtimeMode';

const NARRATION_ROOT = '/demo-assets/narration';

/** Stable public path for one baked answer narration. */
export function demoNarrationUrl(persona: string, turnIndex: number): string {
  return `${NARRATION_ROOT}/${encodeURIComponent(persona)}-${turnIndex + 1}.webm`;
}

/** One reusable HTML media element keeps browser audio permission attached to the Start gesture. */
export class DemoNarration {
  private audio: HTMLAudioElement | null = null;
  private epoch = 0;
  private playing = false;

  constructor(private readonly enabled = IS_SHOWCASE) {}

  isPlaying(): boolean {
    return this.playing;
  }

  play(persona: string, turnIndex: number, muted: boolean): void {
    this.stop();
    if (!this.enabled || muted) return;

    const epoch = ++this.epoch;
    const audio = new Audio(demoNarrationUrl(persona, turnIndex));
    audio.preload = 'auto';
    this.audio = audio;
    // Set this before play() resolves: the demo clock must not race its narration while the
    // browser is buffering a file.
    this.playing = true;
    const finish = (): void => {
      if (this.epoch !== epoch) return;
      this.playing = false;
      this.audio = null;
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    void audio.play().catch(finish);
  }

  stop(): void {
    this.epoch++;
    this.playing = false;
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
}
