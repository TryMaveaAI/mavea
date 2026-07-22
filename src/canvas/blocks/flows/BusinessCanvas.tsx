import type { CSSProperties } from 'react';
import { Icon, type IconKey } from '../../../icons/icons';
import type { BusinessCanvasProps } from './types';

type Props = BusinessCanvasProps & { delay?: number };

type SlotKey =
  | 'keyPartners'
  | 'keyActivities'
  | 'keyResources'
  | 'valueProposition'
  | 'customerRelationships'
  | 'channels'
  | 'customerSegments'
  | 'costStructure'
  | 'revenueStreams';

/** The nine regions in the canvas's reading order (left column to right, then the bottom split).
 *  Each slot carries both vocabularies as a [bmc, lean] pair — the Lean Canvas reuses the BMC's
 *  geometry with five boxes relabeled, so the grid template never changes, only the words and the
 *  little glyph that hints what belongs in the box. */
const REGIONS: {
  key: SlotKey;
  area: string;
  labels: [string, string];
  icons: [IconKey, IconKey];
}[] = [
  {
    key: 'keyPartners',
    area: 'partners',
    labels: ['Key Partners', 'Problem'],
    icons: ['link', 'alert'],
  },
  {
    key: 'keyActivities',
    area: 'activities',
    labels: ['Key Activities', 'Solution'],
    icons: ['refresh', 'check'],
  },
  {
    key: 'keyResources',
    area: 'resources',
    labels: ['Key Resources', 'Key Metrics'],
    icons: ['layers', 'chart'],
  },
  {
    key: 'valueProposition',
    area: 'value',
    labels: ['Value Proposition', 'Unique Value Proposition'],
    icons: ['sparkle', 'sparkle'],
  },
  {
    key: 'customerRelationships',
    area: 'relationships',
    labels: ['Customer Relationships', 'Unfair Advantage'],
    icons: ['chat', 'shield'],
  },
  { key: 'channels', area: 'channels', labels: ['Channels', 'Channels'], icons: ['send', 'send'] },
  {
    key: 'customerSegments',
    area: 'segments',
    labels: ['Customer Segments', 'Customer Segments'],
    icons: ['globe', 'globe'],
  },
  {
    key: 'costStructure',
    area: 'costs',
    labels: ['Cost Structure', 'Cost Structure'],
    icons: ['arrowDown', 'arrowDown'],
  },
  {
    key: 'revenueStreams',
    area: 'revenue',
    labels: ['Revenue Streams', 'Revenue Streams'],
    icons: ['arrowUp', 'arrowUp'],
  },
];

/** Region props are string[], but a near-miss sometimes arrives objectified ({text: …}) or as a
 *  lone string; flatten to clean non-empty strings so the box still reads instead of vanishing. */
const strList = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  for (const it of arr) {
    if (typeof it === 'string') {
      const t = it.trim();
      if (t) out.push(t);
    } else if (it && typeof it === 'object') {
      for (const k of ['text', 'label', 'name', 'title']) {
        const c = (it as Record<string, unknown>)[k];
        if (typeof c === 'string' && c.trim()) {
          out.push(c.trim());
          break;
        }
      }
    }
  }
  return out;
};

export function BusinessCanvas({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  variant,
  keyPartners,
  keyActivities,
  keyResources,
  valueProposition,
  customerRelationships,
  channels,
  customerSegments,
  costStructure,
  revenueStreams,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const vi = variant === 'lean' ? 1 : 0;
  const framework = vi ? 'Lean Canvas' : 'Business Model Canvas';
  const slots: Record<SlotKey, string[]> = {
    keyPartners: strList(keyPartners),
    keyActivities: strList(keyActivities),
    keyResources: strList(keyResources),
    valueProposition: strList(valueProposition),
    customerRelationships: strList(customerRelationships),
    channels: strList(channels),
    customerSegments: strList(customerSegments),
    costStructure: strList(costStructure),
    revenueStreams: strList(revenueStreams),
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || framework}
        {title && <span className="fl-bc-variant">{framework}</span>}
      </div>
      <div className="fl-bc">
        {REGIONS.map((r, i) => {
          const items = slots[r.key];
          const RIc = Icon[r.icons[vi]] || Icon.layers;
          return (
            <div
              key={r.key}
              className={
                `fl-bc-region fl-bc-${r.area} m-stagger-item m-fade-rise` +
                (items.length === 0 ? ' is-empty' : '')
              }
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <div className="fl-bc-head">
                <RIc className="ic" />
                <span className="fl-bc-headtext">{r.labels[vi]}</span>
              </div>
              {items.length > 0 && (
                <ul className="fl-bc-items cf-scroll">
                  {items.map((it, ii) => (
                    <li className="fl-bc-item" key={ii}>
                      {it}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
