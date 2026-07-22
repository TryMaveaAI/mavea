// codeContext.ts — read the REAL code behind a change, so the analysis is grounded in what the repo
// actually does, not just the diff. For a change sourced from a connected repo, this fetches the
// changed files' contents and searches the repo for the actual callers of the changed symbols — the
// blast radius a diff alone can't see. Strictly read-only (it only calls the read connectors), bounded
// (a few files + a few symbols), and best-effort: it never throws and returns '' when nothing loads.
import { fetchFileContents, searchCallers } from './githubBrowser';
import type { ShipModel } from '../model';

const MAX_FILES = 3;
const MAX_SYMBOLS = 4;
const EXCERPT_LINES = 80;

/** Parse the owner/repo out of a Ripple label like "owner/repo #42" or "owner/repo main...head". */
export function repoFromLabel(label?: string): string | undefined {
  if (!label) return undefined;
  const m = /^([\w.-]+\/[\w.-]+)/.exec(label.trim());
  return m?.[1];
}

/** Build a compact "real code" context block (file excerpts + actual callers) for the model to ground
 *  its cascade and blast in. `repo` is owner/name; `ref` defaults to the repo's HEAD. */
export async function gatherCodeContext(
  floor: ShipModel,
  repo: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<string> {
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
  if (signal?.aborted) return '';

  for (const { file, r } of fileResults) {
    if (r.ok && r.content) {
      const excerpt = r.content.split('\n').slice(0, EXCERPT_LINES).join('\n');
      parts.push(`FILE ${file}:\n${excerpt}\n`);
    }
  }

  const callerLines: string[] = [];
  for (const { symbol, r } of callerResults) {
    if (r.ok && r.files.length) {
      const others = r.files.filter((p) => !files.includes(p)).slice(0, 6);
      if (others.length) callerLines.push(`- ${symbol} is referenced in: ${others.join(', ')}`);
    }
  }
  if (callerLines.length) {
    parts.push(
      `REAL CALLERS found across ${repo} (the blast a diff can't see):\n${callerLines.join('\n')}\n`,
    );
  }

  return parts.join('\n');
}
