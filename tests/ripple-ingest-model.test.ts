// ripple-ingest-model.test.ts — Ripple's deterministic, DOM-free spine: the diff/repo ingest, the
// optional model-enrichment parse+merge (batch and streaming), the incident reverse read, CODEOWNERS,
// the GitHub smart input, the tracked-change store, and model-tier budgeting. Nothing here mocks a
// module, so the whole file shares one clean registry.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseUnifiedDiff, looksLikeDiff } from '../src/live/ripple/ingest/parseDiff';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { buildShipFromPaths } from '../src/live/ripple/ingest/buildRepo';
import { parseEnrichment, mergeEnrichment } from '../src/live/ripple/ingest/companionSchema';
import { completedArrayItems, completedBlocks } from '../src/live/streamParse';
import { extractEnrichmentSoFar } from '../src/live/ripple/ingest/streamEnrich';
import {
  parseAlert,
  buildIncidentFloor,
  parseIncidentEnrichment,
  mergeIncident,
  attachIncident,
} from '../src/live/ripple/ingest/incident';
import { SEED_SHIP } from '../src/live/ripple/seed';
import { parseCodeowners, ownerForPath } from '../src/live/ripple/ingest/owners';
import { parseGitHubInput } from '../src/live/ripple/ingest/parseGitHubUrl';
import { listTracked, trackModel, untrack } from '../src/live/ripple/tracked';
import { classifyTier, planFor } from '../src/live/ripple/ingest/tier';
import type { ModelConfig } from '../src/types/mavea';

