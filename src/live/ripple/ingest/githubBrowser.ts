// githubBrowser.ts — read PRs, branch comparisons, repo trees, files, and callers DIRECTLY from
// api.github.com, in the browser, so Ripple's "From GitHub" intake needs no local gateway. PUBLIC
// repos work with zero setup (GitHub's unauthenticated REST API); a PRIVATE repo works once the
// user pastes a GitHub token, kept encrypted on this device (githubToken.ts) and sent only here as
// a Bearer credential over HTTPS. api.github.com is CORS-enabled, so these are ordinary browser
// fetches.
//
// STRICTLY READ-ONLY: every call is a GET against a read endpoint (a PR + its diff, a compare
// range, a commit's tree, a file's contents, a code search, a path's recent commits). There is no
// write/merge/comment path here — that guarantee is the whole point of Ripple's GitHub access. The
// raw diffs feed the SAME parse/build pipeline a pasted diff uses (parseDiff + buildShip), so a
// fetched change and a pasted one are analysed identically.
import { fetchWithTimeout } from '../../providers/http';
import { getGithubToken } from './githubToken';

const TIMEOUT_MS = 25_000;
// Caps that mirror the old gateway's, so a fetched change can't balloon memory or the model prompt.
const MAX_DIFF = 200_000;
const MAX_FILE = 24_000;
const MAX_TREE_PATHS = 4000;

const API = 'https://api.github.com';
const ACCEPT_JSON = 'application/vnd.github+json';
const ACCEPT_DIFF = 'application/vnd.github.v3.diff';

/** GitHub's own owner/repo charset — interpolated straight into the request path, so a crafted
 *  value (slashes, "..", query chars) can never retarget the call. */
const GH_NAME = /^[A-Za-z0-9._-]+$/;

const NETWORK_ERR =
  'Couldn’t reach GitHub — check your connection (a VPN or network blocker can also break it), then try again.';
const REPO_MISSING = 'Add the repo as owner/name, or paste a full GitHub link.';

/** A recent committer to a path (login + how many of the recent commits were theirs). */
export interface Committer {
  login: string;
  count: number;
}

export interface GitHubDiffResult {
  ok: boolean;
  detail: string;
  diff?: string;
  label?: string;
  title?: string;
}

export interface GitHubTreeResult {
  ok: boolean;
  detail: string;
  paths?: string[];
  label?: string;
  truncated?: boolean;
  /** The concrete commit `ref` resolved to — a stable identity to cache against even when `ref`
   *  itself is a branch name that can move. */
  sha?: string;
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

interface Repo {
  owner: string;
  name: string;
  slug: string;
}

/** Split and validate an `owner/name` slug. Browser reads have no server-side "connected default"
 *  repo, so the repo is always explicit; a missing/invalid one fails here, not at the network. */
function parseRepo(repo?: string): Repo | null {
  const [owner, name] = (repo ?? '').trim().split('/');
  if (!owner || !name || !GH_NAME.test(owner) || !GH_NAME.test(name)) return null;
  return { owner, name, slug: `${owner}/${name}` };
}

/** The request headers: the given Accept, plus a Bearer credential IFF a token is stored. No
 *  User-Agent — browsers forbid setting it, and GitHub serves browser requests without one. */
async function authHeaders(accept: string): Promise<Record<string, string>> {
  const token = await getGithubToken();
  return token ? { accept, authorization: `Bearer ${token}` } : { accept };
}

/** Map a failed response to ONE honest, actionable sentence — never a raw status dump. `hasToken`
 *  tunes the 404 line: a fine-grained token that wasn't granted THIS repo 404s exactly like a typo,
 *  so when a token is already stored we point at the token's repo access, not at "add a token". */
function messageFor(res: Response, notFound: string, hasToken: boolean): string {
  if (res.status === 404) {
    if (!notFound) return notFound; // best-effort caller — the message is discarded
    return hasToken
      ? `${notFound} — if it’s private, make sure your token grants access to this repo (fine-grained tokens only see the repos you select).`
      : `${notFound} — if it’s private, add a GitHub token below.`;
  }
  if (res.status === 401) {
    return 'That GitHub token was rejected — check it, or remove it to read public repos.';
  }
  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get('x-ratelimit-remaining') === '0'
  ) {
    return 'GitHub rate-limited this device — add a token below for a much higher limit.';
  }
  if (res.status === 403) {
    return 'GitHub blocked that request — a private repo needs a token that can read it.';
  }
  return 'GitHub couldn’t serve that request — check the link and try again.';
}

/** One GET: the Response on success, or an honest message on any failure (incl. network/CORS). */
async function get(
  url: string,
  accept: string,
  notFound: string,
  signal?: AbortSignal,
): Promise<{ ok: true; res: Response } | { ok: false; detail: string }> {
  let res: Response;
  const headers = await authHeaders(accept);
  const hasToken = 'authorization' in headers;
  try {
    res = await fetchWithTimeout(url, { method: 'GET', headers }, TIMEOUT_MS, signal);
  } catch {
    // A thrown fetch is a network/CORS failure OR the caller aborting (a superseded read) — the
    // aborting caller discards this result, so the message only ever reaches a real failure.
    return { ok: false, detail: NETWORK_ERR };
  }
  return res.ok ? { ok: true, res } : { ok: false, detail: messageFor(res, notFound, hasToken) };
}

