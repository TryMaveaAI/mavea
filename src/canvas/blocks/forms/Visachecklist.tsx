import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VisaDocStatus, VisachecklistProps, VisaDocument } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VisachecklistProps & { delay?: number };

const STATUS_META: Record<VisaDocStatus, { label: string; icon: keyof typeof Icon; c: string }> = {
  done: { label: 'Ready', icon: 'check', c: 'var(--insight)' },
  pending: { label: 'Pending', icon: 'clock', c: 'var(--warning)' },
  missing: { label: 'Missing', icon: 'alert', c: 'var(--danger)' },
};
// A status the model omits or invents reads as "unknown", never a false "missing" — see the
// identical reasoning in Estateplanchecklist's STATUS_META.
const UNKNOWN_STATUS = { label: 'Unknown', icon: 'clock' as const, c: 'var(--text-muted)' };

// Every field read as `unknown` — a document object from a loose model reply is validated for
// shape by the coercer, never for the string/boolean/enum types inside it.
type LooseVisaDoc = { name?: unknown; required?: unknown; status?: unknown };

/** A missing/non-boolean `required` reads as required=true — the safer default for a filing
 *  checklist, where silently treating an unclear document as skippable is the worse mistake. */
function isRequired(d: LooseVisaDoc): boolean {
  return d.required !== false;
}

function docName(d: LooseVisaDoc): string {
  return typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Untitled document';
}

function docStatus(d: LooseVisaDoc): VisaDocStatus | undefined {
  return typeof d.status === 'string' ? (d.status as VisaDocStatus) : undefined;
}

interface GroupProps {
  name: string;
  items: LooseVisaDoc[];
  accent: boolean;
  startIndex: number;
}

/** One bucket (Required / Optional), reusing PackList's group-header + progress-meter
 *  technique. `accent` gives the Required bucket the stronger, left-barred row treatment so
 *  the two kinds of document read as visually distinct at a glance, not just by section title. */
function DocGroup({ name, items, accent, startIndex }: GroupProps) {
  if (items.length === 0) return null;
  const done = items.filter((d) => docStatus(d) === 'done').length;
  const pct = items.length > 0 ? (done / items.length) * 100 : 0;

  return (
    <div className={`vc-group ${accent ? 'is-required' : 'is-optional'}`}>
      <div className="vc-group-head">
        <span className="vc-group-name">{name}</span>
        <span className="vc-group-count tab-num">
          {done}/{items.length}
        </span>
      </div>
      <div className="vc-group-bar">
        <span className="vc-group-bar-fill" style={{ width: pct + '%' }} />
      </div>
      <ul className="vc-items">
        {items.map((it, ii) => {
          const status = docStatus(it);
          const meta = status ? STATUS_META[status] : undefined;
          const shown = meta ?? UNKNOWN_STATUS;
          const StatusIc = Icon[shown.icon] || Icon.check;
          return (
            <li
              className="vc-item m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: startIndex + ii } as CSSProperties}
              key={ii}
            >
              <span className="vc-name">{docName(it)}</span>
              <span
                className="vc-status"
                style={{ ['--vc-status' as string]: shown.c } as CSSProperties}
              >
                <StatusIc className="ic" /> {shown.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * An immigration filing checklist, grouped the way PackList groups a trip by category — here
 * the two buckets are Required and Optional, so what USCIS/the consulate won't move without
 * never gets lost among the nice-to-haves. Static, like Estateplanchecklist: status is what's
 * true about the filing today, not a task the card owner ticks off by hand.
 */
export function Visachecklist({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  caseType,
  documents,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.globe;
  const docs: VisaDocument[] = Array.isArray(documents) ? documents : [];

  const total = docs.length;
  const doneCount = docs.filter((d) => docStatus(d) === 'done').length;
  const overallPct = total > 0 ? (doneCount / total) * 100 : 0;

  const required = docs.filter((d) => isRequired(d));
  const optional = docs.filter((d) => !isRequired(d));

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--vc-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {total > 0 && (
        <>
          <div className="vc-overall">
            {caseType && <span className="vc-case">{caseType}</span>}
            <span className="vc-overall-count">
              {doneCount} / {total} ready
            </span>
          </div>
          <div className="vc-bar" role="progressbar" aria-valuenow={Math.round(overallPct)}>
            <span className="vc-bar-fill" style={{ width: overallPct + '%' }} />
          </div>
        </>
      )}

      {total === 0 ? (
        <div className="vc-empty faint">No documents listed yet.</div>
      ) : (
        <div className="vc-groups">
          <DocGroup name="Required" items={required} accent startIndex={0} />
          <DocGroup name="Optional" items={optional} accent={false} startIndex={required.length} />
        </div>
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
