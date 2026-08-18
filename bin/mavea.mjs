#!/usr/bin/env node
// mavea CLI — serves the prebuilt app locally, same-origin proxies included, so `npx @mavea/mavea`
// works exactly the way `pnpm dev` does in the source repo (see vite.config.ts, which this
// mirrors) without needing Node deps, a clone, or a build step.
import { createServer } from 'node:http';
import http from 'node:http';
import https from 'node:https';
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, resolve, sep } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';
import { homedir, platform, tmpdir } from 'node:os';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const COMPOSE_FILE = join(ROOT, 'docker-compose.yml');

// The CLI is intentionally a local application, not a remotely reachable deployment server.
// Binding an API-key-forwarding proxy to 0.0.0.0 turns every laptop on a shared network into an
// unauthenticated relay. A hosted Mavéa deployment must put its own authenticated HTTPS edge in
// front of the app; this executable always stays on the IPv4 loopback interface.
export const LOOPBACK_HOST = '127.0.0.1';

const MAX_REQUEST_TARGET_BYTES = 8 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

// HSTS is deliberately absent: this server is plain HTTP on loopback. Hosted HTTPS deployments
// receive HSTS from public/_headers. The remaining protections are valid on both HTTP and HTTPS.
export const LOCAL_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Permissions-Policy': 'microphone=(self), display-capture=(self), camera=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

// The ONNX runtime WASM (13MB) and Silero VAD model (2.3MB) are real functional assets voice
// mode needs, not waste — but bundling them into every `npx @mavea/mavea` download costs everyone that
// weight even if they never touch voice (most turns are text). Both are ALSO already public,
// permanently-versioned npm package assets, so instead of shipping them in dist/ (see the `files`
// exclusion in package.json), they're fetched ONCE from jsDelivr's npm CDN the first time voice
// actually starts, cached to a persistent per-OS cache dir, and served from there on every request
// after — a normal user who never uses voice never downloads either file. Pinned to the exact
// version this package was built against (see devDependencies) so a version bump here and a
// version bump there can never silently drift apart.
const LAZY_ASSETS = {
  'ort-wasm-simd-threaded.wasm': {
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort-wasm-simd-threaded.wasm',
    mime: 'application/wasm',
    bytes: 13_022_405,
    sha256: '040d52ce5066707a10d45cb9500c35e70a9c2fb33c4fb63428da9ae45b956b97',
  },
  'silero_vad_v5.onnx': {
    url: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/silero_vad_v5.onnx',
    mime: 'application/octet-stream',
    bytes: 2_327_524,
    sha256: '2623a2953f6ff3d2c1e61740c6cdb7168133479b267dfef114a4a3cc5bdd788f',
  },
};

// Standard per-OS cache location (the same convention env-paths/XDG use) — persists across
// `npx @mavea/mavea` invocations (npx's own package cache does NOT persist these, since they're fetched
// at runtime, not installed), so a user only pays the download once, ever, per machine.
function lazyCacheDir() {
  const plat = platform();
  if (plat === 'darwin') return join(homedir(), 'Library', 'Caches', 'mavea');
  if (plat === 'win32') {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'mavea', 'Cache');
  }
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'mavea');
}

// In-flight downloads by cache path, so two requests racing for the same missing asset (e.g. the
// .wasm and its already-loaded .mjs glue both kicking off near-simultaneously) share one fetch
// instead of downloading twice.
const inFlightDownloads = new Map();
const verifiedLazyAssets = new Set();

function cachedAssetIsValid(cachePath, checksumPath, expectedBytes, expectedSha256) {
  const cacheKey = `${cachePath}:${expectedSha256}`;
  try {
    if (!existsSync(cachePath) || !existsSync(checksumPath)) return false;
    if (verifiedLazyAssets.has(cacheKey)) return true;
    if (
      statSync(cachePath).size !== expectedBytes ||
      readFileSync(checksumPath, 'utf8').trim() !== expectedSha256
    ) {
      return false;
    }
    const actualSha256 = createHash('sha256').update(readFileSync(cachePath)).digest('hex');
    if (actualSha256 !== expectedSha256) return false;
    verifiedLazyAssets.add(cacheKey);
    return true;
  } catch {
    return false;
  }
}

export async function readBoundedAsset(res, expectedBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > expectedBytes) {
    throw new Error('voice asset exceeded its pinned size');
  }
  if (!res.body) throw new Error('voice asset response had no body');
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedBytes) {
        await reader.cancel();
        throw new Error('voice asset exceeded its pinned size');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (received !== expectedBytes) throw new Error('voice asset did not match its pinned size');
  return Buffer.concat(chunks, received);
}

