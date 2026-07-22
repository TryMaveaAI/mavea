// validate.ts — safety and shape validation for model-produced MindShapeSpec objects.
// Mirrors the validateLiveResponse pattern in liveSchema.ts: parse → coerce → drop unsafe →
// return null if unsalvageable. Never throws.
import type {
  MindShapeSpec,
  MindShapePatch,
  MindAtom,
  MindCluster,
  MindLink,
  MindAtomKind,
  MindLinkKind,
  MindAtomStatus,
  MindAtomConfidence,
} from './types';
import { makeTranscriptGrounder, type Grounder } from '../ground/transcript';

const LABEL_MAX = 80; // a short summarizing sentence, not a bare phrase
const QUOTE_MAX = 120;
const CENTER_MAX = 90;
// The "Maybe" observation is a real question/sentence, not a chip. Forty characters cut ordinary
// thoughts ("How are the special cases actually supposed…") before the renderer ever saw them,
// so wrapping could not recover the missing words. Keep a bounded model-output guard, but give the
// card enough room for one complete sentence; its renderer wraps and auto-fit keeps it on canvas.
const UNSAID_LABEL_MAX = 120;
const UNSAID_WHY_MAX = 120;
const LINK_LABEL_MAX = 30;
const CLUSTER_LABEL_MAX = 32;

// Clinical and diagnostic language that must never appear in a mindshape.
// The rule: if the model produced a clinical term, the atom is dropped (not just cleaned)
// because the associated interpretation is likely unsound.
const CLINICAL_RE =
  /\b(?:trauma(?:ti[sz](?:ed?|ing))?|ptsd|clinical depression|major depression|anxiety disorder|bipolar|narcissistic|borderline personality|attachment disorder|co-?dependent(?:ency)?|dissociat(?:e|ed|ion)|avoidant attachment|anxious attachment|emotional dysregulation|hypervigilance|love-?bombing|codependency|enmeshment|enmeshed|parentif(?:ied|ying)|scapegoat(?:ing)?|golden child)\b/i;

const VALID_KINDS = new Set<MindAtomKind>([
  'person',
  'option',
  'want',
  'fear',
  'constraint',
  'tradeoff',
  'contradiction',
  'open_loop',
  'action',
  'value',
  'question',
]);

const VALID_LINK_KINDS = new Set<MindLinkKind>([
  'supports',
  'tensions',
  'depends_on',
  'same_thread',
  'blocks',
]);

const VALID_STATUSES = new Set<MindAtomStatus>(['forming', 'stable', 'maybe']);
const VALID_CONFIDENCES = new Set<MindAtomConfidence>(['said', 'inferred']);

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ── Verbatim grounding (G1, anti-hallucination) ───────────────────────────────
// An atom's quote must be something the person actually said. The fuzzy speech grounder now lives in
// the shared honesty spine (src/live/ground/transcript.ts). MindShape re-validates persisted blocks
// (and unit tests) with no transcript, where grounding must be SKIPPED — so it opts into failOpen:true
// explicitly; the spine defaults to fail-closed for callers that have no source of truth to check.

function coerceAtom(raw: unknown, ground: Grounder): MindAtom | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id, 32);
  if (!id) return null;

  const kind = VALID_KINDS.has(r.kind as MindAtomKind) ? (r.kind as MindAtomKind) : null;
  if (!kind) return null;

  const label = str(r.label, LABEL_MAX);
  if (!label) return null;

  // Quote is required — the anti-hallucination guard. Drop the atom if absent.
  const quote = str(r.quote, QUOTE_MAX);
  if (!quote) return null;

  // Drop atoms that contain clinical language.
  if (CLINICAL_RE.test(label) || CLINICAL_RE.test(quote)) return null;

  // G1: the quote must be grounded in what was actually said.
  if (!ground(quote)) return null;

  const status: MindAtomStatus = VALID_STATUSES.has(r.status as MindAtomStatus)
    ? (r.status as MindAtomStatus)
    : 'stable';

  const confidence: MindAtomConfidence = VALID_CONFIDENCES.has(r.confidence as MindAtomConfidence)
    ? (r.confidence as MindAtomConfidence)
    : 'said';

  const rawWeight = typeof r.weight === 'number' ? r.weight : 1;
  const weight = Math.max(1, Math.min(3, Math.round(rawWeight)));

  return { id, kind, label, quote, status, confidence, weight };
}

// `atomIds` omitted = defer the endpoint-existence check (patch links may point at a prior
// atom not in this delta; useMindShape re-checks every link against the merged atom set).
function coerceLink(raw: unknown, atomIds?: Set<string>): MindLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const from = str(r.from, 32);
  const to = str(r.to, 32);
  if (!from || !to) return null;

  // Drop links that reference non-existent atoms (when the atom set is known).
  if (atomIds && (!atomIds.has(from) || !atomIds.has(to))) return null;
  if (from === to) return null;

  const kind = VALID_LINK_KINDS.has(r.kind as MindLinkKind) ? (r.kind as MindLinkKind) : null;
  if (!kind) return null;

  const label =
    typeof r.label === 'string' ? (str(r.label, LINK_LABEL_MAX) ?? undefined) : undefined;

  return { from, to, kind, ...(label ? { label } : {}) };
}

