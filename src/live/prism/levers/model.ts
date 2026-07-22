// levers/model.ts — the ONE model call for Live Levers: propose the quantitative model implied under
// the document (inputs + derived values with formulas + any stated bound). That's ALL the model does —
// it never computes anything. buildLeverModel then grounds every value verbatim and keeps only the
// derivations that reproduce the document's own printed result, so what the reader drags is real.
// Cost shape: one call on demand; recompute-on-drag is pure code. Never throws (returns null on failure).
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { buildLeverModel, type RawLeverNode } from './build';
import type { LeverModel } from './types';

/** The minimal grounded-claim shape this needs for context. */
export interface LeverClaim {
  quote: string;
  page: number;
  /** Which attached document this quote is from (index into the corpus) — so in multi-document mode
   *  each figure grounds to the right document/page, not always the first. */
  doc: number;
}

function extractJsonObject(raw: string | object): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  const text = String(raw);
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const SYSTEM =
  'You extract the quantitative model implied under a document — its base figures and how they combine — ' +
  'and return strict JSON only. You never compute results yourself and never invent a figure or a quote.';

function buildPrompt(claims: readonly LeverClaim[]): string {
  const lines = claims.map((c) => `[doc ${c.doc} · p.${c.page}] "${c.quote}"`).join('\n');
  return `From the grounded quotes below, identify the document's numeric figures and how they relate.

QUOTES:
${lines}

Return ONLY JSON (no prose, no fences):
{ "nodes": [
  { "id": "price", "label": "Price per unit", "value": 80, "unit": "currency", "quote": "<verbatim quote containing this figure>", "doc": 0, "page": 4 },
  { "id": "units", "label": "Units", "value": 100000, "unit": "count", "quote": "...", "doc": 0, "page": 4 },
  { "id": "revenue", "label": "Revenue", "value": 8000000, "unit": "currency", "formula": "price * units", "quote": "...", "doc": 0, "page": 5 },
  { "id": "profit", "label": "Profit", "value": 1000000, "unit": "currency", "formula": "revenue - cost", "quote": "...", "doc": 0, "page": 6, "bound": { "op": "gte", "value": 0, "label": "profit must be ≥ 0" } }
] }

Rules:
- "id" is a short snake_case variable name (letters, digits, underscores only). "value" is the NUMBER only —
  no symbols, units, or commas ($10M → 10000000; 40% → 40; 3× → 3).
- Every node's "quote" MUST be copied VERBATIM from the document and MUST contain that node's figure
  (it is verified against the real text — anything not found is dropped).
- "doc" and "page" MUST be the document index and page the quote sits on — copy them from the quote's
  [doc N · p.X] label (it is verified against that document — a wrong doc drops the node).
- An INPUT (a base figure / assumption) has NO "formula". A DERIVED value has a "formula": an arithmetic
  expression over OTHER node ids using only + - * / and parentheses. Use the relationship the document
  implies; the formula's result must match the document's own stated value for that node.
- Add a "bound" to a conclusion the document says must hold (profit ≥ 0, ROI must clear 1.5×, etc.):
  { "op": "gt|gte|lt|lte", "value": <threshold>, "label": "<plain words>" }.
- Only include figures the document actually states. If there's no quantitative model, return { "nodes": [] }.`;
}

function parseNodes(raw: string | object): RawLeverNode[] {
  const obj = extractJsonObject(raw);
  const arr = obj && Array.isArray(obj.nodes) ? obj.nodes : [];
  const out: RawLeverNode[] = [];
  for (const n of arr) {
    if (!n || typeof n !== 'object') continue;
    const r = n as Record<string, unknown>;
    out.push({
      id: typeof r.id === 'string' ? r.id : undefined,
      label: typeof r.label === 'string' ? r.label : undefined,
      value: Number(r.value),
      unit: typeof r.unit === 'string' ? r.unit : undefined,
      formula: typeof r.formula === 'string' ? r.formula : undefined,
      quote: typeof r.quote === 'string' ? r.quote : undefined,
      page: Number(r.page),
      doc: Number.isInteger(Number(r.doc)) ? Number(r.doc) : 0,
      bound:
        r.bound && typeof r.bound === 'object'
          ? (r.bound as { op?: string; value?: number; label?: string })
          : undefined,
    });
  }
  return out;
}

/**
 * Extract + ground + gate the document's implied model. Returns the lever model, or null when the
 * document has no quantitative model that checks out against itself (the feature then greys out).
 */
export async function runLevers(
  claims: readonly LeverClaim[],
  corpus: readonly (readonly string[])[],
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<LeverModel | null> {
  if (claims.length === 0) return null;
  // The caller hands us every grounded claim (uncapped) — a data-dense document (the case Levers
  // exists for) can carry dozens of quantitative figures, and each becomes its own node. A fixed
  // budget starves that: the model gets cut off mid-array and the WHOLE model (not just the tail
  // nodes) is lost, since it must parse as one JSON object. ~90 tokens/claim covers a node with its
  // verbatim quote; floored at the old budget for a small document, capped so one call stays bounded.
  const maxTokens = Math.min(5000, Math.max(1500, 500 + claims.length * 90));
  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        system: SYSTEM,
        history: [],
        user: buildPrompt(claims),
        maxTokens,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = res.raw;
  } catch {
    return null;
  }
  return buildLeverModel(parseNodes(raw), corpus);
}
