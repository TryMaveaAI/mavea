// buildShip.ts — turn a parsed diff into a real, grounded ShipModel WITHOUT a model call. The diff
// is ground truth, so EVERYTHING here is derived from the actual changed lines: what each change does
// (a removed export, a changed signature, a new function), which other changed files reference those
// symbols (the in-repo blast a diff CAN see), the impact map's statuses, and a gate computed from the
// worst change. This is the floor every model tier shares — it must read well with no model at all;
// a connected model only sharpens the prose and adds cascades/suggestions on top.
//
// It stays HONEST: a diff shows in-repo references but not cross-repo callers, contracts, or traffic,
// so those are never invented — cross-repo blast is left for the connected-graph moat.
import type {
  ChangeKind,
  ChangeLink,
  GateCondition,
  NodeStatus,
  RiskLevel,
  ShipChange,
  ShipEdge,
  ShipGate,
  ShipMigration,
  ShipModel,
  ShipNode,
} from '../model';
import type { DiffLineKind, ParsedDiff, ParsedFile } from './parseDiff';

const MAX_DIFF_LINES = 60;

function basename(path: string): string {
  return path.split('/').pop() || path;
}
/** Parent directory, the unit changes group by (a module / area / service). */
function areaOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '(root)';
}

// Declaration of a named symbol (function/class/const/type/…), across common languages.
const DECL_RE =
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|interface|type|enum|struct|trait|impl|const|let|var|def|fn|func)\s+([A-Za-z_$][\w$]*)/g;
// A call / signature site: `name(`.
const CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const NOISE = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'function',
  'await',
  'typeof',
  'super',
  'const',
  'let',
  'var',
  'new',
  'class',
  'import',
  'export',
  'require',
  'console',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Promise',
  'Map',
  'Set',
  'Math',
  'JSON',
]);

function matchAll(re: RegExp, text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) if (m[1]) out.push(m[1]);
  return out;
}

function linesOf(f: ParsedFile, kind: DiffLineKind): string[] {
  const out: string[] = [];
  for (const h of f.hunks) for (const l of h.lines) if (l.t === kind) out.push(l.c);
  return out;
}

/** Symbols this file DECLARES in its added or removed lines (the things it defines/changes). */
function declaredSymbols(f: ParsedFile): { added: Set<string>; removed: Set<string> } {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const c of linesOf(f, 'add')) for (const s of matchAll(DECL_RE, c)) added.add(s);
  for (const c of linesOf(f, 'del')) for (const s of matchAll(DECL_RE, c)) removed.add(s);
  return { added, removed };
}

/** A symbol whose call signature changed — its `name(` appears in both a removed and an added line. */
function signatureChange(f: ParsedFile): string | null {
  const delCalls = new Map<string, string>();
  for (const c of linesOf(f, 'del'))
    for (const s of matchAll(CALL_RE, c)) if (!NOISE.has(s)) delCalls.set(s, c);
  for (const c of linesOf(f, 'add')) {
    for (const s of matchAll(CALL_RE, c)) {
      if (NOISE.has(s)) continue;
      const prev = delCalls.get(s);
      if (prev && prev.replace(/\s/g, '') !== c.replace(/\s/g, '')) return s;
    }
  }
  return null;
}

function isTest(p: string): boolean {
  return /\.(test|spec)\.[a-z]+$|(^|\/)(tests?|__tests__|__mocks__|e2e)\//.test(p.toLowerCase());
}
function isMigration(p: string): boolean {
  return /\.sql$|(^|\/)migrations?\//.test(p.toLowerCase());
}
function isConfig(p: string): boolean {
  return /\.(json|ya?ml|toml|ini|env|lock)$|(^|\/)(config|\.config)/.test(p.toLowerCase());
}
function isManifest(p: string): boolean {
  return /(^|\/)(package\.json|cargo\.toml|pyproject\.toml|go\.mod|gemfile|build\.gradle)$/i.test(
    p.toLowerCase(),
  );
}
function isLockfile(p: string): boolean {
  return /(^|\/)(pnpm-lock\.ya?ml|package-lock\.json|yarn\.lock|cargo\.lock|poetry\.lock|go\.sum|gemfile\.lock)$/i.test(
    p.toLowerCase(),
  );
}
/** Dependency version bumps in a manifest: a `"name": "x"` removed and re-added with a new version. */
function packageBumps(f: ParsedFile): string[] {
  const VER = /["']?([@\w./-]+)["']?\s*[:=]\s*["']?[\^~>=<]*\s*([0-9][\w.+-]*)/;
  const olds = new Map<string, string>();
  for (const c of linesOf(f, 'del')) {
    const m = VER.exec(c);
    if (m && m[1] && m[2]) olds.set(m[1], m[2]);
  }
  const bumped: string[] = [];
  for (const c of linesOf(f, 'add')) {
    const m = VER.exec(c);
    if (m && m[1] && m[2] && olds.has(m[1]) && olds.get(m[1]) !== m[2] && !bumped.includes(m[1])) {
      bumped.push(m[1]);
    }
  }
  return bumped;
}

