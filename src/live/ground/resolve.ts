// resolve.ts — the four-surface resolver. Given a quantity (a label + a query for it), find a REAL
// value in trust order and return a typed Resolution that carries its proof — or degrade honestly.
// This is the ONLY file in ground/ that touches the provider and search seams, so it is deliberately
// excluded from the barrel and must be imported from a lazy surface only (tests/eager-bundle.test.ts).
//
//   T1  user data — a value the user gave us (attached file / filled blank), read verbatim.
//   T2  web-cited — one tiny extraction call over real search snippets, gated: the cited quote must
//                   verify against a returned snippet, its URL must be a returned URL, and the value's
//                   digits must actually appear in the quote. A slow local model skips this call.
//   T0  otherwise — no honest number; qualitative note, never a guess.
//
// It never fabricates the user's figure: absent grounding it returns T0 (no value). It never returns a
// model-supplied magnitude (T3) — the generic resolver only surfaces figures it can ground.
import type { ModelConfig } from '../../types/mavea';
import type { FillValue } from '../../data/conversation';
import type { SpeedTier } from '../speed';
import type { SearchProviderId } from '../search/types';
import type { Resolution } from './types';
import { qualitative } from './types';
import { getAdapter } from '../providers/index';
import { getSearchProvider, searchQuery } from '../search/index';
import { gateCitation, type Evidence } from './citation';
import { toNumber, digitsOf } from './number';
import { parseLooseJson } from './json';

/** A real number the user already gave us, with where it came from. Features pass these in from the
 *  dataset connector (a resolved column/cell) or any user-entered figure. */
export interface UserDatum {
  label: string;
  value: number;
  raw: string;
  doc?: number;
  page?: number;
  cell?: string;
}

/** Everything the resolver may read. Only `cfg` is required; every surface is optional, so a caller
 *  with no data still gets an honest T0 rather than an error. */
export interface GroundContext {
  cfg: ModelConfig;
  /** Real values the user supplied (dataset cells, entered figures). */
  userData?: UserDatum[];
  /** Values the user filled into Blank Space holes. */
  filledBlanks?: Record<string, FillValue>;
  /** Web search config; when enabled the T2 path runs. */
  search?: { enabled: boolean; providerId?: SearchProviderId; apiKey?: string };
  /** Measured speed of the connected model — a 'slow' local model skips the T2 extraction call. */
  speedTier?: SpeedTier;
  signal?: AbortSignal;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** T1: look for the quantity among the user's own data and filled blanks. */
function fromUser(label: string, ctx: GroundContext): Resolution | null {
  const key = norm(label);
  const datum = ctx.userData?.find((d) => norm(d.label) === key);
  if (datum && Number.isFinite(datum.value)) {
    const receipt = {
      quote: datum.raw,
      ...(datum.doc !== undefined ? { doc: datum.doc } : {}),
      ...(datum.page !== undefined ? { page: datum.page } : {}),
      ...(datum.cell ? { cell: datum.cell } : {}),
    };
    return { ok: true, tier: 'T1', value: datum.value, raw: datum.raw, receipt, surface: 'user' };
  }
  const fill = ctx.filledBlanks?.[label] ?? ctx.filledBlanks?.[key];
  if (fill && fill.kind === 'number' && Number.isFinite(fill.value)) {
    const raw = fill.unit ? `${fill.value}${fill.unit}` : String(fill.value);
    return {
      ok: true,
      tier: 'T1',
      value: fill.value,
      raw,
      receipt: { quote: raw },
      surface: 'blank',
    };
  }
  return null;
}

const T2_SYSTEM =
  'You read ONE numeric value for a named quantity out of provided web snippets. Use ONLY the snippets. ' +
  'If they do not state the quantity, reply {"found":false}. Never guess, never compute, never round. ' +
  'When found, quote the exact sentence it appears in (verbatim from a snippet) and give the URL of the ' +
  'snippet it came from. Reply with compact JSON only.';

const T2_FORMAT = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    value: { type: 'number' },
    citationQuote: { type: 'string' },
    citationUrl: { type: 'string' },
  },
  required: ['found'],
};

