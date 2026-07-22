import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import { fitText } from '../../lib/fitText';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { HrDiagramProps, HrStar } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HrDiagramProps & { delay?: number };

const W = 380;
const H = 300;
// Left gutter holds the 10ⁿ luminosity ticks + rotated axis title; the bottom holds
// temperature ticks on one row and the axis title on a second; the top strip carries the
// spectral-class letters so they never collide with the plot itself.
const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 34;
const PAD_B = 46;
const BAND_TOP = 14; // spectral-class strip: BAND_TOP..PAD_T-6

type Stage = NonNullable<HrStar['stage']>;

// Hue mapping follows the physics: main-sequence dots read blue, giants amber, supergiants
// red, white dwarfs pale — so the chart's color story matches what a textbook plate shows.
const STAGE_COLOR: Record<Stage, string> = {
  'main-sequence': 'var(--presence)',
  giant: 'var(--warning)',
  supergiant: 'var(--danger)',
  'white-dwarf': 'var(--presence-soft)',
};
// Radius encodes luminosity class subtly — supergiants physically dwarf dwarfs.
const STAGE_R: Record<Stage, number> = {
  'main-sequence': 3.2,
  giant: 4.2,
  supergiant: 5.2,
  'white-dwarf': 2.4,
};

// Real spectral-class temperature ranges (K) — the letters sit at each range's log-midpoint.
const SPECTRAL: { cls: string; lo: number; hi: number }[] = [
  { cls: 'O', lo: 30000, hi: 50000 },
  { cls: 'B', lo: 10000, hi: 30000 },
  { cls: 'A', lo: 7500, hi: 10000 },
  { cls: 'F', lo: 6000, hi: 7500 },
  { cls: 'G', lo: 5200, hi: 6000 },
  { cls: 'K', lo: 3700, hi: 5200 },
  { cls: 'M', lo: 2400, hi: 3700 },
];

// Canonical regions in (log₁₀T, log₁₀L) space. The main sequence is a diagonal band; the
// other three are loose ellipses around where those populations actually cluster.
const MS_FROM = { t: 4.48, l: 4.8 };
const MS_TO = { t: 3.45, l: -2.8 };
const ELLIPSES: { label: string; t: number; l: number; dt: number; dl: number; tint: string }[] = [
  { label: 'Giants', t: 3.64, l: 2.2, dt: 0.16, dl: 1.0, tint: 'var(--warning)' },
  { label: 'Supergiants', t: 3.95, l: 4.9, dt: 0.45, dl: 0.75, tint: 'var(--danger)' },
  { label: 'White dwarfs', t: 4.15, l: -2.7, dt: 0.26, dl: 0.9, tint: 'var(--presence-soft)' },
];

const SUN = { tempK: 5772, luminosity: 1 };

function fmtTemp(t: number): string {
  return t >= 1000 ? `${Math.round(t / 100) / 10}k` : String(Math.round(t));
}

/** Luminosity read-out in solar units: whole numbers for big values, significant digits
 *  for the dim end (0.0017 L☉ must not collapse to "0"). */
function fmtLum(l: number): string {
  if (!Number.isFinite(l)) return '';
  if (l >= 100) return Math.round(l).toLocaleString('en-US');
  if (l >= 1) return (Math.round(l * 10) / 10).toString();
  return l.toPrecision(2);
}

