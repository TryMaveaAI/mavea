import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LitigationtimelineProps, LitigationEvent, LitigationUrgency } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LitigationtimelineProps & { delay?: number };

const URGENCY_META: Record<LitigationUrgency, { c: string; label: string }> = {
  routine: { c: 'var(--text-muted)', label: 'Routine' },
  soon: { c: 'var(--warning)', label: 'Soon' },
  critical: { c: 'var(--danger)', label: 'Critical' },
};
// Most-newsworthy first, matching the family's salient-row convention.
const URGENCY_ORDER: LitigationUrgency[] = ['critical', 'soon', 'routine'];

const KIND_LABEL: Record<string, string> = {
  filing: 'Filing',
  motion: 'Motion',
  hearing: 'Hearing',
  order: 'Order',
  deadline: 'Deadline',
};

// A stray/unrecognized kind still reads as SOMETHING (its own text, capitalized) rather
// than falling back to a generic placeholder — the model's raw string is more informative
// than "Event" would be.
function kindLabel(kind: string): string {
  const known = KIND_LABEL[kind];
  if (known) return known;
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Event';
}

// A model reply can omit `urgency` or send a typo'd value; anything unrecognized reads as
// the calmest tier rather than crashing the META lookup or silently miscoloring a node.
function effectiveUrgency(e: LitigationEvent): LitigationUrgency {
  return e.urgency && URGENCY_META[e.urgency] ? e.urgency : 'routine';
}

// Real calendar math against the caller's own date, nothing invented: "how far is `date`
// from right now" reads the same way a filing deadline reads off a desk calendar. Returns
// null for an unparseable/missing date so the caller can skip the countdown entirely.
function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86_400_000) : null;
}

export function Litigationtimeline({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  events,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;
  const rows: LitigationEvent[] = Array.isArray(events) ? events : [];

  const [filter, setFilter] = useState<LitigationUrgency | 'all'>('all');
  const counts = URGENCY_ORDER.reduce<Record<LitigationUrgency, number>>(
    (m, u) => {
      m[u] = rows.filter((e) => effectiveUrgency(e) === u).length;
      return m;
    },
    { critical: 0, soon: 0, routine: 0 },
  );
  const present = URGENCY_ORDER.filter((u) => counts[u] > 0);
  const shown = rows.filter((e) => filter === 'all' || effectiveUrgency(e) === filter);

  // Mavéa's gesture circles the most newsworthy visible row: the first critical item, else
  // the first soon-due one, else the first row.
  const salientIdx = (() => {
    for (const u of URGENCY_ORDER) {
      const i = shown.findIndex((e) => effectiveUrgency(e) === u);
      if (i !== -1) return i;
    }
    return 0;
  })();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {present.length > 0 && (
        <div className="lt-chips">
          <button
            type="button"
            className={`lt-chip ${filter === 'all' ? 'on' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="lt-chip-n tab-num">{rows.length}</span>
          </button>
          {present.map((u) => (
            <button
              key={u}
              type="button"
              className={`lt-chip ${filter === u ? 'on' : ''}`}
              style={{ ['--chip-c' as string]: URGENCY_META[u].c } as CSSProperties}
              onClick={() => setFilter((f) => (f === u ? 'all' : u))}
            >
              <span className="lt-chip-dot" style={{ background: URGENCY_META[u].c }} />
              {URGENCY_META[u].label} <span className="lt-chip-n tab-num">{counts[u]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="lt-list">
        {shown.map((e, i) => {
          const urgency = effectiveUrgency(e);
          const meta = URGENCY_META[urgency];
          const remaining = urgency === 'critical' ? daysUntil(e.date) : null;
          const metaLine = [e.court, e.party].filter(Boolean).join(' · ');
          return (
            <div
              className="lt-row m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i, ['--ev-c' as string]: meta.c } as CSSProperties}
            >
              <span className="lt-rail">
                <span
                  className="lt-node"
                  data-mark={i === salientIdx ? 'circle' : undefined}
                  aria-hidden="true"
                />
              </span>
              <span className="lt-body">
                <span className="lt-top">
                  <span className="lt-kind">{kindLabel(e.kind)}</span>
                  {e.date && <span className="lt-date faint tab-num">{e.date}</span>}
                </span>
                {metaLine && <span className="lt-meta faint">{metaLine}</span>}
                {e.detail && <span className="lt-detail faint">{e.detail}</span>}
                {remaining != null && (
                  <span className={`lt-countdown ${remaining < 0 ? 'overdue' : ''}`}>
                    {remaining < 0
                      ? `${Math.abs(remaining)}d overdue`
                      : remaining === 0
                        ? 'due today'
                        : `${remaining}d left`}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="lt-empty faint">
            No {filter === 'all' ? '' : URGENCY_META[filter].label.toLowerCase() + ' '}events.
          </div>
        )}
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
