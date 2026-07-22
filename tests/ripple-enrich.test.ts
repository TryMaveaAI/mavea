// ripple-enrich.test.ts — the optional model-enrichment layer for a pasted/fetched diff. Guards that
// the parser is defensive (tolerates fences/prose, drops junk, coerces enums) and that the merge
// only ever IMPROVES the grounded floor — it overrides plain-language fields and adds suggestions,
// but never touches the structural truth (files, diffs, the impact graph) and never invents.
import { describe, it, expect } from 'vitest';
import { parseEnrichment, mergeEnrichment } from '../src/live/ripple/ingest/companionSchema';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';

const FLOOR = buildShipFromDiff(
  parseUnifiedDiff(`diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -42 +42 @@
-validateToken(t: string)
+validateToken(t: string, opts: VerifyOpts)
diff --git a/src/api/guard.ts b/src/api/guard.ts
--- a/src/api/guard.ts
+++ b/src/api/guard.ts
@@ -21 +21 @@
-checkToken(tok)
+await validateToken(tok)
`),
);

describe('parseEnrichment', () => {
  it('parses JSON wrapped in fences and prose', () => {
    const raw =
      'Here you go:\n```json\n{"summary":"Adds an opts arg","risks":[{"level":"breaks","text":"guard calls the old shape"}]}\n```';
    const e = parseEnrichment(raw);
    expect(e?.summary).toBe('Adds an opts arg');
    expect(e?.risks?.[0]).toEqual({ level: 'breaks', text: 'guard calls the old shape' });
  });

  it('coerces a bad risk level to "watch" and drops junk entries', () => {
    const e = parseEnrichment(
      JSON.stringify({
        risks: [
          { level: 'catastrophic', text: 'hmm' },
          { level: 'safe', text: '' },
        ],
        changes: [{ id: 'c0', risk: 'breaks' }, { intent: 'no id here' }],
        suggestions: [{ title: 'Did you consider X?' }, { gist: 'no title' }],
      }),
    );
    expect(e?.risks).toEqual([{ level: 'watch', text: 'hmm' }]); // bad level coerced, empty text dropped
    expect(e?.changes).toEqual([{ id: 'c0', risk: 'breaks' }]); // id-less change dropped
    expect(e?.suggestions).toHaveLength(1); // title-less suggestion dropped
    expect(e?.suggestions?.[0]!.title).toBe('Did you consider X?');
  });

  it('parses a cascade and a gate rationale, coercing the hop/incident severities', () => {
    const e = parseEnrichment(
      JSON.stringify({
        cascades: [
          {
            trigger: 'validateToken gains an arg',
            hops: [
              { label: 'guard.ts calls the old shape', context: '1 caller', severity: 'breaks' },
              { label: 'login flow throws', context: 'runtime', severity: 'nonsense' },
            ],
            incident: 'auth outage',
            incidentSeverity: 'P0',
            caughtBeforeMerge: 'update guard.ts first',
          },
          { trigger: 'no hops here', hops: [] }, // dropped — a cascade needs hops
        ],
        gateRationale: 'Hold until guard.ts is updated.',
      }),
    );
    expect(e?.cascades).toHaveLength(1);
    expect(e?.cascades?.[0]!.incidentSeverity).toBe('P0');
    expect(e?.cascades?.[0]!.hops[1]!.severity).toBe('watch'); // bad severity coerced
    expect(e?.gateRationale).toBe('Hold until guard.ts is updated.');
  });

  it('returns null for unparseable or empty input', () => {
    expect(parseEnrichment('not json at all')).toBeNull();
    expect(parseEnrichment('{}')).toBeNull();
  });
});

describe('mergeEnrichment', () => {
  it('overrides plain-language fields by id but never the structure', () => {
    const merged = mergeEnrichment(
      FLOOR,
      {
        summary: 'Threads a VerifyOpts through token validation.',
        risks: [{ level: 'breaks', text: 'guard.ts still calls the old shape' }],
        changes: [{ id: 'c0', intent: 'Adds opts to validateToken', risk: 'breaks' }],
        suggestions: [
          {
            id: 's0',
            category: 'COMPATIBILITY',
            title: 'Old call-sites?',
            gist: 'opts is optional',
            why: 'they pass undefined',
            evidence: 'token.ts:42',
            fix: 'make it required',
          },
        ],
      },
      'claude',
    );

    expect(merged.pr.summary).toBe('Threads a VerifyOpts through token validation.');
    expect(merged.pr.risks[0]!.text).toContain('old shape');
    // c0 enriched...
    const c0 = merged.changes.find((c) => c.id === 'c0')!;
    expect(c0.intent).toBe('Adds opts to validateToken');
    expect(c0.risk).toBe('breaks');
    // ...but its real diff (structure) is untouched.
    expect(c0.diff).toBe(FLOOR.changes[0]!.diff);
    // c1 (not enriched) is unchanged.
    expect(merged.changes[1]).toBe(FLOOR.changes[1]);
    // structure preserved.
    expect(merged.nodes).toBe(FLOOR.nodes);
    expect(merged.suggestions).toHaveLength(1);
    // provenance records the model's hand, honestly.
    expect(merged.provenance.notes?.some((n) => n.includes('claude'))).toBe(true);
  });

  it('adds a model cascade and the gate rationale onto the floor', () => {
    const merged = mergeEnrichment(FLOOR, {
      cascades: [
        {
          trigger: 'validateToken gains an arg',
          hops: [{ label: 'guard breaks', context: '1 caller', severity: 'breaks' }],
          incident: 'auth outage',
          incidentSeverity: 'P0',
          caughtBeforeMerge: 'update guard first',
        },
      ],
      gateRationale: 'Hold until guard.ts is updated.',
    });
    expect(merged.cascades).toHaveLength(1);
    expect(merged.cascades[0]!.incident).toBe('auth outage');
    expect(merged.gate.rationale).toBe('Hold until guard.ts is updated.');
    // The deterministic gate DECISION is untouched — only the rationale prose is the model's.
    expect(merged.gate.decision).toBe(FLOOR.gate.decision);
  });

  it('keeps the floor when the enrichment is empty', () => {
    const merged = mergeEnrichment(FLOOR, {});
    expect(merged.pr.summary).toBe(FLOOR.pr.summary);
    expect(merged.changes).toEqual(FLOOR.changes);
    expect(merged.cascades).toEqual(FLOOR.cascades);
  });
});