export function HrDiagram({
  title,
  icon = 'sun',
  iconColor = 'var(--presence)',
  stars,
  showRegions = true,
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sun;
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const valid = useMemo(
    () =>
      (Array.isArray(stars) ? stars : [])
        .map((s, i) => {
          const o = s && typeof s === 'object' ? (s as unknown as Record<string, unknown>) : {};
          const tempK = typeof o.tempK === 'number' ? o.tempK : NaN;
          const luminosity = typeof o.luminosity === 'number' ? o.luminosity : NaN;
          if (!Number.isFinite(tempK) || tempK <= 0) return null;
          if (!Number.isFinite(luminosity) || luminosity <= 0) return null;
          const stage =
            typeof o.stage === 'string' && o.stage in STAGE_COLOR ? (o.stage as Stage) : undefined;
          const name =
            typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `Star ${i + 1}`;
          return {
            name,
            tempK,
            luminosity,
            stage,
            logT: Math.log10(tempK),
            logL: Math.log10(luminosity),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [stars],
  );

  const geom = useMemo(() => {
    if (valid.length === 0) return null;

    // Domain: the classic 30 000 → 2 500 K window, stretched only if the data reaches past it.
    const tHi = Math.max(30000, ...valid.map((s) => s.tempK));
    const tLo = Math.min(2500, ...valid.map((s) => s.tempK));
    // Luminosity: whole decades, always including 10⁰ so the Sun reference stays on-plot.
    const lLo = Math.floor(Math.min(0, ...valid.map((s) => s.logL)));
    let lHi = Math.ceil(Math.max(0, ...valid.map((s) => s.logL)));
    if (lHi === lLo) lHi = lLo + 1;

    // INVERTED temperature axis: hot on the left, cool on the right — the H–R convention.
    const sx = scaleLinear([Math.log10(tHi), Math.log10(tLo)], [PAD_L, W - PAD_R]);
    const sy = scaleLinear([lLo, lHi], [H - PAD_B, PAD_T]);

    const tempTicks = [50000, 30000, 20000, 10000, 6000, 4000, 3000].filter(
      (t) => t >= tLo && t <= tHi,
    );
    const lumStep = Math.max(1, Math.ceil((lHi - lLo) / 8));
    const lumTicks: number[] = [];
    for (let e = lLo; e <= lHi; e += lumStep) lumTicks.push(e);

    // Spectral-class letters at each class range's log-midpoint (clamped to the domain).
    // A class squeezed below letter width (data far outside the stellar range) is dropped.
    const bands = SPECTRAL.flatMap((b) => {
      const lo = Math.max(b.lo, tLo);
      const hi = Math.min(b.hi, tHi);
      if (lo >= hi) return [];
      if (Math.abs(sx(Math.log10(hi)) - sx(Math.log10(lo))) < 13) return [];
      const mid = (Math.log10(lo) + Math.log10(hi)) / 2;
      // Class separator only when it falls strictly inside the plot (never on the frame).
      const edgeX = sx(Math.log10(b.hi));
      const edge = b.hi <= tHi && edgeX > PAD_L + 3 && edgeX < W - PAD_R - 3 ? edgeX : null;
      return [{ cls: b.cls, x: sx(mid), edge }];
    });

    const clampX = (x: number) => Math.max(PAD_L, Math.min(W - PAD_R, x));
    const clampY = (y: number) => Math.max(PAD_T, Math.min(H - PAD_B, y));

    const pts = valid.map((s, i) => ({
      ...s,
      i,
      x: clampX(sx(s.logT)),
      y: clampY(sy(s.logL)),
      r: s.stage ? STAGE_R[s.stage] : 3.2,
      color: s.stage ? STAGE_COLOR[s.stage] : 'var(--text-muted)',
    }));

    const ms = {
      x1: sx(MS_FROM.t),
      y1: sy(MS_FROM.l),
      x2: sx(MS_TO.t),
      y2: sy(MS_TO.l),
    };
    const msAngle = (Math.atan2(ms.y2 - ms.y1, ms.x2 - ms.x1) * 180) / Math.PI;

    const inPlot = (x: number, y: number) =>
      x > PAD_L + 8 && x < W - PAD_R - 8 && y > PAD_T + 8 && y < H - PAD_B - 8;

    const ellipses = ELLIPSES.map((e) => {
      const cx = sx(e.t);
      const cy = sy(e.l);
      return {
        label: e.label,
        tint: e.tint,
        cx,
        cy,
        rx: Math.abs(sx(e.t + e.dt) - sx(e.t - e.dt)) / 2,
        ry: Math.abs(sy(e.l + e.dl) - sy(e.l - e.dl)) / 2,
        labeled: inPlot(cx, cy),
      };
    });

    const sun = { x: sx(Math.log10(SUN.tempK)), y: sy(0) };

    return { sx, sy, tempTicks, lumTicks, bands, pts, ms, msAngle, ellipses, sun };
  }, [valid]);

  const highlighted = useMemo(() => {
    if (!geom || typeof highlight !== 'string' || !highlight.trim()) return null;
    const want = highlight.trim().toLowerCase();
    return geom.pts.find((p) => p.name.toLowerCase() === want) ?? null;
  }, [geom, highlight]);

  const active = hover !== null && geom ? geom.pts[hover] : (highlighted ?? null);

  if (!geom) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty
          message="No plottable stars"
          hint="Each star needs a temperature and luminosity above zero"
        />
      </div>
    );
  }

  const hlFit = highlighted
    ? fitText(highlighted.name, { maxWidth: 96, fontSize: 10, minFontSize: 9, maxLines: 2 })
    : null;
  const hlLeft = highlighted !== null && highlighted.x > W - PAD_R - 100;
  // First label baseline, kept below the spectral strip even for a star pinned to the top.
  const hlY = highlighted !== null ? Math.max(PAD_T + 10, highlighted.y - 6) : 0;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="hrd-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="hrd-svg" role="img" aria-label={title}>
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} />
            </clipPath>
          </defs>

          {/* frame + gridlines */}
          {geom.tempTicks.map((t, i) => (
            <line
              key={`gt${i}`}
              x1={geom.sx(Math.log10(t))}
              y1={PAD_T}
              x2={geom.sx(Math.log10(t))}
              y2={H - PAD_B}
              className="hrd-grid"
            />
          ))}
          {geom.lumTicks.map((e, i) => (
            <line
              key={`gl${i}`}
              x1={PAD_L}
              y1={geom.sy(e)}
              x2={W - PAD_R}
              y2={geom.sy(e)}
              className="hrd-grid"
            />
          ))}

          {/* soft population regions, clipped so the blur never bleeds past the plot */}
          {showRegions && (
            <g clipPath={`url(#${clipId})`}>
              <line
                x1={geom.ms.x1}
                y1={geom.ms.y1}
                x2={geom.ms.x2}
                y2={geom.ms.y2}
                className="hrd-region"
                stroke="color-mix(in oklab, var(--presence) 14%, transparent)"
                strokeWidth={30}
                strokeLinecap="round"
              />
              {geom.ellipses.map((e, i) => (
                <ellipse
                  key={i}
                  cx={e.cx}
                  cy={e.cy}
                  rx={e.rx}
                  ry={e.ry}
                  className="hrd-region"
                  fill={`color-mix(in oklab, ${e.tint} 14%, transparent)`}
                />
              ))}
            </g>
          )}
          {/* spectral-class strip */}
          {geom.bands.map((b, i) => (
            <g key={i}>
              <text x={b.x} y={PAD_T - 10} textAnchor="middle" className="hrd-cls">
                {b.cls}
              </text>
              {b.edge !== null && (
                <line
                  x1={b.edge}
                  y1={BAND_TOP}
                  x2={b.edge}
                  y2={PAD_T - 6}
                  className="hrd-cls-sep"
                />
              )}
            </g>
          ))}

          {/* axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="hrd-axis" />
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="hrd-axis" />
          {geom.tempTicks.map((t, i) => (
            <text
              key={`tt${i}`}
              x={geom.sx(Math.log10(t))}
              y={H - PAD_B + 14}
              textAnchor="middle"
              className="hrd-tick"
            >
              {fmtTemp(t)}
            </text>
          ))}
          {geom.lumTicks.map((e, i) => (
            <text
              key={`lt${i}`}
              x={PAD_L - 6}
              y={geom.sy(e) + 3}
              textAnchor="end"
              className="hrd-tick"
            >
              10
              <tspan dy={-3.5} className="hrd-exp">
                {e}
              </tspan>
            </text>
          ))}
          <text
            x={PAD_L + (W - PAD_L - PAD_R) / 2}
            y={H - 8}
            textAnchor="middle"
            className="hrd-axis-lbl"
          >
            Surface temperature (K), hot → cool
          </text>
          <text
            transform={`translate(12, ${(PAD_T + H - PAD_B) / 2}) rotate(-90)`}
            textAnchor="middle"
            className="hrd-axis-lbl"
          >
            Luminosity (L☉)
          </text>

          {/* Sun reference */}
          <g>
            <circle cx={geom.sun.x} cy={geom.sun.y} r={3} className="hrd-sun" />
            <text x={geom.sun.x + 6} y={geom.sun.y + 3} className="hrd-sun-lbl">
              Sun
            </text>
          </g>

          {/* stars */}
          <g className="m-fade-rise">
            {geom.pts.map((p) => (
              <circle
                key={p.i}
                cx={p.x}
                cy={p.y}
                r={hover === p.i ? p.r + 1.6 : p.r}
                fill={p.color}
                className="hrd-star"
                onMouseEnter={() => setHover(p.i)}
              >
                <title>{`${p.name} — ${p.tempK.toLocaleString('en-US')} K, ${fmtLum(p.luminosity)} L☉`}</title>
              </circle>
            ))}
          </g>

          {/* Region labels paint last so their surface halo keeps them legible even where a
              star legitimately falls inside a band (e.g. a giant sitting on the "Giants" label). */}
          {showRegions && (
            <g>
              <text
                transform={`translate(${(geom.ms.x1 + geom.ms.x2) / 2}, ${(geom.ms.y1 + geom.ms.y2) / 2 - 20}) rotate(${Math.round(geom.msAngle)})`}
                className="hrd-region-lbl"
                textAnchor="middle"
                style={{ fill: 'color-mix(in oklab, var(--presence) 55%, var(--text-muted))' }}
              >
                Main sequence
              </text>
              {geom.ellipses.map(
                (e, i) =>
                  e.labeled && (
                    <text
                      key={i}
                      x={e.cx}
                      y={e.cy}
                      className="hrd-region-lbl"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fill: `color-mix(in oklab, ${e.tint} 55%, var(--text-muted))` }}
                    >
                      {e.label}
                    </text>
                  ),
              )}
            </g>
          )}

          {/* persistent highlight ring + label */}
          {highlighted && hlFit && (
            <g>
              <circle
                cx={highlighted.x}
                cy={highlighted.y}
                r={highlighted.r + 4}
                className="hrd-ring"
              />
              <text
                x={highlighted.x + (hlLeft ? -(highlighted.r + 8) : highlighted.r + 8)}
                textAnchor={hlLeft ? 'end' : 'start'}
                fontSize={hlFit.fontSize}
                className="hrd-hl-lbl"
              >
                {hlFit.lines.map((ln, i) => (
                  <tspan
                    key={i}
                    x={highlighted.x + (hlLeft ? -(highlighted.r + 8) : highlighted.r + 8)}
                    y={hlY + i * hlFit.lineHeightPx}
                  >
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          )}
        </svg>

        {/* hover read-out (falls back to the highlighted star), height reserved so nothing shifts */}
        <div className="hrd-read" aria-live="polite">
          {active && (
            <>
              <strong>{active.name}</strong> · {active.tempK.toLocaleString('en-US')} K ·{' '}
              {fmtLum(active.luminosity)} L☉
              {active.stage ? ` · ${active.stage.replace('-', ' ')}` : ''}
            </>
          )}
        </div>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
