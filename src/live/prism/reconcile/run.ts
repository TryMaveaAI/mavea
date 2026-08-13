// reconcile/run.ts — orchestrates Reconcile. The figures are extracted in pure code; ONE batched,
// temperature-0 model call proposes which figures the DOCUMENT ITSELF relates (with a verbatim
// evidence phrase for each relation); then the verdict is computed in pure code (check.ts). The model
// never does arithmetic and never decides the verdict — it only points at relationships, and even
// those are gated: the evidence must appear verbatim in the document, or the relation is dropped.
//
// Cost shape: one model call, on demand (when the reader opens Reconcile) — never a per-figure fan-out.
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { groundedPageOf } from '../grounding';
import { extractNumbers, type NumberSource } from './extractNumbers';
import { equalityVerdict, growthVerdict } from './check';
import { completedArrayItems } from '../../streamParse';
import type { NumberAtom, Reconciliation } from './types';

/** Bound the prompt + the result set. */
const MAX_ATOMS = 60;
const MAX_RESULTS = 8;

/** Pull the first balanced top-level JSON object out of a possibly-noisy model response. */
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

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const RECON_SYSTEM =
  "You check a document's own numbers for internal consistency and return strict JSON only. You only " +
  'relate figures the document ITSELF ties together, you never invent a quote, and when nothing ' +
  'checkably relates you return an empty list.';

function buildPrompt(atoms: readonly NumberAtom[]): string {
  const lines = atoms
    .map(
      (a) => `[${a.id}] ${a.raw}${a.label ? ` (${a.label})` : ''} — in: "${a.quote}" (p.${a.page})`,
    )
    .join('\n');
  return `Below are figures extracted verbatim from ONE document. Find places where the document's own
numbers disagree — and ONLY those the document itself relates.

FIGURES:
${lines}

Return ONLY JSON (no prose, no fences):
{ "checks": [
  { "type": "equality", "ids": ["<id>", "<id>"], "label": "<the single quantity BOTH figures describe>", "evidence": "<a phrase copied VERBATIM from the document showing they are the same quantity>" },
  { "type": "growth", "percentId": "<id>", "fromId": "<id>", "toId": "<id>", "label": "<the quantity>", "evidence": "<a phrase copied VERBATIM showing the percent is the change from the first value to the second>" }
] }

Rules:
- Only propose a check when the DOCUMENT ITSELF asserts the relationship — e.g. a percent and a table
  figure that are clearly the SAME labelled quantity, or a "% growth/increase/decline" stated next to
  the two values it is computed from. Do NOT relate figures that merely look similar or share a topic.
- Every "evidence" MUST be copied character-for-character from the document (it is verified — anything
  not found verbatim is dropped). All ids MUST come from the list above.
- "equality" is for two figures of the SAME unit asserted to be the same quantity. "growth" is for a
  percent that should equal the change between two money/count values.
- If nothing checkably relates, return { "checks": [] }. Quality over quantity — only defensible checks.
- Return at most 10 checks — if a dense document has more, keep the 10 strongest.`;
}

interface RawCheck {
  type?: string;
  ids?: unknown;
  percentId?: string;
  fromId?: string;
  toId?: string;
  label?: string;
  evidence?: string;
}

function parseChecks(raw: string | object): RawCheck[] {
  const obj = extractJsonObject(raw);
  // Truncated stream → salvage the complete array items rather than dropping every check (each is
  // re-grounded against the document's real numbers below, so a ragged tail is safe).
  const arr =
    obj && Array.isArray(obj.checks)
      ? obj.checks
      : typeof raw === 'string'
        ? completedArrayItems(raw, 'checks')
        : [];
  const out: RawCheck[] = [];
  for (const c of arr) {
    if (c && typeof c === 'object') out.push(c as RawCheck);
  }
  return out;
}

/**
 * Reconcile the document's own figures. Returns the contradictions (each a calculator-verifiable
 * receipt) — never throws. [] means the pass RAN and found nothing to flag; `null` means it never
 * ran (the model call failed), which the caller must report as a failure rather than an all-clear.
 * The verdict for every returned item was computed in pure code; the model only proposed (gated)
 * relationships.
 */
export async function runReconcile(
  sources: readonly NumberSource[],
  corpus: readonly (readonly string[])[],
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<Reconciliation[] | null> {
  const atoms = extractNumbers(sources).slice(0, MAX_ATOMS);
  if (atoms.length < 2) return [];

  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        system: RECON_SYSTEM,
        history: [],
        user: buildPrompt(atoms),
        // A dense report can legitimately surface close to MAX_ATOMS worth of relations, each carrying
        // a verbatim evidence phrase — the old 900 could cut the JSON off mid-array on a data-rich
        // document, losing every check (not just the excess ones), since the array must parse whole.
        maxTokens: 1500,
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = res.raw;
  } catch {
    // The pairing pass never ran (a refusal, a 429, a dropped connection). Say "unknown", not "none":
    // an [] here would read on screen as "every number checks out" for a check that never happened.
    return null;
  }

  const byId = new Map(atoms.map((a) => [a.id, a]));
  const evidenceReal = (ev: string): boolean =>
    !!ev.trim() && corpus.some((pages) => groundedPageOf(ev, pages) > 0);

  const out: Reconciliation[] = [];
  const seen = new Set<string>();
  let n = 0;
  for (const c of parseChecks(raw)) {
    if (out.length >= MAX_RESULTS) break;
    if (!evidenceReal(asString(c.evidence))) continue; // the relation must be grounded in the real text

    if (c.type === 'equality') {
      const ids = Array.isArray(c.ids) ? (c.ids as unknown[]).map(asString) : [];
      const a = byId.get(ids[0]);
      const b = byId.get(ids[1]);
      if (!a || !b || a.claimId === b.claimId) continue; // prose-vs-elsewhere, not two in one sentence
      const v = equalityVerdict(a, b, asString(c.label) || a.label || b.label || 'these figures');
      if (!v) continue;
      const key = `e:${[a.claimId, b.claimId].sort().join('|')}:${v.stated}:${v.computed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `r${(n += 1)}`,
        kind: 'equality',
        ...v,
        claimIds: [a.claimId, b.claimId],
        a: a.claimId,
        b: b.claimId,
      });
    } else if (c.type === 'growth') {
      const p = byId.get(asString(c.percentId));
      const f = byId.get(asString(c.fromId));
      const t = byId.get(asString(c.toId));
      if (!p || !f || !t) continue;
      const v = growthVerdict(p, f, t, asString(c.label) || p.label || 'growth');
      if (!v) continue;
      const claimIds = [...new Set([p.claimId, f.claimId, t.claimId])];
      const key = `g:${[p.claimId, t.claimId].sort().join('|')}:${v.stated}:${v.computed}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `r${(n += 1)}`, kind: 'growth', ...v, claimIds, a: p.claimId, b: t.claimId });
    }
  }
  return out;
}
