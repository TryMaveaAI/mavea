// useMindShape.ts — 5-beat phase machine for "Watch Me Think".
// Owns the loop: transcript → localExtract (instant) → debounced patch (delta, rare) →
// settle call (once on speech-end) → settled spec ready for render.
// Anti-jank: atoms keyed by stable id, merged in place — never hard-replace the array.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localExtract } from './localExtract';
import { settleMindShape, patchMindShape } from './modelRefine';
import type { MindAtom, MindIntent, MindLink, MindShapePatch, MindShapeSpec } from './types';
import { detectIntent } from './intentDetect';
import type { MindPhase } from '../../canvas/blocks/diagrams/MindShape';
import type { ModelConfig } from '../providers/types';

export interface UseMindShapeReturn {
  phase: MindPhase;
  spec: MindShapeSpec | null;
  intent: MindIntent;
  onTranscript: (text: string) => void;
  onSpeechEnd: (text: string) => void;
  /** Drop a card the user dismissed ("this isn't right"), pruning any link or theme that depended
   *  on it. The remaining map is what a later "Make sense of this" sends, so deletions are honored. */
  removeAtom: (id: string) => void;
  /** Promote the unsaid thing to a real open_loop atom — the user confirmed "yes, that's it". */
  confirmUnsaid: () => void;
  /** Dismiss the unsaid card — the user said "not quite". Remembered so it doesn't resurface. */
  dismissUnsaid: () => void;
  /** True when the last model call for the map came back empty-handed — rate-limited, refused, or
   *  unreachable. The map has no atoms in that case for a reason that is NOT "you didn't say
   *  enough", and telling someone who typed six thoughts that they were too quiet is a lie. */
  modelUnavailable: boolean;
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

/** Carry forward any thought the settle did not account for. The settle is the one prune
 *  authority, so it REPLACES the map — but a model that summarizes five spoken thoughts into two
 *  atoms deletes three things the person actually said, and watching your own words disappear is
 *  the opposite of being listened to. So: when the settled map came back SMALLER than what was on
 *  screen, the unmatched atoms ride along (deduped by quote, and never past the leak cap). A
 *  settle that genuinely consolidates — same size or larger — is left exactly as the model built
 *  it. Exported for unit tests. */
export function keepUnaccountedAtoms(prior: MindAtom[], settled: MindShapeSpec): MindShapeSpec {
  if (settled.atoms.length >= prior.length) return settled;
  const covered = new Set(settled.atoms.map((a) => quoteKey(a.quote)));
  const carried = prior.filter((a) => {
    const key = quoteKey(a.quote);
    if (!key || covered.has(key)) return false;
    covered.add(key);
    return true;
  });
  if (!carried.length) return settled;
  return { ...settled, atoms: [...settled.atoms, ...carried].slice(0, MAX_ATOMS) };
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
  const [modelUnavailable, setModelUnavailable] = useState(false);
  const [spec, setSpec] = useState<MindShapeSpec | null>(null);

  // Mutable refs — avoid stale closures in callbacks
  const phaseRef = useRef<MindPhase>('idle');
  const specRef = useRef<MindShapeSpec | null>(null);
  const lastTranscriptRef = useRef(''); // transcript as of last patch call
  const lastRefineAt = useRef(0); // timestamp of last patch call
  const refineCount = useRef(0); // calls this session
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false); // a seed/patch is awaiting the model — don't start another
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
    if (!c) return;
    const prior = specRef.current;
    if (!prior || prior.atoms.length === 0) return; // nothing to patch against yet

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const delta = transcript.slice(lastTranscriptRef.current.length).trim();
    lastTranscriptRef.current = transcript;
    lastRefineAt.current = Date.now();
    refineCount.current += 1;

