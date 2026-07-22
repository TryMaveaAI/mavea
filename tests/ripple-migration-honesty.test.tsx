// ShipMigration used to render a FIXED "NOT NULL DEFAULT / checkout outage / no payment can be
// written" paragraph for every migration, regardless of what the real diff's SQL does — a fabricated,
// business-domain-specific claim over top of a real user's schema change (a DROP COLUMN or an index
// add would get the exact same "checkout outage" story). The explanation must be derived from the
// real `sql` text: only a genuine NOT NULL … DEFAULT add gets that specific claim; anything else gets
// an honest, generic caution with no invented domain (no "checkout", no "payment").
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { parseUnifiedDiff } from '../src/live/ripple/ingest/parseDiff';
import { buildShipFromDiff } from '../src/live/ripple/ingest/buildShip';
import { ShipMigration } from '../src/live/ripple/sections/ShipMigration';

const NOT_NULL_DEFAULT_DIFF = `diff --git a/migrations/0042.sql b/migrations/0042.sql
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/migrations/0042.sql
@@ -0,0 +1,2 @@
+ALTER TABLE refresh_tokens
+  ADD COLUMN token_version INT NOT NULL DEFAULT 0;
`;

const DROP_COLUMN_DIFF = `diff --git a/migrations/0043.sql b/migrations/0043.sql
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/migrations/0043.sql
@@ -0,0 +1,1 @@
+ALTER TABLE audit_log DROP COLUMN legacy_note;
`;

describe('ShipMigration — the explanation is grounded in the real SQL, never fabricated', () => {
  it('a genuine NOT NULL DEFAULT add gets the specific, general SQL-fact explanation', () => {
    const model = buildShipFromDiff(parseUnifiedDiff(NOT_NULL_DEFAULT_DIFF));
    const { getByText, queryByText } = render(<ShipMigration model={model} altitude="working" />);
    expect(getByText('Why this locks writes')).toBeTruthy();
    // Never a fabricated, domain-specific story the diff can't actually prove.
    expect(queryByText(/checkout/i)).toBeNull();
    expect(queryByText(/payment/i)).toBeNull();
  });

  it('a migration with no NOT NULL DEFAULT gets an honest generic caution, not the fixed story', () => {
    const model = buildShipFromDiff(parseUnifiedDiff(DROP_COLUMN_DIFF));
    const { getByText, queryByText } = render(<ShipMigration model={model} altitude="working" />);
    expect(getByText('Why this is worth a second look')).toBeTruthy();
    expect(queryByText(/NOT NULL DEFAULT/)).toBeNull();
    expect(queryByText(/checkout/i)).toBeNull();
    expect(queryByText(/payment/i)).toBeNull();
  });

  it('says so honestly when the diff has no schema change at all', () => {
    const model = buildShipFromDiff(
      parseUnifiedDiff(
        `diff --git a/src/api/refresh.ts b/src/api/refresh.ts\n--- a/src/api/refresh.ts\n+++ b/src/api/refresh.ts\n@@ -1,1 +1,1 @@\n-old()\n+new()\n`,
      ),
    );
    expect(model.migration).toBeUndefined();
    const { getByText } = render(<ShipMigration model={model} altitude="working" />);
    expect(getByText('No schema migration in this change.')).toBeTruthy();
  });
});
