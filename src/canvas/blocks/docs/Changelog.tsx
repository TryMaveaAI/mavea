import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ChangelogProps, ChangelogEntryKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ChangelogProps & { delay?: number };

// Reuses ClinicalTimeline's type→color mapping pattern, retuned for release-note kinds: a
// calm progression from "this got better" (added/fixed) through "pay attention" (deprecated)
// to "this could break you" (security) — so the eye reads severity before it reads the word.
const KIND_COLOR: Record<ChangelogEntryKind, string> = {
  added: 'var(--insight)',
  changed: 'var(--presence)',
  fixed: 'var(--presence-soft)',
  deprecated: 'var(--warning-soft)',
  removed: 'var(--warning)',
  security: 'var(--danger)',
};

const KIND_ICON: Record<ChangelogEntryKind, keyof typeof Icon> = {
  added: 'plus',
  changed: 'refresh',
  fixed: 'check',
  deprecated: 'clock',
  removed: 'x',
  security: 'shield',
};

// Ranks entries within a version by real-world severity so the rail dot can flag the release
// that most deserves attention, even when it also carries a pile of routine "added" lines.
const SEVERITY: ChangelogEntryKind[] = [
  'security',
  'removed',
  'deprecated',
  'fixed',
  'changed',
  'added',
];
function mostSevere(entries: { kind: ChangelogEntryKind }[]): ChangelogEntryKind {
  let best = SEVERITY.length - 1;
  for (const e of entries) {
    const rank = SEVERITY.indexOf(e.kind);
    if (rank !== -1 && rank < best) best = rank;
  }
  return SEVERITY[best] ?? 'changed';
}

export function Changelog({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  versions,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cl-versions">
        {versions.map((v, i) => {
          const isLast = i === versions.length - 1;
          const railColor = v.entries.length
            ? KIND_COLOR[mostSevere(v.entries)]
            : 'var(--text-muted)';
          return (
            <div
              key={i}
              className="cl-version m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <div className="cl-rail">
                <div className="cl-dot" style={{ borderColor: railColor, color: railColor }} />
                {!isLast && <div className="cl-line" />}
              </div>
              <div className="cl-body">
                <div className="cl-version-head">
                  <span className="cl-version-num">{v.version}</span>
                  {v.date && <span className="cl-version-date">{v.date}</span>}
                </div>
                {v.entries.length > 0 && (
                  <div className="cl-entries">
                    {v.entries.map((e, ei) => {
                      const color = KIND_COLOR[e.kind] ?? 'var(--text-muted)';
                      const KindIc = Icon[KIND_ICON[e.kind]] || Icon.doc;
                      return (
                        <div key={ei} className="cl-entry">
                          <span
                            className="cl-kind"
                            style={{
                              color,
                              background: `color-mix(in oklab, ${color} 14%, transparent)`,
                            }}
                          >
                            <KindIc className="ic" />
                            {e.kind}
                          </span>
                          <span className="cl-entry-text">{e.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
