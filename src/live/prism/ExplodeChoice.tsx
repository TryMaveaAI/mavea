// ExplodeChoice — the Compare / Synthesize pair for a set of attached sources. Live shows it in two
// places (the dock's attach strip, and the setup wizard's staged strip, which stands in for the dock
// the wizard hides), and both must follow the same count rule `#/synthesis` does, so it lives once.
import { useEffect, useRef, type ReactElement } from 'react';
import { explodeRoute, type ExplodeSources } from '../attachments';

interface Props {
  /** What Prism can compare and Synthesis can read, from `explodeSources`: the one count rule. */
  sources: ExplodeSources;
  onCompare: () => void;
  onSynthesize: () => void;
  /** A door that asked the reader to choose (⌘K, the launcher) hands them straight to the
   *  question: true moves focus to the first choice, then `onFocusHandled` clears the request. It
   *  is a request, not a counter, so a strip mounting later cannot act on a stale one. */
  focusRequested?: boolean;
  onFocusHandled?: () => void;
}

export function ExplodeChoice({
  sources,
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

  const compare = sources.docs.length;
  const synthesize = sources.readable.length;
  if (compare <= 1) return null;
  const route = explodeRoute(synthesize);
  return (
    // A group, so focus landing on the first choice announces what the choice is about.
    <div className="explode-choice" role="group" aria-label={`Map ${compare} documents`}>
      {route !== 'synthesis' && (
        <button
          ref={first}
          type="button"
          className="attach-explode attach-compare"
          aria-label={`Compare ${compare} documents — map their claims and find where they agree and contradict`}
          title="Explode all documents together and compare them"
          onClick={onCompare}
        >
          ⊹ Compare {compare} documents
        </button>
      )}
      {route !== 'prism' && (
        <button
          ref={route === 'synthesis' ? first : undefined}
          type="button"
          className="attach-explode attach-compare"
          aria-label={`Synthesize ${synthesize} sources — fuse them into one map of themes, contradictions, and gaps`}
          title="Fuse all sources into one navigable Synthesis World"
          onClick={onSynthesize}
        >
          ⊹ Synthesize {synthesize} sources
        </button>
      )}
    </div>
  );
}
