// code family block types — developer-answer primitives for debugging, learning, and code walkthroughs
// (stack traces with frame-level callouts, annotated syntax breakdowns, step-by-step algorithm walks).
// Prop shapes are realistic & sample-friendly — a data agent fills them later.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared file
// we must not edit), so import it from its canonical source — same type, identical to what
// `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── stacktrace ── formatted error + stack frames (user code highlighted, fix suggested) ── */
// Use for: debugging help, "what does this error mean", "why is my code crashing"
export interface StackFrame {
  file: string; // e.g. "src/app.ts"
  line?: number;
  col?: number;
  fn?: string; // function/method name
  context?: string; // the code line at that position
  isUser?: boolean; // true = user's code (highlight); false = library/internal
}
export interface StackTraceProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  errorType: string; // e.g. "TypeError", "NullPointerException"
  message: string; // the error message
  frames?: StackFrame[];
  cause?: string; // root cause or inner exception
  fix?: string; // suggested fix in plain language
  footer?: HtmlString;
}

/* ── syntaxbreakdown ── annotated code with per-token/line explanations ── */
// Use for: "explain this code", "what does this line do", learning new syntax
export interface SyntaxToken {
  code: string; // the code fragment
  label: string; // what it is/does
  kind?: 'keyword' | 'type' | 'value' | 'operator' | 'identifier' | 'comment' | 'other';
}
export interface SyntaxLine {
  code: string; // the full line of code
  tokens?: SyntaxToken[];
  explanation?: string; // line-level explanation
}
export interface SyntaxBreakdownProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  lang?: string; // programming language
  lines: SyntaxLine[];
  summary?: string; // overall purpose of the snippet
  /** True only when all lines form one complete, dependency-free executable snippet. */
  runnable?: boolean;
  footer?: HtmlString;
}

/* ── codewalk ── step-by-step walkthrough of an algorithm or code path ── */
export interface CodeWalkStep {
  step: number;
  title: string;
  code?: string; // the relevant code snippet
  lang?: string;
  explanation: string;
}
export interface CodeWalkProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  algorithm?: string; // e.g. "Binary Search", "Quick Sort"
  steps: CodeWalkStep[];
  footer?: HtmlString;
}

/* ── componentapi ── typed prop/contract reference for a component or function ── */
// Use for: "show me ALL the props/API of X" — a clean table of every prop with
// its type, whether it's required, its default, and a one-line description.
export interface ApiProp {
  name: string; // the prop / parameter name
  type: string; // its type signature, e.g. "string" | "() => void" | "'sm'|'md'|'lg'"
  required?: boolean; // true = must be supplied (marked in the table)
  default?: string; // the default value when omitted (shown verbatim)
  desc?: string; // a one-line description of what it does
}
export interface ComponentApiProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  component: string; // the component / function name, e.g. "<Button>" or "fetchUser()"
  props: ApiProp[]; // the documented prop/contract rows
  footer?: HtmlString;
}

/* ── terminal ── a realistic shell session: prompt-prefixed commands + color-coded output ── */
// Use for: "run this command", CLI walkthroughs, git/npm/docker sessions, "what will I see"
export interface TerminalLine {
  /** What this line is: a typed command, normal output, an error, or an inline comment.
   *  Defaults to 'stdout' so a bare string array still renders as output. */
  kind?: 'command' | 'stdout' | 'stderr' | 'comment';
  text: string; // the command (without the prompt) or a line of output
  prompt?: string; // per-command prompt override; falls back to the session `prompt`
}
export interface TerminalProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  prompt?: string; // the default prompt shown before command lines, e.g. "~/app %"
  lines: TerminalLine[]; // the session transcript, top to bottom
  exitCode?: number; // final exit code badge (0 = success, non-zero = failure)
  caption?: string; // one-line takeaway under the session
  footer?: HtmlString;
}

/* ── logstream ── a severity-coded application log feed with per-level volume + filtering ── */
// Use for: log analysis, incident/debugging, "what do these logs mean", observability
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LogEntry {
  time?: string; // timestamp, e.g. "12:04:01.214" or "2026-06-19T12:04Z"
  level: LogLevel;
  source?: string; // emitting service/module, e.g. "api", "db", "auth"
  message: string;
}
export interface LogStreamProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  entries: LogEntry[];
  caption?: string; // one-line takeaway under the feed
  footer?: HtmlString;
}

