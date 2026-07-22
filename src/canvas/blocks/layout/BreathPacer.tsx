import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BreathPacerProps, BreathPattern } from './types';

type Props = BreathPacerProps & { delay?: number };

// Named patterns → inhale/hold/exhale seconds. 'calm' is a gentle even breath, 'box' the
// four-square hold, '478' the relaxing 4-7-8. Explicit inhale/hold/exhale props override these.
const PATTERNS: Record<BreathPattern, { inhale: number; hold: number; exhale: number }> = {
  '478': { inhale: 4, hold: 7, exhale: 8 },
  box: { inhale: 4, hold: 4, exhale: 4 },
  calm: { inhale: 4, hold: 0, exhale: 6 },
};

// A paced breathing exercise done WITH the canvas: a soft orb expands on the inhale, holds, then
// settles on the exhale, looping forever in pure CSS — no JS timer, so it can never leak. The whole
// loop is driven by one --bp-cycle duration and per-phase fraction vars, which also time the caption
// cross-fade and the hold's visibility so the words always track the orb. Honours reduced-motion
// with a still orb and a written rhythm instead of movement.
export function BreathPacer({
  title = 'Breathe with me',
  icon = 'wind',
  iconColor = 'var(--presence)',
  pattern = 'calm',
  inhale,
  hold,
  exhale,
  note,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.wind;
  const base = PATTERNS[pattern] ?? PATTERNS.calm;

  // Explicit seconds win over the named pattern; clamp to sane, calm bounds so a stray value can
  // never produce a frantic or frozen loop.
  const inS = clamp(inhale ?? base.inhale, 2, 12);
  const holdS = clamp(hold ?? base.hold, 0, 12);
  const outS = clamp(exhale ?? base.exhale, 2, 14);
  const total = inS + holdS + outS;

  const hasHold = holdS > 0;
  // Phase boundaries as fractions of the cycle — drive the keyframe split via CSS custom props.
  const inEnd = inS / total;
  const holdEnd = (inS + holdS) / total;

  const orbStyle: CSSProperties = {
    ['--delay' as string]: (delay || 0) + 'ms',
    ['--bp-cycle' as string]: total + 's',
    ['--bp-in-end' as string]: pct(inEnd),
    ['--bp-hold-end' as string]: pct(holdEnd),
    ['--bp-accent' as string]: iconColor,
  } as CSSProperties;

  return (
    <div className="card reveal bp-card" style={orbStyle}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className="bp-stage"
        role="img"
        aria-label={`Breathing pacer: ${describe(inS, holdS, outS)}`}
      >
        <div className="bp-ring" aria-hidden="true">
          <span className="bp-orb" />
        </div>

        {/* Caption cross-fades through the phases on the same cycle, so the word matches the orb. */}
        <div className="bp-caption" aria-hidden="true">
          <span className="bp-phase bp-phase--in">
            Breathe in<span className="bp-secs">{inS}s</span>
          </span>
          {hasHold && (
            <span className="bp-phase bp-phase--hold">
              Hold<span className="bp-secs">{holdS}s</span>
            </span>
          )}
          <span className="bp-phase bp-phase--out">
            Breathe out<span className="bp-secs">{outS}s</span>
          </span>
        </div>
      </div>

      {/* Reduced-motion floor: no movement, just the rhythm written plainly. */}
      <p className="bp-still">{stillText(inS, holdS, outS)}</p>

      {note && <div className="bp-note">{note}</div>}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function pct(fraction: number): string {
  return (fraction * 100).toFixed(2) + '%';
}

function describe(inS: number, holdS: number, outS: number): string {
  return holdS > 0
    ? `in ${inS} seconds, hold ${holdS}, out ${outS}`
    : `in ${inS} seconds, out ${outS}`;
}

function stillText(inS: number, holdS: number, outS: number): string {
  return holdS > 0
    ? `In through your nose for ${inS}, hold for ${holdS}, out slowly for ${outS}. Repeat a few times at your own pace.`
    : `In through your nose for ${inS}, then out slowly for ${outS}. Repeat a few times at your own pace.`;
}
