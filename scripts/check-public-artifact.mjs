#!/usr/bin/env node
// The directory uploaded/deployed by CI is public. Hidden source maps are still downloadable, and
// omitting a lazily-fetched voice runtime makes the packaged product differ from the tested build.
// Keep both promises executable: no source disclosure, and every shipped runtime asset present.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('dist not found — run the production build first.');
  process.exit(1);
}

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

const files = filesUnder(DIST);
const maps = files.filter((file) => file.endsWith('.map'));
const mapReferences = files.filter((file) => {
  if (!/\.(?:html|css|m?js)$/i.test(file)) return false;
  return /[#@]\s*sourceMappingURL=/i.test(readFileSync(file, 'utf8'));
});

// Gitleaks protects the source tree, but a build can still inline a value supplied through an
// environment variable. Scan the exact public bytes as a second boundary. Keep these patterns
// provider-specific so ordinary prose and documented placeholders do not create false positives.
const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['OpenRouter key', /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/],
  ['xAI key', /\bxai-[A-Za-z0-9_-]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  [
    'Slack webhook',
    /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{8,}\/[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/,
  ],
];
const textFiles = files.filter((file) => /\.(?:html|css|m?js|json|svg|txt|xml)$/i.test(file));
const secretHits = [];
for (const file of textFiles) {
  const body = readFileSync(file, 'utf8');
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(body)) secretHits.push({ file, label });
  }
}

const requiredRuntime = [
  'vad.worklet.bundle.min.js',
  'silero_vad_v5.onnx',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];
const missingRuntime = requiredRuntime.filter((name) => !existsSync(resolve(DIST, name)));
const requiredLegalDocs = [
  'LICENSE.txt',
  'TERMS.md',
  'DISCLAIMER.md',
  'PRIVACY.md',
  'TRADEMARKS.md',
  'SUPPORT.md',
  'SECURITY.md',
  'THIRD-PARTY.txt',
];
const missingLegalDocs = requiredLegalDocs.filter(
  (name) => !existsSync(resolve(DIST, 'legal', name)),
);
const legalSources = new Map(
  requiredLegalDocs.map((output) => [output, output === 'LICENSE.txt' ? 'LICENSE' : output]),
);
const changedLegalDocs = requiredLegalDocs.filter((output) => {
  const built = resolve(DIST, 'legal', output);
  const source = resolve(ROOT, legalSources.get(output));
  return (
    existsSync(built) && existsSync(source) && !readFileSync(built).equals(readFileSync(source))
  );
});

const failures = [];
if (maps.length) failures.push(`${maps.length} public source map(s)`);
if (mapReferences.length) failures.push(`${mapReferences.length} source-map reference(s)`);
if (missingRuntime.length) failures.push(`missing runtime assets: ${missingRuntime.join(', ')}`);
if (missingLegalDocs.length)
  failures.push(`missing legal documents: ${missingLegalDocs.join(', ')}`);
if (changedLegalDocs.length)
  failures.push(
    `built legal documents differ from canonical sources: ${changedLegalDocs.join(', ')}`,
  );
if (secretHits.length) failures.push(`${secretHits.length} credential-like value(s)`);

if (failures.length) {
  console.error(`✖ Public artifact rejected: ${failures.join('; ')}`);
  for (const file of [...maps, ...mapReferences].slice(0, 12)) {
    console.error(`  ${relative(DIST, file)}`);
  }
  for (const hit of secretHits.slice(0, 12)) {
    console.error(`  ${relative(DIST, hit.file)} (${hit.label})`);
  }
  process.exit(1);
}

console.log(
  `✓ Public artifact: ${files.length} files, no source maps or credential patterns, runtime assets and legal documents present.`,
);
