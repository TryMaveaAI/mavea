// Pure CSRF/auth checks for the actions gateway, kept separate so they can be unit-tested without
// starting the HTTP server. See actions-gateway.mjs for why the gateway must reject foreign-origin
// state-changing requests: it holds the deployer's OAuth credentials and fires real actions.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * True when a state-changing request may proceed on origin grounds. A browser always attaches an
 * `Origin` header to a cross-origin POST/DELETE (even a no-preflight "simple" request), so an
 * allowlist on Origin blocks CSRF. A request with neither Origin nor Referer is NOT silently
 * trusted: the HTTP layer must authenticate it as a non-browser API call.
 */
export function originAllowed(headers, allowedOrigins) {
  const origin = headers.origin;
  if (origin) return allowedOrigins.has(origin);
  const referer = headers.referer;
  if (referer) return [...allowedOrigins].some((o) => referer === o || referer.startsWith(o + '/'));
  return false;
}

/** True when the shared secret is satisfied. An empty configured secret is valid only for a
 * loopback-only server; startup validation prevents it on any remote bind. */
export function secretOk(headers, secret) {
  if (!secret) return true;
  const supplied = headers['x-gateway-secret'];
  if (typeof supplied !== 'string') return false;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.byteLength === suppliedBytes.byteLength &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

/** The only unauthenticated bind targets the gateway permits. */
export function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

/** Refuse a remotely reachable gateway unless it has a strong shared secret. */
export function assertGatewayConfig(host, secret) {
  if (typeof host !== 'string' || !host.trim()) throw new Error('ACTIONS_HOST must not be empty');
  if (!isLoopbackHost(host) && (typeof secret !== 'string' || secret.length < 32)) {
    throw new Error(
      'GATEWAY_SECRET must be at least 32 characters when ACTIONS_HOST is not loopback',
    );
  }
  return { host, remote: !isLoopbackHost(host) };
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function actionDigest(id, args) {
  return createHash('sha256').update(canonicalJson({ id, args })).digest();
}

/** Single-use action confirmations. The token is random; its stored digest is bound to the exact
 * action id and arguments the user saw. `consume` always burns a known token, even on mismatch, so
 * a captured token cannot be probed or replayed with altered arguments. */
export function createActionConfirmationStore(ttlMs, now = () => Date.now()) {
  const pending = new Map();
  return {
    issue(id, args) {
      const t = now();
      for (const [token, entry] of pending) if (entry.expiresAt <= t) pending.delete(token);
      const token = randomBytes(32).toString('base64url');
      pending.set(token, { digest: actionDigest(id, args), expiresAt: t + ttlMs });
      return token;
    },
    consume(token, id, args) {
      if (typeof token !== 'string' || !token) return false;
      const entry = pending.get(token);
      if (!entry) return false;
      pending.delete(token);
      if (entry.expiresAt <= now()) return false;
      return timingSafeEqual(entry.digest, actionDigest(id, args));
    },
  };
}

/**
 * A single-use, TTL'd OAuth `state` store (CSRF protection for the GET redirect callback). `issue()`
 * mints a nonce included in the auth URL; `consume()` validates + burns it on the callback, so a
 * forged callback with no/expired/reused state is rejected. `now` is injectable for tests.
 */
export function createOAuthStateStore(ttlMs, now = () => Date.now()) {
  const pending = new Map();
  return {
    issue() {
      const t = now();
      for (const [k, exp] of pending) if (exp <= t) pending.delete(k);
      const state = randomBytes(16).toString('hex');
      pending.set(state, t + ttlMs);
      return state;
    },
    consume(state) {
      if (!state) return false;
      const exp = pending.get(state);
      if (exp === undefined) return false;
      pending.delete(state); // single-use
      return exp > now();
    },
  };
}
