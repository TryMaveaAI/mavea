// The in-session record of the pen annotations the reader saw Mavéa draw, ready for the share reel.
// Kept in a ref (a dataURL per step is heavy, and the live draw shouldn't re-render the overlay);
// `count` is the only reactive bit, so the "Share as reel" button can show/enable when there's
// something to share. Deduped by seed (same page+passage) and capped to bound memory.
import { useCallback, useRef, useState } from 'react';
import type { AnnotationStep } from './steps';

/** Keep memory bounded — each step carries a JPEG dataURL. Oldest annotations fall off. */
const MAX_STEPS = 16;

export interface AnnotationReel {
  steps: { readonly current: AnnotationStep[] };
  count: number;
  record: (step: AnnotationStep) => void;
  clear: () => void;
}

export function useAnnotationReel(): AnnotationReel {
  const steps = useRef<AnnotationStep[]>([]);
  const [count, setCount] = useState(0);

  const record = useCallback((step: AnnotationStep) => {
    const arr = steps.current;
    const i = arr.findIndex((s) => s.seed === step.seed);
    if (i >= 0) {
      // Same passage marked again — keep the latest (its explanation may have changed).
      arr[i] = step;
    } else {
      arr.push(step);
      if (arr.length > MAX_STEPS) arr.shift();
    }
    setCount(arr.length);
  }, []);

  const clear = useCallback(() => {
    steps.current = [];
    setCount(0);
  }, []);

  return { steps, count, record, clear };
}
