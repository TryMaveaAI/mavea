import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REVIEWED_HOTLINKED_MEDIA } from '../scripts/check-licenses.mjs';

const root = resolve(import.meta.dirname, '..');
const credits = readFileSync(resolve(root, 'public/demo-assets/CREDITS.md'), 'utf8');

function filesUnder(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else files.push(path);
  }
  return files;
}

describe('demo-asset credits completeness', () => {
  it('lists every bundled demo asset in CREDITS.md', () => {
    const assets = filesUnder(resolve(root, 'public/demo-assets')).filter(
      (file) => basename(file) !== 'CREDITS.md',
    );
    expect(assets.length).toBeGreaterThan(0);
    for (const file of assets) {
      expect(credits, `${basename(file)} missing from CREDITS.md`).toContain(basename(file));
    }
  });

  it('lists every docs/media file shipped in the npm package', () => {
    // docs/media is in package.json `files`, so these captures are distributed exactly like the
    // demo assets — but nothing used to check them. They are screenshots of Mavéa rendering its
    // own fixtures, which is clean by default; the risk is a FUTURE capture that quietly includes
    // third-party content. A map is the sharp case: OpenStreetMap data is ODbL and its credit is
    // mandatory, unlike the CC0 media in this file. Forcing every capture to be declared is what
    // turns "someone remembered to look" into a gate.
    const media = filesUnder(resolve(root, 'docs/media'));
    expect(media.length).toBeGreaterThan(0);
    for (const file of media) {
      expect(credits, `${basename(file)} missing from CREDITS.md`).toContain(basename(file));
    }
  });

  it('credits every reviewed hotlinked photo by its original Commons file name', () => {
    expect(REVIEWED_HOTLINKED_MEDIA.size).toBeGreaterThan(0);
    for (const url of REVIEWED_HOTLINKED_MEDIA.keys()) {
      const segments = new URL(url).pathname.split('/');
      // Wikimedia thumb URLs end in the sized copy (960px-…); the original file name — the one
      // CREDITS.md records — is the second-to-last segment.
      const original = segments.includes('thumb') ? segments.at(-2)! : segments.at(-1)!;
      expect(credits, `${original} missing from CREDITS.md`).toContain(original);
    }
  });
});
