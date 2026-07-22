// actions-gateway.mjs — same-origin endpoint for action running + OAuth connect flows.
//
// Two concerns in one small server so it runs in one container:
//   1. POST /<id>  — run a confirmed action (the existing behavior)
//   2. /oauth/*    — OAuth connect flows so users never paste tokens manually
//
// Browser → Vite proxy → /actions/* → here.
// Run: node gateway/actions-gateway.mjs | Docker: the `actions` service.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { runConnector, SUPPORTED_ACTIONS } from './connectors.mjs';
import { isConfigured, setToken, clearToken, getToken } from './tokenStore.mjs';
import {
  assertGatewayConfig,
  createActionConfirmationStore,
  createOAuthStateStore,
  originAllowed,
  secretOk,
} from './guard.mjs';

const PORT = Number(process.env.ACTIONS_PORT) || 8910;
export const ACTIONS_HOST = process.env.ACTIONS_HOST || '127.0.0.1';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REQUEST_TARGET_BYTES = 8 * 1024;
const RATE_LIMIT = Number(process.env.ACTIONS_RATE_LIMIT) || 100; // requests per window, per client
const RATE_WINDOW_MS = Number(process.env.ACTIONS_RATE_WINDOW_MS) || 60 * 1000;

// ── CSRF / auth guard ───────────────────────────────────────────────────────────
// The gateway holds the deployer's OAuth credentials and fires real actions (Slack/Gmail/Calendar/
// GitHub), so a state-changing request MUST come from the app itself, not a random page the user
// happens to have open. Defence:
//   1. Origin allowlist for browser calls. Missing Origin/Referer never counts as authentication.
//   2. Shared-secret authentication for non-browser calls. It is optional only while the socket is
//      loopback-only; startup refuses any remote bind unless a strong secret is configured.
// Vite serves 5173 by default but falls back to 5174/5175/… when a port is taken, so the local dev
// origin isn't always 5173. Allow the standard Vite dev range on both loopback hosts (plus whatever
// APP_URL names) — the gateway is local-only, and this keeps the anti-CSRF guard while not breaking
// a dev server that happened to land on the next port.
const ALLOWED_ORIGINS = new Set(
  [
    APP_URL,
    ...[4173, 5173, 5174, 5175, 5176, 5177].flatMap((p) => [
      `http://localhost:${p}`,
      `http://127.0.0.1:${p}`,
    ]),
  ].filter(Boolean),
);
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || '';

// ── OAuth CSRF state ──────────────────────────────────────────────────────────
// The Google redirect lands on a GET callback (not covered by the POST/DELETE guard), so it
// carries a single-use, TTL'd `state` nonce: an attacker can't forge a callback without one we
// actually issued. Kept in memory — a short-lived flow, lost only on a gateway restart (retry).
const oauthState = createOAuthStateStore(10 * 60 * 1000);
const actionConfirmations = createActionConfirmationStore(2 * 60 * 1000);

/** Guard a privileged request. Browser callers must be same-origin; non-browser callers must carry
 * the shared secret. When a secret is configured, both kinds must carry it. */
function guardPrivileged(req, res) {
  const hasBrowserContext = Boolean(req.headers.origin || req.headers.referer);
  if (hasBrowserContext && !originAllowed(req.headers, ALLOWED_ORIGINS)) {
    send(res, 403, { ok: false, detail: 'Forbidden: cross-origin request blocked.' });
    return false;
  }
  if (!hasBrowserContext && !GATEWAY_SECRET) {
    send(res, 403, {
      ok: false,
      detail: 'Forbidden: non-browser requests require gateway authentication.',
    });
    return false;
  }
  if (!secretOk(req.headers, GATEWAY_SECRET)) {
    send(res, 403, { ok: false, detail: 'Forbidden: gateway secret missing or invalid.' });
    return false;
  }
  return true;
}

function audit(event, fields = {}) {
  // Never add request bodies, OAuth codes/tokens, confirmation tokens, or provider response text.
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}

