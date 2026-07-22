// parseGitHubUrl.ts — the single smart input for the GitHub-first front door. Paste anything that
// points at code on GitHub — a PR URL, a compare URL, a tree/blob URL, a bare repo URL, or a shorthand
// like `owner/repo`, `owner/repo#123`, or `#123` (with a connected default repo) — and this works out
// what to fetch. Far less friction than separate PR#/base/head/folder fields. Pure + fully tested;
// the overlay maps the result onto the existing read-only connectors (fetchPrDiff/compareRefs/fetchRepoTree).
// Repo/owner names are validated against the gateway's own GH_NAME pattern so a bad input fails here,
// not at the network.

const NAME = /^[A-Za-z0-9._-]+$/;

export type GitHubTarget =
  | { kind: 'pr'; repo: string; prNumber: string }
  | { kind: 'compare'; repo: string; base: string; head: string }
  | { kind: 'tree'; repo: string; ref?: string; path?: string }
  | { kind: 'repo'; repo: string }
  | { kind: 'invalid'; reason: string };

const invalid = (reason: string): GitHubTarget => ({ kind: 'invalid', reason });

/** Work out what a pasted GitHub reference points at. `defaultRepo` (the connected repo) lets bare
 *  `#123` / `123` resolve to a PR. */
export function parseGitHubInput(raw: string, defaultRepo?: string): GitHubTarget {
  const input = raw.trim().replace(/^git@github\.com:/i, 'github.com/');
  if (!input) return invalid('Paste a GitHub PR, compare, or repo URL — or owner/repo#123.');

  // The `owner/repo/...` path — from a full github.com URL (any protocol/www), OR a host-less form
  // like `owner/repo/pull/33` (what people naturally type when they drop the domain).
  const host = input.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const onHost = /^github\.com\/(.+)$/i.exec(host);
  const hostless = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/(?:pull|pulls|compare|tree|blob)\b/i.test(
    input,
  );
  const pathStr = onHost ? onHost[1]! : hostless ? input : null;
  if (pathStr) {
    const rest = pathStr.split('#')[0]!.split('?')[0]!.replace(/\/+$/, '');
    const segs = rest.split('/');
    const owner = segs[0] ?? '';
    const repoName = (segs[1] ?? '').replace(/\.git$/, '');
    if (!owner || !repoName || !NAME.test(owner) || !NAME.test(repoName)) {
      return invalid('That GitHub URL is missing an owner/repo.');
    }
    const repo = `${owner}/${repoName}`;
    const kind = segs[2];
    const tail = segs.slice(3);
    if (!kind) return { kind: 'repo', repo };
    if (kind === 'pull' || kind === 'pulls') {
      const n = (tail[0] ?? '').replace(/\D.*$/, '');
      return n
        ? { kind: 'pr', repo, prNumber: n }
        : invalid('That pull-request URL has no number.');
    }
    if (kind === 'compare') {
      const spec = decodeURIComponent(tail.join('/'));
      const m = /^(.+?)\.{2,3}(.+)$/.exec(spec);
      return m
        ? { kind: 'compare', repo, base: m[1]!, head: m[2]! }
        : invalid('A compare URL looks like base...head.');
    }
    if (kind === 'tree' || kind === 'blob') {
      const ref = tail[0];
      let path = tail.slice(1).join('/');
      if (kind === 'blob' && path) path = path.replace(/\/?[^/]*$/, ''); // a file → its parent folder
      return { kind: 'tree', repo, ref: ref || undefined, path: path || undefined };
    }
    // github.com/owner/repo/<anything else> — treat as the repo.
    return { kind: 'repo', repo };
  }

  // Shorthands.
  const shortPr = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?#(\d+)$/.exec(input);
  if (shortPr) return { kind: 'pr', repo: `${shortPr[1]}/${shortPr[2]}`, prNumber: shortPr[3]! };

  const shortRepo = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(input);
  if (shortRepo) return { kind: 'repo', repo: `${shortRepo[1]}/${shortRepo[2]}` };

  const bareNum = /^#?(\d+)$/.exec(input);
  if (bareNum) {
    return defaultRepo
      ? { kind: 'pr', repo: defaultRepo, prNumber: bareNum[1]! }
      : invalid('Enter owner/repo#number, or connect a default repo first.');
  }

  return invalid('Paste a GitHub PR, compare, or repo URL — or owner/repo#123.');
}
