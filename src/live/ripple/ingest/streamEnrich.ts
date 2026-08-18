// streamEnrich.ts — incremental parsing of the enrichment reply, so Ripple's verdict SHARPENS as the
// model streams instead of appearing all at once at the end. As raw JSON arrives, this pulls out the
// fields that have FULLY landed — the summary/gateRationale strings the instant their closing quote
// arrives, and each risks/changes/cascades/suggestions object the instant its closing brace arrives —
// and runs every one through the SAME validators `parseEnrichment` uses (mapRisks/mapChanges/… in
// companionSchema). A half-streamed token or a malformed value can never escape: closed-item-only
// extraction + shared validation means the overlay only ever merges grounded, complete fields onto
// the deterministic floor. The final, canonical read is still `parseEnrichment(out.raw)` once the
// stream ends.
import { ArrayStreamScanner, StringFieldScanner } from '../../streamParse';
import {
  mapRisks,
  mapChanges,
  mapSuggestions,
  parseCascades,
  type Enrichment,
} from './companionSchema';

/**
 * Cursor-holding reader for ONE streaming enrichment reply. Extracting from scratch per delta
 * re-walked the whole buffer six times (and re-JSON.parsed every already-finished element), so a
 * long verdict cost O(chunks × buffer). This reader holds a scanner per field — each keeps its own
 * cursor and parse state — so a whole stream costs one pass over the buffer per field and each
 * array element is parsed exactly once, the moment it closes. Hold one instance for the LIFETIME
 * of a reply (`generate.ts` does) and call `read` with the accumulated buffer, each call an
 * extension of the last — the same contract as the scanners underneath. A fresh reader per delta
 * still parses correctly, it just pays the full rewalk the cursors exist to avoid.
 */
export class EnrichmentStreamReader {
  private readonly summary = new StringFieldScanner('summary');
  private readonly gateRationale = new StringFieldScanner('gateRationale');
  private readonly risks = new ArrayStreamScanner('risks');
  private readonly changes = new ArrayStreamScanner('changes');
  private readonly cascades = new ArrayStreamScanner('cascades');
  private readonly suggestions = new ArrayStreamScanner('suggestions');

  /** The enrichment fields that have completely streamed in so far (monotonic: strings complete
   *  once, arrays only grow). Empty object until the first field closes. */
  read(buf: string): Enrichment {
    this.summary.scan(buf);
    this.gateRationale.scan(buf);
    this.risks.scan(buf);
    this.changes.scan(buf);
    this.cascades.scan(buf);
    this.suggestions.scan(buf);

    const enr: Enrichment = {};

    const summary = this.summary.value();
    if (summary?.trim()) enr.summary = summary.trim();

    const gateRationale = this.gateRationale.value();
    if (gateRationale?.trim()) enr.gateRationale = gateRationale.trim();

    // The scanners' item lists are live views (they grow across scans) — snapshot for the mappers.
    const risks = mapRisks([...this.risks.items]);
    if (risks?.length) enr.risks = risks;

    const changes = mapChanges([...this.changes.items]);
    if (changes?.length) enr.changes = changes;

    const cascades = parseCascades([...this.cascades.items]);
    if (cascades?.length) enr.cascades = cascades;

    const suggestions = mapSuggestions([...this.suggestions.items]);
    if (suggestions?.length) enr.suggestions = suggestions;

    return enr;
  }
}
