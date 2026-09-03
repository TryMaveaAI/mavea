// links.ts — shared link-building for Ripple. A repo + ref + path only ever becomes a clickable URL
// when it can genuinely resolve to something real; otherwise callers get null and render a plain
// path instead of a link that 404s. Shared by the course's file chips and the Ask rail's citations
// so both features agree on exactly which repos and paths are linkable.

/** A git ref name: a branch, tag or SHA. Slashes are allowed (`feat/short-lived-tokens`), but a
 *  ".." segment is not — it would climb back out of the blob path the URL is built from. */
const REF = /^[\w.-]+(?:\/[\w.-]+)*$/;

/** owner/repo + a ref + a path → a real GitHub blob URL, or null when we can't build one (a shape
 *  that isn't owner/repo, a ref that isn't a ref name, or the worked example's fictional repo,
 *  which would just 404). A path carrying a ":focus" suffix (a lesson's `read` entry, e.g.
 *  "src/auth/token.ts:validateToken") has the suffix stripped — GitHub blob URLs don't understand
 *  it. */
export function fileUrl(repo: string, ref: string, path: string): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  // The worked example uses a fictional repo; don't hand out a 404.
  if (repo === 'acme/auth-service') return null;
  const at = ref || 'HEAD';
  if (!REF.test(at) || at.split('/').includes('..')) return null;
  return `https://github.com/${repo}/blob/${at}/${path.replace(/:.*$/, '')}`;
}
