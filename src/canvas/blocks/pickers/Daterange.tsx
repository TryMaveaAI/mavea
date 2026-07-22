import { useState } from 'react';
import { richInnerHtml } from '../../../lib/richText';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DaterangeProps } from './types';
import {
  WEEKDAYS,
  addMonth,
  buildGrid,
  cmpISO,
  monthLabel,
  parseMonth,
  presetRange,
  prettyISO,
} from './_cal';

type Props = DaterangeProps & { delay?: number };

export function Daterange({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  month,
  start = '2026-06-08',
  end = '2026-06-21',
  presets = ['Last 7 days', 'Last 30 days', 'This month'],
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [view, setView] = useState(parseMonth(month || (start ? start.slice(0, 7) : undefined)));
  const [range, setRange] = useState<{ a: string | null; b: string | null }>({
    a: start || null,
    b: end || null,
  });
  // when both ends are set, the next click starts a fresh range
  const [stage, setStage] = useState<'start' | 'end'>(
    range.a && range.b ? 'start' : range.a ? 'end' : 'start',
  );
  const [hover, setHover] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const right = addMonth(view, 1);

  const lo = range.a && range.b ? (cmpISO(range.a, range.b) <= 0 ? range.a : range.b) : range.a;
  const hi = range.a && range.b ? (cmpISO(range.a, range.b) <= 0 ? range.b : range.a) : null;
  // live preview hi while picking the end
  const previewHi =
    stage === 'end' && range.a && hover ? (cmpISO(range.a, hover) >= 0 ? range.a : hover) : null;
  const previewLo =
    stage === 'end' && range.a && hover ? (cmpISO(range.a, hover) >= 0 ? hover : range.a) : null;

  const click = (iso: string) => {
    if (stage === 'start') {
      setRange({ a: iso, b: null });
      setStage('end');
    } else {
      setRange((r) => ({ a: r.a, b: iso }));
      setStage('start');
    }
  };

  // Apply a preset relative to the latest known date (these pickers carry no real clock, so the
  // anchor is the current end of the range, falling back to the seeded end/start dates).
  const applyPreset = (label: string) => {
    const anchor = hi || range.b || range.a || end || start;
    if (!anchor) return;
    const next = presetRange(label, anchor);
    if (!next) return;
    setRange({ a: next.a, b: next.b });
    setStage('start');
    setView(parseMonth(next.a.slice(0, 7)));
  };

  const inRange = (iso: string) => {
    if (lo && hi) return cmpISO(iso, lo) > 0 && cmpISO(iso, hi) < 0;
    if (previewLo && previewHi) return cmpISO(iso, previewLo) > 0 && cmpISO(iso, previewHi) < 0;
    return false;
  };
  const isEnd = (iso: string) =>
    iso === range.a || iso === range.b || previewLo === iso || previewHi === iso;

  const renderMonth = (m: { y: number; m: number }) => {
    const grid = buildGrid(m.y, m.m);
    return (
      <div className="dr-month">
        <div className="cal-title sm">{monthLabel(m.y, m.m)}</div>
        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => (
            <span key={'h' + i} className="cal-wd">
              {w}
            </span>
          ))}
          {grid.map((c) => {
            const end = isEnd(c.iso);
            return (
              <button
                key={c.iso}
                type="button"
                className={`cal-day ${c.inMonth ? '' : 'out'} ${inRange(c.iso) ? 'rng' : ''} ${end ? 'sel' : ''} ${active === c.iso ? 'edge' : ''}`}
                onMouseEnter={() => setHover(c.iso)}
                onMouseDown={() => setActive(c.iso)}
                onMouseUp={() => setActive(null)}
                onClick={() => click(c.iso)}
              >
                {c.day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const summary =
    lo && hi
      ? `${prettyISO(lo)} → ${prettyISO(hi)}`
      : range.a
        ? `${prettyISO(range.a)} → pick end`
        : 'Pick a start date';

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pk-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dr-bar">
        <span className="dr-summary">{summary}</span>
        <button
          type="button"
          className="dr-clear"
          onClick={() => {
            setRange({ a: null, b: null });
            setStage('start');
          }}
        >
          Clear
        </button>
      </div>

      {presets.length > 0 && (
        <div className="dr-presets">
          {presets.map((p) => (
            <button key={p} type="button" className="dr-preset" onClick={() => applyPreset(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="dr-cal" onMouseLeave={() => setHover(null)}>
        <button
          type="button"
          className="cal-nav dr-edge"
          onClick={() => setView((v) => addMonth(v, -1))}
          aria-label="Previous month"
        >
          <Icon.chevR className="cal-nav-ic flip" />
        </button>
        <div className="dr-months">
          {renderMonth(view)}
          {renderMonth(right)}
        </div>
        <button
          type="button"
          className="cal-nav dr-edge"
          onClick={() => setView((v) => addMonth(v, 1))}
          aria-label="Next month"
        >
          <Icon.chevR className="cal-nav-ic" />
        </button>
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
