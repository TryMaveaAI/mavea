// ai family block types — agent reasoning / model internals visualizations.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';

// ───────────────────────── reasoning ─────────────────────────
export interface ReasoningStep {
  label: string;
  /** one-line summary shown collapsed */
  summary: string;
  /** expanded detail (HTML allowed) */
  detail?: HtmlString;
  tag?: string;
  tagColor?: AccentVar;
}
export interface ReasoningProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  steps: ReasoningStep[];
  conclusion?: HtmlString;
  footer?: HtmlString;
}

// ───────────────────────── toolcalls ─────────────────────────
export interface ToolCall {
  name: string;
  /** e.g. GET / POST / call */
  verb?: string;
  /** request payload / args, shown when expanded */
  request: string;
  /** response body, shown when expanded */
  response: string;
  status?: 'ok' | 'error' | 'pending';
  ms?: number;
}
export interface ToolCallsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  calls: ToolCall[];
  footer?: HtmlString;
}

// ───────────────────────── agenttrace ─────────────────────────
export interface AgentBranch {
  label: string;
  /** short rationale */
  note?: string;
  chosen?: boolean;
  score?: number; // 0..1 value/utility
  color?: AccentVar;
}
export interface AgentTraceNode {
  step: string;
  /** the thing the agent was deciding */
  decision: string;
  branches: AgentBranch[];
}
export interface AgentTraceProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: AgentTraceNode[];
  footer?: HtmlString;
}

// ───────────────────────── modelcompare ─────────────────────────
export interface ModelOutput {
  model: string;
  badge?: string;
  color?: AccentVar;
  /** answer body (HTML allowed; <mark> for diff highlight) */
  text: HtmlString;
  /** small per-model metrics row */
  meta?: { k: string; v: string }[];
  best?: boolean;
}
export interface ModelCompareProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  prompt?: string;
  outputs: ModelOutput[];
  footer?: HtmlString;
}

// ───────────────────────── tokenstream ─────────────────────────
export interface StreamToken {
  text: string;
  /** confidence / top-prob 0..1 */
  p: number;
  /** alternative tokens with their probs, shown on hover */
  alts?: { t: string; p: number }[];
}
export interface TokenStreamProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  prefix?: string;
  tokens: StreamToken[];
  footer?: HtmlString;
}

// ───────────────────────── retrieval ─────────────────────────
export interface RetrievalChunk {
  source: string;
  /** 0..1 relevance / cosine score */
  score: number;
  /** short preview line */
  snippet: string;
  /** full chunk body, shown when expanded */
  body?: HtmlString;
  tag?: string;
  tagColor?: AccentVar;
  used?: boolean;
}
export interface RetrievalProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  query?: string;
  chunks: RetrievalChunk[];
  footer?: HtmlString;
}

// ───────────────────────── whatchanged ─────────────────────────
export interface ChangeLine {
  t?: 'add' | 'del' | 'ctx';
  c: HtmlString;
}
export interface WhatChangedProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  beforeLabel?: string;
  afterLabel?: string;
  before: HtmlString;
  after: HtmlString;
  /** unified diff lines for the diff view */
  diff: ChangeLine[];
  footer?: HtmlString;
}

// ───────────────────────── routing ─────────────────────────
export interface RoutingChoice {
  label: string;
  sub?: string;
  /** confidence / fit 0..1 */
  score?: number;
  taken?: boolean;
  reason?: HtmlString;
  color?: AccentVar;
}
export interface RoutingProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  query?: string;
  classifier?: string;
  choices: RoutingChoice[];
  footer?: HtmlString;
}

// ───────────────────────── embedmap ─────────────────────────
export interface EmbedPoint {
  x: number; // 0..1
  y: number; // 0..1
  label: string;
  cluster: number;
  query?: boolean;
}
export interface EmbedCluster {
  name: string;
  color?: AccentVar;
}
export interface EmbedMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  clusters: EmbedCluster[];
  points: EmbedPoint[];
  footer?: HtmlString;
}

// ───────────────────────── calibration ─────────────────────────
export interface CalibrationBin {
  /** mean predicted prob 0..1 */
  predicted: number;
  /** observed accuracy 0..1 */
  actual: number;
  /** number of samples in this bin */
  count: number;
}
export interface CalibrationProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bins: CalibrationBin[];
  color?: AccentVar;
  /** expected calibration error, e.g. "0.04" */
  ece?: string;
  footer?: HtmlString;
}

// ───────────────────────── httpexchange ─────────────────────────
export interface HttpExchange {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** numeric HTTP status, e.g. 200, 404, 503 — colored by class (2xx/3xx/4xx/5xx) */
  status?: number;
  /** reason phrase, e.g. "OK", "Service Unavailable" */
  statusText?: string;
  /** round-trip time in milliseconds */
  durationMs?: number;
  /** request payload preview, shown in a mono block when present */
  reqBody?: string;
  /** response body preview, shown in a mono block when present */
  respPreview?: string;
  /** a short human note about this exchange (e.g. why it failed) */
  note?: string;
}
export interface HttpExchangeProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  exchanges: HttpExchange[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── trainingcurve ─────────────────────────
export interface TrainingCurveProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** epoch numbers, e.g. [1, 2, …, 50] */
  epochs: number[];
  trainLoss?: number[];
  valLoss?: number[];
  trainAcc?: number[];
  valAcc?: number[];
  /** epoch number of the best checkpoint; a vertical rule is drawn at this position */
  bestEpoch?: number;
  /** y-axis label for the loss panel (default "Loss") */
  lossLabel?: string;
  /** y-axis label for the accuracy panel (default "Accuracy") */
  accLabel?: string;
  footer?: HtmlString;
}

// ───────────────────────── family sub-union ─────────────────────────
export type AiBlock =
  | (BlockBase & { type: 'reasoning'; props: ReasoningProps })
  | (BlockBase & { type: 'toolcalls'; props: ToolCallsProps })
  | (BlockBase & { type: 'agenttrace'; props: AgentTraceProps })
  | (BlockBase & { type: 'modelcompare'; props: ModelCompareProps })
  | (BlockBase & { type: 'tokenstream'; props: TokenStreamProps })
  | (BlockBase & { type: 'retrieval'; props: RetrievalProps })
  | (BlockBase & { type: 'whatchanged'; props: WhatChangedProps })
  | (BlockBase & { type: 'routing'; props: RoutingProps })
  | (BlockBase & { type: 'embedmap'; props: EmbedMapProps })
  | (BlockBase & { type: 'calibration'; props: CalibrationProps })
  | (BlockBase & { type: 'httpexchange'; props: HttpExchangeProps })
  | (BlockBase & { type: 'trainingcurve'; props: TrainingCurveProps });
