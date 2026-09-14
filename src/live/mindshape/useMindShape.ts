// useMindShape.ts — 5-beat phase machine for "Watch Me Think".
// Owns the loop: transcript → localExtract (instant) → debounced patch (delta, rare) →
// settle call (once on speech-end) → settled spec ready for render.
// Anti-jank: atoms keyed by stable id, merged in place — never hard-replace the array.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localExtract } from './localExtract';
import { settleMindShape, patchMindShape } from './modelRefine';
import type {
  MindAtom,
  MindIntent,
  MindLink,
  MindModelStatus,
  MindShapePatch,
  MindShapeSpec,
} from './types';
import { detectIntent } from './intentDetect';
import type { MindPhase } from '../../canvas/blocks/diagrams/MindShape';
import type { ModelConfig } from '../providers/types';

export interface UseMindShapeReturn {
  phase: MindPhase;
  spec: MindShapeSpec | null;
  intent: MindIntent;
  /** Feed the whole accumulated transcript. `uncertainSpan` is the raw text of an utterance that
   *  transcribed with low confidence — anything extracted from it is flagged for the map. */
  onTranscript: (text: string, uncertainSpan?: string) => void;
  onSpeechEnd: (text: string) => void;
  /** Drop a card the user dismissed ("this isn't right"), pruning any link or theme that depended
   *  on it. The remaining map is what a later "Make sense of this" sends, so deletions are honored. */
  removeAtom: (id: string) => void;
  /** Promote the unsaid thing to a real open_loop atom — the user confirmed "yes, that's it". */
  confirmUnsaid: () => void;
  /** Dismiss the unsaid card — the user said "not quite". Remembered so it doesn't resurface. */
  dismissUnsaid: () => void;
  /** Where the model calls stand — answered, never configured, or asked and silent. An empty map
   *  has a different honest explanation in each case, and telling someone who typed six thoughts
   *  that they were too quiet is a lie in two of the three. */
  modelStatus: MindModelStatus;
  /** A seed/patch/settle call is awaiting the model right now. The surface shows it: without it,
   *  the seconds spent asking look exactly like the seconds spent listening. */
  refining: boolean;
  reset: () => void;
  /** Go back to listening. `keepMap` true (default) preserves the atoms so new speech merges in
   *  ("I forgot a few things"); false wipes them for a fresh map but stays on the live surface
   *  ("Start over"). Differs from reset(), which drops all the way to idle and closes the overlay. */
  resume: (keepMap?: boolean) => void;
}

const REFINE_DEBOUNCE_MS = 6_000; // minimum gap between patch calls
const MIN_NEW_WORDS = 8; // minimum new words to trigger a patch
const MIN_NEW_ATOMS = 1; // OR minimum new local atoms
const MAX_REFINE_CALLS = 8; // hard cap per session
// Seed the map from the model after just the first few words, so a single short thought already
// draws something — once the user is in Watch Me Think, an empty stage reads as "it's not working."
// Local atoms (when the heuristics catch them) show instantly; this is the floor for the model seed
// that fills in for topics the local extractor doesn't recognize.
const FIRST_REFINE_WORDS = 4;

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

const MAX_ATOMS = 24; // G4: leak guard for the additive (no model-driven deletion) merge

/** Merge a list of incoming atoms into existing ones by id.
 *  local (forming) atoms never demote a stable atom from the model. */
function mergeAtoms(existing: MindAtom[], incoming: MindAtom[]): MindAtom[] {
  const map = new Map(existing.map((a) => [a.id, a]));
  for (const atom of incoming) {
    const prev = map.get(atom.id);
    if (!prev) {
      map.set(atom.id, atom);
    } else if (atom.status === 'stable' || prev.status === 'forming') {
      // Model can promote forming → stable or replace stable with fresh stable.
      // Local extraction (forming) never overwrites a model-confirmed stable atom.
      map.set(atom.id, { ...prev, ...atom });
    }
  }
  return Array.from(map.values());
}

/** Normalized quote key for de-duplication (mirrors the validator's grounding normalization). */
function quoteKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function statusRank(a: MindAtom): number {
  return a.status === 'stable' ? 2 : a.status === 'forming' ? 1 : 0;
}

/** A containment counts only when the shorter quote is a clause of its own. A settle that quotes
 *  "the job" would otherwise cover "the job pays more", "the job is in Denver" and "the job
 *  starts Monday" at once, and three said things vanish behind one. */
