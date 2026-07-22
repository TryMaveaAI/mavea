// tokenStore.mjs — persistent OAuth token storage for the actions gateway.
// Tokens are written to a JSON file on a Docker volume so they survive restarts.
// Env vars always win over stored tokens for backward compat (set env → skip OAuth UI).
import { readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Docker sets TOKEN_STORE_PATH to a writable volume (/gateway-data). For a bare host run
// (`pnpm actions`) fall back to a gitignored dir beside this module, NOT the root-owned
// /gateway-data — anchored to the module path so it's stable regardless of the cwd.
const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), '.gateway-data', 'tokens.json');
const PATH = process.env.TOKEN_STORE_PATH || DEFAULT_PATH;

function load() {
  try {
    return JSON.parse(readFileSync(PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Low 12 bits of st_mode are the permission bits; mask off the file-type bits before comparing.
const PERM_MASK = 0o777;

/**
 * Decide whether the token file's on-disk permissions are still owner-only. chmod can be a silent
 * no-op on some filesystems (notably a Docker volume mounted where the process lacks ownership), so
 * we re-stat after writing rather than trusting the chmod call. Pure for testability — pass the raw
 * st_mode. Returns null when the mode is fine, or a prominent warning string to log when it isn't.
 */
export function tokenPermWarning(rawMode) {
  const mode = rawMode & PERM_MASK;
  if (mode === 0o600) return null;
  return (
    `tokenStore: SECURITY — token file is mode ${mode.toString(8)}, expected 600. OAuth tokens ` +
    'may be readable by other users; fix the filesystem permissions or volume ownership.'
  );
}

function save(data) {
  try {
    // OAuth access/refresh tokens live here — keep them owner-only so other users on the
    // host (or another container sharing the volume) can't read them off disk.
    mkdirSync(dirname(PATH), { recursive: true, mode: 0o700 });
    writeFileSync(PATH, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    chmodSync(PATH, 0o600); // writeFile's mode only applies on create — enforce it on rewrites too
  } catch (e) {
    console.error('tokenStore: failed to write', e.message);
    return;
  }
  // Verify the on-disk mode actually took, so a swallowed chmod failure can't leave the token file
  // world-readable without anyone noticing — a credential leak we must never pass over quietly.
  try {
    const warning = tokenPermWarning(statSync(PATH).mode);
    if (warning) console.error(warning);
  } catch (e) {
    // If we can't even stat the file we just wrote, we can't vouch for its permissions — say so.
    console.error('tokenStore: could not verify token-file permissions', e.message);
  }
}

export function getToken(service) {
  return load()[service] ?? null;
}

export function setToken(service, value) {
  const data = load();
  data[service] = value;
  save(data);
}

export function clearToken(service) {
  const data = load();
  delete data[service];
  save(data);
}

/** Is this service ready to use? Checks env vars first, then stored tokens. */
export function isConfigured(service) {
  const stored = load();
  switch (service) {
    case 'google':
      return !!(process.env.GOOGLE_OAUTH_TOKEN || stored.google?.token);
    case 'github':
      return !!(process.env.GITHUB_OAUTH_TOKEN || stored.github?.token);
    default:
      return false;
  }
}

/** Merge stored tokens over env so connectors see credentials without knowing their source. */
export function augmentEnv(env) {
  const stored = load();
  const out = { ...env };
  if (!out.GOOGLE_OAUTH_TOKEN && stored.google?.token) out.GOOGLE_OAUTH_TOKEN = stored.google.token;
  if (!out.GITHUB_OAUTH_TOKEN && stored.github?.token) out.GITHUB_OAUTH_TOKEN = stored.github.token;
  if (!out.GITHUB_DEFAULT_REPO && stored.github?.repo) out.GITHUB_DEFAULT_REPO = stored.github.repo;
  return out;
}

/** Return a fresh Google access token, transparently refreshing if needed. */
export async function freshGoogleToken(fetchImpl = fetch) {
  const stored = load();
  const g = stored.google;
  if (!g?.token) return process.env.GOOGLE_OAUTH_TOKEN || null;
  const nowMs = Date.now();
  if ((g.expiresAt ?? 0) - nowMs > 5 * 60 * 1000) return g.token;
  if (!g.refreshToken) return g.token;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return g.token;

  try {
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: g.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) return g.token;
    const data = await res.json();
    const newToken = data.access_token;
    const expiresAt = nowMs + (data.expires_in ?? 3600) * 1000;
    setToken('google', { ...g, token: newToken, expiresAt });
    return newToken;
  } catch {
    return g.token;
  }
}