function coerceCluster(raw: unknown, atomIds: Set<string>): MindCluster | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id, 32);
  if (!id) return null;

  const label = str(r.label, CLUSTER_LABEL_MAX);
  if (!label) return null;

  // A theme named with clinical/diagnostic language is dropped, same as atoms.
  if (CLINICAL_RE.test(label)) return null;

  // Keep only members that resolve to a real atom, de-duped in order. A cluster left
  // with no surviving members is dropped — no empty themes, nothing fabricated.
  const rawMembers = Array.isArray(r.atomIds) ? r.atomIds : [];
  const seen = new Set<string>();
  const memberIds: string[] = [];
  for (const m of rawMembers) {
    const mid = str(m, 32);
    if (mid && atomIds.has(mid) && !seen.has(mid)) {
      seen.add(mid);
      memberIds.push(mid);
    }
  }
  if (memberIds.length === 0) return null;

  const rawWeight = typeof r.weight === 'number' ? r.weight : 1;
  const weight = Math.max(1, Math.min(3, Math.round(rawWeight)));

  return { id, label, atomIds: memberIds, weight };
}

/** Parse raw model output (string or object) into a validated MindShapeSpec.
 *  `transcript` enables the G1 verbatim-grounding gate (omit to skip it, e.g. re-validating a
 *  persisted block). Returns null if the result is unsalvageable. */
export function validateMindShape(raw: unknown, transcript?: string): MindShapeSpec | null {
  let obj: Record<string, unknown> | null = null;

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (!obj) return null;

  const center = str(obj.center, CENTER_MAX);
  if (!center) return null;

  const title = typeof obj.title === 'string' ? (str(obj.title, 60) ?? undefined) : undefined;

  const ground = makeTranscriptGrounder(transcript, { failOpen: true });
  const rawAtoms = Array.isArray(obj.atoms) ? obj.atoms : [];
  const atoms: MindAtom[] = rawAtoms
    .map((a) => coerceAtom(a, ground))
    .filter((a): a is MindAtom => a !== null);

  // Need at least one valid atom.
  if (atoms.length === 0) return null;

  const atomIds = new Set(atoms.map((a) => a.id));

  const rawLinks = Array.isArray(obj.links) ? obj.links : [];
  const links: MindLink[] = rawLinks
    .map((l) => coerceLink(l, atomIds))
    .filter((l): l is MindLink => l !== null);

  // Emergent themes. Absent → undefined; the renderer falls back to a single implicit
  // cluster. Never backfilled here — a map with no real themes shows none.
  const rawClusters = Array.isArray(obj.clusters) ? obj.clusters : [];
  const clusters: MindCluster[] = rawClusters
    .map((c) => coerceCluster(c, atomIds))
    .filter((c): c is MindCluster => c !== null);

  // Coerce unsaid — always force confidence to 'maybe'.
  let unsaid: MindShapeSpec['unsaid'];
  if (obj.unsaid && typeof obj.unsaid === 'object' && !Array.isArray(obj.unsaid)) {
    const u = obj.unsaid as Record<string, unknown>;
    const uLabel = str(u.label, UNSAID_LABEL_MAX);
    const uWhy = str(u.why, UNSAID_WHY_MAX);
    if (uLabel && uWhy && !CLINICAL_RE.test(uLabel) && !CLINICAL_RE.test(uWhy)) {
      unsaid = { label: uLabel, why: uWhy, confidence: 'maybe' };
    }
  }

  return {
    center,
    ...(title ? { title } : {}),
    atoms,
    links,
    ...(clusters.length ? { clusters } : {}),
    ...(unsaid ? { unsaid } : {}),
  };
}

/** Validate an incremental patch (delta) from a listening-phase model call: only the new atoms
 *  and links since the last update. Reuses the same atom gates (quote required + G1 grounded +
 *  no clinical language). Links keep their structure here; their endpoints are re-checked against
 *  the full merged atom set in useMindShape (a patch link may point at a prior-patch atom). No
 *  center/clusters — those are settle-only. Returns null only when the delta is entirely empty. */
export function validateMindShapePatch(raw: unknown, transcript?: string): MindShapePatch | null {
  let obj: Record<string, unknown> | null = null;

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (!obj) return null;

  const ground = makeTranscriptGrounder(transcript, { failOpen: true });
  const rawAdd = Array.isArray(obj.add) ? obj.add : [];
  const add: MindAtom[] = rawAdd
    .map((a) => coerceAtom(a, ground))
    .filter((a): a is MindAtom => a !== null);

  const rawLinks = Array.isArray(obj.addLinks) ? obj.addLinks : [];
  const addLinks: MindLink[] = rawLinks
    .map((l) => coerceLink(l))
    .filter((l): l is MindLink => l !== null);

  if (add.length === 0 && addLinks.length === 0) return null;
  return { add, addLinks };
}
