import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { AccentVar } from '../../../data/conversation';
import type { ElementCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ElementCardProps & { delay?: number };

const MAX_SHELLS_SHOWN = 9; // real elements never exceed 7 — a guard against a malformed reply
const MAX_USES_SHOWN = 6;

// Keyword → accent mapping for the tile color. Checked in order, so a compound category like
// "Alkaline earth metal" matches its own rule before the plainer "alkali" one below it would.
const CATEGORY_COLOR: [RegExp, AccentVar][] = [
  [/alkaline earth/, 'var(--warning-soft)'],
  [/alkali/, 'var(--danger)'],
  [/noble/, 'var(--insight)'],
  [/halogen/, 'var(--insight-soft)'],
  [/lanthanide/, 'var(--presence-soft)'],
  [/actinide/, 'var(--presence-deep)'],
  [/transition/, 'var(--presence)'],
  [/metalloid/, 'var(--warning)'],
  [/post.?transition|poor metal/, 'var(--warning-soft)'],
  [/nonmetal|non-metal/, 'var(--insight)'],
];

function categoryColor(category: string): AccentVar {
  const lc = category.toLowerCase();
  for (const [re, color] of CATEGORY_COLOR) {
    if (re.test(lc)) return color;
  }
  return 'var(--text-muted)';
}

/** A number that might have arrived as a string (or not at all) from a loose model reply.
 *  Returns null rather than a fabricated fallback so the caller can skip the row entirely. */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

// A compact concentric-ring view of electron shells — deliberately simpler than `bohrmodel`'s
// full per-electron dot diagram: one ring per shell, labeled with its real electron count, sized
// to fit inside a fact card rather than stand alone as its own teaching figure.
function ShellRings({ shells }: { shells: number[] }) {
  const R0 = 13;
  const R_STEP = 8.5;
  const maxR = R0 + (shells.length - 1) * R_STEP;
  const size = (maxR + 8) * 2;
  const c = size / 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="lr-ec-shells-svg"
      role="img"
      aria-label={`Electron shells: ${shells.join(', ')}`}
    >
      <circle cx={c} cy={c} r={3} className="lr-ec-nucleus" />
      {shells.map((count, i) => {
        const r = R0 + i * R_STEP;
        return (
          <g
            key={i}
            className="m-fade-rise m-stagger-item"
            style={{ ['--i' as string]: i } as CSSProperties}
          >
            <circle cx={c} cy={c} r={r} className="lr-ec-shell-ring" fill="none" />
            <text x={c} y={c - r - 2} className="lr-ec-shell-count" textAnchor="middle">
              {count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// A single element deep-dive: a classic textbook tile (Z, symbol, mass) plus the surrounding
// facts. Every number is read defensively — a loose model reply that sends a string where a
// number belongs, or omits a field entirely, degrades to that one fact simply not showing rather
// than a crash or a raw NaN/undefined leaking onto the card.
export function ElementCard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  symbol,
  name,
  z,
  mass,
  category,
  electronConfig,
  shells,
  discovered,
  meltingPoint,
  boilingPoint,
  uses,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  const zNum = asNumber(z);
  const massNum = asNumber(mass);
  const meltNum = asNumber(meltingPoint);
  const boilNum = asNumber(boilingPoint);
  const cat = typeof category === 'string' && category.trim() ? category.trim() : null;
  const tileColor = cat ? categoryColor(cat) : 'var(--text-muted)';

  const shellList = Array.isArray(shells)
    ? shells
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
        .slice(0, MAX_SHELLS_SHOWN)
    : [];

  const usesList = Array.isArray(uses)
    ? uses.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-ec-layout">
        <div className="lr-ec-tile" style={{ ['--c' as string]: tileColor } as CSSProperties}>
          <span className="lr-ec-tile-z">{zNum ?? '—'}</span>
          <span className="lr-ec-tile-sym">{symbol || '—'}</span>
          <span className="lr-ec-tile-name">{name || ''}</span>
          <span className="lr-ec-tile-mass">
            {massNum !== null ? formatValue(massNum, { decimals: massNum % 1 === 0 ? 0 : 3 }) : ''}
          </span>
        </div>

        <div className="lr-ec-facts">
          {cat && (
            <span className="lr-ec-badge" style={{ ['--c' as string]: tileColor } as CSSProperties}>
              {cat}
            </span>
          )}
          {electronConfig && <p className="lr-ec-fact lr-ec-fact--mono">{electronConfig}</p>}
          {discovered && <p className="lr-ec-fact">Discovered {discovered}</p>}
          {(meltNum !== null || boilNum !== null) && (
            <p className="lr-ec-fact">
              {meltNum !== null && <>Melts {formatValue(meltNum, { unit: '°C' })}</>}
              {meltNum !== null && boilNum !== null && ' · '}
              {boilNum !== null && <>Boils {formatValue(boilNum, { unit: '°C' })}</>}
            </p>
          )}
        </div>

        {shellList.length > 0 && (
          <div className="lr-ec-shells">
            <ShellRings shells={shellList} />
          </div>
        )}
      </div>

      {usesList.length > 0 && (
        <div className="lr-ec-uses">
          {usesList.slice(0, MAX_USES_SHOWN).map((u, i) => (
            <span key={i} className="lr-ec-use-tag">
              {u}
            </span>
          ))}
          {usesList.length > MAX_USES_SHOWN && (
            <span className="lr-ec-use-tag lr-ec-use-tag--more">
              +{usesList.length - MAX_USES_SHOWN} more
            </span>
          )}
        </div>
      )}

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
