import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { VetpatientchartProps, VetVital } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VetpatientchartProps & { delay?: number };

/** A vital's `value` is deliberately `string | number` (most readings are numeric, some are
 *  qualitative like "Pink" or "CRT <2s"), and a loose model reply can hand it anything else —
 *  render a finite number as-is, a non-empty string as-is, and everything else as an em dash
 *  rather than leaking `undefined`/`NaN`/`[object Object]` onto the card. */
function readVitalValue(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString() : '—';
  if (typeof v === 'string' && v.trim()) return v;
  return '—';
}

// A veterinary patient chart — the signalment (species/breed/sex/age/weight) as identity chips,
// a vitals strip for the visit's readings, and the active problem list. The exam-room
// counterpart to clinicaltimeline's human medical record: one visit, not a history.
export function Vetpatientchart({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  species,
  name,
  breed,
  sex,
  ageYears,
  weightKg,
  vitals,
  problems,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const safeVitals = Array.isArray(vitals) ? vitals : [];
  const safeProblems = Array.isArray(problems)
    ? problems.filter((p) => typeof p === 'string' && p)
    : [];

  if (!name && !species) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No patient on file" />
      </div>
    );
  }

  const chips = [
    species,
    breed,
    sex,
    Number.isFinite(ageYears) ? `${ageYears}y` : undefined,
    Number.isFinite(weightKg) ? `${weightKg} kg` : undefined,
  ].filter((c): c is string => !!c);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="vpc-signalment">
        {name && <div className="vpc-name">{name}</div>}
        {chips.length > 0 && (
          <div className="vpc-chips">
            {chips.map((c, i) => (
              <span key={i} className="vpc-chip">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {safeVitals.length > 0 && (
        <div className="vpc-vitals">
          {safeVitals.map((v, i) => (
            <VitalRow key={i} v={v} i={i} />
          ))}
        </div>
      )}

      {safeProblems.length > 0 && (
        <div className="vpc-problems">
          <div className="vpc-problems-label">Active problems</div>
          <div className="vpc-problem-list">
            {safeProblems.map((p, i) => (
              <span
                key={i}
                className="vpc-problem-chip m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                {p}
              </span>
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

function VitalRow({ v, i }: { v: VetVital; i: number }) {
  const label = typeof v?.label === 'string' && v.label.trim() ? v.label : 'Reading';
  const value = readVitalValue(v?.value);
  const unit = typeof v?.unit === 'string' && v.unit.trim() ? v.unit : '';
  const abnormal = !!v?.abnormal;

  return (
    <div
      className={`vpc-vital m-stagger-item m-fade-rise${abnormal ? ' abnormal' : ''}`}
      style={{ ['--i' as string]: i } as CSSProperties}
    >
      <span className="vpc-vital-label">{label}</span>
      <span className="vpc-vital-value tab-num">
        {value}
        {unit && <span className="vpc-vital-unit">{unit}</span>}
      </span>
      {abnormal && <Icon.alert className="vpc-vital-flag" />}
    </div>
  );
}
