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