const COVER_MIN_WORDS = 3;

function containsClause(longer: string, shorter: string): boolean {
  return ` ${longer} `.includes(` ${shorter} `);
}

/** Is this prior thought represented anywhere in the settled map? Quote coverage, not array
 *  length: the settle re-quotes the same spans, sometimes trimmed or extended, so containment in
 *  either direction counts as the same thought — at word boundaries, and only when the shorter
 *  side says something by itself. */
function quoteCovered(key: string, covered: Iterable<string>): boolean {
  const keyWords = wordCount(key);
  for (const c of covered) {
    if (c === key) return true;
    if (Math.min(keyWords, wordCount(c)) < COVER_MIN_WORDS) continue;
    if (containsClause(c, key) || containsClause(key, c)) return true;
  }
  return false;
}

/** Carry forward any thought the settle did not account for. The settle is the one prune
 *  authority, so it REPLACES the map — but a model that summarizes five spoken thoughts into two
 *  atoms deletes three things the person actually said, and watching your own words disappear is
 *  the opposite of being listened to. Coverage decides, not count: a settle that returns the same
 *  number of atoms with a different membership drops just as much, and a settle is a fresh
 *  full-transcript composition, so different membership is ordinary. Unmatched atoms ride along
 *  (deduped by quote, and never past the leak cap). Exported for unit tests. */
export function keepUnaccountedAtoms(prior: MindAtom[], settled: MindShapeSpec): MindShapeSpec {
  const covered = new Set(settled.atoms.map((a) => quoteKey(a.quote)).filter(Boolean));
  // Ids are the model's own numbering and a settle starts it over, so a carried `a2` beside the
  // settle's `a2` is two cards on one point and one ✕ that removes both. The old map's links are
  // gone with it, so a carried thought needs nothing but a name of its own.
  const taken = new Set(settled.atoms.map((a) => a.id));
  const carried: MindAtom[] = [];
  for (const a of prior) {
    const key = quoteKey(a.quote);
    if (!key || quoteCovered(key, covered)) continue;
    covered.add(key);
    let id = a.id;
    for (let n = 2; taken.has(id); n++) id = `${a.id}-${n}`;
    taken.add(id);
    carried.push(id === a.id ? a : { ...a, id });
  }
  if (!carried.length) return settled;
  return { ...settled, atoms: [...settled.atoms, ...carried].slice(0, MAX_ATOMS) };
}

/** Flag the atoms a low-confidence utterance introduced. Only atoms new to the map count: the
 *  extractor runs over the whole ramble, so a thought heard clearly a minute ago comes back in
 *  `atoms` too, and it must not turn uncertain because its words also occur inside the shaky
 *  span. Quote keys normalize away the clamp's ellipsis, so a clamped quote is a prefix of its
 *  utterance's key. Exported for unit tests. */
export function markUncertain(atoms: MindAtom[], span: string, existing: MindAtom[]): MindAtom[] {
  const hay = quoteKey(span);
  if (!hay) return atoms;
  const known = new Set(existing.flatMap((a) => [a.id, quoteKey(a.quote)]));
  return atoms.map((a) => {
    const key = quoteKey(a.quote);
    if (!key || known.has(a.id) || known.has(key) || !hay.includes(key)) return a;
    return { ...a, uncertain: true };
  });
}

/** Apply a model patch delta to the live spec — additive only (settle is the one prune
 *  authority). Guardrails: G3 fold a new-id atom whose quote already exists onto the original
 *  id (no twin cards); G4 cap total atoms; G2 drop any link whose endpoints didn't survive.
 *  Exported for unit tests (the merge guardrails are the riskiest part of the delta protocol). */
