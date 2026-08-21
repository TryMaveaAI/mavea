// speechPacer.ts — how many sentences go to the synthesizer at a time.
//
// The narration is spoken sentence by sentence, each one queued the instant it forms. That is what
// makes the voice start in a few hundred milliseconds instead of after the whole answer — and it is
// also why the voice sounds like a list being read: Kokoro sees each sentence in ISOLATION, so it
// applies a full utterance-initial onset and sentence-final falling contour to every one, with the
// queue's own gap between them. Three sentences become three separate little speeches.
//
// The fix costs nothing, because the FIRST sentence is the only one whose latency a listener can
// hear. It still goes out alone, immediately. Everything after it accumulates until there is enough
// to say in one breath, and by then the first sentence's playback is covering the wait — so
// time-to-first-word is unchanged while the prosody runs across the sentence boundaries instead of
// resetting at each one.
//
// Pure and synchronous; the streaming caller owns the text, this only decides when to hand it over.

/** Roughly one breath of speech. Below this, a chunk is a fragment and sounds like one; much above
 *  it and a late sentence would wait on one that has not arrived. Two ordinary sentences. */
export const COALESCE_MIN_CHARS = 160;

export interface SpeechPacer {
  /** Offer the next speakable chunk. Returns what to queue NOW, or '' to keep accumulating.
   *  `final` marks the last chunk there will be — everything held comes out with it. */
  push: (chunk: string, final?: boolean) => string;
  /** Whatever is still held, for a stream that ended without a final chunk. */
  flush: () => string;
}

/**
 * Speak the first chunk immediately, then gather the rest into breath-sized utterances.
 * `minChars` is the gathering threshold; pass 0 to disable coalescing entirely.
 */
export function createSpeechPacer(minChars: number = COALESCE_MIN_CHARS): SpeechPacer {
  let held = '';
  let first = true;
  return {
    push(chunk, final = false) {
      const next = chunk.trim();
      if (!next) return final ? this.flush() : '';
      // The opening line goes out on its own — every millisecond of it is one the listener waits.
      if (first && !held) {
        first = false;
        return next;
      }
      held = held ? `${held} ${next}` : next;
      if (!final && held.length < minChars) return '';
      const out = held;
      held = '';
      return out;
    },
    flush() {
      const out = held;
      held = '';
      return out;
    },
  };
}
