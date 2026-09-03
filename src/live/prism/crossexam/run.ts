// crossexam/run.ts — orchestrates Cross-Examine. ONE batched, temperature-0 model call raises the
// sharpest objection per load-bearing claim (constrained to the taxonomy, anchored to verbatim doc
// words, and self-declaring whether the document answers it). Then resolve.ts gates each in pure code:
// the anchor must be real, and "addressed" only survives with a real verbatim rebuttal. The model
// proposes; the document decides. Cost shape: one call, on demand — never a per-claim fan-out.
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { resolveObjection, type RawObjection } from './resolve';
import { completedArrayItems } from '../../streamParse';
import type { Objection } from './types';

/** The minimal claim shape this needs (a grounded, load-bearing claim). */
export interface CrossExamClaim {
  id: string;
  source: number;
  page: number;
  quote: string;
  title: string;
}

/** Cap how many claims we cross-examine (cost guard) — the few load-bearing ones carry the case. */
const MAX_CLAIMS = 10;

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
  "You are a meticulous, skeptical peer reviewer. You attack only a document's INTERNAL logic — never " +
  'outside facts — you quote the document verbatim, and you return strict JSON only.';

function buildPrompt(claims: readonly CrossExamClaim[]): string {
  const lines = claims.map((c) => `[${c.id}] "${c.quote}" (p.${c.page})`).join('\n');
  return `For each CLAIM below (a load-bearing assertion from one document), raise the single SHARPEST
objection to its internal logic, using ONLY this taxonomy:
- unstated-assumption | missing-baseline | cherry-pick | overgeneralization | undefined-term | circular

CLAIMS:
${lines}

Return ONLY JSON (no prose, no fences):
{ "objections": [ { "claimId": "...", "kind": "<taxonomy>", "question": "<the sharp question, <=140 chars>",
  "anchorQuote": "<the document's OWN words the objection targets, copied VERBATIM>",
  "addressed": true|false, "rebuttalQuote": "<if the document answers it elsewhere, the verbatim sentence that does>" } ] }

Rules:
- Exactly ONE objection per claim — the sharpest. "kind" MUST be from the taxonomy above.
- Attack the internal logic only (a missing control, an unstated assumption, an overreach). NEVER bring
  in outside facts or your own knowledge.
- "anchorQuote" MUST be copied character-for-character from the document (it is verified; if not found,
  the objection is dropped).
- "addressed": true ONLY if the DOCUMENT ITSELF answers the objection elsewhere — and then "rebuttalQuote"
  MUST be the verbatim sentence that answers it. If you are unsure, set addressed=false. Do not invent a rebuttal.`;
}

function parseObjections(raw: string | object): RawObjection[] {
  const obj = extractJsonObject(raw);
  // If the whole object didn't parse (a truncated stream), salvage the COMPLETE array items from
  // the raw text instead of losing every objection — the per-item grounding below still gates them.
  const arr =
    obj && Array.isArray(obj.objections)
      ? obj.objections
      : typeof raw === 'string'
        ? completedArrayItems(raw, 'objections')
        : [];
  const out: RawObjection[] = [];
  for (const o of arr) if (o && typeof o === 'object') out.push(o as RawObjection);
  return out;
}

/**
 * Cross-examine the load-bearing claims. Returns the grounded objections (open first, then addressed)
 * — never throws. [] means the pass RAN and nothing stuck; `null` means it never ran (the model call
 * failed), which the caller must report as a failure rather than a clean bill of health. Every
 * returned objection's anchor is verbatim in the document, and an "addressed" status survives only
 * with a real verbatim rebuttal.
 */
export async function runCrossExam(
  claims: readonly CrossExamClaim[],
  corpus: readonly (readonly string[])[],
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<Objection[] | null> {
  const targets = claims.slice(0, MAX_CLAIMS);
  if (targets.length === 0) return [];

  let raw: string | object;
  try {
    const res = await getAdapter(cfg.provider).generate(
      {
        usageLabel: 'prism-cross-examination',
        system: SYSTEM,
        history: [],
        user: buildPrompt(targets),
        // Each objection carries TWO verbatim quotes (anchor +, when addressed, a rebuttal), and
        // report sentences run long — a full house of MAX_CLAIMS (10) can exceed a flat 2600 and
        // truncate the JSON, losing EVERY objection (not just the tail). Size the ceiling to the
        // real claim count so a dense doc gets the room it needs; unused tokens cost nothing.
        maxTokens: Math.min(4096, Math.max(1400, 150 + targets.length * 320)),
        temperature: 0,
        format: null,
        ...(signal ? { signal } : {}),
      },
      cfg,
    );
    raw = res.raw;
  } catch {
    // The pass never ran (a refusal, a 429, a dropped connection). An [] here would read on screen as
    // "no objection stuck" — an all-clear the document never earned.
    return null;
  }

  const byId = new Map(targets.map((c) => [c.id, c]));
  const out: Objection[] = [];
  const seen = new Set<string>();
  let i = 0;
  for (const r of parseObjections(raw)) {
    const claim = byId.get(String(r.claimId ?? ''));
    if (!claim || seen.has(claim.id)) continue; // exactly one objection per claim (the contract)
    const obj = resolveObjection(r, { id: claim.id, source: claim.source }, corpus, (i += 1));
    if (obj) {
      seen.add(claim.id);
      out.push(obj);
    }
  }
  // Open objections (the ones the document never answers) first — that's the headline.
  return out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
}
