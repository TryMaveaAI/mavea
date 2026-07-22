// Catalog entries for the `code` family — the fact sheet the Live selector retrieves over
// and the prompt menu is built from. This module carries the DETAIL fields (blurb, requires,
// optional, item shapes, prop hints); the compact selection facts are generated from it into
// facts.generated.ts. It is loaded lazily, only for the families a turn actually reaches, which is
// what keeps per-turn cost proportional to the answer rather than to the library.
//
// After editing, run `pnpm gen:catalog` — a staleness test fails the build otherwise.
import { createMeta, type ComponentCatalog } from '../meta';

export const CATALOG_CODE: ComponentCatalog = [
  createMeta('componentapi', {
    family: 'code',
    dataShapes: ['tabular', 'keyvalue', 'code'],
    requires: ['title', 'component', 'props'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A typed prop/contract reference — every prop of a component or function as a tidy table of name, type, required, default, and description.',
    itemShapes: [{ prop: 'props', text: 'name', textAliases: ['prop', 'param', 'key'] }],
    propHints: {
      component: 'the component or function name, e.g. "<Button>" or "fetchUser()"',
      'props[].type': 'the type signature, e.g. "string"|"() => void"|"\'sm\'|\'md\'|\'lg\'"',
      'props[].required': 'true if the prop must be supplied (marked in the table)',
      'props[].default': 'the default value shown verbatim when the prop is omitted',
    },
    intents: ['reference', 'explain'],
    domains: ['code'],
  }),
  // ── code family ──────────────────────────────────────────────────────────────
  createMeta('stacktrace', {
    family: 'code',
    dataShapes: ['text', 'code'],
    requires: ['title', 'errorType', 'message'],
    optional: ['icon', 'iconColor', 'frames', 'cause', 'fix', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'base',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A formatted error + call stack — error type, message, per-frame file/line/context, root cause, and a plain-language fix.',
    itemShapes: [{ prop: 'frames', text: 'file', textAliases: ['filename', 'path', 'module'] }],
    propHints: {
      errorType: 'e.g. "TypeError"|"ValueError"|"ReferenceError"',
      'frames[].isUser': 'true for app code, false for library/runtime frames',
    },
  }),
  createMeta('syntaxbreakdown', {
    family: 'code',
    dataShapes: ['code', 'text'],
    requires: ['title', 'lines'],
    optional: ['icon', 'iconColor', 'summary', 'runnable', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'Annotated code — each line explained in plain English, with per-token labels for keywords, types, and operators.',
    itemShapes: [{ prop: 'lines', text: 'code', textAliases: ['line', 'source', 'text'] }],
    propHints: {
      'lines[].tokens[].kind': "'keyword'|'type'|'value'|'operator'|'identifier'|'comment'|'other'",
      runnable:
        'true ONLY when every line together forms one complete dependency-free JavaScript/TypeScript snippet; fragments and code needing imports/DOM/server globals must omit it',
    },
  }),
  createMeta('codewalk', {
    family: 'code',
    dataShapes: ['sequence', 'code'],
    requires: ['title', 'steps'],
    optional: ['icon', 'iconColor', 'algorithm', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A step-by-step algorithm walkthrough — numbered steps each with a title, code snippet, and plain-English explanation.',
    itemShapes: [{ prop: 'steps', text: 'title', textAliases: ['name', 'heading', 'label'] }],
  }),
  createMeta('terminal', {
    family: 'code',
    dataShapes: ['code', 'sequence', 'text'],
    requires: ['lines'],
    optional: ['title', 'icon', 'iconColor', 'prompt', 'exitCode', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'base',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A realistic terminal session — prompt-prefixed commands with color-coded stdout/stderr and a final exit-code badge. Use for "run this", CLI/git/npm/docker walkthroughs.',
    itemShapes: [{ prop: 'lines', text: 'text', textAliases: ['line', 'content', 'command'] }],
    propHints: {
      'lines[].kind': "'command'|'stdout'|'stderr'|'comment' (defaults to stdout)",
      prompt: 'the shell prompt shown before commands, e.g. "~/app %"',
    },
    domains: ['code', 'tech', 'data'],
    intents: ['howto', 'explain', 'reference'],
  }),
  createMeta('logstream', {
    family: 'code',
    dataShapes: ['sequence', 'tabular', 'status'],
    requires: ['entries'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: true,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A severity-coded log feed — timestamp, level pill, source tag, message, with per-level volume chips you can filter by. Use for log analysis, incidents, and observability.',
    itemShapes: [{ prop: 'entries', text: 'message', textAliases: ['msg', 'text', 'line'] }],
    propHints: {
      'entries[].level': "'trace'|'debug'|'info'|'warn'|'error'|'fatal'",
    },
    domains: ['code', 'tech', 'data'],
    intents: ['explain', 'track', 'reference'],
  }),
  createMeta('gitgraph', {
    family: 'code',
    dataShapes: ['hierarchy', 'sequence', 'relationship'],
    requires: ['commits'],
    optional: ['title', 'icon', 'iconColor', 'branches', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A git commit graph — branch lanes, merges, tags, and HEAD drawn like `git log --graph`. Use for explaining history, branching strategy, and merges.',
    itemShapes: [{ prop: 'commits', text: 'message', textAliases: ['subject', 'msg', 'title'] }],
    propHints: {
      commits: 'newest first (top); each needs id, message, branch',
      'commits[].parents': 'parent commit id(s) — two parents render as a merge',
      'commits[].head': 'true marks the current HEAD',
    },
    domains: ['code', 'tech'],
    intents: ['explain', 'reference'],
    stringItems: ['branches'],
  }),
  createMeta('queryplan', {
    family: 'code',
    dataShapes: ['hierarchy', 'tabular', 'code'],
    requires: ['nodes'],
    optional: ['title', 'icon', 'iconColor', 'sql', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A database EXPLAIN plan as an indented operation tree — each node with rows, cost, and time, and the bottleneck flagged. Use for "why is this query slow".',
    itemShapes: [{ prop: 'nodes', text: 'op', textAliases: ['operation', 'node', 'name'] }],
    propHints: {
      'nodes[].depth': 'indent level, 0 = root; emit nodes in pre-order',
      'nodes[].slow': 'true on the bottleneck node',
    },
    domains: ['code', 'tech', 'data'],
    intents: ['explain', 'reference'],
  }),
  createMeta('flamegraph', {
    family: 'code',
    dataShapes: ['hierarchy', 'distribution', 'code'],
    requires: ['frames'],
    optional: ['title', 'icon', 'iconColor', 'unit', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 12,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'A CPU flame graph — width is time/samples, depth is the call stack, with the hot path highlighted. Use for profiling and "where is the time going".',
    itemShapes: [{ prop: 'frames', text: 'name', textAliases: ['fn', 'function', 'label'] }],
    propHints: {
      frames:
        'DFS pre-order: a frame is immediately followed by its children; a parent value ≥ the sum of its children',
      'frames[].depth': 'stack depth, 0 = root',
      'frames[].hot': 'true marks the hot path',
    },
    domains: ['code', 'tech', 'data'],
    intents: ['explain', 'quantify'],
  }),
  createMeta('regexscope', {
    family: 'code',
    dataShapes: ['code', 'text'],
    requires: ['pattern', 'parts'],
    optional: ['title', 'icon', 'iconColor', 'flags', 'samples', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A regular-expression explainer — the pattern broken into labeled, color-coded tokens, plus test strings with matched runs highlighted. Use for "explain this regex".',
    itemShapes: [
      { prop: 'parts', text: 'label', textAliases: ['meaning', 'desc', 'explanation'] },
      { prop: 'samples', children: { prop: 'segments', text: 'text' } },
    ],
    propHints: {
      'parts[].kind': "'literal'|'class'|'quantifier'|'group'|'anchor'|'escape'|'other'",
      'samples[].segments[].match': 'true marks a matched run (highlighted)',
    },
    domains: ['code', 'tech'],
    intents: ['explain', 'reference'],
  }),
  createMeta('sequencealign', {
    family: 'code',
    dataShapes: ['sequence', 'tabular', 'text'],
    requires: ['title', 'kind', 'sequences'],
    optional: ['icon', 'iconColor', 'consensus', 'highlightMismatches', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'frontier',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A DNA/RNA/protein sequence alignment — stacked monospace reads with a pinned label column, gaps shown as dashes, optional per-column mismatch tinting, and a majority-consensus row computed from the real reads. Use for comparing reads, mutations/indels, or homologous sequences.',
    itemShapes: [
      { prop: 'sequences', text: 'chars', textAliases: ['sequence', 'seq', 'bases', 'residues'] },
    ],
    propHints: {
      kind: "'dna'|'rna'|'protein' — which alphabet the reads use",
      'sequences[].label': 'a short read/sample/species name shown at the left of its row',
      'sequences[].chars':
        "the aligned sequence itself; use '-' for a gap, same length across reads",
      consensus:
        'any short label (e.g. "Consensus") to show a majority-vote row — the symbols shown are always computed from `sequences`, never taken from this string',
      highlightMismatches: 'true tints any column where the reads disagree',
    },
    domains: ['science', 'code', 'data'],
    intents: ['explain', 'reference', 'quantify'],
  }),
];
