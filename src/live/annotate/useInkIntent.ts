// The Mark highlighter's brain. A captured stroke is resolved to the text it was drawn over and
// PINNED — drawn in place and named in a chip — so the user sees exactly what got grabbed before
// anything fires. Nothing auto-commits: the turn runs only when the user asks (types a question, or
// taps Ask). Confirm-first by design; the old blind settle-and-fire — which committed a guessed
// gesture before the grab could be verified — is gone. All state is a flat list of pins.
import { useCallback, useEffect, useRef, useState } from 'react';
import { polyline, type Pt, type StageRect } from './geometry';
import { resolveHighlight, type InkStrokeCtx } from './resolve';
import type { HitTester } from './hitTest';
import type { InkIntent } from './inkIntent';

export type InkPhase = 'idle' | 'pinned';

export interface PinnedMark {
  intent: InkIntent;
  /** SVG path of the freehand stroke (stage-local); '' for a tap-pin, which has no path. */
  stroke: string;
  /** Highlight rects over the grabbed text — the confirm-first proof of what the mark captured. */
  rects: StageRect[];
}

export interface UseInkIntent {
  phase: InkPhase;
  /** The pinned marks — the chips + in-place highlights read from this. */
  pins: PinnedMark[];
  /** Derived from pins: the intents to ground a turn (back-compat with the submit/onCommit paths). */
  intents: InkIntent[];
  /** Derived: the freehand stroke paths to keep drawn (UserInkLayer). */
  strokes: string[];
  /** Derived: every pin's highlight rects, flattened (UserInkLayer draws these in place). */
  highlights: StageRect[];
  /** Bumps when a stroke or tap resolves to NOTHING (open space) — the chrome shows a brief, honest
   *  "nothing to grab" nudge instead of the mark silently vanishing. */
  miss: number;
  onStroke: (pts: Pt[], ctx: InkStrokeCtx) => void;
  /** A deliberate tap while armed — grabs the single word under it, or nudges on a miss. */
  onTap: (pt: Pt, ctx: InkStrokeCtx) => void;
  /** Remove a pin by index (the chip's ✕), or the last when no index is given. */
  undo: (index?: number) => void;
  send: () => void;
  clear: () => void;
}

function toStageRects(rects: readonly DOMRect[], svgRect: DOMRect): StageRect[] {
  return rects.map((r) => ({
    x: r.left - svgRect.left,
    y: r.top - svgRect.top,
    w: r.width,
    h: r.height,
  }));
}

export function useInkIntent(opts: {
  /** Fire the turn with the accumulated intents (Ask / explicit send). */
  onCommit: (intents: InkIntent[]) => void;
  /** Changes per turn (turn.turn / topic) — clears pending marks on a new answer. */
  resetKey: unknown;
  /** Test seam: defaults to the live-browser hit tester. */
  hitTester?: HitTester;
}): UseInkIntent {
  const { onCommit, resetKey, hitTester } = opts;
  const [pins, setPins] = useState<PinnedMark[]>([]);
  const [miss, setMiss] = useState(0);

  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const pinFrom = useCallback(
    (pts: Pt[], stroke: string, ctx: InkStrokeCtx): boolean => {
      const res = resolveHighlight(pts, ctx, hitTester);
      if (!res) {
        setMiss((n) => n + 1);
        return false;
      }
      const pin: PinnedMark = {
        intent: res.intent,
        stroke,
        rects: toStageRects(res.rects, ctx.svgRect),
      };
      setPins((p) => [...p, pin]);
      return true;
    },
    [hitTester],
  );

  const onStroke = useCallback(
    (pts: Pt[], ctx: InkStrokeCtx) => {
      pinFrom(pts, polyline(pts), ctx);
    },
    [pinFrom],
  );

  // A tap probes a tiny stroke around the point — grabs the single word there (or misses honestly).
  const onTap = useCallback(
    (pt: Pt, ctx: InkStrokeCtx) => {
      pinFrom([pt, { x: pt.x + 1, y: pt.y + 1 }], '', ctx);
    },
    [pinFrom],
  );

  const undo = useCallback((index?: number) => {
    setPins((p) => (index == null ? p.slice(0, -1) : p.filter((_, i) => i !== index)));
  }, []);

  const send = useCallback(() => {
    const cur = pinsRef.current;
    if (cur.length) onCommitRef.current(cur.map((p) => p.intent));
    setPins([]);
  }, []);

  const clear = useCallback(() => setPins([]), []);

  // New turn clears any pending marks.
  useEffect(() => {
    setPins([]);
  }, [resetKey]);

  const intents = pins.map((p) => p.intent);
  const strokes = pins.map((p) => p.stroke).filter(Boolean);
  const highlights = pins.flatMap((p) => p.rects);

  return {
    phase: pins.length ? 'pinned' : 'idle',
    pins,
    intents,
    strokes,
    highlights,
    miss,
    onStroke,
    onTap,
    undo,
    send,
    clear,
  };
}
