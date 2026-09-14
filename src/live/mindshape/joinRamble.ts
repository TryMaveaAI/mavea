// joinRamble.ts — the one place banked utterances become the transcript the map reads.
// A VAD utterance is a clause boundary by construction: the microphone already decided the person
// finished a thought. Whisper often returns no terminal punctuation, so joining with a bare space
// threw that boundary away — "I want to move to Seattle" + "my dad is getting older" arrived as one
// run-on clause, counted as one thought, and produced a single quote spanning both. A newline states
// the boundary; localExtract's segmentText splits on it.

/** Join banked utterances (and an in-progress partial) into one transcript, one thought per line. */
export function joinRamble(parts: readonly string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n');
}
