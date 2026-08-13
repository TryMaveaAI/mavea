import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const SCAN_DIRS = ['src', 'scripts', 'bin', 'gateway', 'voice'];
const CODE_EXTENSIONS = /\.(?:ts|tsx|js|mjs|mts|css|py|sh)$/;

// Deliberately reviewed exceptions, by repo-relative path. Vendored-with-attribution code lands
// here through review — never by rewording a comment until the scan stops matching.
const ALLOWLIST = [
  // The license gate quotes third-party copyright lines as its reviewed notice fixtures.
  'scripts/check-licenses.mjs',
  // Chart fixture citing the Stack Overflow Developer Survey as its data source.
  'src/live/select/examples.everyday.ts',
];

// Patterns are assembled from fragments so this file can never match itself, whatever the scan
// scope grows to cover.
const FOREIGN_COPYRIGHT = new RegExp('copy' + 'right\\s*(?:\\(c\\)|©)', 'i');
const OWN_NAMES = new RegExp('mav' + 'éa|mav' + 'ea', 'i');
const PORTED_FROM = new RegExp(
  '(?:ada' + 'pted|por' + 'ted|cop' + 'ied|tak' + 'en)\\s+from\\s+http',
  'i',
);
// "(?!s)" keeps the ordinary recursion phrase "the stack overflows" out of the net.
const QA_SITE = new RegExp('stack' + 'overflow\\.com|stack' + ' overflow(?!s)', 'i');

function codeFilesUnder(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...codeFilesUnder(path));
    else if (CODE_EXTENSIONS.test(entry.name) && !entry.name.includes('.generated.'))
      files.push(path);
  }
  return files;
}

describe('code provenance', () => {
  it('keeps the allowlist pruned to paths that still exist', () => {
    for (const path of ALLOWLIST) expect(existsSync(resolve(root, path)), path).toBe(true);
  });

  it('carries no foreign license or attribution fingerprints outside reviewed exceptions', () => {
    const failures: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of codeFilesUnder(resolve(root, dir))) {
        const rel = relative(root, file);
        if (ALLOWLIST.includes(rel)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            const foreignCopyright = FOREIGN_COPYRIGHT.test(line) && !OWN_NAMES.test(line);
            if (foreignCopyright || PORTED_FROM.test(line) || QA_SITE.test(line)) {
              failures.push(`${rel}:${index + 1}: ${line.trim()}`);
            }
          });
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
