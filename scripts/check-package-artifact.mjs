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

  const extracted = spawnSync('tar', ['-xOf', archive, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024,
  });
  if (extracted.status !== 0) {
    throw new Error(extracted.stderr || 'could not inspect the packed package.json');
  }
  const packedPackage = JSON.parse(extracted.stdout);

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
    'dist/demo-assets/CREDITS.md',
    'dist/demo-assets/video/island-coast.webm',
    'dist/fonts/OFL-1.1.txt',
    'dist/fonts/PROVENANCE.md',
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
    'dist/semantic/index.json',
    'dist/semantic/matrix.i8',
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
  const forbiddenMedia = paths.filter((path) => /\.(?:aac|m4a|m4v|mov|mp3|mp4)$/i.test(path));
  if (forbiddenMedia.length) {
    errors.push(
      `royalty-bearing or policy-forbidden media would publish: ${forbiddenMedia.join(', ')}`,
    );
  }

  const productionDependencies = Object.keys(PACKAGE.dependencies ?? {});
  if (productionDependencies.length) {
    errors.push(`published CLI must stay dependency-free: ${productionDependencies.join(', ')}`);
  }
  if (PACKAGE.publishConfig?.engines?.node !== '>=22.12') {
    errors.push('published CLI Node engine must stay explicitly pinned to >=22.12');
  }
  if (PACKAGE.publishConfig?.access !== 'public' || PACKAGE.publishConfig?.provenance !== true) {
    errors.push('source publishConfig must require public access and npm provenance');
  }
  if (PACKAGE.license !== 'PolyForm-Noncommercial-1.0.0') {
    errors.push('published package must declare PolyForm-Noncommercial-1.0.0');
  }
  if (packedPackage.name !== '@mavea/mavea') {
    errors.push(`packed package name changed to ${String(packedPackage.name)}`);
  }
  if (packedPackage.license !== 'PolyForm-Noncommercial-1.0.0') {
    errors.push(`packed package license changed to ${String(packedPackage.license)}`);
  }
  if (packedPackage.engines?.node !== '>=22.12') {
    errors.push(`packed package Node engine changed to ${String(packedPackage.engines?.node)}`);
  }
  if (packedPackage.bin?.mavea !== './bin/mavea.mjs') {
    errors.push(`packed package CLI entry changed to ${String(packedPackage.bin?.mavea)}`);
  }
  if (packedPackage.publishConfig?.access !== 'public') {
    errors.push('packed package must remain public on npm');
  }
  if (packedPackage.publishConfig?.provenance !== true) {
    errors.push('packed package must request npm provenance');
  }
  if (Object.keys(packedPackage.dependencies ?? {}).length) {
    errors.push('packed package unexpectedly declares production dependencies');
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
