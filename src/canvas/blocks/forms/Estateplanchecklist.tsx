import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EstateDocCategory, EstateDocStatus, EstateplanchecklistProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EstateplanchecklistProps & { delay?: number };

// The five pillars in the order estate attorneys actually walk through them — a document
// outside this set (a model typo, a jurisdiction-specific extra) still renders, grouped at
// the end under its own literal name rather than dropped.
const CANONICAL_CATEGORIES: EstateDocCategory[] = [
  'Will',
  'POA',
  'Healthcare Proxy',
  'Beneficiary designations',
  'Digital assets',
];

const STATUS_META: Record<EstateDocStatus, { label: string; icon: keyof typeof Icon; c: string }> =
  {
    done: { label: 'Done', icon: 'check', c: 'var(--insight)' },
    'needs-update': { label: 'Needs update', icon: 'refresh', c: 'var(--warning)' },
    missing: { label: 'Missing', icon: 'alert', c: 'var(--danger)' },
  };
// A status the model invents (or omits) reads as "unknown" rather than a false "missing" —
// the checklist shouldn't claim a document is absent when it simply doesn't know.
const UNKNOWN_STATUS = { label: 'Unknown', icon: 'clock' as const, c: 'var(--text-muted)' };

interface Group {
  name: string;
  items: { status: EstateDocStatus | undefined; lastReviewed: string | undefined }[];
}

// Every field read as `unknown` rather than trusted at its declared type — a loose model reply
// is validated for shape ("is this an array?") but never for the enum/string types inside each
// item, so the renderer has to guard them itself.
type LooseEstateDoc = { category?: unknown; status?: unknown; lastReviewed?: unknown };

/** Bucket the flat document list into its five canonical categories (in the attorney's own
 *  order), then any unrecognized category names, each in first-seen order. Case/whitespace
 *  drift in a model-authored category ("will" vs "Will") still lands in the right bucket. */
function groupDocuments(documents: LooseEstateDoc[]): Group[] {
  const byKey = new Map<string, Group>();
  const order: string[] = [];
  for (const known of CANONICAL_CATEGORIES)
    byKey.set(known.toLowerCase(), { name: known, items: [] });

  for (const doc of documents) {
    const raw = typeof doc?.category === 'string' ? doc.category.trim() : '';
    const key = raw ? raw.toLowerCase() : 'other';
    let group = byKey.get(key);
    if (!group) {
      group = { name: raw || 'Other', items: [] };
      byKey.set(key, group);
    }
    if (!order.includes(key)) order.push(key);
    group.items.push({
      status: typeof doc?.status === 'string' ? (doc.status as EstateDocStatus) : undefined,
      lastReviewed: typeof doc?.lastReviewed === 'string' ? doc.lastReviewed : undefined,
    });
  }

  // Canonical categories lead even when empty-of-order (they were seeded above); anything
  // else appears in the order its first document showed up.
  const seeded = CANONICAL_CATEGORIES.map((c) => c.toLowerCase());
  const rest = order.filter((k) => !seeded.includes(k));
  return [...seeded, ...rest].map((k) => byKey.get(k)!).filter((g) => g.items.length > 0);
}

/**
 * The five-pillar estate-planning status board: Will, POA, Healthcare Proxy, Beneficiary
 * designations, Digital assets, each grouped and shown with a plain done / missing /
 * needs-update badge. Static (not tap-to-toggle) like Preflightchecklist's status is closer
 * to a fact than a task — this reflects what's true today, it isn't a to-do the user checks
 * off in the card.
 */
export function Estateplanchecklist({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  documents,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const docs = Array.isArray(documents) ? documents : [];
  const groups = groupDocuments(docs);

  const total = docs.length;
  const doneCount = docs.filter((d) => d?.status === 'done').length;
  const allDone = total > 0 && doneCount === total;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  let rowIndex = 0;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ep-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {total > 0 && (
        <div className="ep-progress">
          <div className="ep-track">
            <div className="ep-fill" style={{ width: pct + '%' }} />
          </div>
          <span className={`ep-count tab-num ${allDone ? 'done' : ''}`}>
            {allDone ? 'All current' : `${doneCount}/${total}`}
          </span>
        </div>
      )}

      {total === 0 ? (
        <div className="ep-empty faint">No estate documents listed yet.</div>
      ) : (
        <div className="ep-groups">
          {groups.map((group, gi) => {
            const gDone = group.items.filter((it) => it.status === 'done').length;
            return (
              <div className="ep-group" key={gi}>
                <div className="ep-group-head">
                  <span className="ep-group-name">{group.name}</span>
                  <span className="ep-group-count tab-num">
                    {gDone}/{group.items.length}
                  </span>
                </div>
                <div className="ep-list">
                  {group.items.map((it, ii) => {
                    const meta = it.status ? STATUS_META[it.status] : undefined;
                    const shown = meta ?? UNKNOWN_STATUS;
                    const StatusIc = Icon[shown.icon] || Icon.check;
                    const i = rowIndex++;
                    return (
                      <div
                        className="ep-row m-stagger-item m-fade-rise"
                        style={{ ['--i' as string]: i } as CSSProperties}
                        key={ii}
                      >
                        <span
                          className="ep-status"
                          style={{ ['--ep-status' as string]: shown.c } as CSSProperties}
                        >
                          <StatusIc className="ic" /> {shown.label}
                        </span>
                        {it.lastReviewed && (
                          <span className="ep-reviewed faint">Reviewed {it.lastReviewed}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
