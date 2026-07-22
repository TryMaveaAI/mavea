import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { OdontogramProps, ToothStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = OdontogramProps & { delay?: number };

// Chart geometry (SVG units). Two arches of 16 teeth each; the upper arch curves down, the lower up.
const VB_W = 320;
const VB_H = 188;
const TEETH_PER_ARCH = 16;
const TOOTH_W = VB_W / (TEETH_PER_ARCH + 1.2);
const TOOTH_H = 26;
const UPPER_Y = 30; // baseline for the upper arch crowns
const LOWER_Y = 134; // baseline for the lower arch crowns

// Status → accent token + human label. One source of truth for the glyph fill and the legend.
const STATUS_META: Record<ToothStatus, { color: string; label: string }> = {
  healthy: { color: 'var(--text-muted)', label: 'Healthy' },
  caries: { color: 'var(--danger)', label: 'Caries' },
  filling: { color: 'var(--insight)', label: 'Filling' },
  crown: { color: 'var(--warning)', label: 'Crown' },
  missing: { color: 'var(--text-faint)', label: 'Missing' },
  implant: { color: 'var(--presence)', label: 'Implant' },
  rootcanal: { color: 'var(--presence-soft)', label: 'Root canal' },
};
const STATUS_ORDER: ToothStatus[] = [
  'healthy',
  'caries',
  'filling',
  'crown',
  'rootcanal',
  'implant',
  'missing',
];

// Universal numbering runs 1–16 across the upper arch (patient's upper-right → upper-left) and
// 17–32 across the lower arch (lower-left → lower-right). Position i (0..15) per arch maps as below.
const universalUpper = (i: number) => 1 + i;
const universalLower = (i: number) => 32 - i;

// FDI: two digits = quadrant (1 UR, 2 UL, 3 LL, 4 LR) + tooth 1–8 from the midline outward.
// Upper arch: positions 0–7 are quadrant 1 (8→1), positions 8–15 are quadrant 2 (1→8).
// Lower arch: positions 0–7 are quadrant 4 (8→1), positions 8–15 are quadrant 3 (1→8).
function fdiUpper(i: number): string {
  return i < 8 ? `1${8 - i}` : `2${i - 7}`;
}
function fdiLower(i: number): string {
  return i < 8 ? `4${8 - i}` : `3${i - 7}`;
}

export function Odontogram({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  system = 'universal',
  teeth,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  const { byNumber, usedStatuses, focusNotes } = useMemo(() => {
    // Index the charted teeth by their (string) number so each rendered tooth can look itself up.
    const map = new Map<string, { status: ToothStatus; surface?: string; note?: string }>();
    const used = new Set<ToothStatus>();
    const notes: { n: string; status: ToothStatus; surface?: string; note?: string }[] = [];
    for (const t of teeth ?? []) {
      const key = String(t.n).trim();
      const status = STATUS_META[t.status] ? t.status : 'healthy';
      map.set(key, { status, surface: t.surface, note: t.note });
      used.add(status);
      if (t.note || t.surface) notes.push({ n: key, status, surface: t.surface, note: t.note });
    }
    return { byNumber: map, usedStatuses: used, focusNotes: notes };
  }, [teeth]);

  // One tooth glyph: a rounded crown rect tinted by status, with the number beneath/above.
  const renderArch = (arch: 'upper' | 'lower') => {
    const y = arch === 'upper' ? UPPER_Y : LOWER_Y;
    const numFor = (i: number) =>
      system === 'fdi'
        ? arch === 'upper'
          ? fdiUpper(i)
          : fdiLower(i)
        : String(arch === 'upper' ? universalUpper(i) : universalLower(i));

    return Array.from({ length: TEETH_PER_ARCH }, (_, i) => {
      const num = numFor(i);
      const x = TOOTH_W * 0.6 + i * TOOTH_W;
      const rec = byNumber.get(num);
      const status = rec?.status ?? 'healthy';
      const meta = STATUS_META[status];
      const missing = status === 'missing';
      const numY = arch === 'upper' ? y - 6 : y + TOOTH_H + 11;
      return (
        <g key={`${arch}${i}`}>
          {/* Crown glyph (an outline ghost when the tooth is missing) */}
          <rect
            x={x}
            y={y}
            width={TOOTH_W - 4}
            height={TOOTH_H}
            rx={5}
            className={missing ? 'odo-tooth odo-tooth--missing' : 'odo-tooth'}
            fill={
              missing ? 'none' : `color-mix(in oklab, ${meta.color} 24%, var(--surface-elevated))`
            }
            stroke={meta.color}
          />
          {/* Status mark: crown = top band, implant = screw lines, root canal = centre dot, caries = spot */}
          {status === 'crown' && (
            <rect x={x} y={y} width={TOOTH_W - 4} height={6} rx={3} fill={meta.color} />
          )}
          {status === 'filling' && (
            <circle cx={x + (TOOTH_W - 4) / 2} cy={y + TOOTH_H / 2} r={3.4} fill={meta.color} />
          )}
          {status === 'caries' && (
            <circle cx={x + (TOOTH_W - 4) / 2} cy={y + TOOTH_H / 2} r={3} className="odo-caries" />
          )}
          {status === 'implant' &&
            [0.32, 0.5, 0.68].map((f, k) => (
              <line
                key={k}
                x1={x + (TOOTH_W - 4) * f}
                y1={y + 4}
                x2={x + (TOOTH_W - 4) * f}
                y2={y + TOOTH_H - 4}
                stroke={meta.color}
                className="odo-implant"
              />
            ))}
          {status === 'rootcanal' && (
            <line
              x1={x + (TOOTH_W - 4) / 2}
              y1={y + 3}
              x2={x + (TOOTH_W - 4) / 2}
              y2={y + TOOTH_H - 3}
              stroke={meta.color}
              className="odo-rootcanal"
            />
          )}
          {/* Missing: a diagonal slash through the ghost */}
          {missing && (
            <line
              x1={x + 3}
              y1={y + 3}
              x2={x + TOOTH_W - 7}
              y2={y + TOOTH_H - 3}
              stroke={meta.color}
              className="odo-slash"
            />
          )}
          {/* Tooth number */}
          <text x={x + (TOOTH_W - 4) / 2} y={numY} className="odo-num" textAnchor="middle">
            {num}
          </text>
        </g>
      );
    });
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
          <span className="odo-system-tag">{system === 'fdi' ? 'FDI' : 'Universal'}</span>
        </div>
      )}

      <div className="odo-board">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="odo-svg" role="img" aria-label={title}>
          {/* Arch guide labels */}
          <text x={6} y={UPPER_Y + TOOTH_H / 2 + 3} className="odo-arch-lbl">
            U
          </text>
          <text x={6} y={LOWER_Y + TOOTH_H / 2 + 3} className="odo-arch-lbl">
            L
          </text>
          {/* Midline */}
          <line
            x1={VB_W / 2}
            y1={UPPER_Y - 4}
            x2={VB_W / 2}
            y2={LOWER_Y + TOOTH_H + 4}
            className="odo-midline"
          />
          {renderArch('upper')}
          {renderArch('lower')}
        </svg>
      </div>

      {/* Legend — only the statuses actually present in the chart */}
      <ul className="odo-legend">
        {STATUS_ORDER.filter((s) => usedStatuses.has(s)).map((s) => (
          <li key={s} className="odo-legend-item">
            <i className="odo-legend-dot" style={{ background: STATUS_META[s].color }} />
            {STATUS_META[s].label}
          </li>
        ))}
      </ul>

      {/* Per-tooth notes (surface / clinical note) */}
      {focusNotes.length > 0 && (
        <ul className="odo-notes">
          {focusNotes.map((f, i) => (
            <li key={i} className="odo-note">
              <strong style={{ color: STATUS_META[f.status].color }}>
                #{f.n} · {STATUS_META[f.status].label}
              </strong>
              {f.surface ? ` (${f.surface})` : ''}
              {f.note ? ` — ${f.note}` : ''}
            </li>
          ))}
        </ul>
      )}

      {caption && <p className="odo-caption">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
