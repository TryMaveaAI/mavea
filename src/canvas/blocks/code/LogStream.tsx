import { useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LogStreamProps, LogLevel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LogStreamProps & { delay?: number };

// Severity order, low → high, drives both the volume header and the per-row pill color.
const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

// A log viewer: a header of per-level volume chips (click to filter to that level), then a
// scrollable feed of timestamp · level pill · source tag · message, color-coded by severity.
// Filtering is local state only (no timers/listeners), so there is nothing to leak.
export function LogStream({
  title,
  icon = 'layers',
  iconColor = 'var(--insight)',
  entries,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const rows = useMemo(() => entries ?? [], [entries]);
  const [only, setOnly] = useState<LogLevel | null>(null);

  const counts = useMemo(() => {
    const c = {} as Record<LogLevel, number>;
    for (const lvl of LEVELS) c[lvl] = 0;
    for (const e of rows) if (e?.level && c[e.level] != null) c[e.level] += 1;
    return c;
  }, [rows]);

  const shown = only ? rows.filter((e) => e.level === only) : rows;
  const present = LEVELS.filter((lvl) => counts[lvl] > 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {present.length > 0 && (
        <div className="log-vol" role="group" aria-label="Filter by level">
          {present.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`log-chip log-${lvl}${only === lvl ? ' on' : ''}`}
              aria-pressed={only === lvl}
              onClick={() => setOnly(only === lvl ? null : lvl)}
            >
              <span className="log-chip-name">{lvl}</span>
              <span className="log-chip-count">{counts[lvl]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="log-feed">
        {shown.map((e, i) => (
          <div key={i} className={`log-row log-${e.level}`}>
            {e.time && <span className="log-time">{e.time}</span>}
            <span className={`log-pill log-${e.level}`}>{e.level}</span>
            {e.source && <span className="log-src">{e.source}</span>}
            <span className="log-msg">{e.message}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="log-empty">No entries</div>}
      </div>

      {caption && <div className="term-caption">{caption}</div>}
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
