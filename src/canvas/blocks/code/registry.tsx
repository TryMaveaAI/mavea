import { entry, type BlockRegistry } from '../registry-types';
import { StackTrace } from './StackTrace';
import { SyntaxBreakdown } from './SyntaxBreakdown';
import { CodeWalk } from './CodeWalk';
import { ComponentApi } from './ComponentApi';
import { Terminal } from './Terminal';
import { LogStream } from './LogStream';
import { GitGraph } from './GitGraph';
import { QueryPlan } from './QueryPlan';
import { FlameGraph } from './FlameGraph';
import { RegexScope } from './RegexScope';
import { SequenceAlign } from './SequenceAlign';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** code family registry — developer-answer visuals: explanation, errors, sessions, logs,
 *  version-control graphs, query plans, profiles, and regex breakdowns. */
export const codeRegistry: BlockRegistry = {
  stacktrace: entry(StackTrace),

  syntaxbreakdown: entry(SyntaxBreakdown),

  codewalk: entry(CodeWalk),
  componentapi: entry(ComponentApi),
  terminal: entry(Terminal),
  logstream: entry(LogStream),
  gitgraph: entry(GitGraph),
  queryplan: entry(QueryPlan),
  flamegraph: entry(FlameGraph),
  regexscope: entry(RegexScope),
  sequencealign: entry(SequenceAlign),
};
