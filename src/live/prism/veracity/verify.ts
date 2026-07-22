// veracity/verify.ts — the "is this TRUE?" pass. After the map settles, the handful of load-bearing
// claims are checked against the live world: we retrieve real web snippets for each (free-first via
// Wikipedia, or a BYOK provider), then ONE batched model call decides each verdict and cites a
// snippet. Every citation runs the citation-must-verify gate (gate.ts) before it can stand, and a
// world-asserting verdict with no surviving citation is forced to the honest "unsupported".
//
// Cost shape: extraction-free (the claims already exist), N free HTTP searches, and exactly ONE model
// call regardless of how many claims are checked. A claim for which search found nothing is marked
// "unsupported" deterministically — no tokens spent asking about evidence that doesn't exist.
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { getSearchProvider } from '../../search';
import type { SearchProvider, SearchProviderId } from '../../search/types';
import type { Claim } from '../types';
import type { Veracity, Verdict } from './types';
import { resolveVerdict, type Evidence, type RawVerdict } from './gate';
import { completedArrayItems } from '../../streamParse';

/** How the verify pass is configured. The search backend mirrors the user's Live settings — same
 *  provider and key they chose there — so veracity verifies through whatever they configured (free
 *  Wikipedia, or a keyed Brave/Tavily). A keyed provider with no key falls back to free Wikipedia. */
export interface VeracityOpts {
  cfg: ModelConfig;
  /** The configured search backend id (from settings: 'wikipedia' | 'brave' | 'tavily'). */
  searchProviderId?: SearchProviderId;
  /** API key for a keyed provider (Brave/Tavily) — the same key from settings. Ignored by Wikipedia. */
  apiKey?: string;
  /** A pre-resolved provider, for tests/direct callers; overrides `searchProviderId` when present. */
  provider?: SearchProvider;
  signal?: AbortSignal;
  /** Cap how many load-bearing claims we check (cost guard). Default 12. */
  maxClaims?: number;
  /** How many web results to retrieve per claim. Default 4. */
  perClaimResults?: number;
}

/** Resolve the search backend from the configured id, falling back to free keyless Wikipedia when a
 *  keyed provider (Brave/Tavily) has no key — so verification never silently fails to authenticate. */
function resolveProvider(
  id: SearchProviderId | undefined,
  apiKey: string | undefined,
): SearchProvider {
  const p = getSearchProvider(id);
  return p.needsKey && !apiKey ? getSearchProvider('wikipedia') : p;
}

const VALID: readonly Verdict[] = ['holds', 'outdated', 'disputed', 'contradicted', 'unsupported'];
function coerceVerdict(s: unknown): Verdict {
  const v = String(s ?? '')
    .toLowerCase()
    .trim();
  return (VALID as string[]).includes(v) ? (v as Verdict) : 'unsupported';
}

/** A focused search query for a claim: its headline plus the start of its quote, length-bounded so a
 *  long verbatim sentence doesn't drown the query. */
function queryFor(c: Claim): string {
  return `${c.title} ${c.quote}`.replace(/\s+/g, ' ').trim().slice(0, 200);
}

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

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

/** Parse the model's verdict JSON into RawVerdicts, defensively (any field may be missing). */
function parseVerdicts(raw: string | object): RawVerdict[] {
  const obj = extractJsonObject(raw);
  // Truncated stream → salvage the complete array items rather than losing every verdict (each is
  // gated against real evidence below, so a partial prefix is safe).
  const arr =
    obj && Array.isArray(obj.verdicts)
      ? obj.verdicts
      : typeof raw === 'string'
        ? completedArrayItems(raw, 'verdicts')
        : [];
  const out: RawVerdict[] = [];
  for (const v of arr) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const claimId = str(r.claimId);
    if (!claimId) continue;
    out.push({
      claimId,
      verdict: coerceVerdict(r.verdict),
      note: str(r.note),
      citationQuote: str(r.citationQuote),
      citationUrl: str(r.citationUrl),
      citationDate: str(r.citationDate),
    });
  }
  return out;
}

const VERIFY_SYSTEM =
  'You are a meticulous fact-checker. You judge claims only against the sources given to you and ' +
  'return strict JSON. You never invent a source, a URL, or a quote, and you default to "unsupported" ' +
  'whenever the evidence is thin.';

