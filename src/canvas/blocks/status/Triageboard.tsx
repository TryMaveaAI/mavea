import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TriageboardProps, TriagePatient, TriageVital, EsiLevel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TriageboardProps & { delay?: number };

// Standard Emergency Severity Index nomenclature — reference labels, not invented ones.
const ESI_META: Record<EsiLevel, { c: string; label: string }> = {
  1: { c: 'var(--danger)', label: 'Resuscitation' },
  2: { c: 'var(--warning)', label: 'Emergent' },
  3: { c: 'var(--presence)', label: 'Urgent' },
  4: { c: 'var(--insight-soft)', label: 'Less urgent' },
  5: { c: 'var(--text-muted)', label: 'Non-urgent' },
};

// A missing/garbled level lands at the neutral middle tier (3, "Urgent") rather than being
// silently buried at the least-urgent end or falsely spiking to the most-urgent end.
function clampEsi(v: unknown): EsiLevel {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n))) as EsiLevel;
}

function scalarText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return '';
}

export function Triageboard({
  title,
  icon = 'alert',
  iconColor = 'var(--presence)',
  patients,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.alert;
  const raw: TriagePatient[] = Array.isArray(patients) ? patients : [];

  // Acuity-sorted, most urgent first; ties keep the order the caller supplied them in.
  const sorted = raw
    .map((p, i) => ({ p, i, lvl: clampEsi(p.esiLevel) }))
    .sort((a, b) => a.lvl - b.lvl || a.i - b.i);

  const worstLvl = sorted.length ? sorted[0].lvl : null;
  const urgentCount = sorted.filter((r) => r.lvl <= 2).length;
  const bannerText =
    sorted.length === 0
      ? 'No patients waiting'
      : `${sorted.length} patient${sorted.length === 1 ? '' : 's'} waiting` +
        (urgentCount > 0 ? ` · ${urgentCount} at ESI 1–2` : '');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className="tb-banner"
        style={
          {
            ['--tb-c' as string]: worstLvl ? ESI_META[worstLvl].c : 'var(--text-muted)',
          } as CSSProperties
        }
      >
        <span className="tb-banner-dot" />
        <span className="tb-banner-text">{bannerText}</span>
      </div>

      <div className="tb-list">
        {sorted.map(({ p, i, lvl }, row) => {
          const meta = ESI_META[lvl];
          const vitals: TriageVital[] = Array.isArray(p.vitals) ? p.vitals : [];
          return (
            <div
              className="tb-row m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: row, ['--esi-c' as string]: meta.c } as CSSProperties}
            >
              <span className="tb-badge" data-mark={row === 0 ? 'circle' : undefined}>
                <span className="tb-badge-n tab-num">{lvl}</span>
              </span>
              <span className="tb-body">
                <span className="tb-top">
                  <span className="tb-complaint">{p.chiefComplaint}</span>
                  {p.waitTime && <span className="tb-wait faint tab-num">{p.waitTime}</span>}
                </span>
                <span className="tb-esi-label">{meta.label}</span>
                {vitals.length > 0 && (
                  <span className="tb-vitals">
                    {vitals.map((v, vi) => {
                      const val = scalarText(v.value);
                      return (
                        <span key={vi} className={`tb-vital ${v.abnormal ? 'abn' : ''}`}>
                          {v.label}
                          {val && `: ${val}`}
                        </span>
                      );
                    })}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="tb-empty faint">Board is empty.</div>}
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
