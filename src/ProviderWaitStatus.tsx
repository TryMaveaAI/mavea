// ProviderWaitStatus.tsx — the app shell's one line for a provider backoff no surface is showing.
//
// A 429/503/529 makes the adapter wait and re-send. The Live turn and the world say so in place;
// every other feature reports through providers/wait, and this is where the reader hears about it,
// on whichever route they are on. Nothing renders while nothing waits.
import { useEffect, useState, type ReactElement } from 'react';
import { subscribeProviderWait, type ProviderWait } from './live/providers/wait';

export function ProviderWaitStatus(): ReactElement {
  const [wait, setWait] = useState<ProviderWait | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeProviderWait(setWait), []);

  // A countdown only while something waits; idle means no timer at all.
  useEffect(() => {
    if (!wait) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [wait]);

  const seconds = wait ? Math.max(0, Math.ceil((wait.until - now) / 1_000)) : 0;
  return (
    // The live region stays mounted so a screen reader announces the line when it appears.
    <div className="provider-wait" role="status" aria-live="polite">
      {wait && (
        <span className="toast show">
          <span className="toast-dot" aria-hidden="true" />
          {seconds > 0
            ? `Your provider asked Mavéa to wait — retrying in ${seconds}s`
            : 'Your provider asked Mavéa to wait — retrying now'}
        </span>
      )}
    </div>
  );
}