/** Build the one batched verify prompt: every checkable claim with the snippets retrieved for it. */
function buildPrompt(claims: readonly Claim[], evidence: ReadonlyMap<string, Evidence[]>): string {
  const blocks = claims.map((c) => {
    const ev = evidence.get(c.id) ?? [];
    const lines = ev.map((e) => `  - "${e.title}": ${e.snippet} (${e.url})`).join('\n');
    return `[claim ${c.id}] "${c.quote}"\n  sources:\n${lines}`;
  });
  return `For each CLAIM below (a verbatim quote pulled from a document), decide how it stands against
the SOURCES listed for it (short web-search snippets — that is all you have, no full pages).

Return ONLY JSON (no prose, no fences):
{ "verdicts": [ { "claimId": "...", "verdict": "holds|outdated|disputed|contradicted|unsupported",
  "note": "<=120 chars, plain", "citationQuote": "copied VERBATIM from one of that claim's sources",
  "citationUrl": "that source's URL, copied exactly from the list" } ] }

Rules:
- "holds": a source clearly supports the claim. "outdated": a source gives a newer/superseding figure.
  "disputed": credible sources genuinely conflict. "contradicted": a source directly contradicts it.
  "unsupported": the sources don't actually bear on the claim — this is the DEFAULT; when in doubt, pick it.
- For ANY verdict other than "unsupported" you MUST copy a "citationQuote" word-for-word from ONE of
  that claim's own sources, and copy its "citationUrl" exactly. If you cannot, the verdict is "unsupported".
- Never invent a source, URL, or quote. Only the snippets above are real. Bias hard toward "unsupported"
  when evidence is thin or only loosely related — do not stretch a weak match into a verdict.
- "note" is a plain restatement ("the public record shows X" / "a 2024 source reports Y"), never "they lied".

CLAIMS AND THEIR SOURCES:
${blocks.join('\n\n')}`;
}

/**
 * Check the load-bearing claims of a settled map against the live world. Returns a Veracity per
 * checked claim (claims with no web evidence come back "unsupported"). Never throws — a failed search
 * or model call degrades to "unsupported", never a fabricated verdict.
 */
export async function runVeracity(
  claims: readonly Claim[],
  opts: VeracityOpts,
): Promise<Veracity[]> {
  const provider = opts.provider ?? resolveProvider(opts.searchProviderId, opts.apiKey);
  const targets = claims.filter((c) => c.role === 'load-bearing').slice(0, opts.maxClaims ?? 12);
  if (targets.length === 0) return [];

  // Retrieve evidence per claim (free-first). search() never throws; a failure → no evidence.
  const evidence = new Map<string, Evidence[]>();
  await Promise.all(
    targets.map(async (c) => {
      const results = await provider.search(queryFor(c), {
        apiKey: opts.apiKey,
        signal: opts.signal,
        limit: opts.perClaimResults ?? 4,
      });
      evidence.set(
        c.id,
        results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
      );
    }),
  );

  const checkable = targets.filter((c) => (evidence.get(c.id)?.length ?? 0) > 0);
  // A claim with no live source found is "unsupported" — honest, and costs no tokens.
  const out: Veracity[] = targets
    .filter((c) => (evidence.get(c.id)?.length ?? 0) === 0)
    .map((c) => ({
      claimId: c.id,
      verdict: 'unsupported' as const,
      note: 'No live source was found to check this.',
    }));
  if (checkable.length === 0) return out;

  // ONE batched model call for every checkable claim. Each verdict can carry a note + a citation quote,
  // so a fixed cap sized for a couple of claims runs tight once the load-bearing count nears its
  // ceiling (maxClaims) — and a truncated array loses EVERY verdict (not just the last one), since the
  // whole object must parse. Floored at the old budget, scaled per checkable claim.
  const maxTokens = Math.min(4096, Math.max(1400, 250 + checkable.length * 150));
  let raw: string | object;
  try {
    const res = await getAdapter(opts.cfg.provider).generate(
      {
        system: VERIFY_SYSTEM,
        history: [],
        user: buildPrompt(checkable, evidence),
        maxTokens,
        temperature: 0,
        format: null,
        ...(opts.signal ? { signal: opts.signal } : {}),
      },
      opts.cfg,
    );
    raw = res.raw;
  } catch {
    // model unreachable → every checkable claim is honestly unsupported, never fabricated.
    for (const c of checkable) {
      out.push({
        claimId: c.id,
        verdict: 'unsupported',
        note: 'Could not reach the fact-checker.',
      });
    }
    return out;
  }

  const verdicts = parseVerdicts(raw);
  const returned = new Set<string>();
  for (const v of verdicts) {
    if (returned.has(v.claimId)) continue; // ignore duplicate ids
    if (!checkable.some((c) => c.id === v.claimId)) continue; // ignore ids we didn't ask about
    returned.add(v.claimId);
    out.push(resolveVerdict(v, evidence.get(v.claimId) ?? []));
  }
  // any checkable claim the model skipped → honest unsupported
  for (const c of checkable) {
    if (!returned.has(c.id)) {
      out.push({
        claimId: c.id,
        verdict: 'unsupported',
        note: 'The sources did not clearly speak to this.',
      });
    }
  }
  return out;
}