async function fetchToCache(url, cachePath, expectedBytes, expectedSha256) {
  const checksumPath = `${cachePath}.sha256`;
  if (cachedAssetIsValid(cachePath, checksumPath, expectedBytes, expectedSha256)) return;
  const existing = inFlightDownloads.get(cachePath);
  if (existing) return existing;
  const task = (async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    // Download to a per-process tmp file, then rename — a request that arrives mid-download (or a
    // process killed mid-download) never sees or leaves behind a truncated cache file.
    const tmpPath = join(tmpdir(), `mavea-dl-${process.pid}-${Date.now()}.tmp`);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
      const bytes = await readBoundedAsset(res, expectedBytes);
      const actualSha256 = createHash('sha256').update(bytes).digest('hex');
      if (actualSha256 !== expectedSha256) throw new Error(`checksum mismatch for ${url}`);
      await writeFile(tmpPath, bytes);
      if (existsSync(cachePath)) unlinkSync(cachePath);
      renameSync(tmpPath, cachePath);
      await writeFile(checksumPath, `${expectedSha256}\n`);
      verifiedLazyAssets.add(`${cachePath}:${expectedSha256}`);
    } finally {
      clearTimeout(timer);
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    }
  })();
  inFlightDownloads.set(cachePath, task);
  try {
    await task;
  } finally {
    inFlightDownloads.delete(cachePath);
  }
}

async function serveLazyAsset(name, asset, res) {
  const cachePath = join(lazyCacheDir(), name);
  try {
    await fetchToCache(asset.url, cachePath, asset.bytes, asset.sha256);
  } catch {
    // Same failure mode as a missing asset always had here: the client (onnxruntime-web / Silero
    // VAD) treats a 404/502 on this path as "voice model unavailable" and surfaces the local mic
    // as unavailable rather than breaking the typed conversation.
    sendProblem(res, 502, 'The optional voice asset is unavailable.');
    return;
  }
  res.writeHead(200, {
    ...LOCAL_SECURITY_HEADERS,
    'Content-Type': asset.mime,
    'Cache-Control': 'no-cache',
  });
  const stream = createReadStream(cachePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export function parseArgs(argv, env = process.env) {
  const envPort = env.PORT == null || env.PORT === '' ? 4173 : Number(env.PORT);
  const out = { port: envPort, open: true, voice: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') {
      const value = argv[++i];
      if (value == null) throw new Error(`${a} requires a port number`);
      out.port = Number(value);
    } else if (a === '--no-open') out.open = false;
    else if (a === '--no-voice') out.voice = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`unknown option: ${a}`);
  }
  if (!Number.isInteger(out.port) || out.port < 0 || out.port > 65_535) {
    throw new Error(`invalid port: ${String(env.PORT ?? out.port)}`);
  }
  return out;
}

// Same-origin forwarders — the production equivalent of the /llm, /search, /actions, /tts, /stt
// dev proxies in vite.config.ts. BYOK keys travel browser → this local server → provider, same
// as dev; nothing is stored or logged here.
const MiB = 1024 * 1024;

export const PROXIES = [
  {
    prefix: '/tts',
    target: process.env.KOKORO_URL || 'http://localhost:8880',
    methods: ['GET', 'POST'],
    bodyLimit: 2 * MiB,
    responseLimit: 32 * MiB,
    requestsPerMinute: 120,
    maxConcurrent: 4,
    timeoutMs: 120_000,
  },
  {
    prefix: '/stt',
    target: process.env.WHISPER_URL || 'http://localhost:8100',
    methods: ['GET', 'POST'],
    bodyLimit: 32 * MiB,
    responseLimit: 4 * MiB,
    requestsPerMinute: 60,
    maxConcurrent: 2,
    timeoutMs: 120_000,
  },
  {
    prefix: '/llm/anthropic',
    target: 'https://api.anthropic.com',
    // GET too: every provider adapter's readiness probe (the wizard/settings "Test" check) hits
    // GET .../v1/models before ever sending a POST — restricting this to POST 405'd that probe,
    // which surfaced as a permanent, key-independent "Not reachable." on this local server.
    methods: ['GET', 'POST'],
    bodyLimit: 96 * MiB,
    responseLimit: 32 * MiB,
    requestsPerMinute: 60,
    maxConcurrent: 2,
    timeoutMs: 120_000,
  },
  {
    prefix: '/llm/openai',
    target: 'https://api.openai.com',
    methods: ['GET', 'POST'], // GET: the readiness probe (see the anthropic route's comment)
    bodyLimit: 96 * MiB,
    responseLimit: 32 * MiB,
    requestsPerMinute: 60,
    maxConcurrent: 2,
    timeoutMs: 120_000,
  },
  {
    prefix: '/llm/gemini',
    target: 'https://generativelanguage.googleapis.com',
    methods: ['GET', 'POST'], // GET: the readiness probe (see the anthropic route's comment)
    bodyLimit: 96 * MiB,
    responseLimit: 32 * MiB,
    requestsPerMinute: 60,
    maxConcurrent: 2,
    timeoutMs: 120_000,
    injectGeminiKey: true,
  },
  {
    prefix: '/llm/grok',
    target: 'https://api.x.ai',
    methods: ['GET', 'POST'], // GET: the readiness probe (see the anthropic route's comment)
    bodyLimit: 96 * MiB,
    responseLimit: 32 * MiB,
    requestsPerMinute: 60,
    maxConcurrent: 2,
    timeoutMs: 120_000,
  },
  {
    prefix: '/llm/openrouter',
    target: 'https://openrouter.ai',
    methods: ['GET', 'POST'], // GET: the readiness probe (see the anthropic route's comment)
    bodyLimit: 96 * MiB,
    responseLimit: 32 * MiB,
    requestsPerMinute: 60,
    maxConcurrent: 2,
    timeoutMs: 120_000,
  },
  {
    prefix: '/search/brave',
    target: 'https://api.search.brave.com',
    methods: ['GET'],
    bodyLimit: 0,
    responseLimit: 4 * MiB,
    requestsPerMinute: 120,
    maxConcurrent: 6,
    timeoutMs: 30_000,
  },
  {
    prefix: '/search/tavily',
    target: 'https://api.tavily.com',
    methods: ['POST'],
    bodyLimit: 2 * MiB,
    responseLimit: 4 * MiB,
    requestsPerMinute: 120,
    maxConcurrent: 6,
    timeoutMs: 30_000,
  },
  {
    prefix: '/actions',
    target: process.env.ACTIONS_URL || 'http://127.0.0.1:8910',
    methods: ['GET', 'POST', 'DELETE'],
    bodyLimit: 2 * MiB,
    responseLimit: 8 * MiB,
    requestsPerMinute: 120,
    maxConcurrent: 4,
    timeoutMs: 30_000,
    forwardOrigin: true,
    crossSiteNavigationPaths: ['/oauth/google/callback'],
    injectGatewaySecret: true,
  },
];

