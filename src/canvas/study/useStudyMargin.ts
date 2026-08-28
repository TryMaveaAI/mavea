// useStudyMargin.ts — where Mavéa's note sits, and the arrow that makes it point.
//
// ONE note at a time, and that is a finding rather than a simplification. Showing every object's
// note at once put five of them in one gutter with arrows crossing the foreground card and each
// other to reach objects on the far side — the study read as a wiring diagram. MarginNoteRail hit
// the same wall in the grid and answered it with two gutters plus a refusal to draw any tether
// that crosses a card; the study's objects ring its centre, so there is no path that does not.
//
// So the note follows attention: the object being held up, or the one under the pointer. The
// others are not lost — they are one hover away, which is also how a reader learns the background
// objects are live things they can pick.
//
// The foreground object is always centred. Its note uses one stable right gutter, so recasting the
// study changes the lesson instead of making the handwriting jump from side to side.
//
// Measured, never assumed: the note's height depends on its words and the object's box on which
// object it is, so both are read after layout and re-read when the study re-casts or resizes.
import { useEffect, useState, type RefObject } from 'react';

/** Pulled back from the object's edge so the head points AT the card rather than onto it. */
const HEAD_GAP = 9;
/** Under this the note is practically touching its object and a line between them is clutter. */
const MIN_SPAN = 40;
/** The note's inset from the stage edge — mirrors `.study-aside`'s own offset in study.css. */
const GUTTER_EDGE = 20;
/** How far a note may sit off its object's centre line, in px, either way. */
const DRIFT = 46;
/** How far the arrow's control point may swing, as a fraction of the gap it crosses. */
const BOW = 0.26;

/**
 * A stable pseudo-random in [0, 1) for a string. The pen seeds its hand-wobble the same way
 * (gesture.ts's mulberry32) and for the same reason: a note that lands level with its object every
 * single time reads as a machine placing a label, but a note that moves on every render reads as a
 * bug. Seeded off the object's id, each one has its OWN placement — and always the same one.
 */
function seeded(id: string, salt: string): number {
  let h = 2166136261;
  const text = `${id}:${salt}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // xorshift the accumulator so neighbouring ids ("live-3", "live-4") do not land together.
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

export interface StudyMargin {
  id: string;
  /** Which gutter the note sits in. Study teaching notes use the right side consistently. */
  side: 'left' | 'right';
  /** Top edge in stage coordinates. */
  top: number;
  /** Degrees of hand-set tilt, seeded off the object's id. */
  tilt: number;
  /** The curve and its head, in stage coordinates. Absent when the object is close enough that a
   *  line between them explains nothing. */
  tether?: { d: string; head: string };
  /** The stage's box — the SVG viewport the tether is plotted in. */
  w: number;
  h: number;
}

function arrowHead(tip: { x: number; y: number }, from: { x: number; y: number }): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const size = 7.5;
  const spread = 0.42;
  const a = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  };
  const b = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  };
  const f = (n: number): string => n.toFixed(1);
  return `M${f(a.x)},${f(a.y)} L${f(tip.x)},${f(tip.y)} L${f(b.x)},${f(b.y)}`;
}

/**
 * Lay the study's notes out in the gutter and draw each one's arrow.
 *
 * `ids` is the note order — the objects that have something to say, in the order they should
 * stack. `revision` is any value that changes when the study re-casts.
 */
/**
 * Place the note for `id` and draw its arrow, or null when there is nothing to place.
 *
 * `revision` is any value that changes when the study re-casts.
 */
export function useStudyMargin(
  stageRef: RefObject<HTMLElement | null>,
  id: string | null,
  revision: unknown,
): StudyMargin | null {
  const [margin, setMargin] = useState<StudyMargin | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !id) {
      setMargin(null);
      return;
    }

    // Never clears on a failed read: a re-measure that finds nothing yet (mid-travel, a card whose
    // family chunk has not landed) LEAVES the last good placement alone. Clearing it is what made
    // the note blink out every time the study moved — SpotInk's rule, for the same reason.
    const measure = (): void => {
      const s = stage.getBoundingClientRect();
      const note = stage.querySelector<HTMLElement>('.study-aside');
      const object = stage.querySelector(`[data-spot-id="${CSS.escape(id)}"]`);
      if (!s.width || !note || !object) return;
      const n = note.getBoundingClientRect();
      const b = object.getBoundingClientRect();
      if (!b.width || !n.height) return;

      const side = 'right' as const;
      // Level with the object, nudged off that line by the object's own seed, then held inside
      // the stage so a tall note near an edge still fits.
      const drift = (seeded(id, 'drift') - 0.5) * 2 * DRIFT;
      const wanted = b.top - s.top + b.height / 2 - n.height / 2 + drift;
      const top = Math.max(16, Math.min(wanted, s.height - n.height - 16));

      const from = {
        x: s.width - n.width - GUTTER_EDGE,
        y: top + n.height / 2,
      };
      const tip = {
        x: b.left - s.left + b.width + HEAD_GAP,
        y: b.top - s.top + b.height / 2,
      };
      let tether: StudyMargin['tether'];
      if (Math.abs(tip.x - from.x) >= MIN_SPAN) {
        // The bow is seeded too, so no two arrows in a study describe the same curve — a straight
        // line repeated at the same angle is what made the pointing read as a diagram connector.
        const bow = (seeded(id, 'bow') - 0.5) * 2 * BOW;
        const cx = from.x + (tip.x - from.x) * 0.42;
        const cy = from.y + (tip.y - from.y) * 0.12 + (tip.x - from.x) * bow * 0.42;
        const f = (v: number): string => v.toFixed(1);
        tether = {
          d: `M${f(from.x)},${f(from.y)} Q${f(cx)},${f(cy)} ${f(tip.x)},${f(tip.y)}`,
          head: arrowHead(tip, { x: cx, y: cy }),
        };
      }
      setMargin({
        id,
        side,
        top,
        // A degree either way: enough that the note reads as set down by a hand, not enough to
        // look broken. Seeded, so it never twitches between renders.
        tilt: (seeded(id, 'tilt') - 0.5) * 2.4,
        ...(tether ? { tether } : {}),
        w: s.width,
        h: s.height,
      });
    };

    const raf = requestAnimationFrame(measure);
    // Again once the travel has settled — measuring mid-FLIP would pin the arrow to where the
    // object was passing through rather than where it came to rest.
    const settle = setTimeout(measure, 470);
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(stage);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      observer?.disconnect();
    };
  }, [stageRef, id, revision]);

  return margin;
}
