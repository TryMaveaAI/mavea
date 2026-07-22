// ripple-ingest.test.ts — the no-backend "run on real code" path: a pasted unified diff is parsed
// deterministically and turned into an honest ShipModel. Guards the parser across the common diff
// shapes (modified / added / deleted / renamed) and that the builder stays grounded + honest about
// what a diff can't show.
import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, looksLikeDiff } from '../src/live/ripple/ingest/parseDiff';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { buildShipFromPaths } from '../src/live/ripple/ingest/buildRepo';

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
