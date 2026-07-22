// connectors.mjs — the action connectors, kept pure so they're testable.
//
// One connector per action id from the app's catalog (src/live/actions/catalog.ts).
// Each takes the args the user confirmed and the gateway's environment (which holds the
// credentials), performs the real call, and returns a plain { ok, status, detail }. No
// HTTP server, no process globals: env and fetch are passed in, so a test can drive every
// path — unconfigured, bad input, upstream success, upstream failure — without a socket.
//
// Credentials live ONLY here, in the deployment's environment — never in the browser. This
// is the single shared gateway model: the self-hoster connects their own accounts once
// (one Google OAuth token, one GitHub token) and everyone using that deployment acts
// through them. Per-visitor OAuth would need a stateful backend; that's deliberately out
// of scope.
import { augmentEnv, freshGoogleToken } from './tokenStore.mjs';

/** A connector failed because the deployment hasn't supplied its credentials yet. */
function unconfigured(detail) {
  return { ok: false, status: 503, detail };
}

/** The user (or model) sent something the connector can't use. */
function badRequest(detail) {
  return { ok: false, status: 400, detail };
}

/** The upstream service rejected the call. */
function upstreamFailed(service, status, detail) {
  return {
    ok: false,
    status: 502,
    detail: detail || `${service} rejected the request (${status}).`,
  };
}

// --- input hygiene ---------------------------------------------------------------------
// Args originate from model output the user confirmed — trusted to a point, but a confirmed
// string can still carry control characters or be unbounded. Cap length (abuse / cost) and,
// for anything interpolated into an API path or request, collapse CR/LF so a crafted value
// can't smuggle in structure the connector didn't intend.
const MAX = {
  title: 200,
  body: 16000,
  notes: 4000,
  diff: 200000,
  file: 24000,
};

/** GitHub's own name charset — owners/repos are interpolated into the API path, so a crafted value
 *  (slashes, .., query chars) must not be able to retarget the request. */
const GH_NAME = /^[A-Za-z0-9._-]+$/;

const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);
const oneLine = (s) => s.replace(/[\r\n]+/g, ' ').trim();

// --- Google Calendar -------------------------------------------------------------------
async function calendarAddEvent(args, env, fetchImpl) {
  const token = (await freshGoogleToken(fetchImpl)) ?? env.GOOGLE_OAUTH_TOKEN;
  if (!token) {
    return unconfigured('Google Calendar isn’t set up — connect Google in the Actions settings.');
  }
  const title = clip(oneLine(args.title ?? ''), MAX.title);
  const start = (args.start ?? '').trim();
  if (!title || !start)
    return badRequest('A calendar event needs at least a title and a start time.');

  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return badRequest(`Couldn’t read the start time: “${start}”.`);
  const durationMin = Number(args.durationMin) > 0 ? Number(args.durationMin) : 60;
  const endIso = new Date(startMs + durationMin * 60_000).toISOString();

  const res = await fetchImpl('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: title,
      description: clip(String(args.notes ?? ''), MAX.notes),
      start: { dateTime: new Date(startMs).toISOString() },
      end: { dateTime: endIso },
    }),
  });
  if (!res.ok) return upstreamFailed('Google Calendar', res.status);
  return { ok: true, status: 200, detail: `Added “${title}” to your calendar.` };
}

