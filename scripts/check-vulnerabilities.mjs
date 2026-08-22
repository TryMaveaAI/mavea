#!/usr/bin/env node
// Exact installed-graph vulnerability gate backed by the first-party OSV.dev batch API.
// It scans production and development dependencies because compromised build tooling can affect
// the shipped artifact too. Any known, non-withdrawn vulnerability fails the gate; there is no
// severity threshold and no silent ignore list.
//
// REVIEWED, on the other hand, is not silent — see ACCEPTED below. An advisory can be one this
// project has read and shown to be unreachable in the way IT uses the package, and the honest
// answer there is neither to fail forever on something that cannot happen nor to wave through a
// category. Each acceptance names the exact advisory, the exact package VERSION, and the argument;
// it is printed on every run, and it stops applying the moment either changes.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = resolve(ROOT, 'node_modules/.pnpm');
const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_DETAIL_URL = 'https://api.osv.dev/v1/vulns/';
const BATCH_SIZE = 500;

/** Advisories reviewed and accepted, pinned to the exact version the review was done against.
 *
 *  A bump re-opens the question by construction: the key carries the version, so an upgraded
 *  package no longer matches and the gate fails again until someone looks. Removing the last
 *  consumer has the same effect — the entry then matches nothing and is reported as stale. */
const ACCEPTED = new Map([
  [
    'GHSA-5p2g-fcmc-qvqq@image-size@1.2.1',
    'Unreachable as this project uses it. The parsers at fault are JXL/HEIF (and ICNS in the ' +
      'sibling advisory); pptxgenjs only ever receives what export/pipeline/raster.ts produces, ' +
      'which is canvas.toDataURL("image/jpeg") or ("image/png") — never those formats, and never ' +
      'a file the reader supplies. pptxgenjs is lazily imported on the PPTX export path alone. ' +
      'Availability-only (C:N/I:N/A:H), and every published image-size version is affected, so ' +
      'there is nothing to upgrade to. Re-check when image-size ships a fix or pptxgenjs drops it.',
  ],
  [
    'GHSA-w3rx-r6r6-pgpr@image-size@1.2.1',
    'Same package, same review as GHSA-5p2g-fcmc-qvqq — the ICNS parser, a format this project ' +
      'never produces or forwards.',
  ],
]);

function collectInstalledPackages() {
  const packages = new Map();

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      const manifest = join(path, 'package.json');
      if (entry.name !== 'node_modules' && existsSync(manifest)) {
        try {
          const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
          if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
            packages.set(`${pkg.name}@${pkg.version}`, {
              name: pkg.name,
              version: pkg.version,
            });
          }
        } catch {
          // The license gate separately reports unreadable package metadata. Do not invent a
          // version for OSV, because fuzzy or missing-version queries can create false matches.
        }
      }
      if (entry.name === 'node_modules' || entry.name.startsWith('@')) walk(path);
    }
  }

  for (const entry of readdirSync(STORE)) walk(join(STORE, entry, 'node_modules'));
  return [...packages.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function toQuery(pkg, pageToken) {
  return {
    package: { ecosystem: 'npm', name: pkg.name },
    version: pkg.version,
    ...(pageToken ? { page_token: pageToken } : {}),
  };
}

async function queryBatch(packages, findings) {
  let pending = packages.map((pkg) => ({ pkg }));
  while (pending.length) {
    const next = [];
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      const page = pending.slice(offset, offset + BATCH_SIZE);
      const payload = { queries: page.map(({ pkg, pageToken }) => toQuery(pkg, pageToken)) };
      const body = await requestJson(OSV_BATCH_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!Array.isArray(body.results) || body.results.length !== page.length) {
        throw new Error('OSV returned a malformed or incomplete batch response');
      }
      body.results.forEach((result, index) => {
        const pkg = page[index].pkg;
        for (const vulnerability of result.vulns ?? []) {
          if (!vulnerability?.id) continue;
          const affected = findings.get(vulnerability.id) ?? new Set();
          affected.add(`${pkg.name}@${pkg.version}`);
          findings.set(vulnerability.id, affected);
        }
        if (result.next_page_token) next.push({ pkg, pageToken: result.next_page_token });
      });
    }
    pending = next;
  }
}

async function fetchDetails(ids) {
  const details = new Map();
  for (let offset = 0; offset < ids.length; offset += 20) {
    const page = ids.slice(offset, offset + 20);
    const records = await Promise.all(
      page.map((id) => requestJson(`${OSV_DETAIL_URL}${encodeURIComponent(id)}`)),
    );
    records.forEach((record, index) => details.set(page[index], record));
  }
  return details;
}

async function main() {
  if (!existsSync(STORE))
    throw new Error('node_modules/.pnpm not found — run `pnpm install` first');
  const packages = collectInstalledPackages();
  if (!packages.length) throw new Error('no installed packages were found');

  const findings = new Map();
  await queryBatch(packages, findings);
  console.log(`OSV vulnerability gate — scanned ${packages.length} exact npm package versions.`);
  if (!findings.size) {
    console.log('✓ No known vulnerabilities found in the installed dependency graph.');
    return;
  }

  // Split before reporting: an accepted advisory is announced, not hidden, and anything else fails.
  const accepted = [];
  const blocking = new Map();
  for (const [id, pkgs] of findings) {
    const unreviewed = new Set();
    for (const pkg of pkgs) {
      const key = `${id}@${pkg}`;
      if (ACCEPTED.has(key)) accepted.push({ id, pkg, why: ACCEPTED.get(key) });
      else unreviewed.add(pkg);
    }
    if (unreviewed.size) blocking.set(id, unreviewed);
  }
  if (accepted.length) {
    console.log(`\n${accepted.length} reviewed acceptance(s) — read, argued, and version-pinned:`);
    for (const { id, pkg, why } of accepted) {
      console.log(`    ${id} — ${pkg}`);
      console.log(`      ${why}`);
      console.log(`      https://osv.dev/${id}`);
    }
  }
  const stale = [...ACCEPTED.keys()].filter(
    (key) => !accepted.some(({ id, pkg }) => `${id}@${pkg}` === key),
  );
  if (stale.length) {
    console.error(`\n✖ ${stale.length} acceptance(s) match nothing installed — delete them:`);
    for (const key of stale) console.error(`    ${key}`);
    process.exitCode = 1;
  }
  if (!blocking.size) {
    if (!stale.length) console.log('\n✓ No unreviewed vulnerabilities in the installed graph.');
    return;
  }

  const ids = [...blocking.keys()].sort();
  const details = await fetchDetails(ids);
  console.error(`\n✖ ${ids.length} known vulnerabilit${ids.length === 1 ? 'y' : 'ies'} found:`);
  for (const id of ids) {
    const record = details.get(id);
    const packagesForId = [...blocking.get(id)].sort().join(', ');
    const summary = record?.summary || record?.details?.split('\n')[0] || 'No summary provided';
    console.error(`    ${id} — ${packagesForId}`);
    console.error(`      ${summary}`);
    console.error(`      https://osv.dev/${id}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Vulnerability gate failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
