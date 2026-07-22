import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScreenplayProps, ScreenplayElement } from './types';
import './styles.css';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScreenplayProps & { delay?: number };

// Screenplay convention is mechanical: each element kind has a fixed casing the
// renderer enforces so the page reads correctly regardless of how the model cased
// the raw line. Sluglines, character cues, and transitions are spoken in caps;
// parentheticals read in lowercase wrapped in a single pair of parens; action and
// dialogue keep the author's own casing. We derive the displayed string here rather
// than trusting the input so the format is always faithful to the craft.
function formatLine(el: ScreenplayElement): string {
  const raw = el.text.trim();
  switch (el.kind) {
    case 'slug':
    case 'character':
    case 'transition':
      return raw.toUpperCase();
    case 'parenthetical': {
      // Strip any parens the model already added, lowercase the lead, re-wrap once.
      const inner = raw.replace(/^\(+|\)+$/g, '').trim();
      const lead = inner.charAt(0).toLowerCase() + inner.slice(1);
      return `(${lead})`;
    }
    default:
      return raw;
  }
}

export function Screenplay({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  elements,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  // Guard against a partially-constructed block arriving without elements.
  const lines = elements ?? [];

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

      {/* Scene framing — subdued, sits above the typed page */}
      {caption && <div className="scp-caption">{caption}</div>}

      {/* The page: monospace column with per-kind margins/casing/alignment */}
      <div className="scp-page">
        {lines.map((el, i) => (
          <div key={i} className={`scp-el scp-${el.kind}`}>
            {formatLine(el)}
          </div>
        ))}
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
