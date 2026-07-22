import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { Morpheme, MorphemeBreakdownProps, MorphemeRole } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MorphemeBreakdownProps & { delay?: number };

const ROLE_LABEL: Record<MorphemeRole, string> = {
  prefix: 'Prefix',
  root: 'Root',
  suffix: 'Suffix',
};

/** Any role string that isn't one of the three known values reads as a root — the neutral,
 *  most-common bucket — rather than dropping the morpheme or leaving it uncoloured. */
function normalizeRole(role: unknown): MorphemeRole {
  return role === 'prefix' || role === 'suffix' ? role : 'root';
}

export function MorphemeBreakdown({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  word,
  morphemes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  // Only morphemes with real text render — the segmented word is literally these spans laid
  // side by side, so a blank one would show as an unlabelled gap.
  const parts: Morpheme[] = (Array.isArray(morphemes) ? morphemes : []).filter(
    (m): m is Morpheme => !!m && typeof m.text === 'string' && m.text.length > 0,
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {parts.length === 0 ? (
        <div className="lr-mb-empty">No morphemes to break down.</div>
      ) : (
        <>
          <div className="lr-mb-word">{word || parts.map((p) => p.text).join('')}</div>
          <div className="lr-mb-segments">
            {parts.map((m, i) => (
              <span key={i} className={`lr-mb-seg lr-mb-seg--${normalizeRole(m.role)}`}>
                {m.text}
              </span>
            ))}
          </div>
          <div className="lr-mb-legend">
            {parts.map((m, i) => {
              const role = normalizeRole(m.role);
              return (
                <div key={i} className="lr-mb-gloss">
                  <span className={`lr-mb-role-dot lr-mb-role-dot--${role}`} aria-hidden="true" />
                  <span className="lr-mb-gloss-text">
                    <b className={`lr-mb-gloss-term lr-mb-gloss-term--${role}`}>{m.text}</b>
                    <i className="lr-mb-gloss-role">{ROLE_LABEL[role]}</i>
                    {m.meaning && <span className="lr-mb-gloss-meaning"> — {m.meaning}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

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
