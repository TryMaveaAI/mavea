// WorldTransport — the walk's one control: play/pause, a beat per segment, and the line being said.
//
// Two decisions worth knowing before editing this.
//
// It is a CONSTANT height, and the caption slot is always present even when empty. The bar floats
// inside the camera's own viewport, so the stage reserves space for it with `insetBottom` — and a
// band that grew when the walk started would re-fit the whole world at the exact moment the reader
// pressed play. Reserving the full height up front costs a strip of air while idle and buys a world
// that never jumps. `TRANSPORT_BAND` is the single source of that number: it reaches the sheet as a
// custom property, so the reserve and the paint cannot drift apart.
//
// The caption is rendered HERE rather than through turnstate's SpeakingDock, which is voice-gated by
// contract ("when muted the caller hides it entirely"). A world walk has to caption in the silent
// case too — muted, or a harness with no voice wired at all — or the muted reader gets a camera
// flying between cards with nothing telling them why. What is worth borrowing from that component is
// `renderHeroLine`, so a figure inside a spoken line still takes the highlight mark; that is shared.
import type { CSSProperties, ReactElement } from 'react';
import { renderHeroLine } from '../voice/emphasize';

/** The bar's height while a walk is RUNNING — control row plus the caption under it. */
export const TRANSPORT_BAND = 108;
/** …and while it is idle, when there is no line to show and the bar is just its own controls.
 *
 *  Reserving the full band at rest was the first attempt and it cost every OTHER view a third of the
 *  stage's height: the camera fits into the viewport LESS the inset, so a permanent 132px band
 *  dropped the timeline's axis labels to 7.7px and shrank the chart's marks under the 24px target
 *  floor — the audit caught both. The band now grows once, when the reader presses play, and the
 *  camera's own 1100ms flight absorbs the change. */
export const TRANSPORT_IDLE = 54;

export interface WorldTransportProps {
  /** How many beats the walk holds. Zero means there is nothing to walk and nothing is rendered. */
  count: number;
  /** The beat on screen, or -1 before the walk has started. */
  index: number;
  playing: boolean;
  /** The current beat's shown line. Null while idle. */
  caption: string | null;
  /** Whether the caption row is showing — the stage reserves its height to match, so the two must
   *  be told the same thing rather than each deciding for itself. */
  expanded: boolean;
  onToggle: () => void;
  onSeek: (index: number) => void;
  /** Nothing on this world has been touched yet. The walk is the best first move a reader can make
   *  here — it costs no model call, it explains the world, and it TEACHES the other two affordances
   *  by performing them (it selects causes, lights links, changes the view). It was also the
   *  quietest control on screen. While the surface is untouched it leads; the first interaction of
   *  any kind settles it back for good. */
  inviting?: boolean;
}

export function WorldTransport({
  count,
  index,
  playing,
  caption,
  expanded,
  onToggle,
  onSeek,
  inviting,
}: WorldTransportProps): ReactElement | null {
  if (count === 0) return null;
  const at = Math.min(Math.max(index, -1), count - 1);
  return (
    <div
      className="wo-transport"
      data-playing={playing ? '' : undefined}
      data-open={expanded ? '' : undefined}
      style={
        {
          '--wo-transport-h': `${expanded ? TRANSPORT_BAND : TRANSPORT_IDLE}px`,
        } as CSSProperties
      }
    >
      <div className="wo-transport-row">
        <button
          type="button"
          className="wo-play"
          data-inviting={inviting && !playing ? '' : undefined}
          onClick={onToggle}
          aria-label={playing ? 'Pause the walkthrough' : 'Walk me through it'}
        >
          <span className="wo-play-glyph" aria-hidden="true">
            {playing ? '❙❙' : '▶'}
          </span>
          <span className="wo-play-label">{playing ? 'Pause' : 'Walk me through it'}</span>
        </button>
        {inviting && !playing && <span className="wo-play-aside">or press any cause</span>}
        {/* One segment per beat. Real buttons, not a slider: the beats are discrete and named, so a
            reader can jump to the cause they care about and a screen reader can say which.
            Only while the walk is up. The track spans the stage, and the stage is a CANVAS the
            reader pans — on a window small enough for the world to overflow, a full-width strip of
            targets sits on top of the cards they were reaching for and takes the click. The play
            button alone is a small pill in the corner; the track arrives with the walk that needs
            it, by which point the reader is watching rather than pointing. */}
        {expanded && (
          <>
            <div className="wo-track" role="group" aria-label="Walkthrough beats">
              {Array.from({ length: count }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className="wo-tick"
                  data-state={i < at ? 'past' : i === at ? 'now' : 'ahead'}
                  onClick={() => onSeek(i)}
                  aria-label={`Beat ${i + 1} of ${count}`}
                  aria-current={i === at ? 'step' : undefined}
                />
              ))}
            </div>
            <span className="wo-transport-count" aria-hidden="true">
              {at < 0 ? count : at + 1}/{count}
            </span>
          </>
        )}
      </div>
      {/* Rendered for the whole walk, empty beat or not, so the row cannot appear and disappear
          between beats. `aria-live` announces each one to a screen reader, which is the only channel
          a caption has when the voice is off. */}
      {expanded && (
        <p className="wo-caption" aria-live="polite">
          {caption === null ? '' : renderHeroLine(caption)}
        </p>
      )}
    </div>
  );
}
