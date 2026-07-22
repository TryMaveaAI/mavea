// useAskHint — the one-time coach hint pointing out the per-element "ask about this" affordance.
// Once the user has seen it (dismissed it or used the affordance) it never returns, remembered
// across sessions in localStorage. Purely a UI flag — it never touches the turn loop.
import { useCallback, useState } from 'react';

/** localStorage flag: the per-element "ask about this" coach hint has been seen. */
export const ASK_HINT_STORAGE_KEY = 'mavea-live-ask-hint';

export interface UseAskHint {
  /** True once the hint has been seen — hides it for good. */
  askHintSeen: boolean;
  /** Mark the coach hint as seen (and remember it across sessions). */
  dismissAskHint: () => void;
}

export function useAskHint(): UseAskHint {
  const [askHintSeen, setAskHintSeen] = useState(() => {
    try {
      return localStorage.getItem(ASK_HINT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Mark the coach hint as seen (and remember it across sessions).
  const dismissAskHint = useCallback(() => {
    setAskHintSeen(true);
    try {
      localStorage.setItem(ASK_HINT_STORAGE_KEY, '1');
    } catch {
      // Private-mode storage failure is non-fatal — the hint just shows again next session.
    }
  }, []);

  return { askHintSeen, dismissAskHint };
}