/* ── gitgraph ── a commit DAG with branch lanes, merges, tags, and HEAD ── */
// Use for: "explain this git history", branching/merging strategy, "what happened on this branch"
export interface GitCommit {
  id: string; // short hash, e.g. "a1b2c3d"
  message: string;
  branch: string; // the lane this commit sits on
  parents?: string[]; // parent commit id(s); two parents = a merge
  tag?: string; // a ref label, e.g. "v1.2.0" or "origin/main"
  head?: boolean; // marks the current HEAD
}
export interface GitGraphProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  branches?: string[]; // lane order, left → right; derived from the commits when omitted
  commits: GitCommit[]; // newest first (top), like `git log --graph`
  caption?: string;
  footer?: HtmlString;
}

/* ── queryplan ── a database EXPLAIN plan as an indented operation tree ── */
// Use for: "why is this query slow", reading an EXPLAIN/ANALYZE, query optimization
export interface PlanNode {
  op: string; // operation, e.g. "Seq Scan", "Hash Join", "Sort"
  detail?: string; // target / condition, e.g. "on users", "users.id = orders.uid"
  depth?: number; // indent level (0 = the top/root node)
  rows?: number; // estimated or actual row count
  cost?: number; // planner cost
  timeMs?: number; // actual time, ms
  slow?: boolean; // mark the bottleneck node
}
export interface QueryPlanProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  sql?: string; // the query, shown monospace above the plan
  nodes: PlanNode[]; // pre-order; `depth` gives the tree shape
  caption?: string;
  footer?: HtmlString;
}

/* ── flamegraph ── a CPU/profiler flame graph (width = time, depth = call stack) ── */
// Use for: performance profiling, "where is the time going", hot-path analysis
export interface FlameFrame {
  name: string; // function / call name
  depth: number; // stack depth (0 = root)
  value: number; // samples or time — the frame's width
  hot?: boolean; // mark the hot path
}
export interface FlameGraphProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  // DFS pre-order: each frame is followed by its children; a parent's value ≥ the sum of its
  // children's. Widths and offsets are computed from this, so no nested shape is needed.
  frames: FlameFrame[];
  unit?: string; // e.g. "ms", "samples"
  caption?: string;
  footer?: HtmlString;
}

/* ── regexscope ── a regular-expression explainer with token breakdown + live-highlit samples ── */
// Use for: "explain this regex", "what does this pattern match", learning regular expressions
export interface RegexPart {
  token: string; // the regex fragment, e.g. "\\d+", "[a-z]", "(?:…)"
  label: string; // plain-English meaning
  kind?: 'literal' | 'class' | 'quantifier' | 'group' | 'anchor' | 'escape' | 'other';
}
export interface RegexSegment {
  text: string;
  match?: boolean; // true = part of a match (highlighted)
  group?: number; // capture-group index, for group tinting
}
export interface RegexSample {
  label?: string;
  segments: RegexSegment[]; // the test string split into matched / unmatched runs
}
export interface RegexScopeProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  pattern: string; // the full regex source
  flags?: string; // e.g. "gi"
  parts: RegexPart[]; // token-by-token breakdown
  samples?: RegexSample[]; // test strings with highlighted matches
  caption?: string;
  footer?: HtmlString;
}

/* ── sequencealign ── DNA/RNA/protein multiple-sequence alignment, stacked monospace reads ── */
// Use for: "align these sequences/reads", spotting mutations or indels, homology comparisons
export type SequenceKind = 'dna' | 'rna' | 'protein';
export interface AlignedSequence {
  label: string; // read/sample/species name shown at the left of its row
  chars: string; // the aligned sequence itself; '-' marks a gap, same length across reads
}
export interface SequenceAlignProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  kind: SequenceKind;
  sequences: AlignedSequence[];
  // Any non-empty label (e.g. "Consensus") opts into a majority-vote row. The row's actual
  // per-column symbols are always computed live from `sequences` — this string is never
  // rendered as data, only as the row's own left-hand label.
  consensus?: string;
  highlightMismatches?: boolean;
  footer?: HtmlString;
}

export type CodeBlock =
  | (BlockBase & { type: 'stacktrace'; props: StackTraceProps })
  | (BlockBase & { type: 'syntaxbreakdown'; props: SyntaxBreakdownProps })
  | (BlockBase & { type: 'codewalk'; props: CodeWalkProps })
  | (BlockBase & { type: 'componentapi'; props: ComponentApiProps })
  | (BlockBase & { type: 'terminal'; props: TerminalProps })
  | (BlockBase & { type: 'logstream'; props: LogStreamProps })
  | (BlockBase & { type: 'gitgraph'; props: GitGraphProps })
  | (BlockBase & { type: 'queryplan'; props: QueryPlanProps })
  | (BlockBase & { type: 'flamegraph'; props: FlameGraphProps })
  | (BlockBase & { type: 'regexscope'; props: RegexScopeProps })
  | (BlockBase & { type: 'sequencealign'; props: SequenceAlignProps });