export function mergeDelta(spec: MindShapeSpec, patch: MindShapePatch): MindShapeSpec {
  const byId = new Map(spec.atoms.map((a) => [a.id, a]));
  const quoteToId = new Map(spec.atoms.map((a) => [quoteKey(a.quote), a.id]));

  for (const atom of patch.add) {
    const existing = byId.get(atom.id);
    if (existing) {
      byId.set(atom.id, { ...existing, ...atom });
      continue;
    }
    const dupId = quoteToId.get(quoteKey(atom.quote)); // G3
    if (dupId && byId.has(dupId)) {
      byId.set(dupId, { ...byId.get(dupId)!, ...atom, id: dupId });
      continue;
    }
    byId.set(atom.id, atom);
    quoteToId.set(quoteKey(atom.quote), atom.id);
  }

  let atoms = Array.from(byId.values());
  if (atoms.length > MAX_ATOMS) {
    // G4: keep the most salient — highest weight, then stable over forming.
    atoms = [...atoms]
      .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || statusRank(b) - statusRank(a))
      .slice(0, MAX_ATOMS);
  }
  const atomIds = new Set(atoms.map((a) => a.id));

  const linkKey = (l: MindLink): string => `${l.from}|${l.to}|${l.kind}`;
  const linkMap = new Map(spec.links.map((l) => [linkKey(l), l]));
  for (const l of patch.addLinks) linkMap.set(linkKey(l), l);
  // G2: a link survives only if both endpoints are still on the map after the merge/cap.
  const links = Array.from(linkMap.values()).filter(
    (l) => atomIds.has(l.from) && atomIds.has(l.to),
  );

  return { ...spec, atoms, links };
}

const EMPTY_SPEC: MindShapeSpec = { center: '', atoms: [], links: [] };

