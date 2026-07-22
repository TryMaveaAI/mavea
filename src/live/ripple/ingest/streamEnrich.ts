// streamEnrich.ts — incremental parsing of the enrichment reply, so Ripple's verdict SHARPENS as the
// model streams instead of appearing all at once at the end. As raw JSON arrives, this pulls out the
// fields that have FULLY landed — the summary/gateRationale strings the instant their closing quote
// arrives, and each risks/changes/cascades/suggestions object the instant its closing brace arrives —
// and runs every one through the SAME validators `parseEnrichment` uses (mapRisks/mapChanges/… in
// companionSchema). A half-streamed token or a malformed value can never escape: closed-item-only
// extraction + shared validation means the overlay only ever merges grounded, complete fields onto
// the deterministic floor. Pure + cheap — safe to call on every streamed chunk. The final, canonical
// read is still `parseEnrichment(out.raw)` once the stream ends.
import { completedArrayItems, extractStringField } from '../../streamParse';
import {
  mapRisks,
  mapChanges,
  mapSuggestions,
  parseCascades,
  type Enrichment,
} from './companionSchema';

/** The enrichment fields that have completely streamed in so far (monotonic: strings complete once,
 *  arrays only grow). Empty object until the first field closes. */
export function extractEnrichmentSoFar(buf: string): Enrichment {
  const enr: Enrichment = {};

  const summary = extractStringField(buf, 'summary');
  if (summary?.trim()) enr.summary = summary.trim();

  const gateRationale = extractStringField(buf, 'gateRationale');
  if (gateRationale?.trim()) enr.gateRationale = gateRationale.trim();

  const risks = mapRisks(completedArrayItems(buf, 'risks'));
  if (risks?.length) enr.risks = risks;

  const changes = mapChanges(completedArrayItems(buf, 'changes'));
  if (changes?.length) enr.changes = changes;

  const cascades = parseCascades(completedArrayItems(buf, 'cascades'));
  if (cascades?.length) enr.cascades = cascades;

  const suggestions = mapSuggestions(completedArrayItems(buf, 'suggestions'));
  if (suggestions?.length) enr.suggestions = suggestions;

  return enr;
}
