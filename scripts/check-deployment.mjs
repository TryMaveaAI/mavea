#!/usr/bin/env node
// Post-deploy edge gate. HTTP/2, HTTP/3, TLS, CDN compression, and real response headers are host
// behavior, not Vite behavior; test the public URL rather than claiming a protocol from config.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const requireHttp3 = args.includes('--require-http3');
const budgetAt = args.indexOf('--budget-ms');
const rawUrl = args.find(
  (arg, index) => index !== budgetAt && index !== budgetAt + 1 && !arg.startsWith('--'),
);
const budgetMs = budgetAt >= 0 ? Number(args[budgetAt + 1]) : 150;

if (!rawUrl || !Number.isFinite(budgetMs) || budgetMs <= 0) {
  console.error(
    'Usage: pnpm check:deployment -- https://app.example.com [--budget-ms 150] [--require-http3]',
  );
  process.exit(2);
}

let base;
try {
  base = new URL(rawUrl);
} catch {
  console.error(`✖ Invalid deployment URL: ${rawUrl}`);
  process.exit(2);
}
if (base.protocol !== 'https:') {
  console.error('✖ Public deployment checks require an https:// URL.');
  process.exit(1);
}

const failures = [];
const notes = [];
const requireHeader = (headers, name, pattern) => {
  const value = headers.get(name) ?? '';
  if (!pattern.test(value)) failures.push(`${name} is missing or invalid (${value || 'absent'})`);
  return value;
};

async function timedFetch(url, init) {
  const started = performance.now();
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
  const elapsed = performance.now() - started;
  if (!response.ok) failures.push(`${url} returned HTTP ${response.status}`);
  return { response, elapsed };
}

try {
  // HSTS protects future visits, but the first plaintext request still needs a permanent upgrade.
  // Probe it explicitly instead of assuming the CDN redirects because HTTPS happens to work.
  const plaintext = new URL(base);
  plaintext.protocol = 'http:';
  const redirect = await fetch(plaintext, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const location = redirect.headers.get('location');
  let redirectTarget = null;
  try {
    redirectTarget = location ? new URL(location, plaintext) : null;
  } catch {
    // The failure below includes the invalid value.
  }
  if (
    ![301, 308].includes(redirect.status) ||
    redirectTarget?.protocol !== 'https:' ||
    redirectTarget.host !== base.host
  ) {
    failures.push(
      `HTTP must permanently redirect to the same HTTPS host (${redirect.status} ${location ?? 'no location'})`,
    );
  }

  const { response: htmlResponse } = await timedFetch(base);
  const html = await htmlResponse.text();
  requireHeader(
    htmlResponse.headers,
    'strict-transport-security',
    /max-age=(?:3\d{7}|[4-9]\d{7,})/i,
  );
  requireHeader(htmlResponse.headers, 'content-security-policy', /frame-ancestors\s+'none'/i);
  requireHeader(htmlResponse.headers, 'permissions-policy', /microphone=\(self\)/i);
  requireHeader(htmlResponse.headers, 'x-content-type-options', /^nosniff$/i);
  requireHeader(htmlResponse.headers, 'referrer-policy', /strict-origin-when-cross-origin/i);
  requireHeader(htmlResponse.headers, 'cache-control', /(?:no-cache|no-store|max-age=0)/i);
  const altSvc = requireHeader(htmlResponse.headers, 'alt-svc', /(?:^|[,\s])h3(?:-[0-9]+)?=/i);

  const entry = /<script[^>]+src="([^"]+\.js)"/i.exec(html)?.[1];
  if (!entry) failures.push('deployed HTML does not reference a hashed JavaScript entry');
  else {
    const assetUrl = new URL(entry, htmlResponse.url);
    if (!/\/assets\/[^/]+-[A-Za-z0-9_-]+\.js$/.test(assetUrl.pathname)) {
      failures.push(`entry asset is not content-hashed (${assetUrl.pathname})`);
    }
    const { response: assetResponse } = await timedFetch(assetUrl, {
      headers: { 'Accept-Encoding': 'br, gzip' },
    });
    requireHeader(assetResponse.headers, 'content-encoding', /^(?:br|gzip|zstd)$/i);
    const vary = assetResponse.headers.get('vary') ?? '';
    if (!/accept-encoding/i.test(vary))
      failures.push(`Vary must include Accept-Encoding (${vary})`);
    const cache = assetResponse.headers.get('cache-control') ?? '';
    const maxAge = Number(/max-age=(\d+)/i.exec(cache)?.[1] ?? 0);
    if (!/\bimmutable\b/i.test(cache) || maxAge < 31_536_000) {
      failures.push(`hashed asset cache policy must be one-year immutable (${cache || 'absent'})`);
    }
    await assetResponse.arrayBuffer();

    // Reuse connections and caches, then measure a small warm sample. This is a regional probe,
    // not a claim about every user; run it from every launch geography and track RUM percentiles.
    const warm = [];
    for (let i = 0; i < 3; i++) {
      const started = performance.now();
      const response = await fetch(assetUrl, { signal: AbortSignal.timeout(20_000) });
      await response.arrayBuffer();
      warm.push(performance.now() - started);
    }
    warm.sort((a, b) => a - b);
    const median = warm[1];
    notes.push(
      `warm entry median ${median.toFixed(0)} ms (${warm.map((n) => n.toFixed(0)).join('/')})`,
    );
    if (median > budgetMs)
      failures.push(`warm entry median ${median.toFixed(0)} ms exceeds ${budgetMs} ms`);
  }

  const curl = spawnSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_version}',
      '--http2',
      '--tlsv1.3',
      '--connect-timeout',
      '10',
      '--max-time',
      '20',
      base.href,
    ],
    { encoding: 'utf8', timeout: 25_000 },
  );
  if (curl.error?.code === 'ENOENT') failures.push('curl is required to verify negotiated HTTP/2');
  else if (curl.status !== 0) failures.push(`HTTP/2 probe failed: ${(curl.stderr || '').trim()}`);
  else if (!/^(?:2|2\.0|3|3\.0)$/.test(curl.stdout.trim())) {
    failures.push(`edge negotiated HTTP/${curl.stdout.trim() || 'unknown'}, not HTTP/2+`);
  } else notes.push(`negotiated HTTP/${curl.stdout.trim()}`);

  const curlVersion = spawnSync('curl', ['--version'], { encoding: 'utf8', timeout: 5_000 });
  if (/\bHTTP3\b/i.test(curlVersion.stdout ?? '')) {
    const h3 = spawnSync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_version}',
        '--http3-only',
        '--connect-timeout',
        '10',
        '--max-time',
        '20',
        base.href,
      ],
      { encoding: 'utf8', timeout: 25_000 },
    );
    if (h3.status !== 0 || !/^(?:3|3\.0)$/.test(h3.stdout.trim())) {
      failures.push(
        `HTTP/3 was advertised but an HTTP/3-only request failed (${(h3.stderr ?? '').trim()})`,
      );
    } else notes.push('HTTP/3 request completed');
  } else if (requireHttp3) {
    failures.push(
      `HTTP/3 proof required, but this curl build lacks QUIC support (advertisement: ${altSvc})`,
    );
  } else {
    notes.push(`HTTP/3 advertised via Alt-Svc (${altSvc}); real QUIC negotiation not proven`);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exit(1);
}
console.log(`✓ Deployment edge gate passed: ${notes.join(' · ')}`);
