import { useId, useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { KaryotypeProps, KaryotypeAnomaly } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = KaryotypeProps & { delay?: number };

// Relative chromosome lengths (approx. Mb) so the karyogram shrinks 1→22 on a real scale; the sex
// chromosomes join the same scale. Educational proportions, not a clinical measurement.
const CHROM_MB: Record<string, number> = {
  '1': 249,
  '2': 243,
  '3': 198,
  '4': 190,
  '5': 182,
  '6': 171,
  '7': 159,
  '8': 146,
  '9': 141,
  '10': 134,
  '11': 135,
  '12': 134,
  '13': 114,
  '14': 107,
  '15': 102,
  '16': 90,
  '17': 83,
  '18': 80,
  '19': 59,
  '20': 64,
  '21': 47,
  '22': 51,
  X: 156,
  Y: 57,
};
const MAX_MB = 249;

// p-arm fraction of total length → where the centromere pinch sits. Runs metacentric (~0.5)
// through submetacentric to acrocentric (~0.15) by chromosome group.
const P_ARM_FRAC: Record<string, number> = {
  '1': 0.5,
  '2': 0.38,
  '3': 0.46,
  '4': 0.26,
  '5': 0.27,
  '6': 0.36,
  '7': 0.39,
  '8': 0.31,
  '9': 0.34,
  '10': 0.31,
  '11': 0.4,
  '12': 0.27,
  '13': 0.16,
  '14': 0.16,
  '15': 0.17,
  '16': 0.41,
  '17': 0.29,
  '18': 0.24,
  '19': 0.47,
  '20': 0.44,
  '21': 0.24,
  '22': 0.26,
  X: 0.4,
  Y: 0.27,
};

const BAR_W = 11;
const COPY_GAP = 5;
const TOP = 4;
const MIN_H = 20;
const MAX_H = 76;
const SLOT_H = TOP + MAX_H + 6;

const RING_COLOR: Record<KaryotypeAnomaly['kind'], string> = {
  trisomy: 'var(--warning)',
  monosomy: 'var(--warning)',
  deletion: 'var(--danger)',
  duplication: 'var(--insight)',
};
const KIND_LABEL: Record<KaryotypeAnomaly['kind'], string> = {
  trisomy: 'Trisomy',
  monosomy: 'Monosomy',
  deletion: 'Deletion',
  duplication: 'Duplication',
};

/** Normalise a pair reference ("21", 21, "x") to the canonical slot key. */
function normPair(p: string | number | undefined): string {
  const s = String(p ?? '')
    .trim()
    .toUpperCase();
  if (s === 'X' || s === 'Y') return s;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 && n <= 22 ? String(n) : s;
}

function pairSeed(id: string): number {
  if (id === 'X') return 23;
  if (id === 'Y') return 24;
  const n = parseInt(id, 10);
  if (Number.isFinite(n)) return n;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

interface Band {
  y0: number;
  y1: number;
  dark: boolean;
}

/** Deterministic G-band segments (3–5 dark bands) seeded by the pair, as fractions of length. */
function bands(id: string): { segs: Band[]; markIdx: number } {
  let s = (pairSeed(id) * 2654435761) >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const nb = 3 + Math.floor(rng() * 3); // 3..5 dark bands
  const count = nb * 2 + 1; // odd → light at both tips, like a real ideogram
  const widths = Array.from({ length: count }, () => 0.5 + rng());
  const sum = widths.reduce((a, b) => a + b, 0);
  const segs: Band[] = [];
  let acc = 0;
  let markIdx = -1;
  for (let i = 0; i < count; i++) {
    const y0 = acc / sum;
    acc += widths[i];
    const y1 = acc / sum;
    const dark = i % 2 === 1;
    if (dark && markIdx < 0 && i >= count / 2) markIdx = segs.length; // a dark band past mid-length
    segs.push({ y0, y1, dark });
  }
  if (markIdx < 0) {
    // No dark band past the midpoint — fall back to the last dark band so del/dup always shows.
    for (let i = segs.length - 1; i >= 0; i--)
      if (segs[i].dark) {
        markIdx = i;
        break;
      }
  }
  return { segs, markIdx };
}

interface Copy {
  id: string;
  mark: 'del' | 'dup' | null;
}

/** One drawn chromosome copy. */
function Chromosome({ copy, clipId }: { copy: Copy; clipId: string }) {
  const { segs, markIdx } = useMemo(() => bands(copy.id), [copy.id]);
  const mb = CHROM_MB[copy.id] ?? 60;
  const pf = P_ARM_FRAC[copy.id] ?? 0.35;
  const h = MIN_H + (mb / MAX_MB) * (MAX_H - MIN_H);
  const cy = TOP + pf * h;
  const gap = 1.6;
  const pTop = TOP;
  const pBot = Math.max(pTop + 1, cy - gap);
  const qTop = Math.min(TOP + h - 1, cy + gap);
  const qBot = TOP + h;
  const rx = 3;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={pTop} width={BAR_W} height={pBot - pTop} rx={rx} />
          <rect x={0} y={qTop} width={BAR_W} height={qBot - qTop} rx={rx} />
        </clipPath>
      </defs>
      {/* Arm bodies (light base) */}
      <rect x={0} y={pTop} width={BAR_W} height={pBot - pTop} rx={rx} className="kt-arm" />
      <rect x={0} y={qTop} width={BAR_W} height={qBot - qTop} rx={rx} className="kt-arm" />
      {/* G-bands, clipped to the arm shape so the centromere gap stays clear */}
      <g clipPath={`url(#${clipId})`}>
        {segs.map((b, i) => {
          const y = TOP + b.y0 * h;
          const bh = (b.y1 - b.y0) * h;
          const marked = copy.mark && i === markIdx;
          const cls = marked
            ? copy.mark === 'del'
              ? 'kt-band kt-band--del'
              : 'kt-band kt-band--dup'
            : b.dark
              ? 'kt-band kt-band--dark'
              : 'kt-band kt-band--light';
          return (
            <rect key={i} x={0} y={y} width={BAR_W} height={Math.max(0.5, bh)} className={cls} />
          );
        })}
      </g>
      {/* Structural-change tick on the affected band */}
      {copy.mark && markIdx >= 0 && (
        <line
          x1={BAR_W + 1}
          y1={TOP + ((segs[markIdx].y0 + segs[markIdx].y1) / 2) * h}
          x2={BAR_W + 4}
          y2={TOP + ((segs[markIdx].y0 + segs[markIdx].y1) / 2) * h}
          className={copy.mark === 'del' ? 'kt-tick kt-tick--del' : 'kt-tick kt-tick--dup'}
        />
      )}
    </g>
  );
}

function Slot({
  label,
  copies,
  note,
  ringColor,
  baseId,
}: {
  label: string;
  copies: Copy[];
  note?: string;
  ringColor: string | null;
  baseId: string;
}) {
  const svgW = copies.length * BAR_W + (copies.length - 1) * COPY_GAP + 6;
  return (
    <div
      className={ringColor ? 'kt-slot kt-slot--ring' : 'kt-slot'}
      style={ringColor ? ({ ['--kt-ring' as string]: ringColor } as CSSProperties) : undefined}
    >
      <svg
        viewBox={`0 0 ${svgW} ${SLOT_H}`}
        className="kt-svg"
        role="img"
        aria-label={`Chromosome ${label}${note ? `, ${note}` : ''}`}
      >
        {copies.map((c, i) => (
          <g key={i} transform={`translate(${3 + i * (BAR_W + COPY_GAP)},0)`}>
            <Chromosome copy={c} clipId={`${baseId}-${label}-${i}`} />
          </g>
        ))}
      </svg>
      <div className="kt-label">{label}</div>
      {note && <div className="kt-note">{note}</div>}
    </div>
  );
}

export function Karyotype({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  sex = 'XX',
  anomalies,
  highlightPairs,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const { slots, usedKinds } = useMemo(() => {
    const anomList = (Array.isArray(anomalies) ? anomalies : [])
      .filter((a) => a && a.kind in RING_COLOR)
      .slice(0, 24);
    const anomByPair = new Map<string, KaryotypeAnomaly>();
    for (const a of anomList) anomByPair.set(normPair(a.pair), a);

    const highlights = new Set(
      (Array.isArray(highlightPairs) ? highlightPairs : []).map((p) => normPair(p)),
    );

    // Base autosome pairs 1..22, then the sex pair.
    const build = (key: string, chromIds: string[]): ReturnType<typeof makeSlot> => {
      const anomaly = anomByPair.get(key);
      let copies: Copy[] = chromIds.map((id) => ({ id, mark: null as Copy['mark'] }));
      if (anomaly) {
        const targetId = key === 'sexslot' ? (anomaly.pair && normPair(anomaly.pair)) || 'X' : key;
        if (anomaly.kind === 'trisomy') copies.push({ id: targetId, mark: null });
        else if (anomaly.kind === 'monosomy')
          copies = copies.slice(0, Math.max(1, copies.length - 1));
        else if (copies.length)
          copies[copies.length - 1].mark = anomaly.kind === 'deletion' ? 'del' : 'dup';
      }
      return makeSlot(key, copies, anomaly, highlights);
    };

    function makeSlot(
      key: string,
      copies: Copy[],
      anomaly: KaryotypeAnomaly | undefined,
      hl: Set<string>,
    ) {
      const isSex = key === 'sexslot';
      const label = isSex ? copies.map((c) => c.id).join('') || 'XY' : key;
      const highlighted = isSex ? hl.has('X') || hl.has('Y') : hl.has(key);
      const ringColor = anomaly ? RING_COLOR[anomaly.kind] : highlighted ? 'var(--presence)' : null;
      const note = anomaly
        ? `${KIND_LABEL[anomaly.kind]} ${anomaly.note ? `· ${anomaly.note}` : ''}`.trim()
        : undefined;
      return { key, label, copies, ringColor, note };
    }

    // Sex-anomaly lookup: an X/Y anomaly targets the single sex slot.
    const sexAnom = anomByPair.get('X') ?? anomByPair.get('Y');
    if (sexAnom) anomByPair.set('sexslot', sexAnom);

    const out = [];
    for (let i = 1; i <= 22; i++) out.push(build(String(i), [String(i), String(i)]));
    out.push(build('sexslot', sex === 'XY' ? ['X', 'Y'] : ['X', 'X']));

    const kinds = new Set(anomList.map((a) => a.kind));
    return { slots: out, usedKinds: [...kinds] };
  }, [sex, anomalies, highlightPairs]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> <span>{title}</span>
        </div>
      )}

      <div className="kt-grid">
        {slots.map((s) => (
          <Slot
            key={s.key}
            label={s.label}
            copies={s.copies}
            note={s.note}
            ringColor={s.ringColor}
            baseId={baseId}
          />
        ))}
      </div>

      {usedKinds.length > 0 && (
        <ul className="kt-legend" aria-label="Anomaly key">
          {usedKinds.map((k) => (
            <li key={k} className="kt-leg">
              <span className="kt-leg-dot" style={{ background: RING_COLOR[k] }} />
              {KIND_LABEL[k]}
            </li>
          ))}
        </ul>
      )}

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
