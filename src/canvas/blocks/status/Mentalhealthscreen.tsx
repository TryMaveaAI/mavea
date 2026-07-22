import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MentalhealthscreenProps, ScreenItem, ScreenBand, ScreenBandTone } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MentalhealthscreenProps & { delay?: number };

const TONE_COLOR: Record<ScreenBandTone, string> = {
  ok: 'var(--insight)',
  mild: 'var(--insight-soft)',
  moderate: 'var(--warning)',
  severe: 'var(--danger)',
};

function toneColor(t: unknown): string {
  return typeof t === 'string' && t in TONE_COLOR
    ? TONE_COLOR[t as ScreenBandTone]
    : TONE_COLOR.moderate;
}

// A per-item score outside 0..3 (or missing/garbled) reads as 0 — the least-alarming
// reading — rather than propagating NaN into the dot-tick selector or the total.
function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.min(3, Math.max(0, Math.round(n))) : 0;
}

interface ValidBand {
  label: string;
  lo: number;
  hi: number;
  c: string;
}

function toValidBand(b: ScreenBand): ValidBand | null {
  if (!b || !Array.isArray(b.range) || b.range.length !== 2) return null;
  const [lo, hi] = b.range;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  return { label: b.label || '', lo, hi, c: toneColor(b.tone) };
}

export function Mentalhealthscreen({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  instrument,
  items,
  total,
  maxTotal,
  bands,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chat;
  const rows: ScreenItem[] = Array.isArray(items) ? items : [];
  const rawBands: ScreenBand[] = Array.isArray(bands) ? bands : [];

  // The total/max are trusted when they're real numbers; otherwise both are derived from
  // the items themselves — a real, computed figure, never a fabricated one.
  const itemSum = rows.reduce((s, it) => s + clampScore(it.score), 0);
  const safeTotal = Number.isFinite(total) ? total : itemSum;
  const safeMax =
    Number.isFinite(maxTotal) && maxTotal > 0 ? maxTotal : Math.max(rows.length * 3, 1);

  const validBands = rawBands
    .map(toValidBand)
    .filter((b): b is ValidBand => b !== null)
    .sort((a, b) => a.lo - b.lo);
  const matched = validBands.find((b) => safeTotal >= b.lo && safeTotal <= b.hi) ?? null;
  const markerPct = Math.min(100, Math.max(0, (safeTotal / safeMax) * 100));

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {instrument && <span className="mhs-instrument">{instrument}</span>}
      </div>

      <div className="mhs-rows">
        {rows.map((it, i) => {
          const score = clampScore(it.score);
          return (
            <div
              className="mhs-row m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span className="mhs-prompt">{it.prompt}</span>
              <span className="mhs-dots" aria-hidden="true">
                {[0, 1, 2, 3].map((d) => (
                  <span key={d} className={`mhs-dot ${d <= score ? 'on' : ''}`} />
                ))}
              </span>
              <span className="mhs-score tab-num">{score}</span>
              {it.anchor && <span className="mhs-anchor faint">{it.anchor}</span>}
            </div>
          );
        })}
        {rows.length === 0 && <div className="mhs-empty faint">No items scored.</div>}
      </div>

      <div className="mhs-total">
        <span className="mhs-total-val tab-num" data-mark="underline">
          {safeTotal}
        </span>
        <span className="mhs-total-max faint">/ {safeMax}</span>
        {matched && (
          <span className="mhs-total-band" style={{ color: matched.c }}>
            {matched.label}
          </span>
        )}
      </div>

      {validBands.length > 0 && (
        <div className="mhs-bar">
          <div className="mhs-bar-track">
            {validBands.map((b, i) => {
              const lo = Math.min(safeMax, Math.max(0, b.lo));
              const hi = Math.min(safeMax, Math.max(0, b.hi));
              const width = Math.max(0, hi - lo);
              return (
                <span
                  key={i}
                  className={`mhs-bar-seg ${matched === b ? 'on' : ''}`}
                  style={
                    {
                      left: (lo / safeMax) * 100 + '%',
                      width: (width / safeMax) * 100 + '%',
                      ['--seg-c' as string]: b.c,
                    } as CSSProperties
                  }
                  title={b.label}
                />
              );
            })}
            <span className="mhs-bar-marker" style={{ left: markerPct + '%' }} />
          </div>
          <div className="mhs-bar-labels">
            {validBands.map((b, i) => (
              <span key={i} className="mhs-bar-label faint" style={{ color: b.c }}>
                {b.label}
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