// The no-backend "run on real code" path: a pasted unified diff is parsed
// deterministically and turned into an honest ShipModel. Guards the parser across the common diff
// shapes (modified / added / deleted / renamed) and that the builder stays grounded + honest about
// what a diff can't show.
describe('ripple ingest — pasted diff → ShipModel', () => {
  const SAMPLE = `diff --git a/src/auth/token.ts b/src/auth/token.ts
index abc1234..def5678 100644
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -42,1 +42,1 @@ export function validateToken
-validateToken(t: string)
+validateToken(t: string, opts: VerifyOpts)
diff --git a/src/auth/legacy.ts b/src/auth/legacy.ts
deleted file mode 100644
index 1111111..0000000
--- a/src/auth/legacy.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function parseLegacyJWT(token) {
-  // decode v1
-}
diff --git a/src/api/refresh.ts b/src/api/refresh.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/api/refresh.ts
@@ -0,0 +1,2 @@
+export async function rotateRefresh(session) {
+}
`;

  describe('parseUnifiedDiff', () => {
    const d = parseUnifiedDiff(SAMPLE);

    it('finds every file with the right status', () => {
      expect(d.files.map((f) => f.path)).toEqual([
        'src/auth/token.ts',
        'src/auth/legacy.ts',
        'src/api/refresh.ts',
      ]);
      expect(d.files.map((f) => f.status)).toEqual(['modified', 'deleted', 'added']);
    });

    it('counts added/removed lines per file and overall', () => {
      expect(d.files[0]!.add).toBe(1);
      expect(d.files[0]!.del).toBe(1);
      expect(d.files[1]!.del).toBe(3); // the deleted file
      expect(d.files[2]!.add).toBe(2); // the new file
      expect(d.add).toBe(3);
      expect(d.del).toBe(4);
    });

    it('keeps the hunk lines with their markers stripped', () => {
      const lines = d.files[0]!.hunks[0]!.lines;
      expect(lines).toContainEqual({ t: 'del', c: 'validateToken(t: string)' });
      expect(lines).toContainEqual({ t: 'add', c: 'validateToken(t: string, opts: VerifyOpts)' });
    });

    it('detects diff-shaped text and rejects prose', () => {
      expect(looksLikeDiff(SAMPLE)).toBe(true);
      expect(looksLikeDiff('just some notes about my change')).toBe(false);
    });
  });

  describe('buildShipFromDiff', () => {
    const m = buildShipFromDiff(parseUnifiedDiff(SAMPLE));

    it('reads each change from its actual diff content — the symbol, not just the filename', () => {
      expect(m.changes).toHaveLength(3);
      // A changed call signature is detected as an interface break, named by its symbol.
      expect(m.changes[0]!.title).toBe('Change validateToken() signature');
      expect(m.changes[0]!.kind).toBe('interface');
      expect(m.changes[0]!.risk).toBe('breaks');
      // A removed export is named and flagged breaking.
      expect(m.changes[1]!.title).toContain('parseLegacyJWT');
      expect(m.changes[1]!.risk).toBe('breaks');
      // A new symbol is named too.
      expect(m.changes[2]!.title).toContain('rotateRefresh');
      // The change's diff still carries the real hunk lines.
      expect(m.changes[0]!.diff.lines.some((l) => l.c.includes('VerifyOpts'))).toBe(true);
    });

    it('builds an in-repo impact map grouped by area, with consistent edges', () => {
      const ids = new Set(m.nodes.map((n) => n.id));
      expect(m.nodes.find((n) => n.type === 'pr')).toBeTruthy();
      // Two areas changed → two module nodes off the centre.
      expect(
        m.nodes
          .filter((n) => n.type === 'module')
          .map((n) => n.label)
          .sort(),
      ).toEqual(['src/api', 'src/auth']);
      for (const e of m.edges) {
        expect(ids.has(e.from)).toBe(true);
        expect(ids.has(e.to)).toBe(true);
      }
    });

    it('is honest: a real diff (not an example), in-repo only, with an unknown-blast gate', () => {
      expect(m.provenance.source).toBe('pasted-diff');
      expect(m.provenance.example).toBe(false);
      expect(m.provenance.notes?.length).toBeGreaterThan(0);
      // It never invents cross-repo blast, traffic, or a "safe to ship" verdict from a diff alone.
      expect(m.gate.shipSafe).toBe(false);
      expect(m.cascades).toHaveLength(0);
      // The read is synthesised from the actual changes, not a bare file count.
      expect(m.pr.summary).toContain('validateToken');
      // The breaking changes (signature change + removed export) drive the gate to block.
      expect(m.gate.unackedP0).toBeGreaterThanOrEqual(2);
      expect(m.gate.decision).toBe('block');
      expect(m.pr.risks.some((r) => r.text.includes('parseLegacyJWT'))).toBe(true);
    });
  });

  describe('buildShipFromPaths (explore a repo / folder)', () => {
    const m = buildShipFromPaths(
      ['src/auth/token.ts', 'src/auth/session.ts', 'src/api/server.ts', 'README.md'],
      'acme/widget',
    );

    it('groups files into areas and produces an onboarding model (no diff)', () => {
      expect(m.changes).toHaveLength(0);
      const names = m.modules.map((x) => x.name);
      expect(names).toContain('src/auth');
      expect(names).toContain('src/api');
      // The busiest area leads, with an honest file count.
      expect(m.modules[0]!.name).toBe('src/auth');
      expect(m.modules[0]!.health).toBe('2 files');
      expect(m.onboarding?.firstWeek.length).toBeGreaterThan(0);
      expect(m.nodes.find((n) => n.type === 'pr')).toBeTruthy();
    });

    it('is honest: a real repo read, not an example, with no gate/diff to show', () => {
      expect(m.provenance.source).toBe('github');
      expect(m.provenance.example).toBe(false);
      expect(m.pr.summary).toContain('acme/widget');
    });

    it('handles an empty tree without throwing', () => {
      const empty = buildShipFromPaths([], 'x');
      expect(empty.modules).toHaveLength(0);
      expect(empty.changes).toHaveLength(0);
    });
  });
});

// The optional model-enrichment layer for a pasted/fetched diff. Guards that
// the parser is defensive (tolerates fences/prose, drops junk, coerces enums) and that the merge
// only ever IMPROVES the grounded floor — it overrides plain-language fields and adds suggestions,
// but never touches the structural truth (files, diffs, the impact graph) and never invents.
describe('ripple enrichment — parse + merge', () => {
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
});