// --- GitHub ----------------------------------------------------------------------------
// Opens a DRAFT pull request only — draft PRs can't be merged until the user explicitly
// marks them ready. The connector has no delete or merge path; it can only create.
async function githubOpenDraftPr(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) {
    return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  }

  const [owner, repo] = (env.GITHUB_DEFAULT_REPO || '').split('/');
  if (!owner || !repo) {
    return unconfigured(
      'Set a default repo in the Actions settings (owner/repo format) before opening a PR.',
    );
  }
  // owner/repo are interpolated straight into the API path — restrict to GitHub's own name
  // charset so a crafted value (slashes, .., query chars) can't retarget the request.
  const GH_NAME = /^[A-Za-z0-9._-]+$/;
  if (!GH_NAME.test(owner) || !GH_NAME.test(repo)) {
    return badRequest('Repo must be owner/name using letters, numbers, “.”, “_” or “-” only.');
  }

  const title = clip(oneLine(args.title ?? ''), MAX.title);
  const head = oneLine(args.head ?? '').trim();
  const base = oneLine(args.base ?? 'main').trim();
  if (!title || !head) return badRequest('A PR needs a title and a branch name.');

  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'mavea-gateway/1',
      accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      title,
      head,
      base,
      body: clip(String(args.body ?? ''), MAX.body),
      draft: true,
    }),
  });
  if (!res.ok) return upstreamFailed('GitHub', res.status);
  const data = await res.json();
  return { ok: true, status: 200, detail: `Draft PR opened: ${data.html_url}` };
}

// Resolve and validate an owner/repo from the arg (or the configured default). Returns
// { owner, repo } or an error result the caller returns as-is.
function resolveRepo(args, env) {
  const repoArg = oneLine(args.repo ?? '') || env.GITHUB_DEFAULT_REPO || '';
  const [owner, repo] = repoArg.split('/');
  if (!owner || !repo) {
    return {
      err: unconfigured(
        'Provide a repo (owner/name), or set a default repo in the Actions settings.',
      ),
    };
  }
  if (!GH_NAME.test(owner) || !GH_NAME.test(repo)) {
    return {
      err: badRequest('Repo must be owner/name using letters, numbers, “.”, “_” or “-” only.'),
    };
  }
  return { owner, repo };
}

// READ-ONLY. Fetch a pull request's metadata + unified diff. There is no merge/comment/approve
// path here — Ripple only ever READS through this connector.
async function githubGetPrDiff(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  const r = resolveRepo(args, env);
  if (r.err) return r.err;
  const { owner, repo } = r;
  const num = oneLine(args.prNumber ?? '').trim();
  if (!/^\d+$/.test(num)) return badRequest('PR number must be a number, e.g. 4821.');

  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${num}`;
  const auth = { authorization: `Bearer ${token}`, 'user-agent': 'mavea-gateway/1' };

  const metaRes = await fetchImpl(url, {
    method: 'GET',
    headers: { ...auth, accept: 'application/vnd.github+json' },
  });
  if (!metaRes.ok) {
    return upstreamFailed(
      'GitHub',
      metaRes.status,
      metaRes.status === 404 ? `PR #${num} not found in ${owner}/${repo}.` : undefined,
    );
  }
  const pr = await metaRes.json();

  const diffRes = await fetchImpl(url, {
    method: 'GET',
    headers: { ...auth, accept: 'application/vnd.github.v3.diff' },
  });
  if (!diffRes.ok) return upstreamFailed('GitHub', diffRes.status);
  const diff = clip(await diffRes.text(), MAX.diff);

  return {
    ok: true,
    status: 200,
    detail: `Loaded PR #${num}: ${pr.title ?? ''}`.trim(),
    payload: {
      kind: 'diff',
      diff,
      label: `${owner}/${repo} #${num}`,
      title: pr.title ?? '',
      branch: pr.head?.ref ?? '',
      base: pr.base?.ref ?? '',
    },
  };
}

// READ-ONLY. The unified diff between two refs (base...head) — a branch, tag, or commit SHA — so you
// can run Ripple on a branch's changes, not just an open PR. Reads only; never writes.
async function githubCompareRefs(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  const r = resolveRepo(args, env);
  if (r.err) return r.err;
  const { owner, repo } = r;
  const baseRef = oneLine(args.base ?? '').trim();
  const headRef = oneLine(args.head ?? '').trim();
  if (!baseRef || !headRef)
    return badRequest('Provide a base and a head ref (branch, tag, or SHA).');

  // Refs can contain "/" and ".", so encode each side; owner/repo are already charset-validated.
  const range = `${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/compare/${range}`;
  const diffRes = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': 'mavea-gateway/1',
      accept: 'application/vnd.github.v3.diff',
    },
  });
  if (!diffRes.ok) return upstreamFailed('GitHub', diffRes.status);
  const diff = clip(await diffRes.text(), MAX.diff);

  return {
    ok: true,
    status: 200,
    detail: `Compared ${baseRef}...${headRef} in ${owner}/${repo}`,
    payload: { kind: 'diff', diff, label: `${owner}/${repo} ${baseRef}...${headRef}` },
  };
}

