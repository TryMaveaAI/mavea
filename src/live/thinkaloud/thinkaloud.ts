// Think-out-loud mode, the pure parts: when "just listening", every finished utterance is
// banked instead of answered; the user says "thoughts?" (or taps the chip) and the whole
// ramble goes out as ONE turn asking for an honest sort — decisions, todos, contradictions.
// Everything the canvas will show is the user's own words reorganized, never invented.

/** The wake phrase that ends a just-listen session and asks for the sort. */
export function isThoughtsTrigger(text: string): boolean {
  return /^(ok(ay)?[,.\s]+)?(any |your |so[,.\s]+)?thoughts\s*[?.!]*$/i.test(text.trim());
}

/** One utterance for the ramble bank — drop empty/trigger noise. */
export function bankable(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !isThoughtsTrigger(t);
}

/**
 * The single sorting ask sent when the user wants their ramble back. The transcript rides
 * verbatim; the directive asks for decisions/todos/contradictions with honest sourcing
 * (a contradiction must quote both moments).
 */
export function sortAsk(ramble: readonly string[], minutes: number): string {
  const transcript = ramble.map((r, i) => `(${i + 1}) ${r.trim()}`).join('\n');
  return [
    `I just thought out loud for about ${Math.max(1, minutes)} minute${minutes >= 2 ? 's' : ''}. Sort what I actually said — do NOT add ideas of your own:`,
    '- the DECISIONS I made (even tentative ones),',
    '- the TODOS I gave myself,',
    '- any CONTRADICTIONS (quote both moments and ask me which one I mean).',
    'My words, in order:',
    transcript,
  ].join('\n');
}