function t2Message(label: string, query: string, evidence: readonly Evidence[]): string {
  const lines = evidence
    .map((e, i) => `[${i + 1}] ${e.title} — ${e.snippet} (${e.url})`)
    .join('\n');
  return `QUANTITY: ${label}
CONTEXT: ${query}
SNIPPETS:
${lines}

Reply: {"found":true,"value":<number>,"citationQuote":"<verbatim sentence from a snippet>","citationUrl":"<one URL above>"} or {"found":false}`;
}

/** T2: extract a value from real search results, then gate it hard (citation verbatim + URL real +
 *  the value's digits present in the cited quote). Returns null unless every check passes. */
async function fromWeb(
  label: string,
  query: string,
  ctx: GroundContext,
): Promise<Resolution | null> {
  if (!ctx.search?.enabled) return null;
  // A slow local model can't afford the extra serial extraction call — grounding here is a secondary
  // path (the feature's own explode/select call does the primary grounding), so skip to T0 on slow.
  if (ctx.speedTier === 'slow') return null;

  let results;
  try {
    const provider = getSearchProvider(ctx.search.providerId);
    results = await provider.search(searchQuery(query || label), {
      apiKey: ctx.search.apiKey,
      signal: ctx.signal,
      limit: 5,
    });
  } catch {
    return null; // search never throws by contract, but stay defensive
  }
  if (!results || results.length === 0 || ctx.signal?.aborted) return null;
  const evidence: Evidence[] = results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
  }));

  let raw: string | object;
  try {
    const res = await getAdapter(ctx.cfg.provider).generate(
      {
        usageLabel: 'grounding-resolve',
        system: T2_SYSTEM,
        history: [],
        user: t2Message(label, query, evidence),
        maxTokens: 320,
        thinkingLevel: 'minimal',
        format: T2_FORMAT,
      },
      ctx.cfg,
    );
    raw = res.raw;
  } catch {
    return null;
  }
  if (ctx.signal?.aborted) return null;

  const parsed = parseLooseJson(raw) as {
    found?: boolean;
    value?: unknown;
    citationQuote?: string;
    citationUrl?: string;
  } | null;
  if (!parsed || parsed.found !== true) return null;

  const value = toNumber(parsed.value);
  if (value === null) return null;
  const citation = gateCitation(
    { citationQuote: parsed.citationQuote, citationUrl: parsed.citationUrl },
    evidence,
  );
  if (!citation) return null;
  // The number itself must appear in the cited sentence — a real URL + real quote is not enough if the
  // model pulled the figure from thin air. Compare digit-runs so "12,300" in the quote matches 12300 —
  // but per NUMBER, not the whole quote's digits concatenated: stripping punctuation from the entire
  // sentence first would let two unrelated numbers ("in 2023" + "45 million") splice into a false
  // match ("2345") for a fabricated value the quote never actually states.
  const digits = digitsOf(value);
  const quoteNumbers = citation.quote
    .match(/\d[\d,.]*\d|\d/g)
    ?.map((s) => s.replace(/[^0-9]/g, ''));
  if (digits.length > 0 && !quoteNumbers?.includes(digits)) return null;

  return {
    ok: true,
    tier: 'T2',
    value,
    raw: citation.quote,
    receipt: {
      quote: citation.quote,
      url: citation.url,
      host: citation.host,
      ...(citation.date ? { date: citation.date } : {}),
    },
    surface: 'web',
  };
}

/**
 * Resolve one quantity across the four surfaces in trust order, returning a Resolution that always
 * carries its provenance. Never throws, never fabricates a user figure.
 */
export async function resolveValue(
  label: string,
  query: string,
  ctx: GroundContext,
): Promise<Resolution> {
  if (!label.trim()) return { ok: false, reason: 'dropped' };
  const t1 = fromUser(label, ctx);
  if (t1) return t1;
  const t2 = await fromWeb(label, query, ctx);
  if (t2) return t2;
  return qualitative(label);
}