export function useMindShape(cfg: ModelConfig | null): UseMindShapeReturn {
  const [phase, setPhase] = useState<MindPhase>('idle');
  const [modelStatus, setModelStatus] = useState<MindModelStatus>('ok');
  const [refining, setRefining] = useState(false);
  const [spec, setSpec] = useState<MindShapeSpec | null>(null);

  // Mutable refs — avoid stale closures in callbacks
  const phaseRef = useRef<MindPhase>('idle');
  const specRef = useRef<MindShapeSpec | null>(null);
  const lastTranscriptRef = useRef(''); // transcript as of last patch call
  const lastRefineAt = useRef(0); // completion time of the last model call (see the debounce below)
  const refineCount = useRef(0); // calls this session
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false); // a seed/patch is awaiting the model — don't start another
  // The one transcript that arrived while a call was in flight (latest wins). Without it the words
  // spoken during a 12s seed wait for the person to speak AGAIN before anything asks about them.
  const pendingTranscriptRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Atoms the user dismissed (✕). localExtract regenerates the same id for an unchanged clause and
  // the model can re-surface a quote, so a removal must be remembered or the card snaps back on the
  // next interim. Keyed by both id and normalized quote so a re-numbered clause is still suppressed.
  const dismissedRef = useRef<Set<string>>(new Set());
  const cfgRef = useRef(cfg);

  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);

  const dismissalKeys = (a: { id: string; quote: string }): string[] => [
    `id:${a.id}`,
    `q:${quoteKey(a.quote)}`,
  ];
  function isDismissed(a: { id: string; quote: string }): boolean {
    return dismissalKeys(a).some((k) => dismissedRef.current.has(k));
  }
  /** Drop any dismissed atom (and links/clusters that depended on it) from a freshly merged spec,
   *  so model/local re-surfacing can never undo a user's ✕. */
  function pruneDismissed(s: MindShapeSpec): MindShapeSpec {
    if (dismissedRef.current.size === 0) return s;
    const atoms = s.atoms.filter((a) => !isDismissed(a));
    if (atoms.length === s.atoms.length) return s;
    const ids = new Set(atoms.map((a) => a.id));
    return {
      ...s,
      atoms,
      links: s.links.filter((l) => ids.has(l.from) && ids.has(l.to)),
      clusters: s.clusters
        ?.map((c) => ({ ...c, atomIds: c.atomIds.filter((id) => ids.has(id)) }))
        .filter((c) => c.atomIds.length > 0),
    };
  }

  function setPhaseSync(p: MindPhase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function setSpecSync(s: MindShapeSpec | null) {
    specRef.current = s;
    setSpec(s);
  }

  /** The in-flight flag is read synchronously by the gate and rendered by the surface, so it is
   *  written to both at once — same discipline as the phase. */
  function setInFlight(v: boolean) {
    inFlightRef.current = v;
    setRefining(v);
  }

  function clearPending() {
    pendingTranscriptRef.current = null;
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }

  // Re-offer the held transcript to the gate as soon as the flight clears and the debounce has run
  // out. Called after every completed call, so a map that fell behind catches up on its own.
  const onTranscriptRef = useRef<(text: string) => void>(() => {});
  function schedulePending() {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (pendingTranscriptRef.current === null || inFlightRef.current) return;
    if (refineCount.current >= MAX_REFINE_CALLS) {
      pendingTranscriptRef.current = null;
      return;
    }
    const wait = Math.max(0, REFINE_DEBOUNCE_MS - (Date.now() - lastRefineAt.current));
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      const text = pendingTranscriptRef.current;
      pendingTranscriptRef.current = null;
      if (text) onTranscriptRef.current(text);
    }, wait);
  }

  // ── Local extract: merge the forming atoms already extracted for this interim transcript ───
  // Takes the localExtract result from onTranscript (computed once) and drops anything the user
  // dismissed so a regenerated clause can't reappear.
  const applyLocal = useCallback((localAtoms: MindAtom[]) => {
    const fresh = localAtoms.filter((a) => !isDismissed(a));
    if (fresh.length === 0) return;
    const existing = specRef.current ?? EMPTY_SPEC;
    const merged = mergeAtoms(existing.atoms, fresh);
    setSpecSync({ ...existing, atoms: merged });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fire a patch call (delta only — merged additively into the live map) ──────
  // Returns just the new atoms/links since the last update, a fraction of re-emitting the whole
  // shape. Apply-on-success only (never clear-then-apply), so a failed/empty patch leaves the map
  // untouched and the free local atoms keep carrying the live feel.
  const firePatch = useCallback(async (transcript: string) => {
    const c = cfgRef.current;
    if (!c) {
      setModelStatus('not-connected');
      return;
    }
    const prior = specRef.current;
    if (!prior || prior.atoms.length === 0) return; // nothing to patch against yet

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const delta = transcript.slice(lastTranscriptRef.current.length).trim();
    lastTranscriptRef.current = transcript;
    refineCount.current += 1;

    setInFlight(true);
    try {
      const patch = await patchMindShape(delta, prior, transcript, c, ctrl.signal);
      if (ctrl.signal.aborted || !patch) return;
      setSpecSync(pruneDismissed(mergeDelta(specRef.current ?? prior, patch)));
    } finally {
      if (!ctrl.signal.aborted) {
        // Stamped on COMPLETION: the constant expresses "six seconds since the map last visibly
        // changed", not "six seconds since we started asking". Stamping at the start spends the
        // whole window while the call is still out, so on a slow provider the held transcript
        // fires the instant the answer lands — two map changes back to back, and the eight-call
        // budget gone in half the session.
        lastRefineAt.current = Date.now();
        setInFlight(false);
        schedulePending();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Seed the map from the model (when local heuristics found nothing to patch against) ────────
  // localExtract only fires on emotional/decision cues ("scared", "my dad", "should I"); an
  // intellectual or strategic ramble ("a roadmap for linear algebra", "how to go viral") yields no
  // atoms, so firePatch has nothing to delta against and the map would stay empty. This seeds the
  // live map straight from the transcript so it builds for ANY topic — staying on 'listening' (it
  // is not the final settle), after which firePatch takes over with cheap deltas.
  const fireSeed = useCallback(async (transcript: string) => {
    const c = cfgRef.current;
    if (!c) {
      setModelStatus('not-connected');
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    lastTranscriptRef.current = transcript;
    refineCount.current += 1;

    setInFlight(true);
    try {
      const seeded = await settleMindShape(transcript, c, ctrl.signal);
      if (ctrl.signal.aborted || !seeded) return;
      // Merge (don't replace) so any forming atoms extracted while the seed was in flight survive,
      // mirroring firePatch's apply-on-success discipline; carry over the seed's center/themes/unsaid.
      const base = specRef.current ?? EMPTY_SPEC;
      const merged = mergeDelta(base, { add: seeded.atoms, addLinks: seeded.links });
      setSpecSync(
        pruneDismissed({
          ...merged,
          center: seeded.center || merged.center,
          clusters: seeded.clusters,
          unsaid: seeded.unsaid,
          title: seeded.title ?? merged.title,
        }),
      );
    } finally {
      if (!ctrl.signal.aborted) {
        lastRefineAt.current = Date.now(); // debounce from the completion — see firePatch
        setInFlight(false);
        schedulePending();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fire the settle call (full transcript → the complete, clean shape) ────────
  // Wholesale replace: settle is the single authority that can prune, so it corrects everything
  // the additive live loop accumulated and computes center + unsaid + the emergent themes.
  const fireSettle = useCallback(async (transcript: string) => {
    // Nothing further is going to arrive for this map — a held transcript would only re-open it.
    clearPending();
    const c = cfgRef.current;
    if (!c) {
      // No model is configured, so nothing was ever asked. The map settles on whatever the local
      // pass found; the surface says which, rather than blaming the speaker for being too quiet.
      setModelStatus('not-connected');
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    lastTranscriptRef.current = transcript;
    refineCount.current += 1;

    // Same in-flight discipline as fireSeed/firePatch: settle aborts the in-flight patch above, and
    // that patch's own `finally` skips the reset because it sees `aborted`. Without claiming and
    // releasing the guard here too, `inFlightRef` would stay stuck true after a settle and block
    // every later patch (e.g. once the user resumes and speaks more).
    setInFlight(true);
    try {
      const settled = await settleMindShape(transcript, c, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!settled) {
        // The transcript had words in it and the model gave nothing back — a refusal, a rate
        // limit, or an unreachable provider. Remember that, so the empty map can say which.
        setModelStatus('unavailable');
        return;
      }
      setModelStatus('ok');
      // Same dismissal discipline as the patch and seed paths: a settle is a fresh composition off
      // the whole transcript, so without this a card the user ✕'d comes back at the end.
      setSpecSync(pruneDismissed(keepUnaccountedAtoms(specRef.current?.atoms ?? [], settled)));
    } finally {
      if (!ctrl.signal.aborted) {
        lastRefineAt.current = Date.now();
        setInFlight(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── onTranscript: called on every interim update while listening ──────────
  const onTranscript = useCallback(
    (text: string, uncertainSpan?: string) => {
      if (phaseRef.current === 'idle') setPhaseSync('listening');

      // One extraction per interim — feed the live atoms and reuse the same result for the gate.
      const localNow = localExtract(text);
      applyLocal(
        uncertainSpan
          ? markUncertain(localNow, uncertainSpan, specRef.current?.atoms ?? [])
          : localNow,
      );

      const wc = wordCount(text);
      const overCap = refineCount.current >= MAX_REFINE_CALLS;
      const tooSoon = Date.now() - lastRefineAt.current < REFINE_DEBOUNCE_MS;
      // Never start a second model call while one is awaiting — settle latency can exceed the
      // debounce, which would otherwise abort-and-refire and burn the call budget on empty maps.
      const ready = !tooSoon && !inFlightRef.current;

      // No atoms yet — local heuristics came up dry (a non-emotional topic). Seed the whole map
      // from the model once enough has been said, so the live map builds for any subject.
      const noAtoms = (specRef.current?.atoms.length ?? 0) === 0;

      // Atoms exist — refine with a cheap delta patch when there's enough genuinely new material.
      const newWords = wc - wordCount(lastTranscriptRef.current);
      const newAtoms = localNow.filter(
        (a) => !specRef.current?.atoms.some((e) => e.id === a.id),
      ).length;
      const worthAsking = noAtoms
        ? wc >= FIRST_REFINE_WORDS
        : wc >= FIRST_REFINE_WORDS && (newWords >= MIN_NEW_WORDS || newAtoms >= MIN_NEW_ATOMS);

      if (!worthAsking || overCap) return;
      if (!ready) {
        // Hold it (latest wins) rather than dropping it: these words are worth a call and the only
        // thing in the way is a clock. schedulePending fires them the moment the way is clear.
        pendingTranscriptRef.current = text;
        schedulePending();
        return;
      }
      pendingTranscriptRef.current = null;
      void (noAtoms ? fireSeed(text) : firePatch(text));
    },
    [applyLocal, fireSeed, firePatch],
  );
  onTranscriptRef.current = onTranscript;

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setInFlight(false);
    clearPending();
    dismissedRef.current.clear();
    lastTranscriptRef.current = '';
    lastRefineAt.current = 0;
    refineCount.current = 0;
    // A new session starts with no verdict on the model. Leaving the old one standing meant a
    // session that once failed kept apologising for it through every session after.
    setModelStatus('ok');
    setPhaseSync('idle');
    setSpecSync(null);
  }, []);

  // ── resume ────────────────────────────────────────────────────────────────
  // Back to listening without leaving the live surface. Clearing the transcript/refine
  // bookkeeping makes the next utterance read as fresh delta; keepMap decides whether it merges
  // into the existing atoms ("Add more") or onto a blank map ("Start over"). refineCount resets
  // so the continued session gets its full patch budget again.
  const resume = useCallback((keepMap: boolean = true) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setInFlight(false);
    clearPending();
    lastTranscriptRef.current = '';
    lastRefineAt.current = 0;
    refineCount.current = 0;
    setModelStatus('ok');
    // "Start over" wipes the map AND its dismissals (a clean slate); "Add more" keeps both so the
    // cards the user already ✕'d stay gone as new speech merges in.
    if (!keepMap) {
      dismissedRef.current.clear();
      setSpecSync(null);
    }
    setPhaseSync('listening');
  }, []);

  // ── removeAtom: the user dismissed a card ───────────────────────────────────
  // Drop the atom plus any link touching it (mirrors mergeDelta's G2 — no dangling endpoints) and
  // any theme left with no members. Applied to the live spec so the next "Make sense of this"
  // builds its prompt from only the cards the user kept.
  const removeAtom = useCallback((id: string) => {
    const cur = specRef.current;
    if (!cur) return;
    const gone = cur.atoms.find((a) => a.id === id);
    if (!gone) return; // unknown id — nothing to do
    // Remember the dismissal (by id and quote) so the next interim/seed/patch can't resurrect it.
    dismissalKeys(gone).forEach((k) => dismissedRef.current.add(k));
    const atoms = cur.atoms.filter((a) => a.id !== id);
    const links = cur.links.filter((l) => l.from !== id && l.to !== id);
    const clusters = cur.clusters
      ?.map((c) => ({ ...c, atomIds: c.atomIds.filter((aid) => aid !== id) }))
      .filter((c) => c.atomIds.length > 0);
    setSpecSync({ ...cur, atoms, links, clusters });
  }, []);

  // ── confirmUnsaid: user said "yes, that's it" ─────────────────────────────
  // Promote the model's one unsaid observation to a real open_loop stable atom — the user just
  // named the thing they'd been circling. The map reorganizes (new atom enters, layout recomputes)
  // and spec.unsaid is cleared so the card doesn't reappear.
  const confirmUnsaid = useCallback(() => {
    const cur = specRef.current;
    if (!cur?.unsaid) return;
    const { unsaid } = cur;
    const newAtom: MindAtom = {
      id: 'unsaid-confirmed',
      kind: 'open_loop',
      status: 'stable',
      confidence: 'inferred',
      label: unsaid.label,
      quote: unsaid.why,
      weight: 2,
    };
    const merged = mergeAtoms(cur.atoms, [newAtom]);
    setSpecSync({ ...cur, atoms: merged, unsaid: undefined });
  }, []);

  // ── dismissUnsaid: user said "not quite" ─────────────────────────────────
  // Suppress the unsaid card and remember the label so the model can't resurface it via
  // the next seed/patch. Same dismissal channel as removeAtom so the mechanism is consistent.
  const dismissUnsaid = useCallback(() => {
    const cur = specRef.current;
    if (!cur?.unsaid) return;
    const { unsaid } = cur;
    dismissedRef.current.add(`q:${quoteKey(unsaid.label)}`);
    setSpecSync({ ...cur, unsaid: undefined });
  }, []);

  // ── onSpeechEnd: called when the user stops talking ──────────────────────
  const onSpeechEnd = useCallback(
    (text: string) => {
      // The phase REF is the authority, and it has to be: a speech-end lands in the same
      // synchronous batch as the transcript that opened the session (VadVoice emits the result and
      // the idle phase back to back), so the rendered phase is still 'idle' at this point on the
      // very first utterance. A caller consulting the rendered copy missed that utterance entirely
      // — the map never settled by silence and the first "Done thinking" press did nothing.
      if (phaseRef.current !== 'listening') return;
      if (!text.trim()) {
        reset();
        return;
      }
      setPhaseSync('pausing');

      // Settle: one full-transcript call computes center + unsaid + themes and cleans the map
      void fireSettle(text).then(() => {
        if (phaseRef.current === 'pausing') {
          setPhaseSync('settled');
        }
      });
    },
    [fireSettle, reset],
  );

  // Cancel any in-flight call on unmount, and drop the held transcript's timer with it.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pendingTimerRef.current !== null) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  const intent = useMemo<MindIntent>(() => (spec ? detectIntent(spec) : 'general'), [spec]);

  return {
    phase,
    spec,
    intent,
    modelStatus,
    refining,
    onTranscript,
    onSpeechEnd,
    removeAtom,
    confirmUnsaid,
    dismissUnsaid,
    reset,
    resume,
  };
}