// Floor-first progressive reveal. As the enrichment JSON streams in, Ripple
// sharpens the verdict field-by-field. These guard the two load-bearing honesty properties: a field
// is only ever emitted once it has FULLY arrived (closed string / closed object), and the streamed
// view is monotonic and converges exactly to the final, canonical parseEnrichment. A half-streamed or
// malformed value can never reach the screen.
describe('ripple streaming enrichment', () => {
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
});

// Ripple in reverse. Guards that an alert is parsed into a symptom/
// severity/service, that the floor is honest (real owners for who-to-wake; an inferred root cause it
// admits to), that the model's reverse read merges without overwriting the parsed facts, and that
// attaching an incident never mutates a change's structure. Read-only throughout.
describe('ripple incident — the reverse read', () => {
  describe('parseAlert', () => {
    it('pulls the symptom, a severity, and a service from a pasted alert', () => {
      const a = parseAlert(
        'PagerDuty: [payments-api] P1 — 5xx rate 38% on /charge\nfired at 03:14',
      );
      expect(a.symptom).toContain('payments-api');
      expect(a.severity).toBe('P1');
      expect(a.service).toBe('payments-api');
    });
    it('reads a critical/outage as P0', () => {
      expect(parseAlert('CRITICAL: auth-service outage').severity).toBe('P0');
    });
  });

  describe('buildIncidentFloor', () => {
    it('stays honest: no fabricated who-to-wake when GitHub gives no owner data', () => {
      const inc = buildIncidentFloor('P0 checkout down', SEED_SHIP);
      // The honest seed carries no owners (GitHub alone can't supply them), so the floor invents none.
      expect(inc.whoToWake).toEqual([]);
      expect(inc.rootCause.toLowerCase()).toContain('connect'); // inferred → admits it
      expect(inc.timeline[0]!.label).toContain('Alert received');
      expect(inc.chain).toHaveLength(0); // the floor never invents the chain
    });
    it('derives who-to-wake from a node owner when one exists', () => {
      const withOwner: typeof SEED_SHIP = {
        ...SEED_SHIP,
        hotspots: [],
        nodes: [SEED_SHIP.nodes[0]!, { ...SEED_SHIP.nodes[1]!, team: 'Auth team' }],
      };
      const inc = buildIncidentFloor('P0 checkout down', withOwner);
      expect(inc.whoToWake.length).toBeGreaterThan(0);
    });
    it('with no change attached, asks for one', () => {
      const inc = buildIncidentFloor('something broke');
      expect(inc.rootCause.toLowerCase()).toContain('attach');
    });
  });

  describe('parseIncidentEnrichment + mergeIncident', () => {
    it('parses the reverse read and merges it without losing the parsed symptom', () => {
      const floor = buildIncidentFloor('P0 gateway 5xx', SEED_SHIP);
      const enr = parseIncidentEnrichment(
        JSON.stringify({
          rootCause: 'deploy-order skew: auth shipped before gateway upgraded',
          chain: [{ label: 'gateway calls the old shape', context: '12m ago' }],
          rollback: ['revert the auth deploy'],
          whoToWake: [{ name: 'Edge on-call', team: 'Edge', why: 'owns gateway' }],
        }),
      );
      expect(enr).not.toBeNull();
      const merged = mergeIncident(floor, enr!);
      expect(merged.symptom).toBe(floor.symptom); // parsed fact preserved
      expect(merged.rootCause).toContain('deploy-order');
      expect(merged.chain).toHaveLength(1);
      expect(merged.rollback).toEqual(['revert the auth deploy']);
      // the floor has no owner data (honest), so the model's who-to-wake fills it in
      expect(merged.whoToWake).toEqual([
        { name: 'Edge on-call', team: 'Edge', why: 'owns gateway' },
      ]);
    });
    it('returns null for junk', () => {
      expect(parseIncidentEnrichment('no json here')).toBeNull();
      expect(parseIncidentEnrichment('{}')).toBeNull();
    });
  });

  describe('attachIncident', () => {
    const base = buildShipFromDiff(
      parseUnifiedDiff('diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n'),
      'acme/widget #5',
    );

    it('attaches an incident to a change without touching its structure', () => {
      const m = attachIncident('P0 down', base);
      expect(m.incident).toBeTruthy();
      expect(m.changes).toBe(base.changes); // structure untouched
      expect(m.nodes).toBe(base.nodes);
    });
    it('builds a standalone incident model when no change is attached', () => {
      const m = attachIncident('P1 errors spiking');
      expect(m.incident?.symptom).toContain('errors spiking');
      expect(m.changes).toHaveLength(0);
    });
  });
});

