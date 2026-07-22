// companionSchema.ts — the model-enrichment layer. The deterministic floor (buildShipFromDiff) is
// always the structural truth; a capable model adds the things a parser can't: a thorough plain-
// language read, each change's intent + why, a sharper risk call, the CASCADE (how a change ripples
// out to an incident), a gate rationale, and principal-level suggestions. When real code context is
// supplied (changed-file contents + the actual callers found across the repo), the model grounds the
// cascade and blast in THOSE — not guesses. Malformed output is dropped, so enrichment only ever
// improves the floor. Pure + testable: prompt, parse, and merge here; the network call is in generate.ts.
import type {
  CascadeHop,
  RiskLevel,
  Severity,
  ShipCascade,
  ShipModel,
  ShipSuggestion,
} from '../model';

export interface ChangeEnrichment {
  id: string;
  intent?: string;
  why?: string;
  risk?: RiskLevel;
}

export interface Enrichment {
  summary?: string;
  risks?: { level: RiskLevel; text: string }[];
  changes?: ChangeEnrichment[];
  suggestions?: ShipSuggestion[];
  cascades?: ShipCascade[];
  gateRationale?: string;
}

const RISKS: RiskLevel[] = ['safe', 'watch', 'breaks'];
const SEVS: Severity[] = ['P0', 'P1', 'P2', 'P3'];
const isRisk = (v: unknown): v is RiskLevel =>
  typeof v === 'string' && RISKS.includes(v as RiskLevel);
const isSev = (v: unknown): v is Severity => typeof v === 'string' && SEVS.includes(v as Severity);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const ENRICH_PERSONA =
  'You are a principal engineer reviewing a code change for a teammate who is nervous about merging ' +
  'it. Your job is to make them UNDERSTAND it — what it does, why, what it could break, and in what ' +
  'order to ship it safely. You ground every claim in the diff and, when provided, the real file ' +
  'contents and the real callers found across the repo. You NEVER invent a caller, a file, a number, ' +
  'or production traffic that the inputs do not support — when unsure, you say so. You write in clear, ' +
  'concrete prose (no hedging filler). You reply with STRICT JSON only — no prose, no markdown fences.';

// The schema + rules are STABLE across every analysis, so they live in the system prompt where
// providers cache them (Anthropic's ephemeral cache block, Gemini's systemInstruction). Only the
// per-change data (ids, code context, diff) varies and goes in the user prompt.
const ENRICH_SCHEMA = [
  'Review the code change in the user message and return JSON of exactly this shape:',
  '{',
  '  "summary": "2-4 sentences: what this change does, why it matters, and the single thing to watch — plain language a nervous reviewer can act on",',
  '  "risks": [ { "level": "breaks|watch|safe", "text": "a before-you-merge risk, worst first" } ],',
  '  "changes": [ { "id": "<one of the given ids>", "intent": "what this file\'s change does", "why": "why it is part of this change", "risk": "breaks|watch|safe" } ],',
  '  "cascades": [ { "trigger": "the change that starts the chain", "hops": [ { "label": "the next thing it breaks/affects", "context": "who/where, e.g. \'2 callers in webhooks/\'", "severity": "breaks|watch|safe" } ], "incident": "where the chain ends if it ships wrong", "incidentSeverity": "P0|P1|P2|P3", "caughtBeforeMerge": "what to do first so the chain never starts" } ],',
  '  "gateRationale": "one paragraph: should this merge, and under what conditions",',
  '  "suggestions": [ { "category": "CONCURRENCY|COMPATIBILITY|RESILIENCE|OBSERVABILITY|SECURITY|DATA", "title": "Did you consider …?", "gist": "one line", "why": "the reasoning", "evidence": "cite file:line", "fix": "the concrete fix" } ]',
  '}',
  '',
  'Rules: ground every claim in the inputs. Cite file:line in "evidence". 0-3 risks, 0-2 cascades, ',
  '0-5 suggestions — only ones you can prove. Use the exact change ids given. If real callers are ',
  'provided, the cascade hops MUST reference those actual files; if none are provided, keep the ',
  'cascade to what the diff shows and say the blast is in-repo only. Output the fields in the order ',
  'above (summary first) so a reader sees the verdict while the rest streams. Omit anything you are unsure of.',
].join('\n');

/** The full, stable system prompt for diff enrichment (persona + schema + rules). Passed as BOTH
 *  `system` and `systemBase` so providers serve it from cache on every re-analysis. */
export const ENRICH_SYSTEM = ENRICH_PERSONA + '\n\n' + ENRICH_SCHEMA;

/** Build the per-analysis user prompt — only the data that varies (change ids, real code context,
 *  the diff). When `codeContext` is given (changed-file excerpts + real callers), the cascade and
 *  blast must be grounded in it; without it the model reasons conservatively. */
export function buildEnrichPrompt(
  floor: ShipModel,
  diffText: string,
  codeContext?: string,
): string {
  const changeList = floor.changes.map((c) => `- ${c.id}: ${c.file} (${c.title})`).join('\n');
  const diff =
    diffText.length > 14000 ? diffText.slice(0, 14000) + '\n…[diff truncated]' : diffText;
  return [
    'CHANGE IDS:',
    changeList,
    ...(codeContext
      ? ['', 'REAL CODE CONTEXT (file contents + actual callers found in the repo):', codeContext]
      : []),
    '',
    'DIFF:',
    diff,
  ].join('\n');
}

