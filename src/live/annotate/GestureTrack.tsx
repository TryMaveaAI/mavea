// GestureTrack — a compact log of every stroke Mavéa has drawn this turn, with
// timestamps and a toggle so the user can quiet the pen at any time. Appears
// once the first annotation fires and fades out when the user dismisses it.
//
// The panel is positioned inside `.canvas-stage` (absolute, lower-right) so it
// floats over the canvas without pushing layout. Each entry carries the elapsed
// time since the turn started, an icon for the gesture kind, and the target text
// the model named (or a short excerpt of the spoken line when no target is known).
//
// Entries are clickable — tapping one scrolls to and flashes that card. Each also
// carries a show/hide eye button so the user can quiet individual annotations.
import { useCallback, type ReactElement } from 'react';
import type { TourMark } from '../../engine/liveSchema';
import './gesture-track.css';

export interface GestureEntry {
  spot: string;
  /** Typed off TourMark itself so the log's vocabulary can never drift from the schema's. */
  kind?: TourMark['kind'];
  /** The exact on-block text the model named for this gesture. */
  at?: string;
  /** The far-end text a span/connect gesture names (a trend's landing point, a connector's
   *  target on the OTHER block) — shown alongside `at` for those kinds. */
  to?: string;
  /** Spoken line fallback when no named target is available. */
  line?: string;
  /** Generous (teach/tapped) — no model-authored target. */
  generous?: boolean;
  /** When ink() was called (Date.now()), for elapsed display. */
  inkedAt: number;
  /** Ink color tone for this gesture. */
  color?: 'warm' | 'key' | 'cool';
  /** Animation delay in ms (for sequential multi-mark reveals). */
  delayMs?: number;
  /** This mark's 1-based position in a multi-step stop — shown as "Step N" in the log. */
  stepNumber?: number;
  /** "connect" only: the OTHER block's data-spot-id the arrow lands on — the log reads
   *  "connects A → B" and jumping to the entry can bring both cards into view. */
  toSpot?: string;
}

function gestureIcon(kind?: string): string {
  if (kind === 'circle') return '○';
  if (kind === 'point') return '→';
  if (kind === 'underline') return '—';
  if (kind === 'highlight') return '▬';
  if (kind === 'rising') return '↗';
  if (kind === 'falling') return '↘';
  if (kind === 'bracket') return '⊓';
  if (kind === 'note') return '✎';
  if (kind === 'connect') return '⤳';
  if (kind === 'strike') return '✕';
  if (kind === 'question') return '?';
  if (kind === 'star') return '★';
  if (kind === 'check') return '✓';
  if (kind === 'frame') return '▢';
  if (kind === 'brace') return '{';
  return '✦';
}

