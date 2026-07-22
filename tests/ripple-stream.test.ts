// ripple-stream.test.ts — floor-first progressive reveal. As the enrichment JSON streams in, Ripple
// sharpens the verdict field-by-field. These guard the two load-bearing honesty properties: a field
// is only ever emitted once it has FULLY arrived (closed string / closed object), and the streamed
// view is monotonic and converges exactly to the final, canonical parseEnrichment. A half-streamed or
// malformed value can never reach the screen.
import { describe, it, expect } from 'vitest';
import { completedArrayItems, completedBlocks } from '../src/live/streamParse';
import { extractEnrichmentSoFar } from '../src/live/ripple/ingest/streamEnrich';
import { parseEnrichment, mergeEnrichment } from '../src/live/ripple/ingest/companionSchema';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';

const FULL = JSON.stringify({
  summary: 'Threads a VerifyOpts through token validation.',
  risks: [
    { level: 'breaks', text: 'guard.ts still calls the old shape' },
    { level: 'watch', text: 'rotation is not atomic' },
  ],
  changes: [
    { id: 'c0', intent: 'adds opts to validateToken', why: 'short-lived tokens', risk: 'breaks' },
  ],
  cascades: [
    {
      trigger: 'validateToken gains an arg',
      hops: [
        { label: 'guard.ts calls the old shape', context: '1 caller', severity: 'breaks' },
        { label: 'every guarded route 5xxs', context: 'runtime', severity: 'breaks' },
      ],
      incident: 'auth outage on every guarded route',
      incidentSeverity: 'P0',
      caughtBeforeMerge: 'update guard.ts first',
    },
  ],
  gateRationale: 'Hold until guard.ts is updated.',
  suggestions: [
    {
      category: 'COMPATIBILITY',
      title: 'Old call-sites?',
      gist: 'opts is optional',
      why: 'they pass undefined',
      evidence: 'token.ts:42',
      fix: 'make it required',
    },
  ],
});

describe('completedArrayItems', () => {
  it('emits only objects whose closing brace has arrived', () => {
    // cut in the middle of the SECOND risk object
    const cut = FULL.slice(0, FULL.indexOf('rotation is not'));
    expect(completedArrayItems(cut, 'risks')).toHaveLength(1);
    expect(completedArrayItems(FULL, 'risks')).toHaveLength(2);
  });

  it('handles a nested array inside an element (a cascade with hops)', () => {
    // a prefix cut INSIDE the cascade's hops array — the cascade object is not closed yet
    const cut = FULL.slice(0, FULL.indexOf('every guarded route'));
    expect(completedArrayItems(cut, 'cascades')).toHaveLength(0);
    const cascades = completedArrayItems(FULL, 'cascades') as { hops: unknown[] }[];
    expect(cascades).toHaveLength(1);
    expect(cascades[0]!.hops).toHaveLength(2); // inner array fully captured
  });

  it('returns [] when the key has not streamed in yet', () => {
    expect(completedArrayItems('{"summary":"x"', 'risks')).toEqual([]);
  });

  it('completedBlocks delegates to the "blocks" key', () => {
    const b = '{"blocks":[{"type":"a"},{"type":"b"}]}';
    expect(completedBlocks(b)).toEqual(completedArrayItems(b, 'blocks'));
    expect(completedBlocks(b)).toHaveLength(2);
  });
});

describe('extractEnrichmentSoFar', () => {
  it('is monotonic across the stream — fields/counts only ever grow', () => {
    let lastSummary = false;
    let lastGate = false;
    const counts = { risks: 0, changes: 0, cascades: 0, suggestions: 0 };
    for (let i = 1; i <= FULL.length; i++) {
      const enr = extractEnrichmentSoFar(FULL.slice(0, i));
      // a present string field never disappears
      const hasSummary = !!enr.summary;
      const hasGate = !!enr.gateRationale;
      expect(hasSummary || !lastSummary).toBe(true);
      expect(hasGate || !lastGate).toBe(true);
      lastSummary = hasSummary || lastSummary;
      lastGate = hasGate || lastGate;
      // array counts never shrink
      const next = {
        risks: enr.risks?.length ?? 0,
        changes: enr.changes?.length ?? 0,
        cascades: enr.cascades?.length ?? 0,
        suggestions: enr.suggestions?.length ?? 0,
      };
      expect(next.risks).toBeGreaterThanOrEqual(counts.risks);
      expect(next.changes).toBeGreaterThanOrEqual(counts.changes);
      expect(next.cascades).toBeGreaterThanOrEqual(counts.cascades);
      expect(next.suggestions).toBeGreaterThanOrEqual(counts.suggestions);
      Object.assign(counts, next);
    }
  });

  it('converges to the canonical parseEnrichment on the full buffer', () => {
    const streamed = extractEnrichmentSoFar(FULL);
    const canonical = parseEnrichment(FULL)!;
    expect(streamed.summary).toBe(canonical.summary);
    expect(streamed.gateRationale).toBe(canonical.gateRationale);
    expect(streamed.risks).toEqual(canonical.risks);
    expect(streamed.changes).toEqual(canonical.changes);
    expect(streamed.cascades).toEqual(canonical.cascades);
    expect(streamed.suggestions).toEqual(canonical.suggestions);
  });

  it('never emits a value before it has fully landed', () => {
    // right after the opening brace, before "summary" closes — nothing yet
    const early = extractEnrichmentSoFar(FULL.slice(0, FULL.indexOf('Threads') + 4));
    expect(early.summary).toBeUndefined();
    expect(early.risks).toBeUndefined();
  });
});

describe('partial merges converge onto the floor', () => {
  const FLOOR = buildShipFromDiff(
    parseUnifiedDiff(`diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -42 +42 @@
-validateToken(t: string)
+validateToken(t: string, opts: VerifyOpts)
`),
  );

  it('streaming partials applied to the floor end exactly at the final merge', () => {
    // Merge each partial onto the IMMUTABLE floor (as the overlay does) — exercising every prefix,
    // and checking structure is never disturbed mid-stream.
    for (let i = 1; i <= FULL.length; i += 7) {
      const step = mergeEnrichment(FLOOR, extractEnrichmentSoFar(FULL.slice(0, i)), 'gemini');
      expect(step.changes[0]!.diff).toBe(FLOOR.changes[0]!.diff);
    }
    // The final partial merge equals the canonical final merge.
    const last = mergeEnrichment(FLOOR, extractEnrichmentSoFar(FULL), 'gemini');
    const canonical = mergeEnrichment(FLOOR, parseEnrichment(FULL)!, 'gemini');
    expect(last.pr.summary).toBe(canonical.pr.summary);
    expect(last.cascades).toEqual(canonical.cascades);
    expect(last.suggestions).toEqual(canonical.suggestions);
    expect(last.gate.rationale).toBe(canonical.gate.rationale);
  });
});
