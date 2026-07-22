import { type CSSProperties, useMemo, useRef } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, ticks, usePathDraw } from '../../lib';
import type { ClaimAge, ClaimAgeCompareProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ClaimAgeCompareProps & { delay?: number };

const W = 340;
const H = 190;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const END_AGE = 90; // a common horizon for a claim-age tradeoff chart
const SERIES_COLORS = ['var(--warning)', 'var(--presence)', 'var(--insight)'];

const AGE_LABEL: Record<number, string> = { 62: 'Early', 67: 'Full', 70: 'Delayed' };

function safeMonthly(a: ClaimAge | undefined): number {
  return Number.isFinite(a?.monthlyBenefit) ? Math.max(0, a?.monthlyBenefit as number) : 0;
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

// The Social Security claim-age tradeoff: three KPI chips (one per claiming age given) and a
// cumulative-payout line — years-since-claiming × 12 × the GIVEN monthly benefit, honest
// running-total arithmetic over caller-supplied numbers, the same category of computed curve
// as taxbracket's real bracket arithmetic, never an invented shape. An optional breakeven
// point is drawn only when the caller supplies one — it is never derived here.
export function ClaimAgeCompare({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  ages,
  breakeven,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const safeAges = Array.isArray(ages) ? ages : [];
  const ref0 = useRef<SVGPathElement>(null);
  const ref1 = useRef<SVGPathElement>(null);
  const ref2 = useRef<SVGPathElement>(null);
  const pathRefs = [ref0, ref1, ref2];
  usePathDraw(ref0, { delay });
  usePathDraw(ref1, { delay: (delay || 0) + 100 });
  usePathDraw(ref2, { delay: (delay || 0) + 200 });

  const breakevenAge =
    breakeven && Number.isFinite(breakeven.age) ? (breakeven.age as number) : null;

  const model = useMemo(() => {
    const valid = (Array.isArray(ages) ? ages : []).filter(
      (a): a is ClaimAge => !!a && (a.age === 62 || a.age === 67 || a.age === 70),
    );
    if (valid.length === 0) return null;

    // Capped well past any plausible lifespan — a wild/fuzzed breakeven.age (e.g. 1e9) must
    // never turn the per-year sampling loop below into an unbounded one.
    const horizon =
      breakevenAge !== null ? Math.min(130, Math.max(END_AGE, breakevenAge + 2)) : END_AGE;

    const series = valid.map((a, i) => {
      const monthly = safeMonthly(a);
      // Cumulative payout from this claiming age out to the horizon, sampled yearly.
      const points: { age: number; total: number }[] = [];
      for (let age = a.age; age <= horizon; age++) {
        points.push({ age, total: monthly * 12 * (age - a.age) });
      }
      return { age: a.age, monthly, color: SERIES_COLORS[i % SERIES_COLORS.length], points };
    });

    const allTotals = series.flatMap((s) => s.points.map((p) => p.total));
    const [yMin, yMax] = niceDomain(0, Math.max(...allTotals, 1));
    const ySpan = yMax - yMin || 1;
    const x = (age: number) => PAD_L + ((age - 62) / (horizon - 62 || 1)) * PLOT_W;
    const y = (v: number) => PAD_T + (1 - (v - yMin) / ySpan) * PLOT_H;
    const yTicks = ticks(yMin, yMax, (yMax - yMin) / 4 || 1);

    const paths = series.map((s) => ({
      ...s,
      d: s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.age)} ${y(p.total)}`).join(' '),
    }));

    const breakevenX =
      breakevenAge !== null && breakevenAge >= 62 && breakevenAge <= horizon
        ? x(breakevenAge)
        : null;

    return { series, paths, yTicks, y, breakevenX };
  }, [ages, breakevenAge]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {safeAges.length > 0 && (
        <div className="cac-kpis">
          {safeAges.map((a, i) => {
            const age = a?.age;
            return (
              <div key={i} className="cac-kpi">
                <span className="cac-kpi-label">
                  {age !== undefined ? (AGE_LABEL[age] ?? `Age ${age}`) : '—'}
                </span>
                <span className="cac-kpi-age tab-num">{age ?? '—'}</span>
                <span className="cac-kpi-value tab-num">{fmtMoney(safeMonthly(a))}/mo</span>
              </div>
            );
          })}
        </div>
      )}

      {model && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="cac-chart"
          role="img"
          aria-label={`${title} cumulative payout by claiming age`}
        >
          {model.yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={model.y(t)}
                x2={PAD_L + PLOT_W}
                y2={model.y(t)}
                className="cac-grid"
              />
              <text x={PAD_L - 6} y={model.y(t) + 3} textAnchor="end" className="cac-tick">
                {t >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}
              </text>
            </g>
          ))}

          {model.breakevenX !== null && (
            <line
              x1={model.breakevenX}
              y1={PAD_T}
              x2={model.breakevenX}
              y2={PAD_T + PLOT_H}
              className="cac-breakeven"
            />
          )}

          {model.paths.map((s, i) => (
            <path
              key={s.age}
              ref={pathRefs[i % pathRefs.length]}
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {model.breakevenX !== null && (
            <circle cx={model.breakevenX} cy={PAD_T + PLOT_H} r={3.5} fill="var(--text-primary)" />
          )}
        </svg>
      )}

      {model?.breakevenX != null && breakeven && (
        <div className="cac-breakeven-note">
          <Icon.alert className="ic" style={{ width: 12, height: 12 }} /> Breakeven at age{' '}
          {breakeven.age}
          {breakeven.note ? ` — ${breakeven.note}` : ''}
        </div>
      )}

      {model && (
        <div className="cac-legend">
          {model.series.map((s) => (
            <span key={s.age} className="cac-leg">
              <i style={{ background: s.color } as CSSProperties} /> Claim at {s.age}
            </span>
          ))}
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