// READ-ONLY. The file tree of a repo at a ref (default HEAD) — so Ripple can explore a whole repo or
// a folder with no change at all (the onboarding view). Returns just the blob paths; reads only.
// Resolves `ref` to its concrete commit FIRST: a branch/tag name is a moving target, so two calls made
// moments apart could otherwise silently see different code, and there'd be nothing stable to cache
// against. The commit's own tree SHA is then an immutable snapshot to read.
async function githubGetRepoTree(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  const r = resolveRepo(args, env);
  if (r.err) return r.err;
  const { owner, repo } = r;
  const ref = oneLine(args.ref ?? '') || 'HEAD';
  const auth = {
    authorization: `Bearer ${token}`,
    'user-agent': 'mavea-gateway/1',
    accept: 'application/vnd.github+json',
  };

  const commitRes = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
    { method: 'GET', headers: auth },
  );
  if (!commitRes.ok) {
    return upstreamFailed(
      'GitHub',
      commitRes.status,
      commitRes.status === 404 ? `Couldn’t find ${owner}/${repo} @ ${ref}.` : undefined,
    );
  }
  const commit = await commitRes.json();
  const commitSha = typeof commit.sha === 'string' ? commit.sha : ref;
  const treeSha = commit.commit?.tree?.sha || commitSha;

  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`;
  const res = await fetchImpl(url, { method: 'GET', headers: auth });
  if (!res.ok) {
    return upstreamFailed(
      'GitHub',
      res.status,
      res.status === 404 ? `Couldn’t find ${owner}/${repo} @ ${ref}.` : undefined,
    );
  }
  const data = await res.json();
  // Cap the path count so a giant monorepo can't balloon the response; flag if GitHub truncated it.
  const paths = Array.isArray(data.tree)
    ? data.tree
        .filter((t) => t && t.type === 'blob' && typeof t.path === 'string')
        .map((t) => t.path)
        .slice(0, 4000)
    : [];

  return {
    ok: true,
    status: 200,
    detail: `Loaded ${paths.length} files from ${owner}/${repo}`,
    payload: {
      kind: 'tree',
      paths,
      label: `${owner}/${repo}`,
      truncated: Boolean(data.truncated) || paths.length >= 4000,
      // The exact commit `ref` resolved to — a stable identity to cache against, even when `ref`
      // itself is a branch name that can move.
      sha: commitSha,
    },
  };
}

// READ-ONLY. The contents of one file at a ref — so Ripple can read the actual code a change touches,
// not just the diff. Decodes GitHub's base64 blob to text. Reads only.
async function githubGetFileContents(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  const r = resolveRepo(args, env);
  if (r.err) return r.err;
  const { owner, repo } = r;
  const path = (args.path ?? '').trim();
  if (!path || path.includes('..')) return badRequest('Provide a file path inside the repo.');
  const ref = oneLine(args.ref ?? '') || 'HEAD';

  const segs = path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${segs}?ref=${encodeURIComponent(ref)}`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': 'mavea-gateway/1',
      accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    return upstreamFailed(
      'GitHub',
      res.status,
      res.status === 404 ? `${path} not found.` : undefined,
    );
  }
  const data = await res.json();
  if (data.type !== 'file' || typeof data.content !== 'string') {
    return badRequest('That path is not a file.');
  }
  const text = clip(Buffer.from(data.content, 'base64').toString('utf8'), MAX.file);
  return {
    ok: true,
    status: 200,
    detail: `Read ${path}`,
    payload: { kind: 'file', path, content: text },
  };
}

