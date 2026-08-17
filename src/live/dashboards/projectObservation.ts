// projectObservation.ts — turn fetched DATA into the props a component renders.
//
// This is the half of the split that makes the observation model worth having. The check fetches an
// observation in a shape this app defined (observation.ts); this module decides how that reading
// LOOKS. The model is never consulted about prop names, item shapes, or component vocabulary — so a
// drift in its output can no longer discard a grounded search, and a tile's presentation can change
// without re-asking anyone for the same data.
//
// A projection is total for the pairs it claims: given a well-formed observation it always returns
// renderable props. Where a kind and a view genuinely do not fit (a table of rows cannot be one
// number), it returns null and the caller leaves the existing block alone rather than rendering a
// worse view of the same truth.
import { valueWithUnit } from './format';
import type { ObservationData } from './observation';

type Props = Record<string, unknown>;

/** The value a metric card shows, written the way its unit is written. */
function metricStat(o: Extract<ObservationData, { kind: 'metric' }>, unit?: string): string {
  return o.raw ?? valueWithUnit(String(o.value), unit);
}

/**
 * Props for `blockType` from `data`, or null when this observation cannot honestly fill this view.
 * `prev` is the block's current props: a projection keeps the parts that are the tile's IDENTITY
 * (its title, its icon — chosen when the tracker was made) and replaces only what the check
 * fetched, so a refresh never silently renames a card the user recognizes.
 */
export function projectObservation(
  blockType: string,
  data: ObservationData,
  prev: Props = {},
  unit?: string,
): Props | null {
  const title = typeof prev.title === 'string' ? prev.title : '';
  const keep = { ...(title ? { title } : {}), ...(prev.icon ? { icon: prev.icon } : {}) };

  switch (blockType) {
    case 'insight':
      if (data.kind !== 'metric') return null;
      // 'strong' because this value came from a grounded check — the gate upstream already
      // discarded anything a source could not stand behind.
      return { ...prev, ...keep, stat: metricStat(data, unit), conf: 'strong' };

    case 'kpi': {
      if (data.kind === 'metric') {
        return { ...keep, items: [{ label: title || 'Now', value: metricStat(data, unit) }] };
      }
      if (data.kind === 'series') {
        return {
          ...keep,
          items: data.points.slice(-4).map((p) => ({ label: p.label, value: String(p.value) })),
        };
      }
      return null;
    }

    case 'list':
    case 'checklist': {
      const items =
        data.kind === 'list'
          ? data.items
          : data.kind === 'event'
            ? data.events.map((e) => [e.when, e.title, e.detail].filter(Boolean).join(' — '))
            : data.kind === 'series'
              ? data.points.map((p) => `${p.label} — ${p.value}`)
              : data.kind === 'table'
                ? data.rows.map((r) => r.filter(Boolean).join(' — '))
                : null;
      if (!items?.length) return null;
      // checklist reads rows of {t, st}; list reads plain strings.
      return blockType === 'checklist'
        ? { ...keep, rows: items.map((t) => ({ t, st: 'todo' })) }
        : { ...keep, items };
    }

    case 'timeline': {
      if (data.kind !== 'event') return null;
      return {
        ...keep,
        events: data.events.map((e) => ({
          time: e.when,
          title: e.title,
          ...(e.detail ? { detail: e.detail } : {}),
        })),
      };
    }

    case 'datatable': {
      if (data.kind !== 'table') return null;
      const columns = data.columns.map((label, i) => ({ key: `c${i}`, label }));
      return {
        ...keep,
        columns,
        rows: data.rows.map((r) => Object.fromEntries(r.map((cell, i) => [`c${i}`, cell]))),
      };
    }

    case 'standings': {
      if (data.kind !== 'table') return null;
      // standings is a fixed three-column table (team, record, games-behind) — map positionally,
      // which is what its renderer reads, rather than trying to guess the source's own headers.
      const rows = data.rows
        .map((r) => ({ team: r[0] ?? '', rec: r[1] ?? '', gb: r[2] ?? '' }))
        .filter((r) => r.team);
      return rows.length ? { ...keep, rows } : null;
    }

    case 'chart': {
      if (data.kind !== 'series') return null;
      return {
        ...keep,
        labels: data.points.map((p) => p.label),
        series: [
          {
            name: title || 'Value',
            color: 'var(--insight)',
            data: data.points.map((p) => p.value),
          },
        ],
        conf: 'strong',
      };
    }

    case 'bars': {
      if (data.kind !== 'series') return null;
      return {
        ...keep,
        bars: data.points.map((p) => ({ label: p.label, value: p.value })),
        conf: 'strong',
      };
    }

    default:
      return null;
  }
}