// ── Rate limiting ───────────────────────────────────────────────────────────────
// The gateway fires real, irreversible actions (Slack posts, Gmail drafts, PRs) and talks to
// rate-limited upstreams, so a single client must not be able to hammer it. A per-client sliding
// window caps bursts: kept in memory (a Map of recent timestamps per key), self-pruning so it
// stays bounded, and clock-injectable for tests. `now` is in ms; `take()` returns whether the hit
// is allowed plus, when blocked, the seconds until the oldest hit in the window ages out.
export function createRateLimiter(limit, windowMs, now = () => Date.now()) {
  const hits = new Map(); // client key → array of hit timestamps, oldest first
  return {
    take(key) {
      const t = now();
      const cutoff = t - windowMs;
      // Drop keys whose entire window has aged out, so idle clients don't accumulate forever.
      for (const [k, times] of hits) {
        if (times.length === 0 || times[times.length - 1] <= cutoff) hits.delete(k);
      }
      const times = hits.get(key) ?? [];
      while (times.length && times[0] <= cutoff) times.shift(); // expire this key's stale hits
      if (times.length >= limit) {
        const retryAfterMs = times[0] + windowMs - t;
        return { allowed: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }
      times.push(t);
      hits.set(key, times);
      return { allowed: true };
    },
  };
}

// One bounded, self-pruning limiter shared by the state-changing routes (see the router).
const rateLimiter = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

/** Identify the calling client for rate limiting: the same-origin proxy is the trusted hop, so we
 *  key on the socket peer rather than any client-supplied forwarding header (which is spoofable). */
function clientKey(req) {
  return req.socket?.remoteAddress || 'unknown';
}

// ── helpers ───────────────────────────────────────────────────────────────────
function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function readJson(req) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    req.resume();
    return Promise.reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        fail(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', fail);
  });
}

function parseRequestTarget(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('/') || Buffer.byteLength(rawUrl) > MAX_REQUEST_TARGET_BYTES) {
    throw new Error('invalid request target');
  }
  const parsed = new URL(rawUrl, 'http://127.0.0.1');
  const path = decodeURIComponent(parsed.pathname);
  if (path.includes('\0')) throw new Error('invalid request target');
  return { path, qs: Object.fromEntries(parsed.searchParams) };
}

// ── OAuth: GitHub Device Flow ─────────────────────────────────────────────────
async function githubStart(res) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId)
    return send(res, 503, {
      ok: false,
      detail: 'GITHUB_OAUTH_CLIENT_ID not set on this deployment.',
    });

  const r = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    // Public repositories are the secure default. A self-hoster who intentionally connects a
    // private repository can opt into the classic broader `repo` scope explicitly.
    body: JSON.stringify({
      client_id: clientId,
      scope: process.env.GITHUB_OAUTH_SCOPE === 'repo' ? 'repo' : 'public_repo',
    }),
  });
  const data = await r.json();
  if (!data.device_code) return send(res, 502, { ok: false, detail: 'GitHub device flow failed.' });
  send(res, 200, {
    ok: true,
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    interval: data.interval ?? 5,
  });
}

async function githubPoll(res, qs) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const deviceCode = qs.device_code;
  if (!clientId || !clientSecret || !deviceCode)
    return send(res, 400, { ok: false, detail: 'Missing params.' });

  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = await r.json();
  if (data.access_token) {
    setToken('github', { token: data.access_token, repo: getToken('github')?.repo ?? '' });
    audit('oauth.connected', { service: 'github' });
    return send(res, 200, { ok: true, connected: true });
  }
  // authorization_pending / slow_down are normal — keep polling
  return send(res, 200, { ok: true, connected: false, error: data.error });
}

async function githubSetRepo(res, body) {
  const repo = (body.repo ?? '').trim();
  if (!repo) return send(res, 400, { ok: false, detail: 'Provide a repo as owner/name.' });
  const stored = getToken('github') ?? {};
  setToken('github', { ...stored, repo });
  audit('oauth.configuration.updated', { service: 'github' });
  send(res, 200, { ok: true });
}

// ── OAuth: Google Auth Code + PKCE-lite (popup flow) ─────────────────────────
function googleAuthUrl(state) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = APP_URL + '/actions/oauth/google/callback';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
}

