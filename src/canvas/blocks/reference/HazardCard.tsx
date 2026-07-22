import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { GhsPictogramGlyph } from './GhsPictograms';
import { GHS_LABELS } from './ghsPictogramLabels';
import type { HazardCardProps, GhsPictogram, HazardStatement } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HazardCardProps & { delay?: number };

// GHS chemical hazard / safety-data summary: the signal word up top (the single most
// severe classification, always shown), the pictograms that apply, then the full H-code
// (hazard) and P-code (precautionary) statement lists in the same label→value row rhythm
// FactSheet uses for its facts. A loose model payload can send a pictogram key we don't
// draw or an empty list anywhere — every section is guarded so a partial safety sheet
// still renders cleanly instead of a blank row or a crash.
export function HazardCard({
  title,
  icon = 'alert',
  iconColor = 'var(--danger)',
  cas,
  signalWord,
  pictograms,
  hazards,
  precautions,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.alert;
  const isWarning = signalWord === 'Warning';
  const signalColor = isWarning ? 'var(--warning)' : 'var(--danger)';
  const pics = (pictograms ?? []).filter((p): p is GhsPictogram => p in GHS_LABELS);
  const safeHazards: HazardStatement[] = hazards ?? [];
  const safePrecautions: HazardStatement[] = precautions ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {cas && <div className="hc-cas">CAS {cas}</div>}

      <div
        className="hc-signal"
        style={{ ['--hc-c' as string]: signalColor } as CSSProperties}
        role="status"
      >
        <span className="hc-signal-icon">
          <Icon.alert />
        </span>
        <span className="hc-signal-word">{isWarning ? 'Warning' : 'Danger'}</span>
      </div>

      {pics.length > 0 && (
        <div className="hc-pictograms">
          {pics.map((p, i) => (
            <div
              // index, not the pictogram key — a loose model payload can repeat a pictogram
              key={i}
              className="hc-pic m-stagger-item m-scale-in"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <GhsPictogramGlyph kind={p} className="hc-pic-glyph" />
              <span className="hc-pic-label">{GHS_LABELS[p]}</span>
            </div>
          ))}
        </div>
      )}

      {safeHazards.length > 0 && (
        <div className="hc-section">
          <div className="hc-section-label">Hazards</div>
          <div className="hc-codes">
            {safeHazards.map((h, i) => (
              <div
                key={i}
                className="hc-code-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="hc-code">{h.code}</span>
                <span className="hc-code-text">{h.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {safePrecautions.length > 0 && (
        <div className="hc-section">
          <div className="hc-section-label">Precautions</div>
          <div className="hc-codes">
            {safePrecautions.map((p, i) => (
              <div
                key={i}
                className="hc-code-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="hc-code">{p.code}</span>
                <span className="hc-code-text">{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
