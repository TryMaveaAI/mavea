// grounding.ts — re-export shim. The strict verbatim gate now lives in the shared honesty spine
// (src/live/ground/verbatim.ts, with its OCR recovery in ground/snap.ts) so every feature grounds a
// quote the exact same way. Prism keeps importing from here; the implementation and its behavior
// are unchanged (verified by prism-grounding.test.ts).
export {
  normalizePdfText,
  isVerbatimOnPage,
  isClaimGrounded,
  groundedPageOf,
  type GroundableClaim,
} from '../ground/verbatim';
export { snapQuoteToPage, makePageSnapper } from '../ground/snap';
