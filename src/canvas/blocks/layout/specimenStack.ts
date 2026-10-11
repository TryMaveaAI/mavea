// A spec names a face the reader's machine may not have (Inter, Fraunces, a brand's licensed
// family). A bare `font-family: Inter` then falls to the browser default — Times — so a sans
// spec renders as a serif and the sheet misstates the very thing it documents. Every family is
// given a generic tail matching its kind, so a missing face degrades to a close stand-in.
const SERIF_HINT =
  /\b(serif|garamond|georgia|times|fraunces|playfair|lora|merriweather|baskerville|caslon|didot|bodoni|crimson|spectral|charter|cambria|palatino|minion|tiempos|freight|recoleta)\b/i;
const MONO_HINT = /\b(mono|code|courier|consolas|menlo)\b/i;

export function specimenStack(family: string | undefined): string | undefined {
  const name = family?.trim();
  if (!name) return undefined;
  // A model may already send a stack ("Inter, sans-serif"); quote a lone multi-word name.
  const head = name.includes(',') || /^['"]/.test(name) ? name : `"${name.replace(/"/g, '')}"`;
  const tail = MONO_HINT.test(name)
    ? 'ui-monospace, monospace'
    : SERIF_HINT.test(name) && !/\bsans\b/i.test(name)
      ? 'Georgia, serif'
      : 'system-ui, sans-serif';
  return `${head}, ${tail}`;
}