function send(res, status, body = '', headers = {}) {
  if (res.headersSent) return res.end();
  const payload = body ? Buffer.from(body) : null;
  res.writeHead(status, {
    ...LOCAL_SECURITY_HEADERS,
    'Cache-Control': 'no-store',
    ...(payload ? { 'Content-Length': String(payload.byteLength) } : {}),
    ...headers,
  });
  res.end(payload);
}

function sendProblem(res, status, message, headers = {}) {
  send(res, status, `${message}\n`, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
}

function parseRequestTarget(rawUrl) {
  if (!rawUrl || Buffer.byteLength(rawUrl) > MAX_REQUEST_TARGET_BYTES) {
    throw new Error('request target is empty or too long');
  }
  // Only origin-form request targets belong on this local origin. Rejecting absolute-form targets
  // prevents the CLI from accidentally behaving like a general-purpose forward proxy.
  if (!rawUrl.startsWith('/')) throw new Error('absolute request targets are not supported');
  const parsed = new URL(rawUrl, 'http://127.0.0.1');
  const decodedPathname = decodeURIComponent(parsed.pathname);
  if (decodedPathname.includes('\0')) throw new Error('request target contains a null byte');
  return {
    pathname: parsed.pathname,
    decodedPathname,
    search: parsed.search,
  };
}

function routeMatches(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function localUrlFromHeader(value) {
  if (!value || Array.isArray(value)) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `http://${value}`);
    const hostname = parsed.hostname.toLowerCase();
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isTrustedBrowserRequest(req, requestTarget, route) {
  const host = localUrlFromHeader(req.headers.host);
  if (!host) return false;

  const crossSitePath = requestTarget.pathname.slice(route.prefix.length) || '/';
  if (
    req.method === 'GET' &&
    route.crossSiteNavigationPaths?.some((path) => crossSitePath === path)
  ) {
    return true;
  }

  const origin = localUrlFromHeader(req.headers.origin);
  if (origin) return origin.host === host.host;

  const referer = localUrlFromHeader(req.headers.referer);
  if (referer) return referer.host === host.host;

  // Fetch Metadata is supplied by current browsers even for same-origin GETs that omit Origin.
  // A raw socket/curl request supplies none of these browser proofs and cannot consume the proxy.
  return req.headers['sec-fetch-site'] === 'same-origin';
}

function createRateLimiter(now = Date.now) {
  const windows = new Map();
  let calls = 0;
  return {
    take(key, limit) {
      const current = now();
      const cutoff = current - 60_000;
      const recent = (windows.get(key) || []).filter((time) => time > cutoff);
      if (recent.length >= limit) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((recent[0] + 60_000 - current) / 1000)),
        };
      }
      recent.push(current);
      windows.set(key, recent);
      // Keep a long-running CLI bounded even if many transient client keys appear.
      if (++calls % 256 === 0) {
        for (const [client, hits] of windows) {
          if (!hits.some((time) => time > cutoff)) windows.delete(client);
        }
      }
      return { allowed: true, retryAfter: 0 };
    },
  };
}

function readRequestBody(req, limit) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    req.resume();
    return Promise.reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
  }
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let received = 0;
    let settled = false;
    const reject = (error) => {
      if (settled) return;
      settled = true;
      rejectBody(error);
    };
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > limit) {
        reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolveBody(Buffer.concat(chunks, received));
    });
    req.on('aborted', () =>
      reject(Object.assign(new Error('request aborted'), { statusCode: 400 })),
    );
    req.on('error', reject);
  });
}

function requestHeadersForUpstream(req, route, targetUrl, body) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lower) ||
      lower === 'host' ||
      lower === 'cookie' ||
      lower === 'content-length' ||
      (!route.forwardOrigin && (lower === 'origin' || lower === 'referer'))
    ) {
      continue;
    }
    if (value != null) headers[lower] = value;
  }
  headers.host = targetUrl.host;
  if (body.byteLength > 0) headers['content-length'] = String(body.byteLength);
  if (route.injectGeminiKey && process.env.GEMINI_API_KEY && !headers['x-goog-api-key']) {
    headers['x-goog-api-key'] = process.env.GEMINI_API_KEY;
  }
  if (route.injectGatewaySecret && process.env.GATEWAY_SECRET) {
    headers['x-gateway-secret'] = process.env.GATEWAY_SECRET;
  }
  return headers;
}