// Real, read-only ownership from CODEOWNERS. Guards the parser (comments,
// blanks, last-match-wins) and the glob→path matching (root anchor, directory ownership, basename
// patterns, the `:line` strip) so "who owns this" is grounded in the repo's own contract.
describe('ripple owners — CODEOWNERS', () => {
  const FILE = `
# Default owner for everything
*            @acme/eng

# The auth area
/src/auth/   @acme/auth-team
src/api/guard.ts  @acme/platform-team @alice

# Docs
*.md         @acme/docs
`;

  describe('parseCodeowners', () => {
    it('drops comments + blanks and keeps owner rules in order', () => {
      const rules = parseCodeowners(FILE);
      expect(rules.map((r) => r.glob)).toEqual(['*', '/src/auth/', 'src/api/guard.ts', '*.md']);
      expect(rules[2]!.owners).toEqual(['@acme/platform-team', '@alice']);
    });
  });

  describe('ownerForPath', () => {
    const rules = parseCodeowners(FILE);

    it('last matching rule wins', () => {
      // a .ts under src/auth matches both `*` and `/src/auth/` → the later one wins
      expect(ownerForPath(rules, 'src/auth/token.ts')).toEqual(['@acme/auth-team']);
    });

    it('a directory rule owns everything beneath it', () => {
      expect(ownerForPath(rules, 'src/auth')).toEqual(['@acme/auth-team']);
      expect(ownerForPath(rules, 'src/auth/refresh/index.ts')).toEqual(['@acme/auth-team']);
    });

    it('an exact-file rule wins for that file (and strips a :line suffix)', () => {
      expect(ownerForPath(rules, 'src/api/guard.ts:21')).toEqual(['@acme/platform-team', '@alice']);
    });

    it('a basename pattern matches anywhere; the catch-all covers the rest', () => {
      expect(ownerForPath(rules, 'docs/guide.md')).toEqual(['@acme/docs']);
      expect(ownerForPath(rules, 'src/server/main.ts')).toEqual(['@acme/eng']);
    });

    it('returns [] when there are no rules', () => {
      expect(ownerForPath([], 'anything')).toEqual([]);
    });
  });
});

