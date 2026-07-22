// Share-to-Mavéa — the receipts machine's intake. Paste or drop a link or a screenshot
// anywhere on the Live surface and it becomes a fact-check ask: the URL (or image) rides
// the existing grounding paths, and the answer's claims come back checked against real
// sources — never a vibe. Pure helpers; the surface owns the event wiring.

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

/** The first http(s) URL in a pasted blob, or null. Trailing punctuation is trimmed the way
 *  links pasted out of prose usually need. */
export function sharedUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) return null;
  return m[0].replace(/[.,;:!?]+$/, '');
}

/** Whether a paste looks like a SHARE (a bare link, maybe with a few words around it) rather
 *  than the user writing a sentence that merely contains a link. */
export function looksLikeShare(text: string): boolean {
  const url = sharedUrl(text);
  if (!url) return false;
  const rest = text.replace(url, '').trim();
  return rest.split(/\s+/).filter(Boolean).length <= 12;
}

/** The claim-check ask for a shared link. */
export function claimCheckAsk(url: string): string {
  return `Check this for me: ${url} — what's actually true, what's shaky, and what's missing context? Ground every verdict in real sources.`;
}

/** The claim-check ask for a shared screenshot (it rides as an attachment). */
export const SCREENSHOT_CHECK_ASK =
  "Check the claim in this screenshot — what's actually true, what's shaky, and what's missing context? Ground every verdict in real sources.";

/** True when a paste/drop landed in a text field — leave those completely alone. */
export function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}
