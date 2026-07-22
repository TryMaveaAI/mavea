// useSignals.ts — tracks transient pattern-recognition chips shown near the center face.
// Signals fire at most once per kind per session, auto-expire after 5 seconds, and are purely
// presentational (never spoken, no model call). Kept separate from useMindShape so the signal
// lifecycle doesn't pollute the core phase machine.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MindPhase } from '../../canvas/blocks/diagrams/MindShape';
import type { MindSignal, MindShapeSpec } from './types';

const SIGNAL_TTL_MS = 5_000;

let nextSignalId = 0;

export function useSignals(
  spec: MindShapeSpec | null,
  phase: MindPhase,
): { currentSignal: MindSignal | null } {
  const [signals, setSignals] = useState<MindSignal[]>([]);
  const signaledRef = useRef<Set<string>>(new Set());

  const addSignal = useCallback((kind: MindSignal['kind'], content: string) => {
    const id = `sig-${++nextSignalId}`;
    setSignals([{ id, content, kind, expiresAt: Date.now() + SIGNAL_TTL_MS }]);
  }, []);

  // Sleep until the active signal actually expires. The old unconditional 1Hz sweep kept a timer
  // alive for the entire Live session even when there was no signal to expire; scheduling only the
  // next deadline makes the idle path truly idle and removes up to five needless wake-ups per TTL.
  useEffect(() => {
    const next = signals[0];
    if (!next) return;
    const delay = Math.max(0, next.expiresAt - Date.now());
    const t = window.setTimeout(() => {
      setSignals((prev) => prev.filter((signal) => signal.expiresAt > Date.now()));
    }, delay);
    return () => window.clearTimeout(t);
  }, [signals]);

  // Reset signal memory when thinking session resets to idle
  useEffect(() => {
    if (phase === 'idle') {
      signaledRef.current.clear();
      setSignals([]);
    }
  }, [phase]);

  // Trigger signals from spec changes
  useEffect(() => {
    if (!spec || phase === 'settled' || phase === 'idle') return;
    const n = spec.atoms.length;
    const seen = signaledRef.current;

    if (n >= 4 && !seen.has('pattern')) {
      seen.add('pattern');
      addSignal('pattern', 'A shape is forming…');
    }
    if (spec.links.some((l) => l.kind === 'tensions' && !l.provisional) && !seen.has('tension')) {
      seen.add('tension');
      addSignal('tension', 'I see a pull here…');
    }
    if (spec.unsaid && !seen.has('unsaid')) {
      seen.add('unsaid');
      addSignal('unsaid', "There's something unsaid circling…");
    }
    if (n >= 8 && !seen.has('depth')) {
      seen.add('depth');
      addSignal('depth', 'This runs deeper than one answer…');
    }
  }, [spec, phase, addSignal]);

  return { currentSignal: signals[0] ?? null };
}
