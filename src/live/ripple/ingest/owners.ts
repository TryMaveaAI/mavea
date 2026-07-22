// owners.ts — real, READ-ONLY ownership, so a connected repo answers "who owns this?" honestly. Two
// signals, both just reads: CODEOWNERS (a parsed ownership CONTRACT → evidence "verified"), and, where
// there's no CODEOWNERS rule, the recent committers to a path (the closest read-only "who to ask" proxy
// → evidence "inferred", and always LABELLED as such, never claimed as the owner). When neither exists,
// ownership stays honestly unknown — never invented. Pure helpers (parse/match) + a best-effort
// resolveOwners that merges onto the model and never throws.
import type { ShipModel, ShipModule, ShipNode } from '../model';
import { fetchCodeowners, fetchFileCommits } from './githubBrowser';

/** One CODEOWNERS rule: a path glob and the owners it assigns. */
export interface OwnerRule {
  glob: string;
  owners: string[];
}

/** Parse a CODEOWNERS file into ordered rules. Comments/blank lines are dropped; order is preserved
 *  because the LAST matching rule wins (per the CODEOWNERS spec). */
export function parseCodeowners(text: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const glob = parts[0]!;
    const owners = parts.slice(1).filter((o) => o.includes('@'));
    if (glob && owners.length) rules.push({ glob, owners });
  }
  return rules;
}

/** Translate a CODEOWNERS glob (a gitignore-style pattern) to a RegExp covering the common subset:
 *  leading `/` anchors at root; a trailing `/` (or a bare directory) owns everything beneath; `*`
 *  stops at a path segment, `**` crosses them; a pattern with no slash matches that name anywhere. */
function globToRe(glob: string): RegExp {
  let g = glob.trim();
  const anchored = g.startsWith('/');
  if (anchored) g = g.slice(1);
  const dirOnly = g.endsWith('/');
  if (dirOnly) g = g.replace(/\/+$/, '');
  const hasSlash = g.includes('/');
  const body = g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials (keep * ? /)
    // `**` crosses path segments (.*), a single `*` stops at one ([^/]*), `?` is one non-slash char.
    .replace(/\*+|\?/g, (m) => (m === '?' ? '[^/]' : m.length >= 2 ? '.*' : '[^/]*'));
  const prefix = anchored || hasSlash ? '^' : '(?:^|.*/)';
  // A directory (or any area) also owns everything inside it.
  return new RegExp(`${prefix}${body}(?:/.*)?$`);
}

/** The owners for a path — the LAST matching rule wins, as CODEOWNERS specifies. A `:line` suffix and
 *  any leading slash are stripped first. Returns [] when nothing matches. */
export function ownerForPath(rules: OwnerRule[], path: string): string[] {
  const p = path.replace(/^\/+/, '').replace(/:.*$/, '');
  let owners: string[] = [];
  for (const r of rules) {
    try {
      if (globToRe(r.glob).test(p)) owners = r.owners;
    } catch {
      /* a pattern we can't compile — skip it */
    }
  }
  return owners;
}

const MAX_COMMITTER_LOOKUPS = 6; // bound the extra round-trips when there's no CODEOWNERS

/** Resolve real owners onto a model (modules + impact-map nodes), READ-ONLY and best-effort. CODEOWNERS
 *  matches are verified ownership; where there's none, a few recent-committer lookups fill in an honest
 *  "recent committer" hint. Never throws; returns the model unchanged on any failure. */
export async function resolveOwners(
  model: ShipModel,
  repo: string,
  ref: string | undefined,
  signal?: AbortSignal,
): Promise<ShipModel> {
  try {
    const codeowners = await fetchCodeowners(repo, ref);
    if (signal?.aborted) return model;
    const rules = parseCodeowners(codeowners);

    // CODEOWNERS owners (verified) for every module/node, from one file read — no per-path network.
    const moduleOwner = new Map<string, string>();
    const needCommitter: { id: string; path: string }[] = [];
    for (const m of model.modules) {
      const owners = ownerForPath(rules, m.entry || m.name);
      if (owners.length) moduleOwner.set(m.id, owners.join(', '));
      else if (m.entry || m.name) needCommitter.push({ id: m.id, path: m.entry || m.name });
    }

    // Where CODEOWNERS is silent, ask the repo who's been touching that path lately — bounded, honest,
    // and clearly labelled as a recent committer (NOT a declared owner).
    if (needCommitter.length) {
      const lookups = needCommitter.slice(0, MAX_COMMITTER_LOOKUPS);
      const results = await Promise.all(
        lookups.map(({ id, path }) =>
          fetchFileCommits(path, repo, ref)
            .catch(() => [])
            .then((c) => ({ id, login: c[0]?.login })),
        ),
      );
      if (signal?.aborted) return model;
      for (const { id, login } of results) {
        if (login) moduleOwner.set(id, `${login} · recent committer`);
      }
    }

    if (moduleOwner.size === 0) return model; // nothing real to add — leave ownership unknown

    const ownerForNode = (n: ShipNode): string | undefined => {
      const refPath = n.cite?.ref || n.sub || '';
      if (!refPath) return undefined;
      const owners = ownerForPath(rules, refPath);
      return owners.length ? owners.join(', ') : undefined;
    };

    const modules: ShipModule[] = model.modules.map((m) =>
      moduleOwner.has(m.id) ? { ...m, owner: moduleOwner.get(m.id)! } : m,
    );
    const nodes: ShipNode[] = model.nodes.map((n) => {
      if (n.owner) return n;
      const o = ownerForNode(n);
      return o ? { ...n, owner: o } : n;
    });

    return { ...model, modules, nodes };
  } catch {
    return model;
  }
}