    inFlightRef.current = true;
    try {
      const patch = await patchMindShape(delta, prior, transcript, c, ctrl.signal);
      if (ctrl.signal.aborted || !patch) return;
      setSpecSync(pruneDismissed(mergeDelta(specRef.current ?? prior, patch)));
    } finally {
      if (!ctrl.signal.aborted) inFlightRef.current = false;
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
    if (!c) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    lastTranscriptRef.current = transcript;
    lastRefineAt.current = Date.now();
    refineCount.current += 1;

    inFlightRef.current = true;
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
      if (!ctrl.signal.aborted) inFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fire the settle call (full transcript → the complete, clean shape) ────────
  // Wholesale replace: settle is the single authority that can prune, so it corrects everything
  // the additive live loop accumulated and computes center + unsaid + the emergent themes.
  const fireSettle = useCallback(async (transcript: string) => {
    const c = cfgRef.current;
    if (!c) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    lastTranscriptRef.current = transcript;
    lastRefineAt.current = Date.now();
    refineCount.current += 1;

    // Same in-flight discipline as fireSeed/firePatch: settle aborts the in-flight patch above, and
    // that patch's own `finally` skips the reset because it sees `aborted`. Without claiming and
    // releasing the guard here too, `inFlightRef` would stay stuck true after a settle and block
    // every later patch (e.g. once the user resumes and speaks more).
    inFlightRef.current = true;
    try {
      const settled = await settleMindShape(transcript, c, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!settled) {
        // The transcript had words in it and the model gave nothing back — a refusal, a rate
        // limit, or an unreachable provider. Remember that, so the empty map can say which.
        setModelUnavailable(true);
        return;
      }
      setModelUnavailable(false);
      setSpecSync(keepUnaccountedAtoms(specRef.current?.atoms ?? [], settled));
    } finally {
      if (!ctrl.signal.aborted) inFlightRef.current = false;
    }
  }, []);

  // ── onTranscript: called on every interim update while listening ──────────
  const onTranscript = useCallback(
    (text: string) => {
      if (phaseRef.current === 'idle') setPhaseSync('listening');

      // One extraction per interim — feed the live atoms and reuse the same result for the gate.
      const localNow = localExtract(text);
      applyLocal(localNow);

      const wc = wordCount(text);
      const overCap = refineCount.current >= MAX_REFINE_CALLS;
      const tooSoon = Date.now() - lastRefineAt.current < REFINE_DEBOUNCE_MS;
      // Never start a second model call while one is awaiting — settle latency can exceed the
      // debounce, which would otherwise abort-and-refire and burn the call budget on empty maps.
      const ready = !overCap && !tooSoon && !inFlightRef.current;

      // No atoms yet — local heuristics came up dry (a non-emotional topic). Seed the whole map
      // from the model once enough has been said, so the live map builds for any subject.
      if ((specRef.current?.atoms.length ?? 0) === 0) {
        if (ready && wc >= FIRST_REFINE_WORDS) {
          void fireSeed(text);
        }
        return;
      }

      // Atoms exist — refine with a cheap delta patch when there's enough genuinely new material.
      const newWords = wc - wordCount(lastTranscriptRef.current);
      const newAtoms = localNow.filter(
        (a) => !specRef.current?.atoms.some((e) => e.id === a.id),
      ).length;
      const belowThreshold =
        wc < FIRST_REFINE_WORDS || (newWords < MIN_NEW_WORDS && newAtoms < MIN_NEW_ATOMS);

      if (ready && !belowThreshold) {
        void firePatch(text);
      }
    },
    [applyLocal, fireSeed, firePatch],
  );

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    dismissedRef.current.clear();
    lastTranscriptRef.current = '';
    lastRefineAt.current = 0;
    refineCount.current = 0;
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
    inFlightRef.current = false;
    lastTranscriptRef.current = '';
    lastRefineAt.current = 0;
    refineCount.current = 0;
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

  // Cancel any in-flight call on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const intent = useMemo<MindIntent>(() => (spec ? detectIntent(spec) : 'general'), [spec]);

  return {
    phase,
    spec,
    intent,
    modelUnavailable,
    onTranscript,
    onSpeechEnd,
    removeAtom,
    confirmUnsaid,
    dismissUnsaid,
    reset,
    resume,
  };
}
