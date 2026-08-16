// WhatIfFrame.tsx — the frame that keeps a counterfactual from being mistaken for an observation.
// Untouched, the answer is one column: what was actually measured. Pull a lever and a SECOND column
// appears beside it, permanently chipped HYPOTHETICAL (MODELED) — the observed figure never moves,
// never gets overwritten, and the two live side by side so the comparison is the point.
//
// The honesty ladder is the same one the Why Machine walks: an exact delta only when the whole path
// is grounded, otherwise words with no digits in them, otherwise a dash. The chip carries the
// meaning, so a reader who never sees the dash still knows which column is modelled.
import { memo, type ReactElement } from 'react';
import { withUnit } from '../../canvas/lib/format';
import { relativeDeltaPhrase } from './phrase';
import './trust.css';

/** A cascade readout, flattened to plain numbers so this frame never imports the engine. */
export interface WhatIfReadout {
  /** The outcome's measured magnitude, or null when nothing grounds it. */
  exactBase: number | null;
  /** Change vs. baseline in the outcome's own units — non-null only when fully grounded. */
  exactDelta: number | null;
  /** Fraction of the outcome explained by active causes (0..1). */
  explainedPct: number | null;
  fullyGrounded: boolean;
  /** Structure-only relative strength (0..1) before and after the intervention. */
  relBase: number | null;
  relCur: number | null;
}

interface WhatIfFrameProps {
  baseline: WhatIfReadout;
  current: WhatIfReadout;
  unit?: string;
  /** True once an intervention is set — the hypothetical column exists only then. */
  active: boolean;
  /** Why the observed column has no figure, in the surface's own words — it knows things the
   *  ladder cannot see (an illustrative world measured nothing at all, whatever tiers it wrote).
   *  Prose only: this frame prints no digit it cannot back. Omitted, the ladder answers for itself.
   */
  observedNote?: string;
}

const HYPOTHETICAL_TITLE =
  'Recomputed locally from the causes above — a model of what would happen, never an observation.';
const OBSERVED_TITLE =
  'What was actually measured. This column never moves when a lever is pulled.';

function signed(delta: number, unit?: string): string {
  return (delta > 0 ? '+' : '') + withUnit(delta, unit);
}

/**
 * Is this really a share of the outcome? `explainedPct` is contracted as a fraction in 0..1, and on
 * a web whose links only reinforce it is one. A DAMPENING link carries sign −1 straight into the
 * engine's sum, so a grounded world with one — the ordinary case, not a corner — hands this frame a
 * negative number, and the line rendered as "−29% explained", which means nothing to anybody.
 *
 * The engine's semantics are the real fix and they are not this file's to change; what this frame
 * owes the reader is to print nothing rather than nonsense. The delta and the projected total above
 * it are computed separately and stay, so the answer is not lost — only the line that was lying.
 */
function isShare(pct: number | null): pct is number {
  return pct !== null && Number.isFinite(pct) && pct >= 0 && pct <= 1;
}

/**
 * Why the observed column has no figure. A dash on its own reads as a bug — or worse, as a number
 * that failed to load — so the ladder says out loud which rung it stopped on. Both answers are
 * prose by construction: this frame never emits a digit it cannot back.
 */
function observedGap(baseline: WhatIfReadout): string {
  return baseline.exactBase === null
    ? 'nothing measured stands behind this outcome'
    : 'not every step is grounded, so the total stays unmeasured';
}

function WhatIfFrameView({
  baseline,
  current,
  unit,
  active,
  observedNote,
}: WhatIfFrameProps): ReactElement {
  const observed =
    baseline.fullyGrounded && baseline.exactBase !== null
      ? withUnit(baseline.exactBase, unit)
      : null;
  const base = current.exactBase ?? baseline.exactBase;
  return (
    <div className="tr-wi" data-active={active ? '1' : undefined}>
      <div className="tr-wi-col">
        <span className="tr-chip tr-wi-chip" title={OBSERVED_TITLE}>
          OBSERVED
        </span>
        {observed !== null ? (
          <p className="tr-wi-figure">{observed}</p>
        ) : (
          <>
            <p className="tr-wi-figure tr-wi-dash">—</p>
            <p className="tr-wi-note tr-wi-why">{observedNote ?? observedGap(baseline)}</p>
          </>
        )}
      </div>

      {active && (
        <div className="tr-wi-col tr-wi-hypo" data-world="hypothetical">
          <span className="tr-chip tr-wi-chip tr-wi-chip-hypo" title={HYPOTHETICAL_TITLE}>
            HYPOTHETICAL (MODELED)
          </span>
          {current.fullyGrounded && base !== null && current.exactDelta !== null ? (
            <>
              <p className="tr-wi-figure">{withUnit(base + current.exactDelta, unit)}</p>
              <p className="tr-wi-delta">{signed(current.exactDelta, unit)}</p>
              {isShare(current.explainedPct) && (
                <p className="tr-wi-note">{Math.round(current.explainedPct * 100)}% explained</p>
              )}
            </>
          ) : current.relCur !== null ? (
            <>
              <p className="tr-wi-figure tr-wi-phrase">
                {relativeDeltaPhrase(current.relBase ?? 0, current.relCur)}
              </p>
              <p className="tr-wi-note">relative, not measured</p>
            </>
          ) : (
            <p className="tr-wi-figure tr-wi-dash">—</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Memoized for the same reason as the rail: its host re-renders on every camera frame, and a
 *  what-if readout changes only when a lever does. */
export const WhatIfFrame = memo(WhatIfFrameView);