function responseHeadersForClient(proxyHeaders) {
  const headers = { ...LOCAL_SECURITY_HEADERS, 'Cache-Control': 'no-store' };
  for (const [name, value] of Object.entries(proxyHeaders)) {
    const lower = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lower) ||
      lower === 'set-cookie' ||
      lower.startsWith('access-control-') ||
      lower === 'content-length'
    ) {
      continue;
    }
    if (value != null) headers[lower] = value;
  }
  return headers;
}

function streamBoundedResponse(proxyRes, res, limit, onDone) {
  const declared = Number(proxyRes.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    proxyRes.destroy();
    sendProblem(res, 502, 'Upstream response exceeded the configured limit.');
    onDone();
    return;
  }

  res.writeHead(proxyRes.statusCode || 502, responseHeadersForClient(proxyRes.headers));
  let received = 0;
  proxyRes.on('data', (chunk) => {
    received += chunk.length;
    if (received > limit) {
      proxyRes.destroy();
      res.destroy(new Error('upstream response exceeded the configured limit'));
      onDone();
      return;
    }
    if (!res.write(chunk)) {
      proxyRes.pause();
      res.once('drain', () => proxyRes.resume());
    }
  });
  proxyRes.on('end', () => {
    res.end();
    onDone();
  });
  proxyRes.on('aborted', () => {
    res.destroy();
    onDone();
  });
  proxyRes.on('error', () => {
    if (!res.headersSent) sendProblem(res, 502, 'The upstream service failed.');
    else res.destroy();
    onDone();
  });
}

async function proxyRequest(req, res, route, requestTarget) {
  let body;
  try {
    body = await readRequestBody(req, route.bodyLimit);
  } catch (error) {
    sendProblem(res, error.statusCode || 400, error.message || 'Invalid request body.');
    return;
  }

  const targetUrl = new URL(route.target);
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    sendProblem(res, 502, 'The upstream service has an invalid protocol.');
    return;
  }
  const restPath = requestTarget.pathname.slice(route.prefix.length) || '/';
  const rest = restPath + requestTarget.search;
  const isHttps = targetUrl.protocol === 'https:';
  const mod = isHttps ? https : http;
  const headers = requestHeadersForUpstream(req, route, targetUrl, body);

  await new Promise((resolveProxy) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      res.off('close', onClientClose);
      resolveProxy();
    };
    const proxyReq = mod.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: (targetUrl.pathname === '/' ? '' : targetUrl.pathname) + rest,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        proxyRes.setTimeout(route.timeoutMs, () => {
          proxyRes.destroy(new Error('upstream response timeout'));
        });
        streamBoundedResponse(proxyRes, res, route.responseLimit, settle);
      },
    );
    const onClientClose = () => {
      if (!res.writableEnded) proxyReq.destroy(new Error('client disconnected'));
      settle();
    };
    res.once('close', onClientClose);
    proxyReq.setTimeout(route.timeoutMs, () => {
      proxyReq.destroy(new Error('upstream request timeout'));
    });
    proxyReq.on('error', () => {
      // Connection refused (voice/gateway not running) surfaces as an honest failure on the card.
      if (!res.destroyed && !res.headersSent) {
        sendProblem(res, 502, 'The upstream service is unavailable.');
      } else if (!res.destroyed) {
        res.destroy();
      }
      settle();
    });
    if (body.byteLength > 0) proxyReq.write(body);
    proxyReq.end();
  });
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// Text assets are stored uncompressed, so serving them verbatim spends roughly three bytes for
// every one a browser needs: the app shell alone is 396 kB raw against 129 kB gzipped. Anything
// already carrying its own compression (fonts, images, PDFs, media) is left alone — re-compressing
// it costs CPU and returns nothing. `.wasm` is here because it is plain bytecode and halves.
const COMPRESSIBLE = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.wasm',
  '.xml',
]);

// Quality 5 rather than brotli's default 11: on a local server the file is compressed on every
// request, and 11 spends seconds of CPU to save a few percent over 5 — a trade that makes the
// first paint slower, not faster. Encoding the size hint lets brotli size its window to the file.
const BROTLI_OPTIONS = {
  params: {
    [constants.BROTLI_PARAM_QUALITY]: 5,
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
  },
};

/** The best encoding this client accepts for this file, or null to send it verbatim. Brotli beats
 *  gzip by ~15% on our bundles and every browser that can run the app supports it, so it wins when
 *  offered; gzip is the floor for anything older or a proxy that stripped br. */
