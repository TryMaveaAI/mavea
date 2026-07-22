import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { DiscoveryTrackerProps, DiscoveryRequest, DiscoveryStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DiscoveryTrackerProps & { delay?: number };

const STATUS_SET = new Set<DiscoveryStatus>(['outstanding', 'produced', 'objected', 'privileged']);
const STATUS_COLOR: Record<DiscoveryStatus, string> = {
  outstanding: 'var(--warning)',
  produced: 'var(--insight)',
  objected: 'var(--danger)',
  privileged: 'var(--presence)',
};
const STATUS_LABEL: Record<DiscoveryStatus, string> = {
  outstanding: 'Outstanding',
  produced: 'Produced',
  objected: 'Objected',
  privileged: 'Privileged',
};
const STATUS_ORDER: DiscoveryStatus[] = ['outstanding', 'produced', 'objected', 'privileged'];

/** A loose/misspelled status from the model still lands on a real badge instead of an undefined
 *  one — the same reasoning DataDictionary's `toDtype` uses for its dtype pill. */
function toStatus(v: unknown): DiscoveryStatus {
  return typeof v === 'string' && STATUS_SET.has(v as DiscoveryStatus)
    ? (v as DiscoveryStatus)
    : 'outstanding';
}

type SortKey = 'num' | 'party' | 'status' | 'due';
type SortDir = 'asc' | 'desc';

interface Row {
  req: DiscoveryRequest;
  num: number;
  party: string;
  status: DiscoveryStatus;
}

/** Best-effort chronological compare for a free-form due-date string: a parseable date sorts by
 *  time, an unparseable one (or a missing one, sorted last) falls back to plain string order so
 *  the column never throws on a model's non-ISO date. */
function compareDue(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  if (Number.isFinite(ta)) return -1;
  if (Number.isFinite(tb)) return 1;
  return a.localeCompare(b);
}

// A legal discovery request log: one row per request, a sortable table with a colored status
// badge, and filter chips to isolate what's still outstanding vs. produced/objected/privileged.
// Litigation, legal ops — "where does discovery stand".
export function DiscoveryTracker({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  requests,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const [filter, setFilter] = useState<'all' | DiscoveryStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('num');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const list = Array.isArray(requests) ? requests : [];
  const rows: Row[] = list
    .filter((r) => typeof r?.description === 'string' && r.description.trim().length > 0)
    .map((req, i) => ({
      req,
      num: typeof req.num === 'number' && Number.isFinite(req.num) ? req.num : i + 1,
      party:
        typeof req.requestingParty === 'string' && req.requestingParty.trim()
          ? req.requestingParty
          : 'Unspecified',
      status: toStatus(req.status),
    }));

  const counts = useMemo(() => {
    const c: Record<DiscoveryStatus, number> = {
      outstanding: 0,
      produced: 0,
      objected: 0,
      privileged: 0,
    };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const sorted = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'num':
          return (a.num - b.num) * mul;
        case 'party':
          return a.party.localeCompare(b.party) * mul;
        case 'status':
          return (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * mul;
        case 'due':
          return compareDue(a.req.dueDate || '', b.req.dueDate || '') * mul;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const Th = ({ label, sk }: { label: string; sk: SortKey }) => (
    <th className="dtr-th">
      <button type="button" className="dtr-th-btn" onClick={() => toggleSort(sk)}>
        {label}
        {sortKey === sk && <span className="dtr-th-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {rows.length === 0 ? (
        <BlockEmpty message="No discovery requests logged" />
      ) : (
        <>
          <div className="dtr-chips" role="tablist">
            <button
              type="button"
              className={`dtr-chip ${filter === 'all' ? 'on' : ''}`}
              onClick={() => setFilter('all')}
            >
              All <span className="dtr-count">{rows.length}</span>
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`dtr-chip ${filter === s ? 'on' : ''}`}
                style={{ ['--dtr-c' as string]: STATUS_COLOR[s] } as CSSProperties}
                onClick={() => setFilter(s)}
              >
                {STATUS_LABEL[s]} <span className="dtr-count">{counts[s]}</span>
              </button>
            ))}
          </div>

          <div className="dtr-scroll">
            <table className="dtr-table">
              <thead>
                <tr>
                  <Th label="#" sk="num" />
                  <th className="dtr-th dtr-th-desc">Description</th>
                  <Th label="Requesting party" sk="party" />
                  <Th label="Status" sk="status" />
                  <th className="dtr-th">Bates</th>
                  <Th label="Due" sk="due" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.num}-${i}`} className="dtr-row m-stagger-item m-fade-rise">
                    <td className="dtr-num tab-num">{r.num}</td>
                    <td className="dtr-desc">{r.req.description}</td>
                    <td className="dtr-party">{r.party}</td>
                    <td>
                      <span
                        className="dtr-status"
                        style={{ ['--dtr-c' as string]: STATUS_COLOR[r.status] } as CSSProperties}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.status === 'privileged' && r.req.privilegeBasis && (
                        <div className="dtr-priv-note">{r.req.privilegeBasis}</div>
                      )}
                    </td>
                    <td className="dtr-bates">{r.req.batesRange || '—'}</td>
                    <td className="dtr-due">{r.req.dueDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