interface Analysis {
  kind: ChangeKind;
  risk: RiskLevel;
  title: string;
  intent: string;
  /** A short verb phrase for the summary, e.g. "changes the validateToken signature". */
  phrase: string;
  risks: { level: RiskLevel; text: string }[];
  /** Symbols this change defines/removes/reshapes — used to resolve in-repo callers. */
  symbols: string[];
}

/** Read a single file's change from its actual diff content — never just its path/stats. */
function analyze(f: ParsedFile): Analysis {
  const name = basename(f.path);
  const { added, removed } = declaredSymbols(f);
  const primary = (s: Set<string>): string | undefined => [...s][0];

  if (f.status === 'deleted') {
    const sym = primary(removed) ?? name;
    return {
      kind: 'breaking',
      risk: 'breaks',
      title: `Remove ${sym}`,
      intent: `Deletes ${sym}${removed.size > 1 ? ' and others' : ''} from ${name}.`,
      phrase: `removes ${sym}`,
      risks: [
        {
          level: 'breaks',
          text: `Anything importing ${sym} breaks — confirm there are no remaining callers.`,
        },
      ],
      symbols: [...removed],
    };
  }
  if (isTest(f.path)) {
    return {
      kind: 'test',
      risk: 'safe',
      title: `Tests in ${name}`,
      intent: `Adds or updates tests in ${name}.`,
      phrase: `adds tests in ${areaOf(f.path)}`,
      risks: [],
      symbols: [],
    };
  }
  if (isMigration(f.path)) {
    const sql = linesOf(f, 'add').join(' ').toUpperCase();
    const heavy = /\bNOT NULL\b|\bDROP\b|\bALTER\b/.test(sql);
    return {
      kind: 'config',
      risk: heavy ? 'breaks' : 'watch',
      title: `Migration ${name}`,
      intent: `A schema change in ${name}.`,
      phrase: `migrates the schema`,
      risks: heavy
        ? [
            {
              level: 'breaks',
              text: `${name} alters a table — on a large table this can lock writes. Check the row count.`,
            },
          ]
        : [],
      symbols: [],
    };
  }
  if (isLockfile(f.path)) {
    return {
      kind: 'config',
      risk: 'safe',
      title: `Lockfile ${name}`,
      intent: `Regenerates ${name} to match the dependency changes — machine-written, not reviewed by hand.`,
      phrase: `updates the lockfile`,
      risks: [],
      symbols: [],
    };
  }
  if (isManifest(f.path)) {
    const bumps = packageBumps(f);
    if (bumps.length > 0) {
      const shown = bumps.slice(0, 4).join(', ');
      const more = bumps.length > 4 ? `, +${bumps.length - 4} more` : '';
      const word = bumps.length === 1 ? 'dependency' : 'dependencies';
      return {
        kind: 'config',
        risk: 'watch',
        title: `Bump ${bumps.length} ${word}`,
        intent: `Updates ${bumps.length} ${bumps.length === 1 ? 'package' : 'packages'} in ${name} (${shown}${more}).`,
        phrase: `bumps ${bumps.length} ${word}`,
        risks: [
          {
            level: 'watch',
            text: `A version bump can carry breaking changes or a compromised release — skim the changelogs for any majors before merging.`,
          },
        ],
        symbols: [],
      };
    }
    return {
      kind: 'config',
      risk: 'watch',
      title: `Update ${name}`,
      intent: `Changes ${name} (scripts or config, not a clean version bump).`,
      phrase: `updates ${name}`,
      risks: [],
      symbols: [],
    };
  }
  if (isConfig(f.path)) {
    return {
      kind: 'config',
      risk: 'watch',
      title: `Config ${name}`,
      intent: `Changes configuration in ${name}.`,
      phrase: `updates ${name}`,
      risks: [],
      symbols: [...added, ...removed],
    };
  }
  if (f.status === 'added') {
    const sym = primary(added);
    return {
      kind: 'behavior',
      risk: 'watch',
      title: sym ? `Add ${sym}` : `Add ${name}`,
      intent: sym
        ? `Adds ${sym}${added.size > 1 ? ' and other symbols' : ''} in ${name}.`
        : `Adds ${name}.`,
      phrase: sym ? `adds ${sym}` : `adds ${name}`,
      risks: [],
      symbols: [...added],
    };
  }
  // Modified — the interesting case.
  const sig = signatureChange(f);
  if (sig) {
    return {
      kind: 'interface',
      risk: 'breaks',
      title: `Change ${sig}() signature`,
      intent: `Changes the call signature of ${sig} in ${name}.`,
      phrase: `changes the ${sig} signature`,
      risks: [
        {
          level: 'breaks',
          text: `Callers of ${sig} on the old shape break — they may still compile but fail at runtime.`,
        },
      ],
      symbols: [sig, ...added, ...removed],
    };
  }
  const removedExport = [...removed].find((s) => !added.has(s));
  if (removedExport) {
    return {
      kind: 'breaking',
      risk: 'breaks',
      title: `Remove ${removedExport}`,
      intent: `Removes ${removedExport} from ${name}.`,
      phrase: `removes ${removedExport}`,
      risks: [
        { level: 'breaks', text: `${removedExport} is gone — anything that referenced it breaks.` },
      ],
      symbols: [...removed],
    };
  }
  const sym = primary(added) ?? primary(removed);
  return {
    kind: 'behavior',
    risk: 'watch',
    title: sym ? `Update ${sym}` : `Update ${name}`,
    intent: sym ? `Reworks ${sym} in ${name}.` : `Updates ${name} (+${f.add} / −${f.del}).`,
    phrase: sym ? `reworks ${sym}` : `updates ${name}`,
    risks: [],
    symbols: [...added, ...removed],
  };
}

