// ripple-tracked.test.ts — the device-local "keep an eye on this change" store. Guards that tracking
// persists + reopens, de-dupes by label (newest wins), untracks, and never throws on missing/corrupt
// storage. Strictly local — a tracked item is a saved analysis, never a write back anywhere.
import { describe, it, expect, beforeEach } from 'vitest';
import { listTracked, trackModel, untrack } from '../src/live/ripple/tracked';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';

function model(label: string) {
  return buildShipFromDiff(
    parseUnifiedDiff('diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n'),
    label,
  );
}

beforeEach(() => localStorage.clear());

describe('ripple tracked store', () => {
  it('tracks a model and lists it back', () => {
    trackModel(model('acme/widget #1'), 1000);
    const list = listTracked();
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe('acme/widget #1');
    expect(list[0]!.model.changes.length).toBeGreaterThan(0);
  });

  it('lists newest first and de-dupes by label', () => {
    trackModel(model('a'), 1000);
    trackModel(model('b'), 2000);
    trackModel(model('a'), 3000); // re-track "a" — newest wins, no duplicate
    const list = listTracked();
    expect(list.map((t) => t.label)).toEqual(['a', 'b']); // a (3000) before b (2000)
    expect(list.filter((t) => t.label === 'a')).toHaveLength(1);
  });

  it('untracks by id', () => {
    const t = trackModel(model('gone'), 1000);
    expect(listTracked()).toHaveLength(1);
    untrack(t.id);
    expect(listTracked()).toHaveLength(0);
  });

  it('returns an empty list when storage is missing or corrupt', () => {
    expect(listTracked()).toEqual([]);
    localStorage.setItem('mavea.ripple.tracked.v1', 'not json');
    expect(listTracked()).toEqual([]);
  });
});