export function negotiateEncoding(acceptEncoding, ext) {
  if (!COMPRESSIBLE.has(ext.toLowerCase())) return null;
  const accepted = String(acceptEncoding ?? '').toLowerCase();
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

// Content-hashed assets are immutable by definition — the same URL can never return different
// bytes — so compressing one twice is pure waste, and on the small machines this exists to serve,
// brotli-ing a 400 kB bundle on every page load is CPU taken from the render. Compress once, hold
// the result, and every later request is a buffer write with a real Content-Length instead of a
// chunked stream. Only /assets/ is eligible: index.html is `no-cache` and may change under us.
const COMPRESSED_CACHE_BUDGET_BYTES = 32 * 1024 * 1024;
const compressedCache = new Map();
let compressedCacheBytes = 0;

function cacheCompressed(key, body) {
  // A budget rather than an LRU: the set is the build's own asset list, which is bounded and small.
  // The cap exists so a pathological dist/ cannot pin unbounded memory, not to manage churn.
  if (compressedCacheBytes + body.length > COMPRESSED_CACHE_BUDGET_BYTES) return;
  compressedCache.set(key, body);
  compressedCacheBytes += body.length;
}

/** Compressed bytes for an immutable asset, or null if it is not worth holding one. */
function cachedCompression(filePath, encoding, isHashedAsset) {
  if (!isHashedAsset) return null;
  return compressedCache.get(`${encoding} ${filePath}`) ?? null;
}

export function resetCompressionCacheForTest() {
  compressedCache.clear();
  compressedCacheBytes = 0;
}

function serveStatic(req, res, requestTarget, distDir = DIST) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendProblem(res, 405, 'Method not allowed.', { Allow: 'GET, HEAD' });
    return;
  }

  const urlPath = requestTarget.decodedPathname;
  const safePath = normalize(urlPath === '/' ? '/index.html' : urlPath);
  let filePath = resolve(distDir, `.${safePath}`);
  // Hash-routed app (#/live, #/gallery never hit the server) — no traversal outside dist/.
  const distPrefix = distDir.endsWith(sep) ? distDir : `${distDir}${sep}`;
  const inDist =
    filePath.startsWith(distPrefix) && existsSync(filePath) && !statSync(filePath).isDirectory();
  if (!inDist) {
    // A published package omits these two large assets from dist/ (see package.json `files`) —
    // fetch-and-cache them on first request instead of falling through to the SPA's index.html,
    // which would hand onnxruntime-web an HTML page where it expects a .wasm/.onnx binary.
    // A source checkout's own `pnpm build` still writes them straight into dist/, so this path
    // never triggers there — `inDist` above is already true and this whole branch is skipped.
    const asset = LAZY_ASSETS[safePath.replace(/^\//, '')];
    if (asset) return void serveLazyAsset(safePath.replace(/^\//, ''), asset, res);
    filePath = join(distDir, 'index.html');
  }
  if (!existsSync(filePath)) {
    sendProblem(res, 404, 'Build entry point not found.');
    return;
  }
  const isHtml = extname(filePath) === '.html';
  const isPdf = extname(filePath).toLowerCase() === '.pdf';
  const isHashedAsset = safePath.startsWith('/assets/');
  const encoding = negotiateEncoding(req.headers['accept-encoding'], extname(filePath));
  const cached = encoding ? cachedCompression(filePath, encoding, isHashedAsset) : null;
  res.writeHead(200, {
    ...LOCAL_SECURITY_HEADERS,
    ...(isPdf
      ? {
          // The app shell remains DENY/'none'. Only a PDF response may be framed, and then only
          // by this same origin for Pdfreader's sandboxed iframe.
          'Content-Security-Policy': "frame-ancestors 'self'",
          'X-Frame-Options': 'SAMEORIGIN',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Content-Disposition': 'inline',
        }
      : {}),
    'Cache-Control': isHtml
      ? 'no-cache'
      : isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
    ...(encoding ? { 'Content-Encoding': encoding, Vary: 'Accept-Encoding' } : {}),
    // Known only for a cached body: a streamed compression cannot state its length up front, and
    // guessing it from the uncompressed file would be a lie the client counts bytes against.
    ...(cached ? { 'Content-Length': String(cached.length) } : {}),
  });
  if (req.method === 'HEAD') return res.end();
  if (cached) return void res.end(cached);

  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) sendProblem(res, 500, 'Could not read the requested file.');
    else res.destroy();
  });
  if (!encoding) return void stream.pipe(res);

  const compressor = encoding === 'br' ? createBrotliCompress(BROTLI_OPTIONS) : createGzip();
  compressor.on('error', () => res.destroy());
  stream.pipe(compressor).pipe(res);
  if (!isHashedAsset) return;

  // Keep what the client is already being sent, so the next request for this immutable URL skips
  // the compression entirely. Collecting alongside the pipe adds no latency — the response streams
  // as it is produced either way — and 'end' lands once the last chunk has gone out.
  const chunks = [];
  compressor.on('data', (chunk) => chunks.push(chunk));
  compressor.once('end', () => cacheCompressed(`${encoding}\0${filePath}`, Buffer.concat(chunks)));
}