async function googleCallback(res, qs) {
  const code = qs.code;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = APP_URL + '/actions/oauth/google/callback';

  // CSRF: the callback must carry a `state` nonce we issued at /oauth/google/start.
  if (!oauthState.consume(qs.state)) {
    return sendHtml(
      res,
      400,
      closingHtml('error', 'Invalid or expired sign-in request. Try again.'),
    );
  }
  if (!code || !clientId || !clientSecret) {
    return sendHtml(res, 400, closingHtml('error', 'Missing OAuth parameters.'));
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await r.json();
  if (!data.access_token) {
    return sendHtml(res, 502, closingHtml('error', 'Token exchange failed.'));
  }
  setToken('google', {
    token: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  audit('oauth.connected', { service: 'google' });
  sendHtml(res, 200, closingHtml('google', null));
}

function closingHtml(service, errMsg) {
  const payload = errMsg
    ? JSON.stringify({ service, ok: false, error: errMsg })
    : JSON.stringify({ service, ok: true });
  // Target the app origin explicitly (never '*') so only Mavéa — not any page that happened
  // to open this popup — receives the OAuth result.
  return `<!doctype html><html><body><script>
    window.opener?.postMessage(${payload}, ${JSON.stringify(APP_URL)});
    window.close();
  </script></body></html>`;
}

// ── Router ────────────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  let requestTarget;
  try {
    requestTarget = parseRequestTarget(req.url);
  } catch {
    return send(res, 400, { ok: false, detail: 'Malformed request target.' });
  }
  const { path, qs } = requestTarget;
  const method = req.method || 'GET';

  // Every privileged request must pass the CSRF/auth guard. That's all POST/DELETE, plus the
  // OAuth INITIATION GETs (/oauth/*/start): a cross-origin link to google/start would otherwise mint
  // a real state nonce and let the callback complete the flow. GitHub poll is privileged too: a
  // successful poll persists the access token, despite being a GET. Status exposes connection and
  // repository metadata. The provider callback remains bound to its single-use OAuth state nonce.
  const isOAuthInit =
    method === 'GET' && (path === '/oauth/google/start' || path === '/oauth/github/start');
  const isMutation = method === 'POST' || method === 'DELETE' || isOAuthInit;
  const isGithubPoll = method === 'GET' && path === '/oauth/github/poll';
  const isOAuthStatus = method === 'GET' && path === '/oauth/status';
  const isPrivileged = isMutation || isGithubPoll || isOAuthStatus;
  if (isPrivileged && !guardPrivileged(req, res)) return;

  // Throttle state-changing requests per client so one caller can't flood the connectors or the
  // rate-limited upstreams they call. Runs after the CSRF guard but before any handler reads the
  // body or fires an action.
  if (isMutation || isGithubPoll) {
    const verdict = rateLimiter.take(clientKey(req));
    if (!verdict.allowed) {
      res.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': String(verdict.retryAfter),
      });
      return res.end(
        JSON.stringify({ ok: false, detail: 'Too many requests. Slow down and retry shortly.' }),
      );
    }
  }

  // Health check
  if (method === 'GET' && path === '/healthz') {
    return send(res, 200, { ok: true, actions: SUPPORTED_ACTIONS });
  }

  // OAuth status
  if (method === 'GET' && path === '/oauth/status') {
    const g = getToken('github');
    return send(res, 200, {
      ok: true,
      github: isConfigured('github'),
      google: isConfigured('google'),
      githubRepo: g?.repo ?? '',
    });
  }

  // GitHub device flow
  if (method === 'POST' && path === '/oauth/github/start') {
    return githubStart(res);
  }
  if (method === 'GET' && path === '/oauth/github/poll') {
    return githubPoll(res, qs);
  }
  if (method === 'POST' && path === '/oauth/github/repo') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.statusCode || 400, { ok: false, detail: 'Bad JSON.' });
    }
    return githubSetRepo(res, body);
  }

  // Google OAuth popup
  if (method === 'GET' && path === '/oauth/google/start') {
    // Runs in a popup: reply with a self-closing page that posts the result back to the
    // opener, never raw JSON. An unconfigured gateway therefore surfaces as a clean error
    // on the card instead of a bare error page in the popup.
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID)
      return sendHtml(
        res,
        503,
        closingHtml(
          'google',
          'Google sign-in isn’t set up on this gateway (GOOGLE_OAUTH_CLIENT_ID).',
        ),
      );
    res.writeHead(302, { location: googleAuthUrl(oauthState.issue()) });
    return res.end();
  }
  if (method === 'GET' && path === '/oauth/google/callback') {
    return googleCallback(res, qs);
  }

  // Disconnect
  if (method === 'DELETE' && (path === '/oauth/github' || path === '/oauth/google')) {
    const svc = path.split('/')[2];
    clearToken(svc);
    audit('oauth.disconnected', { service: svc, client: clientKey(req) });
    return send(res, 200, { ok: true });
  }

  // The browser asks for a short-lived token only after the user clicks the confirm button. It is
  // bound to the exact action + args and consumed by the execution route below, so retries or a
  // captured request cannot replay the action or change its arguments.
  if (method === 'POST' && path === '/confirm') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.statusCode || 400, { ok: false, detail: 'Bad JSON.' });
    }
    const id = typeof body.id === 'string' ? body.id : '';
    const actionArgs = body.args && typeof body.args === 'object' ? body.args : {};
    if (!SUPPORTED_ACTIONS.includes(id)) {
      return send(res, 404, { ok: false, detail: `No connector for “${id}”.` });
    }
    const confirmationToken = actionConfirmations.issue(id, actionArgs);
    audit('action.confirmed', { action: id, client: clientKey(req) });
    return send(res, 200, { ok: true, confirmationToken, expiresInMs: 2 * 60 * 1000 });
  }

  // Run a confirmed action — POST /<id>
  if (method === 'POST') {
    const id = path.replace(/^\//, '');
    if (!id) return send(res, 404, { ok: false, detail: 'No action id in the path.' });
    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return send(res, err.statusCode || 400, {
        ok: false,
        detail: `Couldn't read the request (${err.message}).`,
      });
    }
    const actionArgs = body.args && typeof body.args === 'object' ? body.args : {};
    if (!actionConfirmations.consume(req.headers['x-action-confirmation'], id, actionArgs)) {
      return send(res, 403, {
        ok: false,
        detail: 'Action confirmation is missing, expired, already used, or does not match.',
      });
    }
    const started = Date.now();
    const result = await runConnector(id, actionArgs);
    audit('action.executed', {
      action: id,
      ok: result.ok,
      status: result.status,
      durationMs: Date.now() - started,
      client: clientKey(req),
    });
    // `payload` carries read-only data a connector returns (e.g. a fetched PR diff for Ripple);
    // write actions omit it, so the wire shape is unchanged for them.
    return send(res, result.status, {
      ok: result.ok,
      detail: result.detail,
      ...(result.payload !== undefined ? { payload: result.payload } : {}),
    });
  }

  send(res, 405, { ok: false, detail: 'Method not allowed.' });
}