// READ-ONLY. Find where a symbol is used across the repo (GitHub code search). Grounds the real blast
// radius a diff can't see — the actual callers. Reads only; returns the file paths that match.
async function githubSearchCode(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  const r = resolveRepo(args, env);
  if (r.err) return r.err;
  const { owner, repo } = r;
  const term = (args.query ?? '').trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(term))
    return badRequest('Search term must be a single identifier.');

  const q = encodeURIComponent(`${term} repo:${owner}/${repo}`);
  const url = `https://api.github.com/search/code?q=${q}&per_page=20`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': 'mavea-gateway/1',
      accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return upstreamFailed('GitHub', res.status);
  const data = await res.json();
  const files = Array.isArray(data.items)
    ? data.items
        .map((i) => i && i.path)
        .filter((p) => typeof p === 'string')
        .slice(0, 20)
    : [];
  return {
    ok: true,
    status: 200,
    detail: `${files.length} file(s) reference ${term}`,
    payload: { kind: 'search', term, files },
  };
}

// READ-ONLY. The recent committers to a path — a real "who to ask / who to wake" signal when a repo
// has no CODEOWNERS (the REST API has no line-level blame; recent committers is the closest read-only
// proxy). Reads only; returns logins with their commit counts, most active first.
async function githubGetFileCommits(args, env, fetchImpl) {
  const token = env.GITHUB_OAUTH_TOKEN;
  if (!token) return unconfigured("GitHub isn't set up — connect GitHub in the Actions settings.");
  const r = resolveRepo(args, env);
  if (r.err) return r.err;
  const { owner, repo } = r;
  const path = (args.path ?? '').trim();
  if (!path || path.includes('..')) {
    return badRequest('Provide a file or folder path inside the repo.');
  }
  const ref = oneLine(args.ref ?? '');
  const q = new URLSearchParams({ path, per_page: '10' });
  if (ref) q.set('sha', ref);
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?${q.toString()}`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': 'mavea-gateway/1',
      accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return upstreamFailed('GitHub', res.status);
  const data = await res.json();
  const counts = new Map();
  if (Array.isArray(data)) {
    for (const c of data) {
      const login = c?.author?.login || c?.commit?.author?.name;
      if (typeof login === 'string' && login) counts.set(login, (counts.get(login) ?? 0) + 1);
    }
  }
  const committers = [...counts.entries()]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return {
    ok: true,
    status: 200,
    detail: `${committers.length} recent committer(s) to ${path}`,
    payload: { kind: 'commits', path, committers },
  };
}

/** action id → connector. The id is also the proxy route the app POSTs to. */
const CONNECTORS = {
  'calendar.addEvent': calendarAddEvent,
  'github.openDraftPr': githubOpenDraftPr,
  // Read-only — Ripple fetches diffs / trees / files / code-search / committers to analyze; never writes.
  'github.getPrDiff': githubGetPrDiff,
  'github.compareRefs': githubCompareRefs,
  'github.getRepoTree': githubGetRepoTree,
  'github.getFileContents': githubGetFileContents,
  'github.searchCode': githubSearchCode,
  'github.getFileCommits': githubGetFileCommits,
};

/** The action ids this gateway knows how to run. */
export const SUPPORTED_ACTIONS = Object.keys(CONNECTORS);

/**
 * Run a confirmed action. Pure: pass the env that holds the credentials and a fetch
 * implementation (defaults to the global). Never throws — a network error becomes an
 * honest { ok:false } the surface can show.
 */
export async function runConnector(id, args, env = process.env, fetchImpl = fetch) {
  const connector = CONNECTORS[id];
  if (!connector) return { ok: false, status: 404, detail: `No connector for “${id}”.` };
  try {
    const augmented = augmentEnv(env);
    return await connector(args && typeof args === 'object' ? args : {}, augmented, fetchImpl);
  } catch {
    return { ok: false, status: 502, detail: `Couldn’t reach the connector for “${id}”.` };
  }
}
