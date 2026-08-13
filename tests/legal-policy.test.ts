import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const LEGAL_FILES = [
  'LICENSE',
  'TERMS.md',
  'DISCLAIMER.md',
  'PRIVACY.md',
  'TRADEMARKS.md',
  'SUPPORT.md',
  'SECURITY.md',
  'THIRD-PARTY.txt',
] as const;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

describe('project legal policy', () => {
  it('uses the exact PolyForm SPDX id and ships every legal notice', () => {
    const pkg = JSON.parse(read('package.json')) as { license: string; files: string[] };
    expect(pkg.license).toBe('PolyForm-Noncommercial-1.0.0');
    for (const file of LEGAL_FILES) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
      expect(pkg.files, `${file} must ship in npm`).toContain(file);
    }

    const license = read('LICENSE');
    expect(license).toContain('https://polyformproject.org/licenses/noncommercial/1.0.0');
    expect(license).toContain('## Noncommercial Purposes');
    expect(license).toContain('## No Other Rights');
    expect(license).toContain('## No Liability');
    expect(license).toMatch(
      /^Required Notice: Copyright \(c\) 2026 Akash Maitra and Aryan Chordia$/m,
    );
    expect(license).not.toContain('# MIT License');

    expect(read('README.md')).toContain('including as part of an acquisition');
    expect(read('TERMS.md')).toContain('offering paid or commercial licenses');
    expect(read('TERMS.md')).toContain('rights it owns or controls');
    expect(read('PRIVACY.md')).toContain('non-extractable, device-bound browser key');
    expect(read('PRIVACY.md')).toContain('no separate Mavéa user accounts');
    expect(read('PRIVACY.md')).toContain('no automatic expiration');
    expect(read('PRIVACY.md')).toContain('does not set analytics or advertising cookies');
    expect(read('PRIVACY.md')).toContain('transferred to a successor');
  });

  it('passes the file-shape gate but keeps release authorization closed by default', () => {
    const shape = spawnSync(
      process.execPath,
      ['scripts/check-release-policy.mjs', '--files-only'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      },
    );
    expect(shape.status, shape.stderr).toBe(0);

    const release = spawnSync(process.execPath, ['scripts/check-release-policy.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, MAVEA_LEGAL_RELEASE_APPROVED: '0' },
    });
    expect(release.status).toBe(1);
    expect(release.stderr).toContain('MAVEA_LEGAL_RELEASE_APPROVED is not 1');
  });

  it('contains no stale project-license or external-code invitation language', () => {
    const allMarkdown = markdownFiles(ROOT)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(allMarkdown).not.toMatch(/Issues and PRs welcome/i);
    expect(allMarkdown).not.toMatch(/PRs with reproducible results are welcome/i);
    expect(allMarkdown).not.toMatch(/All rights reserved\. A license will be announced/i);
    expect(allMarkdown).not.toMatch(/Mavéa's own intentionally missing license/i);
    expect(allMarkdown).not.toMatch(/package\.json` is `UNLICENSED/i);

    const fixture = read('src/data/topics/oss.ts');
    const shippedFixtures = [
      fixture,
      read('src/gallery/fixtures/docs.json'),
      read('src/gallery/fixtures/diagrams.json'),
      read('src/live/select/referenceExamples.generated.json'),
    ].join('\n');
    expect(shippedFixtures).not.toMatch(
      /Should we open-source Mavéa|Open-sourcing Mavéa|MIT license|open-core|closed-source client|open client repo/i,
    );
    expect(fixture).toContain('Fictional strategy exercise · not Mavéa policy');
  });

  it('exposes the canonical legal set in the app build and CLI help', () => {
    const vite = read('vite.config.ts');
    for (const file of [
      'LICENSE.txt',
      'TERMS.md',
      'DISCLAIMER.md',
      'PRIVACY.md',
      'TRADEMARKS.md',
      'SUPPORT.md',
      'SECURITY.md',
      'THIRD-PARTY.txt',
    ]) {
      expect(vite).toContain(file);
    }

    const help = spawnSync(process.execPath, ['bin/mavea.mjs', '--help'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('PolyForm Noncommercial 1.0.0');
    expect(help.stdout).toContain('AI output may be inaccurate');
    expect(help.stdout).toContain('Provider terms and charges apply');
  });
});
