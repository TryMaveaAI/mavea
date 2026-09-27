// ExplodeChoice — the Compare / Synthesize pair for a set of attached sources. Live shows it in two
// places (the dock's attach strip, and the setup wizard's staged strip, which stands in for the dock
// the wizard hides), and both must follow the same count rule `#/synthesis` does, so it lives once.
import { useEffect, useRef, type ReactElement } from 'react';
import { explodeRoute } from '../attachments';

interface Props {
  /** How many sources Synthesis could read — the count the route is decided on. */
  count: number;
  onCompare: () => void;
  onSynthesize: () => void;
  /** A door that asked the reader to choose (⌘K, the launcher) hands them straight to the
   *  question: true moves focus to the first choice, then `onFocusHandled` clears the request. It
   *  is a request, not a counter, so a strip mounting later cannot act on a stale one. */
  focusRequested?: boolean;
  onFocusHandled?: () => void;
}

export function ExplodeChoice({
  count,
  onCompare,
  onSynthesize,
  focusRequested,
  onFocusHandled,
}: Props): ReactElement | null {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusRequested) return;
    first.current?.focus();
    onFocusHandled?.();
  }, [focusRequested, onFocusHandled]);

  if (count <= 1) return null;
  const route = explodeRoute(count);
  return (
    <>
      {route !== 'synthesis' && (
        <button
          ref={first}
          type="button"
          className="attach-explode attach-compare"
          aria-label={`Compare ${count} documents — map their claims and find where they agree and contradict`}
          title="Explode all documents together and compare them"
          onClick={onCompare}
        >
          ⊹ Compare {count} documents
        </button>
      )}
      {route !== 'prism' && (
        <button
          ref={route === 'synthesis' ? first : undefined}
          type="button"
          className="attach-explode attach-compare"
          aria-label={`Synthesize ${count} sources — fuse them into one map of themes, contradictions, and gaps`}
          title="Fuse all sources into one navigable Synthesis World"
          onClick={onSynthesize}
        >
          ⊹ Synthesize {count} sources
        </button>
      )}
    </>
  );
}
