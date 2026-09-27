// codeContext.ts — read the REAL code behind a change, so the analysis is grounded in what the repo
// actually does, not just the diff. For a change sourced from a connected repo, this fetches the
// changed files' contents and searches the repo for the actual callers of the changed symbols — the
// blast radius a diff alone can't see. Strictly read-only (it only calls the read connectors), bounded
// (a few files + a few symbols), and best-effort: it never throws and returns '' when nothing loads.
import { fetchFileContents, searchCallers } from './githubBrowser';
import type { NodeStatus, ShipModel } from '../model';

const MAX_FILES = 3;
const MAX_SYMBOLS = 4;
const EXCERPT_LINES = 80;

export interface CallerEvidence {
  symbol: string;
  file: string;
}

export interface CodeEvidence {
  prompt: string;
  callers: CallerEvidence[];
}

/** Parse the owner/repo out of a Ripple label like "owner/repo #42" or "owner/repo main...head". */
export function repoFromLabel(label?: string): string | undefined {
  if (!label) return undefined;
  const m = /^([\w.-]+\/[\w.-]+)/.exec(label.trim());
  return m?.[1];
}

/** Build a compact "real code" context block (file excerpts + actual callers) for the model to ground
 *  its cascade and blast in. `repo` is owner/name; `ref` defaults to the repo's HEAD. */
export async function gatherCodeEvidence(
  floor: ShipModel,
  repo: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<CodeEvidence> {
  const parts: string[] = [];
  const files = floor.changes.map((c) => c.file).slice(0, MAX_FILES);
  const symbols = [...new Set(floor.changes.flatMap((c) => c.symbols ?? []))].slice(0, MAX_SYMBOLS);

  // Fetch the changed-file excerpts and the cross-repo caller searches in ONE parallel wave (bounded
  // by MAX_FILES + MAX_SYMBOLS) instead of awaiting each round-trip in turn.
  const [fileResults, callerResults] = await Promise.all([
    Promise.all(
      files.map((f) =>
        fetchFileContents(f, ref, repo)
          .catch(() => ({ ok: false as const }))
          .then((r) => ({ file: f, r })),
      ),
    ),
    Promise.all(
      symbols.map((s) =>
        searchCallers(s, repo)
          .catch(() => ({ ok: false as const, files: [] }))
          .then((r) => ({ symbol: s, r })),
      ),
    ),
  ]);
  if (signal?.aborted) return { prompt: '', callers: [] };

  for (const { file, r } of fileResults) {
    if (r.ok && r.content) {
      const excerpt = r.content.split('\n').slice(0, EXCERPT_LINES).join('\n');
      parts.push(`FILE ${file}:\n${excerpt}\n`);
    }
  }

  const callerLines: string[] = [];
  const callers: CallerEvidence[] = [];
  for (const { symbol, r } of callerResults) {
    if (r.ok && r.files.length) {
      const others = r.files.filter((p) => !files.includes(p)).slice(0, 6);
      if (others.length) {
        callerLines.push(`- ${symbol} is referenced in: ${others.join(', ')}`);
        callers.push(...others.map((file) => ({ symbol, file })));
      }
    }
  }
  if (callerLines.length) {
    parts.push(
      `REAL CALLERS found across ${repo} (the blast a diff can't see):\n${callerLines.join('\n')}\n`,
    );
  }

  return { prompt: parts.join('\n'), callers };
}

/** Backwards-compatible prompt-only view used by callers that do not need graph enrichment. */
export async function gatherCodeContext(
  floor: ShipModel,
  repo: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await gatherCodeEvidence(floor, repo, ref, signal)).prompt;
}

const callerStatus = (floor: ShipModel, symbols: ReadonlySet<string>): NodeStatus =>
  floor.changes.some(
    (change) => change.risk === 'breaks' && change.symbols?.some((symbol) => symbols.has(symbol)),
  )
    ? 'breaks'
    : 'affected';

/** Promote verified repo-wide callers into the map before model enrichment. These are the central
 *  Ripple finding: unchanged files whose behaviour can move because the PR changes what they call. */
export function mergeCallerEvidence(
  floor: ShipModel,
  evidence: readonly CallerEvidence[],
): ShipModel {
  if (!evidence.length) return floor;
  const changedFiles = new Set(floor.changes.map((change) => change.diff.file));
  const grouped = new Map<string, Set<string>>();
  for (const caller of evidence) {
    if (changedFiles.has(caller.file)) continue;
    const symbols = grouped.get(caller.file) ?? new Set<string>();
    symbols.add(caller.symbol);
    grouped.set(caller.file, symbols);
  }
  if (!grouped.size) return floor;

  const nodes = [...floor.nodes];
  const edges = [...floor.edges];
  const changes = floor.changes.map((change) => ({
    ...change,
    blastRadius: [...(change.blastRadius ?? [])],
    links: [...change.links],
  }));
  const existingLabels = new Set(nodes.map((node) => node.label));

  for (const [file, symbolSet] of [...grouped].slice(0, 12)) {
    if (existingLabels.has(file)) continue;
    const symbols = [...symbolSet];
    const id = `caller:${file}`;
    const related = changes.filter((change) =>
      change.symbols?.some((symbol) => symbolSet.has(symbol)),
    );
    const status = callerStatus(floor, symbolSet);
    nodes.push({
      id,
      label: file,
      sub: 'verified caller outside the diff',
      type: 'module',
      status,
      scope: 'downstream',
      problem: `This unchanged file references ${symbols.join(', ')}, which this PR changes.`,
      fix: 'Inspect this caller and either adapt it in the PR or explicitly accept the changed behavior.',
      cite: { ref: file, evidence: 'verified' },
      altitudeNotes: {
        newgrad: `Start with ${symbols.join(', ')} in the changed file, then follow its use here. This file is not edited by the PR, but its dependency is.`,
        working: `The repository-wide caller search verified this unchanged use of ${symbols.join(', ')}. Check its assumptions and add a focused regression test.`,
        principal:
          'Treat this as a PR-boundary effect: confirm ownership, intended behavior, and rollout coupling before merge.',
      },
    });
    existingLabels.add(file);
    for (const change of related) {
      const sourceId =
        change.blastRadius?.[0] ?? floor.nodes.find((node) => node.type === 'pr')?.id;
      if (sourceId && !edges.some((edge) => edge.from === sourceId && edge.to === id)) {
        edges.push({
          from: sourceId,
          to: id,
          verb: 'is used by',
          status,
          breaking: status === 'breaks',
        });
      }
      change.blastRadius = [...new Set([...(change.blastRadius ?? []), id])];
      change.blastOutside = (change.blastOutside ?? 0) + 1;
      change.links.push({
        name: file,
        ref: file,
        scope: 'downstream',
        status: status === 'breaks' ? 'breaks' : 'affected',
      });
    }
  }
  return { ...floor, nodes, edges, changes };
}