export function createMaveaServer({ distDir = DIST, proxies = PROXIES, now = Date.now } = {}) {
  const limiter = createRateLimiter(now);
  const activeByRoute = new Map();
  const server = createServer((req, res) => {
    let requestTarget;
    try {
      requestTarget = parseRequestTarget(req.url);
    } catch {
      sendProblem(res, 400, 'Malformed request target.');
      return;
    }

    const route = proxies.find((candidate) =>
      routeMatches(requestTarget.pathname, candidate.prefix),
    );
    if (!route) {
      try {
        serveStatic(req, res, requestTarget, distDir);
      } catch {
        sendProblem(res, 500, 'The local server could not complete the request.');
      }
      return;
    }

    const allowedMethods = route.methods || [];
    if (!allowedMethods.includes(req.method)) {
      sendProblem(res, 405, 'Method not allowed.', { Allow: allowedMethods.join(', ') });
      return;
    }
    if (!isTrustedBrowserRequest(req, requestTarget, route)) {
      sendProblem(res, 403, 'Proxy requests must come from this local Mavéa page.');
      return;
    }

    const client = req.socket.remoteAddress || 'unknown';
    const rate = limiter.take(`${route.prefix}:${client}`, route.requestsPerMinute);
    if (!rate.allowed) {
      sendProblem(res, 429, 'Too many proxy requests.', {
        'Retry-After': String(rate.retryAfter),
      });
      return;
    }

    const active = activeByRoute.get(route.prefix) || 0;
    if (active >= (route.maxConcurrent || 4)) {
      sendProblem(res, 503, 'This local service is busy. Try again shortly.', {
        'Retry-After': '1',
      });
      return;
    }
    activeByRoute.set(route.prefix, active + 1);

    void proxyRequest(req, res, route, requestTarget)
      .catch(() => {
        if (!res.headersSent) sendProblem(res, 502, 'The upstream service failed.');
        else res.destroy();
      })
      .finally(() => {
        const remaining = (activeByRoute.get(route.prefix) || 1) - 1;
        if (remaining <= 0) activeByRoute.delete(route.prefix);
        else activeByRoute.set(route.prefix, remaining);
      });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 45_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1_000;
  return server;
}

export function listenOnLoopback(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off('listening', onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen(server.address());
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, LOOPBACK_HOST);
  });
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (platform === 'win32')
      spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // best-effort only
  }
}

function commandExists(cmd) {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, {
      stdio: 'ignore',
      shell: true,
    });
    return true;
  } catch {
    return false;
  }
}

function commandReady(command, args) {
  try {
    execSync([command, ...args].join(' '), { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function composeRuntime() {
  if (commandReady('podman', ['info'])) {
    if (commandReady('podman', ['compose', 'version'])) {
      return { command: 'podman', prefix: ['compose'], label: 'Podman' };
    }
    if (commandReady('podman-compose', ['--version'])) {
      return { command: 'podman-compose', prefix: [], label: 'Podman' };
    }
  }
  if (commandReady('docker', ['info'])) {
    return { command: 'docker', prefix: ['compose'], label: 'Docker' };
  }
  return null;
}

function installedRuntime() {
  if (commandExists('podman')) return 'podman';
  if (commandExists('docker')) return 'docker';
  return null;
}

async function serviceReachable(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 800);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Kokoro thread tuning ---------------------------------------------------
//
// The measured tuner `pnpm dev` runs (scripts/dev.mjs), ported here. Duplicated rather than
// imported on purpose: the published package ships bin/ and dist/, never the repo's scripts/, and
// this executable is deliberately dependency-free. Keep the two in step when either changes.
//
// There is no thread count that is right for every machine: the same 4 threads that leave a fast
// box idling at 4x realtime are barely enough on an older one, and the answer depends on per-core
// speed, which nothing in a compose file can see. Kokoro's throughput is near-linear in threads up
// to its measured peak (1.12x / 2.47x / 3.38x / 4.23x at 1-4 threads), so one probe at a known
// thread count yields per-thread speed, and the smallest count clearing the target follows.

/** Speech plays at 1x, so anything above it is only margin — but the margin has to absorb a busy
 *  machine mid-sentence, and falling behind is audible as a stutter. 2x is the smallest cushion. */
const VOICE_TARGET_REALTIME = 2;
/** The measured peak of Kokoro's thread-scaling curve; past this it gets slower AND hungrier. It
 *  is also the compose default, so a tuned machine only ever comes DOWN from it. */
const VOICE_MAX_THREADS = 4;
const VOICE_PROBE_TEXT =
  'Mavéa is a voice first thinking companion that draws what it means as it speaks.';
/** Kokoro emits 24kHz mono 16-bit PCM, so byte length converts straight to seconds of audio. */
const VOICE_PCM_BYTES_PER_SECOND = 24_000 * 2;
/** Kokoro loads its voice model on first run; a cold pull can take a while, so poll generously. */
const VOICE_READY_TIMEOUT_MS = 180_000;
const VOICE_POLL_MS = 1_000;

export function voiceThreadsCacheFile() {
  return join(lazyCacheDir(), 'voice-threads.json');
}

/** The thread count this machine settled on last time, or null on a first run (or a cache written
 *  by a build that measured a different ceiling). */
export function readCachedVoiceThreads(file = voiceThreadsCacheFile()) {
  try {
    const { threads } = JSON.parse(readFileSync(file, 'utf8'));
    return Number.isInteger(threads) && threads > 0 && threads <= VOICE_MAX_THREADS
      ? threads
      : null;
  } catch {
    return null;
  }
}

export function rememberVoiceThreads(threads, realtimePerThread, file = voiceThreadsCacheFile()) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ threads, realtimePerThread }, null, 2));
    return true;
  } catch {
    // A cache that cannot be written costs one probe per run, which is not worth failing over.
    return false;
  }
}

