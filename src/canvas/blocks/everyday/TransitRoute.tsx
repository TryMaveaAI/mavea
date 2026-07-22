import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { transitGlyph } from './glyphs';
import type { TransitRouteProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TransitRouteProps & { delay?: number };

// Transit/driving directions — step-by-step route card. Each step row is anchored
// by a mode icon (falls back to globe when the mode isn't in the icon set) and a
// vertical spine line that visually threads the steps together. The final step
// receives arrival styling to close the journey. Line badges use the same pill
// treatment as other metadata chips in the everyday family.
export function TransitRoute({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  origin,
  destination,
  totalTime,
  totalDistance,
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon as keyof typeof Icon] || Icon.globe;
  const safeSteps = steps ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Origin → destination summary row */}
      <div className="tr-endpoints">
        <span className="tr-origin">{origin}</span>
        <span className="tr-arrow">→</span>
        <span className="tr-dest">{destination}</span>
      </div>

      {/* Aggregate time / distance */}
      {(totalTime || totalDistance) && (
        <div className="tr-total">
          {totalTime && <span>{totalTime}</span>}
          {totalTime && totalDistance && <span>·</span>}
          {totalDistance && <span>{totalDistance}</span>}
        </div>
      )}

      {/* Step list with spine connector */}
      <div className="tr-steps">
        {safeSteps.map((step, i) => {
          const isLast = i === safeSteps.length - 1;
          // Resolve the mode glyph from the step's mode word ("walking", "light rail",
          // "driving", …) so each leg gets a real icon instead of a generic globe.
          const ModeIc = transitGlyph(step.mode);

          return (
            <div
              key={i}
              className={`tr-step${isLast ? ' tr-step--arrival' : ''}`}
              // Remove default bottom border on last step (handled by :last-child in CSS),
              // but add left-spine + dot structure via a wrapper offset trick.
              style={{ position: 'relative', paddingLeft: 28 } as CSSProperties}
            >
              {/* Spine line — runs full height except on the last step */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  style={
                    {
                      position: 'absolute',
                      left: 9,
                      top: 22,
                      bottom: 0,
                      width: 2,
                      background: 'var(--grid-line)',
                      borderRadius: 1,
                    } as CSSProperties
                  }
                />
              )}

              {/* Step dot — sits on the spine and frames the mode icon */}
              <span
                aria-hidden="true"
                style={
                  {
                    position: 'absolute',
                    left: 2,
                    top: 10,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: isLast
                      ? 'var(--presence)'
                      : 'color-mix(in oklab, var(--presence) 18%, var(--surface))',
                    border: '2px solid var(--presence)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  } as CSSProperties
                }
              />

              {/* Mode icon — rendered in the tr-mode-ic container for CSS sizing */}
              <div
                className="tr-mode-ic"
                style={{ position: 'absolute', left: 32 } as CSSProperties}
              >
                <ModeIc className="ic" />
              </div>

              {/* Step body — instruction + optional meta */}
              <div className="tr-body" style={{ paddingLeft: 20 } as CSSProperties}>
                {/* Arrival step is explicitly styled bold + presence — the journey's endpoint */}
                <div
                  className="tr-instruction"
                  style={isLast ? { fontWeight: 700, color: 'var(--presence)' } : undefined}
                  {...(isLast ? { 'data-mark': 'underline' } : {})}
                >
                  {step.instruction}
                </div>
                {(step.line || step.duration || step.distance) && (
                  <div className="tr-meta">
                    {step.line && <span className="tr-line-badge">{step.line}</span>}
                    {step.duration && <span>{step.duration}</span>}
                    {step.distance && <span>{step.distance}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
