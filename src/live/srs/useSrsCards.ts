// useSrsCards.ts — keep a flashcard surface in step with the store (which broadcasts SRS_EVENT on
// every write) without each component wiring its own listener.
//
// This is the blunt instrument: a counter that bumps on every write, for views that want to
// re-read several things at once. It deliberately imports nothing but the event name, so a surface
// that only needs "something changed" (the course pages) doesn't pull the study-queue reads into
// its chunk. The sharper, value-holding hooks live in ./useStudy.
import { useEffect, useState } from 'react';
import { SRS_EVENT } from './store';

export function useSrsRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => setRev((n) => n + 1);
    window.addEventListener(SRS_EVENT, onChange);
    return () => window.removeEventListener(SRS_EVENT, onChange);
  }, []);
  return rev;
}