/** Decode a GitHub base64 blob (newline-wrapped, UTF-8 bytes) back to text. */
function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Fetch a PR's unified diff (plus its title from the PR JSON). `repo` is `owner/name`. Read-only. */
export async function fetchPrDiff(
  prNumber: string,
  repo?: string,
  signal?: AbortSignal,
): Promise<GitHubDiffResult> {
  const r = parseRepo(repo);
  if (!r) return { ok: false, detail: REPO_MISSING };
  const num = prNumber.trim();
  if (!/^\d+$/.test(num)) return { ok: false, detail: 'A pull-request number looks like 4821.' };
  const notFound = `Couldn’t find PR #${num} in ${r.slug}`;
  const url = `${API}/repos/${r.owner}/${r.name}/pulls/${num}`;

  // The PR JSON first (title/metadata), then the raw diff — the shape the analyze pipeline reads.
  const meta = await get(url, ACCEPT_JSON, notFound, signal);
  if (!meta.ok) return { ok: false, detail: meta.detail };
  const pr = (await meta.res.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof pr.title === 'string' ? pr.title : '';

  const diffRes = await get(url, ACCEPT_DIFF, notFound, signal);
  if (!diffRes.ok) return { ok: false, detail: diffRes.detail };
  const diff = clip(await diffRes.res.text(), MAX_DIFF);
  if (!diff.trim()) return { ok: false, detail: `PR #${num} has no diff to analyze.` };

  return {
    ok: true,
    detail: `Loaded PR #${num}${title ? `: ${title}` : ''} from ${r.slug}`,
    diff,
    label: `${r.slug} #${num}`,
    title,
  };
}

/** Fetch the unified diff between two refs (branch/tag/SHA), so Ripple can run on a branch's changes,
 *  not just an open PR. Read-only. */
export async function compareRefs(
  base: string,
  head: string,
  repo?: string,
  signal?: AbortSignal,
): Promise<GitHubDiffResult> {
  const r = parseRepo(repo);
  if (!r) return { ok: false, detail: REPO_MISSING };
  const b = base.trim();
  const h = head.trim();
  if (!b || !h) return { ok: false, detail: 'Enter a base and a head ref (branch, tag, or SHA).' };
  // Refs can contain "/" and "."; owner/repo are already charset-validated.
  const range = `${encodeURIComponent(b)}...${encodeURIComponent(h)}`;
  const notFound = `Couldn’t compare ${b}...${h} in ${r.slug} — check the refs`;
  const url = `${API}/repos/${r.owner}/${r.name}/compare/${range}`;

  const res = await get(url, ACCEPT_DIFF, notFound, signal);
  if (!res.ok) return { ok: false, detail: res.detail };
  const diff = clip(await res.res.text(), MAX_DIFF);
  if (!diff.trim()) return { ok: false, detail: `No changes between ${b} and ${h}.` };

  return {
    ok: true,
    detail: `Compared ${b}...${h} in ${r.slug}`,
    diff,
    label: `${r.slug} ${b}...${h}`,
  };
}

/** Fetch a repo's file tree at a ref (default HEAD) — the no-change "explore the repo" path. Resolves
 *  `ref` to its concrete commit FIRST: a branch/tag name is a moving target, so two reads moments
 *  apart could otherwise see different code with nothing stable to cache against. Read-only. */
export async function fetchRepoTree(
  ref?: string,
  repo?: string,
  signal?: AbortSignal,
): Promise<GitHubTreeResult> {
  const r = parseRepo(repo);
  if (!r) return { ok: false, detail: REPO_MISSING };
  const wanted = (ref ?? '').trim() || 'HEAD';
  const notFound = `Couldn’t find ${r.slug} @ ${wanted}`;

  const commitRes = await get(
    `${API}/repos/${r.owner}/${r.name}/commits/${encodeURIComponent(wanted)}`,
    ACCEPT_JSON,
    notFound,
    signal,
  );
  if (!commitRes.ok) return { ok: false, detail: commitRes.detail };
  const commit = (await commitRes.res.json().catch(() => ({}))) as {
    sha?: unknown;
    commit?: { tree?: { sha?: unknown } };
  };
  const commitSha = typeof commit.sha === 'string' ? commit.sha : wanted;
  const treeSha = typeof commit.commit?.tree?.sha === 'string' ? commit.commit.tree.sha : commitSha;

  const treeRes = await get(
    `${API}/repos/${r.owner}/${r.name}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    ACCEPT_JSON,
    notFound,
    signal,
  );
  if (!treeRes.ok) return { ok: false, detail: treeRes.detail };
  const data = (await treeRes.res.json().catch(() => ({}))) as {
    tree?: unknown;
    truncated?: unknown;
  };
  const entries = Array.isArray(data.tree)
    ? (data.tree as Array<{ type?: unknown; path?: unknown }>)
    : [];
  // Cap the path count so a giant monorepo can't balloon the response; flag if GitHub truncated it.
  const paths = entries
    .filter((t) => t && t.type === 'blob' && typeof t.path === 'string')
    .map((t) => t.path as string)
    .slice(0, MAX_TREE_PATHS);
  if (paths.length === 0) return { ok: false, detail: `No files found in ${r.slug} @ ${wanted}.` };

  return {
    ok: true,
    detail: `Loaded ${paths.length} files from ${r.slug}`,
    paths,
    label: r.slug,
    truncated: Boolean(data.truncated) || paths.length >= MAX_TREE_PATHS,
    sha: commitSha,
  };
}

/** Read one file's contents at a ref — so the analysis can read the real code, not just the diff.
 *  Decodes GitHub's base64 blob to text. Best-effort: returns `{ ok: false }` on any miss. */
export async function fetchFileContents(
  path: string,
  ref?: string,
  repo?: string,
): Promise<{ ok: boolean; content?: string }> {
  const r = parseRepo(repo);
  const clean = (path ?? '').trim();
  if (!r || !clean || clean.includes('..')) return { ok: false };
  const segs = clean.split('/').map(encodeURIComponent).join('/');
  const refPart = (ref ?? '').trim();
  const url = `${API}/repos/${r.owner}/${r.name}/contents/${segs}${
    refPart ? `?ref=${encodeURIComponent(refPart)}` : ''
  }`;

  const res = await get(url, ACCEPT_JSON, '');
  if (!res.ok) return { ok: false };
  const data = (await res.res.json().catch(() => ({}))) as { type?: unknown; content?: unknown };
  if (data.type !== 'file' || typeof data.content !== 'string') return { ok: false };
  try {
    return { ok: true, content: clip(decodeBase64Utf8(data.content), MAX_FILE) };
  } catch {
    return { ok: false };
  }
}

/** Find the files that reference a symbol across the repo — the real callers a diff can't see.
 *  NOTE: GitHub code search REQUIRES a token even for PUBLIC repos, so with no token this degrades
 *  cleanly to "no callers found" rather than erroring. Best-effort; read-only. */
export async function searchCallers(
  symbol: string,
  repo?: string,
): Promise<{ ok: boolean; files: string[] }> {
  const r = parseRepo(repo);
  const term = (symbol ?? '').trim();
  if (!r || !/^[A-Za-z_$][\w$]*$/.test(term)) return { ok: false, files: [] };
  const q = encodeURIComponent(`${term} repo:${r.slug}`);
  const res = await get(`${API}/search/code?q=${q}&per_page=20`, ACCEPT_JSON, '');
  if (!res.ok) return { ok: false, files: [] };
  const data = (await res.res.json().catch(() => ({}))) as { items?: unknown };
  const items = Array.isArray(data.items) ? (data.items as Array<{ path?: unknown }>) : [];
  const files = items
    .map((i) => i?.path)
    .filter((p): p is string => typeof p === 'string')
    .slice(0, 20);
  return { ok: true, files };
}

/** Read the repo's CODEOWNERS file (the real ownership contract), trying the standard locations.
 *  Returns the raw text, or '' if there isn't one. Read-only. */
export async function fetchCodeowners(repo?: string, ref?: string): Promise<string> {
  for (const p of ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']) {
    const r = await fetchFileContents(p, ref, repo);
    if (r.ok && r.content) return r.content;
  }
  return '';
}

/** The recent committers to a path — the real "who to ask / who to wake" when there's no CODEOWNERS.
 *  The REST API has no line-level blame; recent committers is the closest read-only proxy. */
export async function fetchFileCommits(
  path: string,
  repo?: string,
  ref?: string,
): Promise<Committer[]> {
  const r = parseRepo(repo);
  const clean = (path ?? '').trim();
  if (!r || !clean || clean.includes('..')) return [];
  const q = new URLSearchParams({ path: clean, per_page: '10' });
  const refPart = (ref ?? '').trim();
  if (refPart) q.set('sha', refPart);

  const res = await get(
    `${API}/repos/${r.owner}/${r.name}/commits?${q.toString()}`,
    ACCEPT_JSON,
    '',
  );
  if (!res.ok) return [];
  const data = (await res.res.json().catch(() => [])) as Array<{
    author?: { login?: unknown };
    commit?: { author?: { name?: unknown } };
  }>;
  const counts = new Map<string, number>();
  if (Array.isArray(data)) {
    for (const c of data) {
      const login =
        (typeof c?.author?.login === 'string' && c.author.login) ||
        (typeof c?.commit?.author?.name === 'string' && c.commit.author.name) ||
        '';
      if (login) counts.set(login, (counts.get(login) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}