// The smart GitHub input. Paste a PR/compare/tree/repo URL or a shorthand
// and it routes to the right read-only connector. Guards every recognized shape + honest invalids.
describe('ripple GitHub smart input', () => {
  describe('parseGitHubInput — URLs', () => {
    it('a pull-request URL (and /files, protocol, www)', () => {
      expect(parseGitHubInput('https://github.com/acme/auth/pull/482')).toEqual({
        kind: 'pr',
        repo: 'acme/auth',
        prNumber: '482',
      });
      expect(parseGitHubInput('https://www.github.com/acme/auth/pull/482/files')).toEqual({
        kind: 'pr',
        repo: 'acme/auth',
        prNumber: '482',
      });
      expect(parseGitHubInput('github.com/acme/auth/pull/482#discussion_r1')).toEqual({
        kind: 'pr',
        repo: 'acme/auth',
        prNumber: '482',
      });
    });

    it('a compare URL (... and ..)', () => {
      expect(parseGitHubInput('github.com/acme/auth/compare/main...feat/short-lived')).toEqual({
        kind: 'compare',
        repo: 'acme/auth',
        base: 'main',
        head: 'feat/short-lived',
      });
      expect(parseGitHubInput('github.com/acme/auth/compare/v1..v2')).toEqual({
        kind: 'compare',
        repo: 'acme/auth',
        base: 'v1',
        head: 'v2',
      });
    });

    it('a tree URL → folder explore; a blob URL → its parent folder', () => {
      expect(parseGitHubInput('github.com/acme/auth/tree/main/src/auth')).toEqual({
        kind: 'tree',
        repo: 'acme/auth',
        ref: 'main',
        path: 'src/auth',
      });
      expect(parseGitHubInput('github.com/acme/auth/blob/main/src/auth/token.ts')).toEqual({
        kind: 'tree',
        repo: 'acme/auth',
        ref: 'main',
        path: 'src/auth',
      });
    });

    it('a bare repo URL (trailing slash, .git, ssh)', () => {
      expect(parseGitHubInput('https://github.com/acme/auth')).toEqual({
        kind: 'repo',
        repo: 'acme/auth',
      });
      expect(parseGitHubInput('github.com/acme/auth/')).toEqual({
        kind: 'repo',
        repo: 'acme/auth',
      });
      expect(parseGitHubInput('https://github.com/acme/auth.git')).toEqual({
        kind: 'repo',
        repo: 'acme/auth',
      });
      expect(parseGitHubInput('git@github.com:acme/auth.git')).toEqual({
        kind: 'repo',
        repo: 'acme/auth',
      });
    });
  });

  describe('parseGitHubInput — shorthands', () => {
    it('owner/repo and owner/repo#123', () => {
      expect(parseGitHubInput('acme/auth')).toEqual({ kind: 'repo', repo: 'acme/auth' });
      expect(parseGitHubInput('acme/auth#482')).toEqual({
        kind: 'pr',
        repo: 'acme/auth',
        prNumber: '482',
      });
    });

    it('host-less owner/repo/pull|compare|tree forms (domain dropped)', () => {
      expect(parseGitHubInput('TryMaveaAI/mavea/pull/33')).toEqual({
        kind: 'pr',
        repo: 'TryMaveaAI/mavea',
        prNumber: '33',
      });
      expect(parseGitHubInput('acme/auth/compare/main...feat/x')).toEqual({
        kind: 'compare',
        repo: 'acme/auth',
        base: 'main',
        head: 'feat/x',
      });
      expect(parseGitHubInput('acme/auth/tree/main/src')).toEqual({
        kind: 'tree',
        repo: 'acme/auth',
        ref: 'main',
        path: 'src',
      });
    });

    it('bare #123 / 123 resolves only with a connected default repo', () => {
      expect(parseGitHubInput('#482', 'acme/auth')).toEqual({
        kind: 'pr',
        repo: 'acme/auth',
        prNumber: '482',
      });
      expect(parseGitHubInput('482', 'acme/auth')).toEqual({
        kind: 'pr',
        repo: 'acme/auth',
        prNumber: '482',
      });
      expect(parseGitHubInput('482').kind).toBe('invalid');
    });
  });

  describe('parseGitHubInput — invalids', () => {
    it('empty / junk / malformed return a reason, never throw', () => {
      expect(parseGitHubInput('').kind).toBe('invalid');
      expect(parseGitHubInput('just some words').kind).toBe('invalid');
      expect(parseGitHubInput('github.com/acme').kind).toBe('invalid'); // no repo
      const r = parseGitHubInput('');
      if (r.kind === 'invalid') expect(r.reason.length).toBeGreaterThan(0);
    });
  });
});

