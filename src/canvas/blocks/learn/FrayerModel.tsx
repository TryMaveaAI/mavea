import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { FrayerModelProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FrayerModelProps & { delay?: number };

/** Read a loose list prop defensively: keep only non-empty strings so a panel never shows a blank
 *  bullet, and a stray object degrades to its text rather than "[object Object]". */
function asList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const t = o.text ?? o.label ?? o.name ?? o.value;
        return typeof t === 'string' ? t : '';
      }
      return '';
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function Panel({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className="frm-panel" style={{ ['--frm-accent' as string]: accent } as CSSProperties}>
      <h4 className="frm-panel-label">{label}</h4>
      <div className="frm-panel-body">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="frm-muted">—</p>;
  return (
    <ul className="frm-list">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export function FrayerModel({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  term,
  pronunciation,
  definition,
  characteristics,
  examples,
  nonexamples,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.edit;
  const chars = asList(characteristics);
  const exs = asList(examples);
  const nonexs = asList(nonexamples);
  const def = typeof definition === 'string' ? definition.trim() : '';
  // Required text props can arrive objectified from a loose reply — coerce so a bad shape never
  // reaches React as a child (which would throw and vanish the whole card).
  const termText = typeof term === 'string' && term.trim() ? term : 'Term';
  const pron = typeof pronunciation === 'string' && pronunciation.trim() ? pronunciation : '';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> <span>{title}</span>
        </div>
      )}

      <div className="frm-term">
        <span className="frm-term-word">{termText}</span>
        {pron && <span className="frm-term-pron">{pron}</span>}
      </div>

      <div className="frm-grid">
        <Panel label="Definition" accent="var(--presence)">
          {def ? <p className="frm-def">{def}</p> : <p className="frm-muted">—</p>}
        </Panel>
        <Panel label="Characteristics" accent="var(--insight)">
          <BulletList items={chars} />
        </Panel>
        <Panel label="Examples" accent="var(--presence-deep)">
          <BulletList items={exs} />
        </Panel>
        <Panel label="Non-examples" accent="var(--warning)">
          <BulletList items={nonexs} />
        </Panel>
      </div>

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
