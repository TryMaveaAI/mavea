// StartWith — the front door to Mavéa's capabilities on a brand-new conversation.
//
// Every mode is mounted from the first paint, but the setup wizard hides the whole topbar and dock
// (setup-wizard.css, voice.css) — so the feature menus, the ⌘K handle, the paperclip and the attach
// strip's Explode button are all invisible until you have typed something. The only way to reach
// Prism, Just listen or Watch me think was to ask a throwaway question first, which is not a door.
//
// The rows come from the FEATURES registry, never a hand-written list: registry.ts says a new
// capability becomes discoverable by adding ONE entry, and a fourth copy of the catalogue here
// would quietly break that. What IS decided here is which of them make sense as a STARTING point —
// a place to begin, rather than something you do to an answer you already have.
import type { ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import type { Feature } from '../features/registry';
import './start-with.css';

/** Everything a launcher row needs, resolved by the host so availability and the "why not yet"
 *  reason stay shared with the command palette rather than computed twice. */
export interface StartWithItem {
  feature: Feature;
  available: boolean;
  reason?: string;
  /** Replaces the registry blurb when this row's action differs from the general one — Prism's
   *  card opens a file picker before there is anything to split, and has to say so. */
  blurb?: string;
  run: () => void;
  preload?: () => Promise<void>;
}

export function StartWith({
  items,
  onSeeHow,
}: {
  items: readonly StartWithItem[];
  /** "See how" for a row that has a walkthrough chapter — omitted when none can be played. */
  onSeeHow?: (feature: Feature) => void;
}): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section className="start-with" aria-label="Ways to start">
      {/* Distinct from the starter chips right above, which are example QUESTIONS. These are
          places to begin that a question would not get you to. */}
      <span className="card-eyebrow start-with-head">Or start a different way</span>
      <ul className="start-with-grid">
        {items.map((it) => (
          <li key={it.feature.id}>
            <button
              type="button"
              className={'start-with-card' + (it.available ? '' : ' is-unavailable')}
              onClick={it.run}
              onPointerEnter={it.preload}
              onFocus={it.preload}
            >
              <span className="start-with-label">{it.feature.label}</span>
              {/* An unavailable row stays visible and says WHY, the same choice the command
                  palette makes — a capability that vanishes reads as one that doesn't exist. */}
              <span className="start-with-blurb">
                {it.available
                  ? (it.blurb ?? it.feature.blurb)
                  : (it.reason ?? it.blurb ?? it.feature.blurb)}
              </span>
            </button>
            {onSeeHow && it.feature.tourChapter && (
              <button
                type="button"
                className="start-with-see"
                onClick={() => onSeeHow(it.feature)}
                aria-label={`See how ${it.feature.label} works`}
              >
                <Icon.play /> See how
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
