import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NumberBondProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { useCountUp } from '../../lib/motion';

type Props = NumberBondProps & { delay?: number };

const W = 300;
const WHOLE_CY = 40;
const WHOLE_R = 30;
const PART_CY = 132;

const PART_ACCENTS = [
  'var(--insight)',
  'var(--warning)',
  'var(--presence-deep)',
  'var(--insight-soft)',
];

/** Coerce a loose value to number|null — a string "4" counts, anything else is an unknown slot. */
function asValue(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A single bond circle. Owns its own count-up so the hook count stays stable per instance. */
function BondCircle({
  cx,
  cy,
  r,
  value,
  accent,
  delay,
}: {
  cx: number;
  cy: number;
  r: number;
  value: number | null;
  accent: string;
  delay: number;
}) {
  const isNum = value !== null;
  const shown = useCountUp(isNum ? value : 0, { duration: 800, delay });
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className={isNum ? 'nb-circle' : 'nb-circle nb-circle--open'}
        style={{ ['--nb-accent' as string]: accent } as CSSProperties}
      />
      <text
        x={cx}
        y={cy}
        className={isNum ? 'nb-num' : 'nb-num nb-unknown'}
        textAnchor="middle"
        dominantBaseline="central"
        style={isNum ? undefined : ({ ['--glow-color' as string]: accent } as CSSProperties)}
      >
        {isNum ? shown : '?'}
      </text>
    </g>
  );
}

export function NumberBond({
  title,
  icon = 'plus',
  iconColor = 'var(--presence)',
  whole,
  parts,
  factFamily = false,
  label,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.plus;

  const { wholeVal, partVals, facts } = useMemo(() => {
    const w = asValue(whole);
    const ps = (Array.isArray(parts) ? parts : []).slice(0, 4).map(asValue);
    while (ps.length < 2) ps.push(null);

    // Fact family only when the three numbers are a consistent bond — never show a false equation.
    const nums = ps.filter((p): p is number => p !== null);
    let eqs: string[] = [];
    if (
      factFamily &&
      w !== null &&
      ps.length === 2 &&
      nums.length === 2 &&
      nums[0] + nums[1] === w
    ) {
      const [a, b] = nums;
      eqs = [
        `${a} + ${b} = ${w}`,
        `${b} + ${a} = ${w}`,
        `${w} − ${a} = ${b}`,
        `${w} − ${b} = ${a}`,
      ];
    }
    return { wholeVal: w, partVals: ps, facts: eqs };
  }, [whole, parts, factFamily]);

  const n = partVals.length;
  const partR = n >= 4 ? 22 : n === 3 ? 25 : 28;
  const svgH = PART_CY + partR + 8;
  const wholeCx = W / 2;

  // Even horizontal spread for the parts row.
  const margin = 18 + partR;
  const partCx = (i: number) => (n === 1 ? W / 2 : margin + (i * (W - 2 * margin)) / (n - 1));

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

      <div className="nb-wrap">
        <svg
          viewBox={`0 0 ${W} ${svgH}`}
          className="nb-svg"
          role="img"
          aria-label={title || 'Number bond'}
        >
          {/* Connectors (behind the circles) */}
          {partVals.map((_, i) => (
            <line
              key={`ln${i}`}
              x1={wholeCx}
              y1={WHOLE_CY + WHOLE_R * 0.5}
              x2={partCx(i)}
              y2={PART_CY - partR * 0.5}
              className="nb-link"
            />
          ))}

          <BondCircle
            cx={wholeCx}
            cy={WHOLE_CY}
            r={WHOLE_R}
            value={wholeVal}
            accent="var(--presence)"
            delay={delay ?? 0}
          />
          {partVals.map((v, i) => (
            <BondCircle
              key={`p${i}`}
              cx={partCx(i)}
              cy={PART_CY}
              r={partR}
              value={v}
              accent={PART_ACCENTS[i % PART_ACCENTS.length]}
              delay={(delay ?? 0) + 120 + i * 90}
            />
          ))}
        </svg>
      </div>

      {typeof label === 'string' && label.trim() && <p className="nb-label">{label}</p>}

      {facts.length > 0 && (
        <div className="nb-facts" aria-label="Fact family">
          {facts.map((eq, i) => (
            <span key={i} className="nb-fact">
              {eq}
            </span>
          ))}
        </div>
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
