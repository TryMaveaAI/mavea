import type { TurnAudio } from './recorder';

// Keep the spoken tracks of recent turns so the voice scrubber works on a chat you've scrolled
// back to — not only the live head. The recorder itself keeps just the current turn (so it stays
// cheap during a turn); this store holds the finished tracks, bounded by TOTAL samples so a long
// session can't grow memory without limit. When the budget is exceeded the OLDEST tracks fall off
// first, but the track just stored is always kept.
const SAMPLE_RATE = 24000;
/** ~5 minutes of voice held across all retained turns (~28 MB of Float32 PCM at most). */
const SAMPLE_BUDGET = SAMPLE_RATE * 300;

export class TurnAudioStore {
  private map = new Map<number, TurnAudio>();

  /** `budget` is the max total samples held across all turns (defaults to ~5 min); injectable for tests. */
  constructor(private budget = SAMPLE_BUDGET) {}

  /** Retain a turn's finished track, keyed by its frame index; evicts the oldest to stay bounded. */
  set(frame: number, audio: TurnAudio): void {
    this.map.set(frame, audio);
    this.evict(frame);
  }

  /** The retained track for a frame, or null when it was never captured or has aged out. */
  get(frame: number): TurnAudio | null {
    return this.map.get(frame) ?? null;
  }

  get size(): number {
    return this.map.size;
  }

  private total(): number {
    let n = 0;
    for (const a of this.map.values()) n += a.pcm.length;
    return n;
  }

  private evict(keep: number): void {
    const order = [...this.map.keys()].sort((a, b) => a - b); // oldest frame first
    let i = 0;
    while (this.total() > this.budget && this.map.size > 1 && i < order.length) {
      const k = order[i++];
      if (k !== keep) this.map.delete(k);
    }
  }
}