export function createActionsGatewayServer() {
  const gateway = createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      if (!res.headersSent) {
        send(res, 500, { ok: false, detail: 'The gateway could not complete the request.' });
      } else {
        res.destroy();
      }
    });
  });
  gateway.headersTimeout = 10_000;
  gateway.requestTimeout = 15_000;
  gateway.keepAliveTimeout = 5_000;
  gateway.maxHeadersCount = 64;
  gateway.maxRequestsPerSocket = 500;
  return gateway;
}

export function listenGateway(gateway, { port = PORT, host = ACTIONS_HOST } = {}) {
  // Validate the same module-scoped secret the request guard will enforce. Accepting a separate
  // listen-time value would let startup validate one secret while requests checked another.
  assertGatewayConfig(host, GATEWAY_SECRET);
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      gateway.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      gateway.off('error', onError);
      resolve(gateway.address());
    };
    gateway.once('error', onError);
    gateway.once('listening', onListening);
    gateway.listen(port, host);
  });
}

export const server = createActionsGatewayServer();

// Bind the port only when run as the entry point, not when a test imports the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void listenGateway(server)
    .then((address) => {
      const actualPort = typeof address === 'object' && address ? address.port : PORT;
      console.log(
        `actions gateway ${ACTIONS_HOST}:${actualPort} — connectors: ${SUPPORTED_ACTIONS.join(', ')}`,
      );
    })
    .catch((error) => {
      console.error(`actions gateway refused to start: ${error.message}`);
      process.exitCode = 1;
    });
}