function diffLines(f: ParsedFile): { t?: DiffLineKind; c: string }[] {
  const out: { t?: DiffLineKind; c: string }[] = [];
  f.hunks.forEach((h, i) => {
    if (i > 0) out.push({ t: 'ctx', c: '⋯' });
    for (const l of h.lines) {
      out.push({ t: l.t, c: l.c });
      if (out.length >= MAX_DIFF_LINES) return;
    }
  });
  if (out.length >= MAX_DIFF_LINES) out.push({ t: 'ctx', c: '… diff truncated' });
  return out;
}

/** Does a file's diff text reference any of `symbols` as a call? (an in-repo dependent). */
function referencesAny(f: ParsedFile, symbols: Set<string>): boolean {
  if (symbols.size === 0) return false;
  for (const kind of ['add', 'del', 'ctx'] as const) {
    for (const c of linesOf(f, kind)) {
      for (const s of matchAll(CALL_RE, c)) if (symbols.has(s)) return true;
    }
  }
  return false;
}

const worst = (a: RiskLevel, b: RiskLevel): RiskLevel => {
  const rank = { safe: 0, watch: 1, breaks: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};
const nodeStatusFor = (risk: RiskLevel, hasMigration: boolean, allTests: boolean): NodeStatus =>
  risk === 'breaks' ? 'breaks' : hasMigration ? 'migration' : allTests ? 'safe' : 'affected';

/** Build the deterministic, content-aware ShipModel from a parsed diff. */
export function buildShipFromDiff(parsed: ParsedDiff, label?: string): ShipModel {
  const real = parsed.files.filter((f) => !f.binary);
  const analyses = real.map(analyze);

  // Every symbol any change defines/reshapes — so we can find in-repo callers among the OTHER files.
  const changes: ShipChange[] = real.map((f, i) => {
    const a = analyses[i]!;
    const ownSymbols = new Set(a.symbols);
    const links: ChangeLink[] = [];
    real.forEach((other, j) => {
      if (j === i || ownSymbols.size === 0) return;
      if (referencesAny(other, ownSymbols)) {
        links.push({
          name: basename(other.path),
          ref: other.path,
          scope: 'in-pr',
          status: a.risk === 'breaks' ? 'breaks' : 'affected',
        });
      }
    });
    return {
      id: `c${i}`,
      subsystem: areaOf(f.path).toUpperCase(),
      file: f.path,
      kind: a.kind,
      risk: a.risk,
      title: a.title,
      intent: a.intent,
      why: '',
      diff: { file: f.path, add: f.add, del: f.del, lines: diffLines(f) },
      blastRadius: [],
      blastFiles: 1 + links.length,
      blastOutside: 0,
      links,
      risks: a.risks,
      symbols: a.symbols.length ? a.symbols.slice(0, 6) : undefined,
    };
  });

  // Impact map: one node per area, status = the worst change in it. Plus real area→area edges where a
  // change in one area calls a symbol changed in another (the in-repo dependency a diff CAN prove).
  const areaIdx = new Map<string, number>();
  real.forEach((f) => {
    const ar = areaOf(f.path);
    if (!areaIdx.has(ar)) areaIdx.set(ar, areaIdx.size);
  });
  const areaRisk = new Map<string, RiskLevel>();
  const areaMig = new Map<string, boolean>();
  const areaNonTest = new Map<string, boolean>();
  real.forEach((f, i) => {
    const ar = areaOf(f.path);
    areaRisk.set(ar, worst(areaRisk.get(ar) ?? 'safe', analyses[i]!.risk));
    if (isMigration(f.path)) areaMig.set(ar, true);
    if (!isTest(f.path)) areaNonTest.set(ar, true);
  });

  const centerLabel = label || 'this change';
  const nodes: ShipNode[] = [
    {
      id: 'pr',
      label: centerLabel,
      sub: 'THIS CHANGE',
      type: 'pr',
      status: 'affected',
      scope: 'in-pr',
    },
  ];
  const edges: ShipEdge[] = [];
  // Cap the map to the busiest 9 areas (the rest live in the change list) so it stays legible.
  const areas = [...areaIdx.keys()]
    .map((ar) => ({ ar, count: real.filter((f) => areaOf(f.path) === ar).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 9);
  const nodeIdByArea = new Map<string, string>();
  areas.forEach(({ ar, count }, k) => {
    const id = `n${k}`;
    nodeIdByArea.set(ar, id);
    const status = nodeStatusFor(
      areaRisk.get(ar) ?? 'safe',
      !!areaMig.get(ar),
      !areaNonTest.get(ar),
    );
    nodes.push({
      id,
      label: ar,
      sub: `${count} file${count === 1 ? '' : 's'}`,
      type: 'module',
      status,
      scope: 'in-pr',
    });
    edges.push({ from: 'pr', to: id, verb: 'changes', status });
  });
  // Area→area dependency edges from in-repo references (deduped).
  const seenEdge = new Set<string>();
  real.forEach((f, i) => {
    const fromArea = areaOf(f.path);
    const fromId = nodeIdByArea.get(fromArea);
    if (!fromId || analyses[i]!.symbols.length === 0) return;
    const syms = new Set(analyses[i]!.symbols);
    real.forEach((other, j) => {
      if (j === i) return;
      const toArea = areaOf(other.path);
      if (toArea === fromArea) return;
      const toId = nodeIdByArea.get(toArea);
      if (!toId || !referencesAny(other, syms)) return;
      const key = `${toId}->${fromId}`;
      if (seenEdge.has(key)) return;
      seenEdge.add(key);
      edges.push({
        from: toId,
        to: fromId,
        verb: 'calls',
        status: analyses[i]!.risk === 'breaks' ? 'breaks' : 'affected',
      });
    });
  });

  // Gate, computed from the worst change.
  const breaking = changes.filter((c) => c.risk === 'breaks');
  const hasTests = real.some((f) => isTest(f.path));
  const overall: RiskLevel = changes.reduce<RiskLevel>((r, c) => worst(r, c.risk), 'safe');
  const conditions: GateCondition[] = [];
  for (const c of breaking.slice(0, 4)) {
    conditions.push({
      id: `b-${c.id}`,
      label: `breaking change reviewed — ${c.title}`,
      status: 'pending',
      actor: 'human',
    });
  }
  conditions.push({
    id: 'tests',
    label: hasTests ? 'tests touched in this change' : 'a test covers the changed paths',
    status: hasTests ? 'met' : 'pending',
    actor: 'agent',
  });
  conditions.push({
    id: 'human',
    label: 'reviewed and understood by a human',
    status: 'pending',
    actor: 'human',
  });
  const gate: ShipGate = {
    decision: overall === 'breaks' ? 'block' : overall === 'watch' ? 'watch' : 'pass',
    shipSafe: overall === 'safe',
    unackedP0: breaking.length,
    requires: [],
    deployOrder: 'unset',
    conditions,
    rationale: breaking.length
      ? `${breaking.length} breaking change${breaking.length === 1 ? '' : 's'} to clear before merge: ${breaking.map((c) => c.title).join('; ')}. In-repo callers are flagged; cross-repo callers need a connected graph.`
      : overall === 'watch'
        ? 'No outright breaks detected in the diff, but the changed paths warrant a review.'
        : 'Only low-risk changes (tests/config) detected in the diff.',
  };

  // Migration section, if the diff carries a schema change.
  const migFile = real.find((f) => isMigration(f.path));
  const migration: ShipMigration | undefined = migFile
    ? {
        file: migFile.path,
        sql: linesOf(migFile, 'add').slice(0, 6),
        rows: 'unknown',
        lockCost: 'depends on the table size — verify the row count before running',
        expand: [
          {
            title: 'Add it nullable',
            detail: 'Add the column without NOT NULL — instant, no rewrite.',
          },
          {
            title: 'Backfill in batches',
            detail: 'Fill existing rows off-peak so replicas keep up.',
          },
          { title: 'Then set NOT NULL', detail: 'A fast validate once every row is populated.' },
        ],
        note: 'Row count and lock time aren’t in the diff — confirm against the real table before you run it.',
      }
    : undefined;

  const fileWord = real.length === 1 ? 'file' : 'files';
  const areaNames = [...areaIdx.keys()];
  const areaList = areaNames.slice(0, 3).join(', ');
  // A read synthesised from the actual changes, worst-first.
  const rank: Record<RiskLevel, number> = { safe: 0, watch: 1, breaks: 2 };
  const ordered = [...changes].sort((a, b) => rank[b.risk] - rank[a.risk]);
  const lead = analyses
    .slice()
    .sort((a, b) => rank[b.risk] - rank[a.risk])
    .slice(0, 3)
    .map((a) => a.phrase);
  const sentence =
    lead.length > 0
      ? lead.slice(0, -1).join(', ') + (lead.length > 1 ? ' and ' : '') + lead[lead.length - 1]
      : `touches ${real.length} ${fileWord}`;

  return {
    pr: {
      repo: label || '',
      title: `${real.length} ${fileWord} changed`,
      added: parsed.add,
      removed: parsed.del,
      files: real.length,
      p0Ways: breaking.length || undefined,
      summary:
        `This change ${sentence}` +
        (areaList
          ? ` — across ${areaNames.length} area${areaNames.length === 1 ? '' : 's'} (${areaList})`
          : '') +
        `, +${parsed.add} / −${parsed.del}.`,
      // Pull each change's specific risk note to the top (worst-first); fall back to naming the
      // change for a non-safe change that carries no explicit note.
      risks: ordered
        .flatMap((c): { level: RiskLevel; text: string }[] =>
          c.risks && c.risks.length
            ? c.risks
            : c.risk !== 'safe'
              ? [{ level: c.risk, text: `${c.title} — ${c.file}` }]
              : [],
        )
        .slice(0, 3),
      readScope: `Read from the diff: ${real.length} ${fileWord} across ${areaNames.length} area${areaNames.length === 1 ? '' : 's'}.`,
    },
    nodes,
    edges,
    changes,
    cascades: [],
    rollout: [],
    workTypes: [],
    hotspots: [],
    suggestions: [],
    suppressedNits: 0,
    modules: [],
    migration,
    gate,
    provenance: {
      source: 'pasted-diff',
      example: false,
      notes: [
        'Built from the diff itself — what each change does, and the in-repo callers it touches.',
        'Cross-repo callers, contracts, and traffic need a connected graph, so they’re left out rather than guessed.',
      ],
    },
  };
}
