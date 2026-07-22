// useStudy.ts — hooks that hold a VALUE read from the SRS store, rather than a change counter, so
// React can bail out of a render when the value hasn't actually moved. That matters most for the
// study count, which subscribes the whole Live tree.
//
// None of these poll. They recompute on a store write and when the tab regains focus — due-ness
// only crosses a boundary with the clock, and the focus listener covers a session left open
// overnight without waking a weak machine up to recount a deck nobody is looking at.
import { useEffect, useState } from 'react';
import { getCounts, getStudyPrefs, getStudyStyle, SRS_EVENT } from './store';
import { countStudyable, studyPrompt } from './queue';
import type { SrsCounts, StudyPrefs, StudyStyle } from './store';

/** Subscribe to the store, recomputing `read` on every write and whenever the tab regains focus. */
function useSrsValue<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = (): void => setValue(read());
    // A value read during the first render can already be stale by the time the effect runs.
    sync();
    window.addEventListener(SRS_EVENT, sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener(SRS_EVENT, sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
    // `read` is a stable module function at every call site; re-subscribing on it would churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/**
 * How many cards a study session would serve right now — the Practice badge's read; 0 under the
 * collection style, so the badge simply never appears there.
 *
 * Recomputed on store writes and on focus, never on a timer: the weakest machine shouldn't wake up
 * to recount a deck nobody is looking at, and due-ness only crosses a boundary with the clock,
 * which the focus listener covers for any session left open overnight. Holding the NUMBER (rather
 * than a revision counter) lets React bail out when the count hasn't actually changed — this
 * subscribes the whole LiveApp tree, so an unconditional re-render would be expensive.
 */
export function useStudyableCount(): number {
  return useSrsValue(countStudyable);
}

/** The collection's study style, kept in sync across the settings panel and the study surfaces. */
export function useStudyStyle(): StudyStyle {
  return useSrsValue(getStudyStyle);
}

/** Style, intake rate, and whether the one-time question has been settled. */
export function useStudyPrefs(): StudyPrefs {
  return useSrsValue(getStudyPrefs);
}

/** The sidebar/settings tallies, recomputed whenever the collection or its style changes. */
export function useCardCounts(): SrsCounts {
  return useSrsValue(() => getCounts());
}

/**
 * The reason to open Mavéa with no question in mind, or null when there isn't one — so the
 * surfaces that render it can disappear entirely rather than showing an empty shelf.
 */
export function useStudyPrompt(): ReturnType<typeof studyPrompt> {
  return useSrsValue(() => studyPrompt());
}
