// The acceptance version is what makes a changed disclosure reach an existing reader.
//
// §10 of the Terms ships an update as a new effective date plus a new acceptance version: a stale
// version stops counting, so the gate returns once with the changed documents. Nothing enforced
// that. A material PRIVACY.md edit — the Prism/Synthesis map, a new device-local store of document
// text with no timer expiry — was written, reviewed and very nearly shipped against an unchanged
// v7, which would have left every reader who had already accepted with no notice at all.
//
// So the documents are digested and the digests are pinned here. Editing one fails this test, and
// the failure is the decision: cosmetic, so re-pin the digest — or material, so re-pin it AND bump
// LEGAL_ACCEPTANCE_VERSION and the document's effective date. A digest cannot judge materiality;
// it can only guarantee the question is asked.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance';

const digest = (file: string): string =>
  createHash('sha256')
    .update(readFileSync(join(__dirname, '..', file), 'utf8'))
    .digest('hex')
    .slice(0, 16);

/** The documents the gate asks a reader to accept or acknowledge, and the digest each was last
 *  reviewed at. Update a line only together with the review that earned it. */
const REVIEWED: Record<string, string> = {
  'TERMS.md': 'f71c98d9d8d10aaf',
  'PRIVACY.md': 'b8256086647bb017',
  'DISCLAIMER.md': '1331da4b98ee7d90',
};

describe('a changed legal document cannot ship without a decision about the acceptance version', () => {
  for (const [file, reviewed] of Object.entries(REVIEWED)) {
    it(`${file} is the reviewed text`, () => {
      expect(
        digest(file),
        `${file} changed. If the change is material, bump LEGAL_ACCEPTANCE_VERSION in ` +
          `src/legal/acceptance.ts and the document's own "Effective:" line so every reader is ` +
          `shown it once; either way, re-pin the digest in this file.`,
      ).toBe(reviewed);
    });
  }

  it('the acceptance version names the date it took effect', () => {
    // The version string is what a stored acceptance is compared against, so it has to change when
    // the documents do — a date prefix makes a stale one obvious on sight.
    expect(LEGAL_ACCEPTANCE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
  });

  it('every accepted document states an effective date', () => {
    for (const file of Object.keys(REVIEWED)) {
      const text = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(text, `${file} has no "Effective:" line`).toMatch(/^Effective: \w+ \d{1,2}, \d{4}$/m);
    }
  });
});
