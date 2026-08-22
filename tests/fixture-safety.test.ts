// Demo fixtures are the one place invented content can accidentally describe a REAL person or
// reach a real endpoint. Every résumé, contact card, invoice and message draft in the library is
// fiction, and it has to stay fiction under the forms that are reserved for exactly this:
//   • e-mail  — example.com / .net / .org / .test / .invalid  (RFC 2606 — unregistrable forever)
//   • phone   — the 555 exchange, the convention every studio uses
//   • profile — no real social slug: linkedin.com/in/<name> resolves to somebody
// A plausible-looking address on a live domain (jordan.alvarez@email.com — email.com is a real
// mail provider) or a real profile slug is the failure this pins. Numbers and company names are
// left alone: an invented firm harms nobody, an invented person with a working handle might.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIRS = ['../src/gallery/fixtures', '../src/data/topics'];

function fixtureFiles(): string[] {
  return FIXTURE_DIRS.flatMap((rel) => {
    const dir = join(__dirname, rel);
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json') || f.endsWith('.ts'))
      .map((f) => join(dir, f));
  });
}

const corpus = fixtureFiles().map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

/** Reserved for documentation and fiction — an address here can never reach a real inbox. */
const RESERVED_EMAIL_DOMAIN =
  /@(?:[A-Za-z0-9-]+\.)*example\.(?:com|net|org)$|@.*\.(?:test|invalid|localhost)$/i;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const SOCIAL_PROFILE =
  /\b(?:linkedin\.com\/in|twitter\.com|x\.com|instagram\.com|facebook\.com)\/[A-Za-z0-9._-]+/gi;
const PHONE = /\b(?:\+?1[-. ]?)?\(?(\d{3})\)?[-. ]?\d{3}[-. ]?\d{4}\b/g;

describe('demo fixtures invent people safely', () => {
  it('routes every e-mail address to a reserved, unregistrable domain', () => {
    const offenders: string[] = [];
    for (const { file, text } of corpus) {
      for (const address of text.match(EMAIL) ?? []) {
        if (!RESERVED_EMAIL_DOMAIN.test(address)) offenders.push(`${address}  (${file})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never points at a real social profile', () => {
    const offenders: string[] = [];
    for (const { file, text } of corpus) {
      for (const url of text.match(SOCIAL_PROFILE) ?? []) offenders.push(`${url}  (${file})`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps invented phone numbers in the 555 exchange', () => {
    const offenders: string[] = [];
    for (const { file, text } of corpus) {
      let m: RegExpExecArray | null;
      const re = new RegExp(PHONE.source, 'g');
      while ((m = re.exec(text))) {
        if (m[1] !== '555') offenders.push(`${m[0]}  (${file})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
