import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import { useCountUp } from '../../lib/motion';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { FlightChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FlightChartProps & { delay?: number };

// A small, token-only cycle for a channel the caller never assigned a color — keeps every
// lane visually distinct without inventing a new palette.
const LANE_PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
  'var(--text-muted)',
];

interface Lane {
  name: string;
  color: string;
}

interface PlacedFlight {
  lane: number;
  start: number;
  span: number;
  budget: number;
}

export function FlightChart({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  channels,
  flights,
  totalBudget,
  currency = 'USD',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const chanList = Array.isArray(channels) ? channels : [];
    const flightList = Array.isArray(flights) ? flights : [];

    // Lanes come from the declared channels, in order; a flight naming a channel that was
    // never declared still gets a lane of its own, appended, so no real flight is silently
    // dropped for want of a matching header.
    const laneNames: string[] = [];
    const laneSet = new Set<string>();
    for (const c of chanList) {
      const name = typeof c?.name === 'string' ? c.name.trim() : '';
      if (name && !laneSet.has(name)) {
        laneSet.add(name);
        laneNames.push(name);
      }
    }
    for (const f of flightList) {
      const ch = typeof f?.channel === 'string' ? f.channel.trim() : '';
      if (ch && !laneSet.has(ch)) {
        laneSet.add(ch);
        laneNames.push(ch);
      }
    }
    const laneIndex = new Map(laneNames.map((n, i) => [n, i]));
    const lanes: Lane[] = laneNames.map((name, i) => {
      const declared = chanList.find((c) => c?.name === name);
      const color = declared?.color || LANE_PALETTE[i % LANE_PALETTE.length];
      return { name, color };
    });

    // A flight only places when it resolves to a real lane; start/span/budget each fall back
    // to a sane floor rather than skip the whole flight over one malformed field.
    const placed: PlacedFlight[] = [];
    let maxEnd = 0;
    for (const f of flightList) {
      const ch = typeof f?.channel === 'string' ? f.channel.trim() : '';
      const lane = laneIndex.get(ch);
      if (lane === undefined) continue;
      const start = Number.isFinite(f.start) && f.start >= 0 ? f.start : 0;
      const span = Number.isFinite(f.span) && f.span > 0 ? f.span : 1;
      const budget = Number.isFinite(f.budget) && f.budget > 0 ? f.budget : 0;
      placed.push({ lane, start, span, budget });
      maxEnd = Math.max(maxEnd, start + span);
    }

    const periods = Math.max(1, Math.ceil(maxEnd));
    const maxBudget = Math.max(1, ...placed.map((p) => p.budget));
    const computedSpend = placed.reduce((sum, p) => sum + p.budget, 0);
    const spend =
      Number.isFinite(totalBudget) && (totalBudget as number) > 0
        ? (totalBudget as number)
        : computedSpend;

    return { lanes, placed, periods, maxBudget, spend };
  }, [channels, flights, totalBudget]);

  const spendShown = useCountUp(geom.spend, {
    delay: delay ?? 0,
    format: (n) => formatValue(n, { currency, compact: n >= 100_000 }),
  });

  if (geom.lanes.length === 0) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty />
      </div>
    );
  }

  const unit = 100 / geom.periods;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-fc" onMouseLeave={() => setHot(null)}>
        {geom.lanes.map((lane, li) => (
          <div key={li} className="c2-fc-line">
            <div className="c2-fc-name" title={lane.name}>
              {lane.name}
            </div>
            <div className="c2-fc-track">
              {[...Array(geom.periods + 1)].map((_, g) => (
                <span key={g} className="c2-fc-grid" style={{ left: `${g * unit}%` }} />
              ))}
              {geom.placed.map((p, pi) => {
                if (p.lane !== li) return null;
                const left = p.start * unit;
                const width = p.span * unit;
                const weight = Math.max(18, Math.round((p.budget / geom.maxBudget) * 100));
                const active = hot === pi;
                return (
                  <button
                    key={pi}
                    type="button"
                    className={'c2-fc-bar m-stagger-item m-scale-in' + (active ? ' on' : '')}
                    style={
                      {
                        left: `${left}%`,
                        width: `${width}%`,
                        borderColor: lane.color,
                        ['--i' as string]: pi,
                        ['--scale-from' as string]: 0,
                      } as CSSProperties
                    }
                    onMouseEnter={() => setHot(pi)}
                    onFocus={() => setHot(pi)}
                  >
                    <span
                      className="c2-fc-fill"
                      style={{ width: `${weight}%`, background: lane.color }}
                    />
                    <span className="c2-fc-amt tab-num">
                      {formatValue(p.budget, { currency, compact: true })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="c2-fc-total">
        <span className="c2-fc-total-lbl faint">Total spend</span>
        <span className="c2-fc-total-val tab-num mono">{spendShown}</span>
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