/** Map a raw `risks` array to typed risk items, dropping empties. Shared by the final parse and the
 *  streaming parse so both apply identical validation. */
export function mapRisks(v: unknown): { level: RiskLevel; text: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((r) => {
      const rr = r as Record<string, unknown>;
      return { level: isRisk(rr.level) ? rr.level : ('watch' as RiskLevel), text: str(rr.text) };
    })
    .filter((r) => r.text.length > 0);
  return out.length ? out : undefined;
}

/** Map a raw `changes` array to per-file enrichments, keyed by the floor's change ids. */
export function mapChanges(v: unknown): ChangeEnrichment[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((c) => {
      const cc = c as Record<string, unknown>;
      const e: ChangeEnrichment = { id: str(cc.id) };
      if (str(cc.intent)) e.intent = str(cc.intent);
      if (str(cc.why)) e.why = str(cc.why);
      if (isRisk(cc.risk)) e.risk = cc.risk;
      return e;
    })
    .filter((c) => c.id.length > 0);
  return out.length ? out : undefined;
}

/** Map a raw `suggestions` array to typed staff-engineer suggestions, dropping titleless ones. */
export function mapSuggestions(v: unknown): ShipSuggestion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((s, i): ShipSuggestion | null => {
      const ss = s as Record<string, unknown>;
      const title = str(ss.title);
      if (!title) return null;
      return {
        id: `s${i}`,
        category: str(ss.category) || 'REVIEW',
        title,
        gist: str(ss.gist),
        why: str(ss.why),
        evidence: str(ss.evidence),
        fix: str(ss.fix),
      };
    })
    .filter((s): s is ShipSuggestion => s !== null);
  return out.length ? out : undefined;
}

export function parseCascades(v: unknown): ShipCascade[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ShipCascade[] = [];
  for (const c of v) {
    const cc = c as Record<string, unknown>;
    const trigger = str(cc.trigger);
    const hops: CascadeHop[] = Array.isArray(cc.hops)
      ? cc.hops
          .map((h): CascadeHop => {
            const hh = h as Record<string, unknown>;
            return {
              label: str(hh.label),
              context: str(hh.context),
              severity: isRisk(hh.severity) ? hh.severity : 'watch',
            };
          })
          .filter((h) => h.label.length > 0)
      : [];
    if (!trigger || hops.length === 0) continue;
    out.push({
      trigger,
      hops,
      incident: str(cc.incident),
      incidentSeverity: isSev(cc.incidentSeverity) ? cc.incidentSeverity : 'P2',
      caughtBeforeMerge: str(cc.caughtBeforeMerge),
    });
  }
  return out.length ? out : undefined;
}

/** Pull the JSON object out of a model reply (tolerating fences/prose) and validate it. Returns null
 *  when nothing usable parses — the caller then keeps the floor untouched. */
export function parseEnrichment(raw: string | object): Enrichment | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/```json\s*|```/gi, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      obj = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  const risks = mapRisks(o.risks);
  const changes = mapChanges(o.changes);
  const suggestions = mapSuggestions(o.suggestions);
  const cascades = parseCascades(o.cascades);
  const gateRationale = str(o.gateRationale) || undefined;
  const summary = str(o.summary) || undefined;

  if (
    !summary &&
    !risks?.length &&
    !changes?.length &&
    !suggestions?.length &&
    !cascades?.length &&
    !gateRationale
  ) {
    return null;
  }
  return { summary, risks, changes, suggestions, cascades, gateRationale };
}

/** Merge an enrichment onto the floor. Structure is never touched — only plain-language fields, the
 *  cascade (net-new), the gate rationale, and suggestions — so the result is at least as grounded. */
export function mergeEnrichment(floor: ShipModel, enr: Enrichment, modelLabel?: string): ShipModel {
  const byId = new Map(enr.changes?.map((c) => [c.id, c]) ?? []);
  return {
    ...floor,
    pr: {
      ...floor.pr,
      summary: enr.summary || floor.pr.summary,
      risks: enr.risks && enr.risks.length ? enr.risks : floor.pr.risks,
    },
    changes: floor.changes.map((c) => {
      const e = byId.get(c.id);
      if (!e) return c;
      return { ...c, intent: e.intent || c.intent, why: e.why || c.why, risk: e.risk ?? c.risk };
    }),
    cascades: enr.cascades && enr.cascades.length ? enr.cascades : floor.cascades,
    suggestions: enr.suggestions && enr.suggestions.length ? enr.suggestions : floor.suggestions,
    gate: enr.gateRationale ? { ...floor.gate, rationale: enr.gateRationale } : floor.gate,
    provenance: {
      ...floor.provenance,
      notes: [
        floor.provenance.notes?.[0] ??
          'Built from the diff — what each change does, and the in-repo callers it touches.',
        modelLabel
          ? `The read, cascade, and suggestions are ${modelLabel}'s analysis.`
          : 'The read, cascade, and suggestions are the model’s analysis.',
        ...(floor.provenance.notes?.slice(2) ?? []),
      ],
    },
  };
}
