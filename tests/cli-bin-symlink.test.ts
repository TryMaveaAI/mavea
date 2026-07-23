// @vitest-environment node
//
// Regression test for a real, confirmed bug: npm/npx installs `bin` entries as a SYMLINK
// (node_modules/.bin/mavea -> ../@mavea/mavea/bin/mavea.mjs) on macOS/Linux. Node's ESM loader
// resolves that symlink when setting import.meta.url to the module's real path, but
// path.resolve(process.argv[1]) does not dereference symlinks — so the "is this the main module"
// check silently never matched, and `npx @mavea/mavea` ran main() zero times with no error, no
// output, and exit code 0. The dependency-free CLI smoke check in ci.yml invokes
// `node bin/mavea.mjs --help` DIRECTLY, with no symlink involved, so it could never have caught
// this — this test exists specifically to close that gap by reproducing npm's real bin mechanism.
import { describe, expect, it, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

describe('bin/mavea.mjs invoked through a symlink (the real npm/npx bin mechanism)', () => {
  it('runs main() and prints --help output, not silently no-op', () => {
    const real = resolve(import.meta.dirname, '../bin/mavea.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'mavea-bin-symlink-'));
    cleanupDirs.push(dir);
    const binDir = join(dir, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const link = join(binDir, 'mavea');
    symlinkSync(real, link);

    const output = execFileSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
    expect(output).toContain('mavea — run the Mavéa app locally');
    expect(output).toContain('Usage: npx @mavea/mavea [options]');
  });
});
