// levers/build.ts — turn the model's proposed model into a GATED, self-consistent one, in pure code.
// Two guards make Live Levers trustworthy:
//   1. Grounding — a node's value must appear verbatim in its quote (and the quote in the document), so
//      every base figure is the document's own; the matched figure's value + unit are used, not the model's.
//   2. Self-consistency — a derived node survives ONLY if its formula reproduces the document's printed
//      value from the document's printed inputs (within tolerance). A formula that doesn't reproduce the
//      page's result is dropped, so dragging can never cascade a number the document's arithmetic wouldn't.
// What remains is a graph where the inputs are real assumptions and the conclusions really follow. Pure.
import { groundedPageOf } from '../grounding';
import { extractNumbers } from '../reconcile/extractNumbers';
import { evaluate } from './dag';
import { identifiersIn } from './expr';
import type { LeverModel, LeverNode, LeverUnit } from './types';

/** A node must reproduce the document's printed value to within this relative tolerance to survive. */
const SELF_CONSISTENCY_TOL = 0.02;
/** A node's claimed value must match a figure in its quote to within this relative tolerance. */
const GROUND_TOL = 0.01;

const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface RawLeverNode {
  id?: string;
  label?: string;
  value?: number;
  unit?: string;
  formula?: string;
  quote?: string;
  page?: number;
  doc?: number;
  bound?: { op?: string; value?: number; label?: string };
}

function asUnit(s: unknown): LeverUnit {
  const u = String(s ?? '').toLowerCase();
  return u === '%' || u === 'currency' || u === 'x' || u === 'count' ? (u as LeverUnit) : 'number';
}

function asBound(b: RawLeverNode['bound']): LeverNode['bound'] {
  if (!b) return undefined;
  const raw = String(b.op ?? '').trim();
  const op =
    raw === 'gt' || raw === '>'
      ? 'gt'
      : raw === 'gte' || raw === '>='
        ? 'gte'
        : raw === 'lt' || raw === '<'
          ? 'lt'
          : raw === 'lte' || raw === '<='
            ? 'lte'
            : null;
  const value = Number(b.value);
  if (!op || !Number.isFinite(value)) return undefined;
  return { op, value, ...(b.label ? { label: String(b.label) } : {}) };
}

/** Ground one raw node: the quote must be verbatim in its document, and the node's value must match a
 *  real figure in that quote (whose value + unit are then used). Returns null if either gate fails. */
function coerceNode(r: RawLeverNode, corpus: readonly (readonly string[])[]): LeverNode | null {
  const id = String(r.id ?? '').trim();
  if (!ID_RE.test(id)) return null;
  const quote = String(r.quote ?? '').trim();
  if (!quote) return null;
  const doc = Number.isInteger(r.doc) && r.doc! >= 0 && r.doc! < corpus.length ? r.doc! : 0;
  const pages = corpus[doc];
  if (!pages) return null;
  const page = groundedPageOf(quote, pages, Number.isInteger(r.page) ? r.page : undefined);
  if (page === 0) return null; // quote not verbatim in the document

  // The value must be one the document actually prints in this quote.
  const figures = extractNumbers([{ id: 'q', page, quote }]);
  const claimed = Number(r.value);
  let printed: number | undefined;
  let unit: LeverUnit = asUnit(r.unit);
  if (Number.isFinite(claimed)) {
    const match = figures.find((f) => {
      const denom = Math.abs(claimed) > 1e-9 ? Math.abs(claimed) : 1;
      return Math.abs(f.value - claimed) / denom <= GROUND_TOL;
    });
    if (match) {
      printed = match.value;
      unit = match.unit;
    }
  }
  if (printed === undefined && figures.length === 1) {
    printed = figures[0].value; // unambiguous single figure in the quote
    unit = figures[0].unit;
  }
  if (printed === undefined) return null; // no grounded value

  const formula = String(r.formula ?? '').trim() || undefined;
  const bound = asBound(r.bound);
  return {
    id,
    label: String(r.label ?? '').trim() || id,
    printed,
    unit,
    ...(formula ? { formula, deps: identifiersIn(formula).filter((d) => d !== id) } : { deps: [] }),
    quote,
    page,
    doc,
    ...(bound ? { bound } : {}),
  };
}

/** Pick a sensible slider range for an input from its printed value. */
function withRange(n: LeverNode): LeverNode {
  const p = n.printed;
  const [min, max] = p > 0 ? [0, p * 2] : p < 0 ? [p * 2, 0] : [0, 100];
  return { ...n, min, max };
}

/**
 * Build the gated, self-consistent lever model from the model's proposal. Returns null when nothing
 * survives (no draggable input drives a consistent conclusion) — the feature then greys out honestly.
 */
export function buildLeverModel(
  raw: readonly RawLeverNode[],
  corpus: readonly (readonly string[])[],
): LeverModel | null {
  let nodes: LeverNode[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = coerceNode(r, corpus);
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      nodes.push(n);
    }
  }

  // Fixpoint: drop derived nodes that reference a missing dep, can't resolve, or don't reproduce their
  // printed value. Dropping one may break another (a chained derivation), so repeat until stable.
  for (let guard = 0; guard < 50; guard += 1) {
    const ids = new Set(nodes.map((n) => n.id));
    const before = nodes.length;
    nodes = nodes.filter((n) => !n.formula || n.deps.every((d) => ids.has(d)));
    const { values, unresolved } = evaluate(nodes, new Map());
    nodes = nodes.filter((n) => {
      if (!n.formula) return true;
      if (unresolved.has(n.id)) return false;
      const computed = values.get(n.id);
      if (computed === undefined) return false;
      const denom = Math.abs(n.printed) > 1e-9 ? Math.abs(n.printed) : 1;
      return Math.abs(computed - n.printed) / denom <= SELF_CONSISTENCY_TOL;
    });
    if (nodes.length === before) break;
  }

  // Keep only inputs that actually drive a surviving derivation, plus the derived nodes themselves.
  const referenced = new Set<string>();
  for (const n of nodes) if (n.formula) for (const d of n.deps) referenced.add(d);
  const inputs = nodes.filter((n) => !n.formula && referenced.has(n.id)).map((n) => n.id);
  const keep = new Set<string>([...inputs, ...nodes.filter((n) => n.formula).map((n) => n.id)]);
  nodes = nodes
    .filter((n) => keep.has(n.id))
    .map((n) => (inputs.includes(n.id) ? withRange(n) : n));

  if (inputs.length === 0 || !nodes.some((n) => n.formula)) return null;
  return { nodes, inputs };
}