function gestureVerb(kind?: string): string {
  if (kind === 'circle') return 'circles';
  if (kind === 'point') return 'arrow:';
  if (kind === 'underline') return 'underlines';
  if (kind === 'highlight') return 'highlights';
  if (kind === 'rising') return 'trend up:';
  if (kind === 'falling') return 'trend down:';
  if (kind === 'bracket') return 'brackets';
  if (kind === 'note') return 'notes';
  if (kind === 'connect') return 'connects:';
  if (kind === 'strike') return 'strikes out';
  if (kind === 'question') return 'questions';
  if (kind === 'star') return 'stars';
  if (kind === 'check') return 'checks off';
  if (kind === 'frame') return 'frames';
  if (kind === 'brace') return 'groups';
  return 'drew on';
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function entryLabel(entry: GestureEntry): string {
  if (entry.kind === 'connect' && entry.at && entry.to) return `${entry.at} → ${entry.to}`;
  if (entry.at) return entry.at;
  if (entry.line) {
    const words = entry.line.split(/\s+/).slice(0, 4).join(' ');
    return words.length < entry.line.length ? `${words}…` : words;
  }
  return entry.spot;
}

export function GestureTrack({
  entries,
  turnStartMs,
  annotationsEnabled,
  hiddenSpots,
  onToggle,
  onKeep,
  onClear,
  onClip,
  onJumpTo,
  onToggleSpot,
}: {
  entries: GestureEntry[];
  turnStartMs: number;
  annotationsEnabled: boolean;
  /** Spots whose ink is temporarily hidden. */
  hiddenSpots?: ReadonlySet<string>;
  onToggle: () => void;
  /** Dismiss the track panel (strokes stay on the cards). */
  onKeep: () => void;
  /** Clear the ink and dismiss. */
  onClear: () => void;
  /** Open the clip/share flow for this annotated moment. */
  onClip?: () => void;
  /** Scroll to and flash the card for this spot — a connect entry's `toSpot` frames both. */
  onJumpTo?: (spot: string, toSpot?: string) => void;
  /** Toggle visibility of one specific annotation. */
  onToggleSpot?: (spot: string) => void;
}): ReactElement {
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle],
  );

  return (
    <div className="gesture-track" role="complementary" aria-label="Gesture track">
      <div className="gesture-track-header">
        <span className="gesture-track-eyebrow">Gesture track</span>
        <button
          type="button"
          className={`gesture-track-toggle ${annotationsEnabled ? 'on' : 'off'}`}
          onClick={handleToggle}
          title={annotationsEnabled ? 'Turn off drawing' : 'Turn on drawing'}
          aria-label={
            annotationsEnabled ? 'Drawing on — tap to turn off' : 'Drawing off — tap to turn on'
          }
          aria-pressed={annotationsEnabled}
        >
          <span className="gesture-track-toggle-icon">✦</span>
          <span>{annotationsEnabled ? 'Pen on' : 'Pen off'}</span>
          <span className="gesture-track-toggle-switch" aria-hidden="true">
            <span className="gesture-track-toggle-knob" />
          </span>
        </button>
      </div>

      <ol className="gesture-track-list" aria-label="Drawn gestures">
        {entries.map((entry) => {
          const hidden = hiddenSpots?.has(entry.spot) ?? false;
          return (
            <li
              key={`${entry.spot}|${entry.kind ?? ''}|${entry.at ?? ''}`}
              className={`gesture-track-entry${hidden ? ' is-hidden' : ''}`}
            >
              <button
                type="button"
                className="gesture-track-entry-btn"
                onClick={() => onJumpTo?.(entry.spot, entry.toSpot)}
                title="Jump to this annotation"
              >
                <span className="gesture-track-time">
                  {formatElapsed(entry.inkedAt - turnStartMs)}
                </span>
                <span className="gesture-track-icon" aria-hidden="true">
                  {gestureIcon(entry.kind)}
                </span>
                <span className="gesture-track-desc">
                  {entry.stepNumber && (
                    <span className="gesture-track-step">Step {entry.stepNumber}</span>
                  )}
                  <span className="gesture-track-verb">{gestureVerb(entry.kind)}</span>{' '}
                  <span className="gesture-track-target" title={entryLabel(entry)}>
                    {entryLabel(entry)}
                  </span>
                </span>
              </button>
              {onToggleSpot && (
                <button
                  type="button"
                  className="gesture-track-eye"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSpot(entry.spot);
                  }}
                  title={hidden ? 'Show annotation' : 'Hide annotation'}
                  aria-pressed={hidden}
                  aria-label={hidden ? 'Show annotation' : 'Hide annotation'}
                >
                  {hidden ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path
                        d="M1.5 1.5L10.5 10.5M5 5.3C5 5.3 5.4 5 6 5c.9 0 1.5.7 1.5 1.5 0 .5-.2.9-.5 1.2"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M2 3.5C1 4.4.5 5.2.5 6s1.5 3 5.5 3c.9 0 1.7-.1 2.4-.4M10 8.5c1-1 1.5-1.8 1.5-2.5s-1.5-3-5.5-3c-.5 0-1 0-1.4.1"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <ellipse
                        cx="6"
                        cy="6"
                        rx="5.5"
                        ry="3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <circle cx="6" cy="6" r="1.5" fill="currentColor" />
                    </svg>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <p className="gesture-track-hint">
        Your blue ink, Mavéa&apos;s orange. Tap an entry to jump to it.
      </p>

      <div className="gesture-track-actions">
        <button type="button" className="gesture-track-btn primary" onClick={onKeep}>
          Keep annotations
        </button>
        {onClip && (
          <button type="button" className="gesture-track-btn" onClick={onClip}>
            Clip this moment
          </button>
        )}
        <button type="button" className="gesture-track-btn ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