/** The smallest thread count that clears the realtime target at this machine's measured speed. */
export function voiceThreadsFor(realtimePerThread) {
  if (!(realtimePerThread > 0)) return VOICE_MAX_THREADS;
  return Math.min(
    VOICE_MAX_THREADS,
    Math.max(1, Math.ceil(VOICE_TARGET_REALTIME / realtimePerThread)),
  );
}

/** The environment a compose spawn runs with: the tuned thread count, or the compose default. */
export function voiceThreadEnv(threads, env = process.env) {
  return threads ? { ...env, MAVEA_VOICE_THREADS: String(threads) } : env;
}

/** Synthesize one clause and return how many seconds of audio came back per second of wall clock. */
async function measureVoiceRealtime(kokoroUrl) {
  try {
    const started = performance.now();
    const res = await fetch(`${kokoroUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: VOICE_PROBE_TEXT,
        voice: 'af_heart',
        response_format: 'pcm',
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const bytes = (await res.arrayBuffer()).byteLength;
    const seconds = (performance.now() - started) / 1000;
    if (!bytes || seconds <= 0) return null;
    return bytes / VOICE_PCM_BYTES_PER_SECOND / seconds;
  } catch {
    return null;
  }
}

/** Measure this machine and record the answer for next time.
 *
 *  Deliberately does NOT restart the container to apply the new number now: a restart drops the
 *  voice for as long as the model takes to reload, and the app probes speech availability once per
 *  page session — a browser that asks during that window would go silent for the whole session
 *  with nothing to show for it. The default is already safe; the tuned value takes effect on the
 *  next run, so nobody waits and nothing goes quiet. */
async function settleVoiceThreads(kokoroUrl, ranAt) {
  // Best of three, not an average: a busy moment can only ever make synthesis look slower, so the
  // fastest run is the one closest to what this machine can actually do. The first call also pays
  // for warmup, which the later ones do not.
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const realtime = await measureVoiceRealtime(kokoroUrl);
    if (realtime !== null) runs.push(realtime);
  }
  if (!runs.length) return;
  const perThread = Math.max(...runs) / ranAt;
  const want = voiceThreadsFor(perThread);
  rememberVoiceThreads(want, Number(perThread.toFixed(3)));
  if (want === ranAt) return;
  console.log(
    `  Voice: this machine only needs ${want} core${want === 1 ? '' : 's'} — applied from the next run.`,
  );
}

/** Wait for Kokoro to actually answer before probing it — the model load is what takes the time on
 *  a first run, and a measurement taken through it would over-provision every later session. Runs
 *  in the background: the app is already being served while this waits. */
async function tuneVoiceWhenReady(kokoroUrl, ranAt) {
  const deadline = Date.now() + VOICE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serviceReachable(`${kokoroUrl}/health`)) {
      await settleVoiceThreads(kokoroUrl, ranAt);
      return;
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, VOICE_POLL_MS));
  }
}

/**
 * The compose invocation that starts speech, for whichever runtime is present — Docker, Podman and
 * podman-compose all take the same verbs, so the caching behaviour below is identical on each.
 *
 * `--build` is deliberately absent. It forces a build pass on EVERY run, which re-resolves the
 * whisper image on a machine that already has it; without it compose builds only when the image is
 * missing and reuses what is already there. That is safe because the tag carries the version
 * (`mavea-whisper-cpp:1.9.1` in docker-compose.yml), so a version bump is a new tag and does build,
 * while a repeat run on the same version costs nothing. Kokoro is pinned by digest and compose's
 * default `--pull missing` never re-pulls a digest it already holds.
 */
export function composeUpArgs(runtime, composeFile = COMPOSE_FILE) {
  return [...runtime.prefix, '-f', composeFile, 'up', '-d'];
}

function startSpeechServices(runtime, threads) {
  console.log('  Starting Kokoro TTS + whisper.cpp STT. The first run downloads pinned models…');
  spawn(runtime.command, composeUpArgs(runtime), {
    stdio: 'inherit',
    env: voiceThreadEnv(threads),
  });
}

function askYesNo(question, defaultYes = true) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim();
      resolve(/^y/i.test(normalized) || (defaultYes && normalized === ''));
    });
  });
}

const VOICE_INTRO =
  '\n◌ Configured speech — Kokoro reads replies and whisper.cpp transcribes your mic.\n' +
  '  The defaults are loopback-only. A custom WHISPER_URL receives microphone audio at that endpoint.\n';

async function maybeOfferVoice() {
  const kokoroUrl = process.env.KOKORO_URL || 'http://localhost:8880';
  const whisperUrl = process.env.WHISPER_URL || 'http://localhost:8100';
  const [kokoroReady, whisperReady] = await Promise.all([
    serviceReachable(kokoroUrl),
    serviceReachable(whisperUrl),
  ]);
  if (kokoroReady && whisperReady) return;
  if (!existsSync(COMPOSE_FILE) || !process.stdin.isTTY) {
    console.log(
      'Local speech is not fully running — captions and typing still work. ' +
        'Re-run in a terminal to set up Kokoro + whisper.cpp.',
    );
    return;
  }
  console.log(VOICE_INTRO);
  const runtime = composeRuntime();
  if (!runtime) {
    const installed = installedRuntime();
    if (installed === 'podman') {
      console.log(
        '  Podman is installed but not ready. Start `podman machine`, then re-run Mavéa.',
      );
    } else if (installed === 'docker') {
      console.log('  Docker is installed but not ready. Start its engine, then re-run Mavéa.');
      console.log('  Docker Desktop may require a paid subscription for some commercial users.');
    } else {
      console.log('  Install Podman Desktop (Apache-2.0): https://podman-desktop.io/downloads');
      console.log('  Docker also works when its license permits your use.');
    }
    return;
  }
  console.log(
    `  ${runtime.label} is ready. Missing: ${[
      !kokoroReady && 'spoken replies',
      !whisperReady && 'local mic transcription',
    ]
      .filter(Boolean)
      .join(' + ')}.`,
  );
  const yes = await askYesNo('  Start the missing local speech services now? [Y/n] ');
  if (!yes) {
    console.log('  Skipping — Mavéa remains usable with captions and typing.');
    return;
  }
  if (runtime.label === 'Docker') {
    const licensed = await askYesNo(
      '  Docker Desktop has separate terms and may require a paid subscription. Have you read them and confirmed your Docker installation is licensed for this use? [y/N] ',
      false,
    );
    if (!licensed) {
      console.log('  Skipping Docker — use Podman instead, or continue with captions and typing.');
      return;
    }
  }
  const tuned = readCachedVoiceThreads();
  const startedAt = tuned ?? VOICE_MAX_THREADS;
  startSpeechServices(runtime, startedAt);
  // First run on this machine, and we are the ones bringing the voice up: measure it once it
  // answers and remember the answer for next time. A voice that was already running is left alone
  // — the probe costs real CPU, and nothing about it is urgent.
  if (tuned === null && !kokoroReady) void tuneVoiceWhenReady(kokoroUrl, startedAt);
}

/**
 * Speech is settled BEFORE the browser opens, and the order is the whole point: the setup questions
 * live in this terminal, so a window opening over them is how a first run ends up permanently
 * without voice or transcription — the reader never sees the prompt, the answer falls to a default
 * nobody chose, and the experience they judge Mavéa on is the degraded one. Nothing here waits on
 * containers (the compose spawn is detached), so the cost is one reachability probe plus however
 * long the answers take.
 */
export async function settleStartup(args, { offerVoice, openApp }) {
  if (args.voice) await offerVoice();
  if (args.open) openApp();
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`mavea: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(`mavea — run the Mavéa app locally

Usage: npx @mavea/mavea [options]

Options:
  --port, -p <n>   Port to serve on (default 4173, or $PORT)
  --no-open        Don't open a browser automatically
  --no-voice       Skip the local Kokoro + whisper.cpp container prompt
  --help, -h       Show this help

The CLI listens only on 127.0.0.1. Live mode needs your own model API key (BYOK) — add it in
Settings inside the app. Requests pass through this local proxy to your selected providers.
AI output may be inaccurate and is not professional advice. Provider terms and charges apply.

License: PolyForm Noncommercial 1.0.0 (noncommercial use only)
Terms, privacy, disclaimer, and third-party notices ship with this package.
Podman is the recommended free/open-source container runtime. Docker Desktop has separate terms.
`);
    return;
  }

  if (!existsSync(DIST)) {
    console.error(
      'mavea: no build found in this package (missing dist/). If you are running from source, ' +
        'run `pnpm build` first; a published package should always ship a prebuilt dist/.',
    );
    process.exitCode = 1;
    return;
  }

  const server = createMaveaServer();
  let address;
  try {
    address = await listenOnLoopback(server, args.port);
  } catch (error) {
    console.error(`mavea: could not listen on ${LOOPBACK_HOST}:${args.port} (${error.message})`);
    process.exitCode = 1;
    return;
  }
  const actualPort = typeof address === 'object' && address ? address.port : args.port;
  const base = `http://${LOOPBACK_HOST}:${actualPort}`;
  console.log(`\nMavéa is running at ${base}`);
  console.log(`  Demo:    ${base}/`);
  console.log(`  Live:    ${base}/#/live`);
  console.log(`  Gallery: ${base}/#/gallery`);
  console.log('\nLive mode needs your own model API key (BYOK) — add it in Settings in the app.');
  console.log('Requests pass through this local proxy. Provider terms and charges apply.');
  console.log(
    'AI output may be inaccurate and is not professional advice; verify important information.',
  );
  console.log(`Terms:   ${base}/legal/TERMS.md`);
  console.log(`Privacy: ${base}/legal/PRIVACY.md`);
  console.log(`License: ${base}/legal/LICENSE.txt (PolyForm Noncommercial 1.0.0)`);
  await settleStartup(args, { offerVoice: maybeOfferVoice, openApp: () => openBrowser(base) });
}

// npm/npx installs `bin` entries as a symlink (node_modules/.bin/mavea -> ../@mavea/mavea/bin/
// mavea.mjs). Node's ESM loader resolves that symlink when setting import.meta.url to this
// module's REAL path, but path.resolve(process.argv[1]) does not dereference symlinks — it stays
// the symlink's own path, so the two never matched and `npx @mavea/mavea` silently ran main() 0 times.
// realpathSync resolves both sides to the same real filesystem path before comparing.
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
const isMain = isMainModule();
if (isMain) {
  void main().catch((error) => {
    console.error(`mavea: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
