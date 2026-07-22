// buildRepo.ts — turn a repo's (or a folder's) file tree into an onboarding ShipModel, with no
// change at all. This is the "understand the whole service" path: it groups the real files into
// areas/modules and lays out the repo's structure, so a new hire (or a team landing in code they
// didn't write) can read the shape of it. Deterministic and honest — it only ever describes files
// that exist; a connected model can later add a one-line purpose per area, but the floor stands alone.
import type { ShipModel, ShipModule, ShipNode, ShipEdge } from '../model';

/** The area a file belongs to: its directory, collapsed to at most two segments so a deep tree still
 *  groups into a readable handful of modules (src/auth/oauth/… → src/auth). */
function areaOfPath(path: string): string {
  const slash = path.lastIndexOf('/');
  const dir = slash > 0 ? path.slice(0, slash) : '';
  if (!dir) return '(root)';
  return dir.split('/').slice(0, 2).join('/');
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** A light, honest purpose guess from the area name — never a fabricated claim, just a hint a model
 *  can sharpen. Returns '' when nothing obvious matches (the UI then shows the file count alone). */
function purposeOf(area: string): string {
  const a = area.toLowerCase();
  if (/\b(api|routes?|server|http|controllers?|handlers?)\b/.test(a))
    return 'Routes + request handling.';
  if (/\b(auth|identity|session|login)\b/.test(a)) return 'Tokens, sessions, permissions.';
  if (/\b(db|data|models?|schema|migrations?|store)\b/.test(a))
    return 'Schemas, queries, persistence.';
  if (/\b(billing|payments?|charge|orders?)\b/.test(a)) return 'The money path.';
  if (/\b(jobs?|workers?|queue|tasks?|cron)\b/.test(a)) return 'Async / background work.';
  if (/\b(ui|components?|views?|pages?|client|web)\b/.test(a)) return 'The user interface.';
  if (/\b(tests?|__tests__|spec|e2e)\b/.test(a)) return 'Tests.';
  if (/\b(lib|utils?|shared|common|helpers?)\b/.test(a)) return 'Shared utilities.';
  if (/\b(config|infra|deploy|ci|scripts?)\b/.test(a)) return 'Config + tooling.';
  if (/\b(webhooks?|events?|integrations?|connectors?)\b/.test(a))
    return 'Outbound events / integrations.';
  return '';
}

/** Pick a representative entry file for an area (an index/main/mod, else the shortest path). */
function entryOf(files: string[]): string {
  const named = files.find((f) => /\/(index|main|mod|app|server)\.[a-z]+$/i.test(f));
  if (named) return named;
  return [...files].sort((a, b) => a.length - b.length)[0] ?? files[0] ?? '';
}

/** Build the onboarding ShipModel from a flat list of file paths. `label` is the repo (or folder). */
export function buildShipFromPaths(
  paths: readonly string[],
  label: string,
  truncated = false,
): ShipModel {
  const files = paths.filter((p) => typeof p === 'string' && p.length > 0);

  // Group files into areas, preserving first-seen order for stable output.
  const byArea = new Map<string, string[]>();
  for (const f of files) {
    const area = areaOfPath(f);
    (byArea.get(area) ?? byArea.set(area, []).get(area)!).push(f);
  }
  // Largest areas first — the modules a newcomer should meet first.
  const areas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length);

  const modules: ShipModule[] = areas.map(([area, areaFiles], i) => {
    const entry = entryOf(areaFiles);
    const count = `${areaFiles.length} file${areaFiles.length === 1 ? '' : 's'}`;
    const purpose = purposeOf(area);
    return {
      id: `m${i}`,
      name: area,
      purpose: purpose || count,
      entry,
      owner: '',
      health: count,
      // Always say something concrete — the file count and where to start reading — so "Mavéa
      // explains" is never empty; a connected model sharpens it into a real purpose.
      explain:
        `${purpose ? purpose + ' ' : ''}${count} in ${area}.` +
        (entry ? ` Start with ${basename(entry)} and follow what it imports.` : ''),
      startHere: areaFiles.slice(0, 3).map(basename),
      depends: [],
      usedBy: [],
    };
  });

  const repoName = label.split('/').pop() || label;
  const nodes: ShipNode[] = [
    { id: 'pr', label: repoName, sub: 'THIS REPO', type: 'pr', status: 'affected', scope: 'in-pr' },
  ];
  const edges: ShipEdge[] = [];
  // Cap the map to the busiest areas so a large repo stays legible; the module list keeps all.
  const mapped = areas.slice(0, 9);
  mapped.forEach(([area, areaFiles], i) => {
    const id = `n${i}`;
    const entry = entryOf(areaFiles);
    nodes.push({
      id,
      label: area,
      sub: `${areaFiles.length} file${areaFiles.length === 1 ? '' : 's'}`,
      type: 'module',
      status: 'affected',
      scope: 'in-pr',
      // Give the node something to show when clicked (the inspect panel reads `contract`).
      contract:
        `${purposeOf(area) || `${areaFiles.length} files`}` +
        (entry ? ` · start with ${basename(entry)}` : ''),
    });
    edges.push({ from: 'pr', to: id, verb: 'contains', status: 'affected' });
  });

  const topAreas = areas
    .slice(0, 4)
    .map(([a]) => a)
    .join(', ');

  return {
    pr: {
      repo: label,
      title: `${files.length} file${files.length === 1 ? '' : 's'}`,
      files: files.length,
      summary:
        `${label} — ${files.length} file${files.length === 1 ? '' : 's'} across ${byArea.size} ` +
        `area${byArea.size === 1 ? '' : 's'}${topAreas ? ` (${topAreas})` : ''}. ` +
        `Start with the busiest areas and follow what they touch.`,
      risks: [],
      readScope: `Read the repo tree: ${files.length} file${files.length === 1 ? '' : 's'}.`,
    },
    nodes,
    edges,
    changes: [],
    cascades: [],
    rollout: [],
    workTypes: [],
    hotspots: [],
    suggestions: [],
    suppressedNits: 0,
    modules,
    onboarding: {
      firstWeek: areas.slice(0, 5).map(([area, areaFiles]) => ({
        team: area.toUpperCase(),
        title: area,
        sub: purposeOf(area) || `${areaFiles.length} files`,
        file: entryOf(areaFiles),
      })),
      requestLife: [],
    },
    gate: {
      decision: 'watch',
      shipSafe: false,
      unackedP0: 0,
      requires: [],
      deployOrder: 'unset',
      conditions: [],
      rationale: 'Exploring the repo — there’s no change to gate here.',
    },
    provenance: {
      source: 'github',
      example: false,
      notes: [
        `Exploring ${label} — ${files.length} files grouped into ${byArea.size} areas.`,
        'This is the code as it stands, not a change. The gate and diff views don’t apply.',
        ...(areas.length > mapped.length
          ? [`The map shows the ${mapped.length} busiest areas; the full list is in Onboarding.`]
          : []),
        ...(truncated ? ['Large repo — only the first slice of files was read.'] : []),
      ],
    },
  };
}
