#!/usr/bin/env node
// Pack exactly what npm would receive, then enforce the public CLI artifact boundary. This catches
// regressions that a dist/ scan cannot: accidental source/test publication, production dependency
// creep, and large optional voice models leaking back into every `npx @mavea/mavea` install.
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const MAX_TARBALL_BYTES = 15 * 1024 * 1024;
const temp = mkdtempSync(join(tmpdir(), 'mavea-pack-'));
const archive = join(temp, 'mavea.tgz');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function fail(messages) {
  for (const message of messages) console.error(`✖ ${message}`);
  process.exitCode = 1;
}

try {
  const packed = spawnSync(pnpm, ['pack', '--json', '--out', archive], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, HUSKY: '0' },
    maxBuffer: 4 * 1024 * 1024,
  });
  if (packed.status !== 0) {
    console.error(packed.stderr || packed.stdout || 'pnpm pack failed');
    process.exit(1);
  }

  const jsonStart = packed.stdout.indexOf('{');
  if (jsonStart < 0) throw new Error('pnpm pack did not return its JSON manifest');
  const manifest = JSON.parse(packed.stdout.slice(jsonStart));
  const paths = manifest.files.map((file) => file.path);
  const pathSet = new Set(paths);
  const errors = [];

  for (const required of [
    'bin/mavea.mjs',
    'dist/index.html',
    'dist/legal/LICENSE.txt',
    'dist/legal/TERMS.md',
    'dist/legal/DISCLAIMER.md',
    'dist/legal/PRIVACY.md',
    'dist/legal/TRADEMARKS.md',
    'dist/legal/SUPPORT.md',
    'dist/legal/SECURITY.md',
    'dist/legal/THIRD-PARTY.txt',
    'dist/ort-wasm-simd-threaded.mjs',
    'dist/vad.worklet.bundle.min.js',
    'LICENSE',
    'TERMS.md',
    'DISCLAIMER.md',
    'PRIVACY.md',
    'TRADEMARKS.md',
    'SUPPORT.md',
    'SECURITY.md',
    'THIRD-PARTY.txt',
    'package.json',
  ]) {
    if (!pathSet.has(required)) errors.push(`packed artifact is missing ${required}`);
  }
  for (const forbidden of [
    'dist/ort-wasm-simd-threaded.wasm',
    'dist/silero_vad_v5.onnx',
    'dist/stats.html',
  ]) {
    if (pathSet.has(forbidden))
      errors.push(`optional/private artifact leaked into npm: ${forbidden}`);
  }
  const leaked = paths.filter(
    (path) =>
      /(?:^|\/)(?:src|tests?|coverage|\.git|\.github)(?:\/|$)/.test(path) ||
      /(?:^|\/)\.env(?:\.|$)/.test(path) ||
      /\.map$/i.test(path),
  );
  if (leaked.length) errors.push(`source/test/secret files would publish: ${leaked.join(', ')}`);

  const productionDependencies = Object.keys(PACKAGE.dependencies ?? {});
  if (productionDependencies.length) {
    errors.push(`published CLI must stay dependency-free: ${productionDependencies.join(', ')}`);
  }
  if (PACKAGE.publishConfig?.engines?.node !== '>=20.19') {
    errors.push('published CLI Node engine must stay explicitly pinned to >=20.19');
  }
  if (PACKAGE.license !== 'PolyForm-Noncommercial-1.0.0') {
    errors.push('published package must declare PolyForm-Noncommercial-1.0.0');
  }

  const size = statSync(archive).size;
  if (size > MAX_TARBALL_BYTES) {
    errors.push(
      `npm tarball ${(size / 1024 / 1024).toFixed(2)} MB exceeds the ${MAX_TARBALL_BYTES / 1024 / 1024} MB budget`,
    );
  }
  if (errors.length) fail(errors);
  else {
    console.log(
      `✓ npm artifact: ${paths.length} files, ${(size / 1024 / 1024).toFixed(2)} MB, zero runtime dependencies, no source/maps, optional voice models excluded.`,
    );
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