// The device-local "keep an eye on this change" store. Guards that tracking
// persists + reopens, de-dupes by label (newest wins), untracks, and never throws on missing/corrupt
// storage. Strictly local — a tracked item is a saved analysis, never a write back anywhere.
describe('ripple tracked store', () => {
  function model(label: string) {
    return buildShipFromDiff(
      parseUnifiedDiff('diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n'),
      label,
    );
  }

  beforeEach(() => localStorage.clear());

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

// Sizing the analysis to the model WITHOUT ever swapping it. Guards that each
// model bucket gets the intended budget: a slow/cheap model (a local base URL / OpenRouter `:free`)
// drops to one course, a lean read, no code-context round-trips, and minimal thinking; a deep
// reasoning model keeps the full read; a fast frontier model gets the full read + 3-course ladder.
describe('ripple model tiering', () => {
  const cfg = (
    provider: ModelConfig['provider'],
    model: string,
    baseUrl?: string,
  ): ModelConfig => ({
    provider,
    model,
    ...(baseUrl ? { baseUrl } : {}),
  });

  describe('classifyTier', () => {
    it('buckets local + free routes as slow-cheap', () => {
      expect(classifyTier(cfg('openrouter', 'meta-llama/llama-3.1-8b-instruct:free'))).toBe(
        'slow-cheap',
      );
      expect(classifyTier(cfg('openai', 'gpt-4o', 'http://localhost:1234/v1'))).toBe('slow-cheap');
      expect(classifyTier(cfg('openai', 'gpt-4o', 'http://host.docker.internal:11434/v1'))).toBe(
        'slow-cheap',
      );
    });

    it('buckets the big reasoning models as frontier-deep', () => {
      expect(classifyTier(cfg('anthropic', 'claude-opus-4-8'))).toBe('frontier-deep');
      expect(classifyTier(cfg('anthropic', 'claude-sonnet-4-6'))).toBe('frontier-deep');
      expect(classifyTier(cfg('openai', 'gpt-5'))).toBe('frontier-deep');
      expect(classifyTier(cfg('openai', 'o3'))).toBe('frontier-deep');
      expect(classifyTier(cfg('gemini', 'gemini-3-pro'))).toBe('frontier-deep');
    });

    it('buckets fast frontier models as frontier-fast', () => {
      expect(classifyTier(cfg('gemini', 'gemini-3.1-flash-lite'))).toBe('frontier-fast');
      expect(classifyTier(cfg('anthropic', 'claude-haiku-4-5-20251001'))).toBe('frontier-fast');
      expect(classifyTier(cfg('openai', 'gpt-5-mini'))).toBe('frontier-fast');
      expect(classifyTier(cfg('grok', 'grok-4'))).toBe('frontier-fast');
    });
  });

  describe('planFor', () => {
    it('slow-cheap: one course, lean read, no code context, minimal thinking', () => {
      const p = planFor(cfg('openrouter', 'llama3.2:3b', 'http://localhost:1234/v1'));
      expect(p.courseCount).toBeLessThan(5); // fewer weeks so its outline JSON doesn't truncate
      expect(p.fetchCodeContext).toBe(false);
      expect(p.thinkingLevel).toBe('minimal');
      expect(p.enrichMaxTokens).toBeLessThan(2600);
      expect(p.lessonMaxTokens).toBeLessThan(4200); // a leaner deep-lesson budget
    });

    it('frontier-fast: full read + a multi-week curriculum + code context', () => {
      const p = planFor(cfg('gemini', 'gemini-3.1-flash-lite'));
      expect(p.courseCount).toBe(5);
      expect(p.fetchCodeContext).toBe(true);
      expect(p.enrichMaxTokens).toBe(2600);
      expect(p.lessonMaxTokens).toBeGreaterThanOrEqual(4000);
    });

    it('frontier-deep: full read, deeper thinking + a generous lesson budget', () => {
      const p = planFor(cfg('anthropic', 'claude-opus-4-8'));
      expect(p.courseCount).toBe(5);
      expect(p.thinkingLevel).toBe('low');
      expect(p.fetchCodeContext).toBe(true);
      expect(p.lessonMaxTokens).toBeGreaterThanOrEqual(5000);
    });
  });
});
