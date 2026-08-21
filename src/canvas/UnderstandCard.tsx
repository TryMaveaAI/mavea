// "What I learned about you" — each inference is cited to its source and correctable,
// so the user can ground or fix what Mavéa inferred about them.
import type { CSSProperties } from 'react';
import { richInnerHtml } from '../lib/richText';
import { Icon } from '../icons/icons';
import { SourceChip, ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import { toast } from '../lib/toast';
import { readableText } from './lib/empty';
import type { UnderstandProps } from '../data/conversation';

type Props = UnderstandProps & { delay?: number };

export function UnderstandCard({ title = 'What I learned about you', items, conf, delay }: Props) {
  // An inference with nothing to show still drew a check circle, a source slot and a "Fix this"
  // button, so the card read as confident about something it never said. Drop those rows here as
  // well as in the validator: a baked demo frame is replayed straight to the canvas and never
  // revisits it. Nothing readable at all means there is no card to draw.
  const shown = items.filter((it) => readableText(it.text));
  if (shown.length === 0) return null;
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.sparkle className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
      </div>
      <div className="understand-list">
        {shown.map((it, i) => (
          <div className="understand-row" key={i}>
            <span className="understand-check">
              <Icon.check />
            </span>
            {/* the first inference is the authored lead — Mavéa's gesture underlines it */}
            <span
              className="understand-text"
              data-mark={i === 0 ? 'underline' : undefined}
              dangerouslySetInnerHTML={richInnerHtml(it.text)}
            />
            <span className="understand-meta">
              {it.source && <SourceChip file={it.source} />}
              <button
                className="understand-edit"
                title="Fix this"
                type="button"
                onClick={() => toast("Tell Mavéa what's off — it'll adjust", 'info')}
              >
                <Icon.edit />
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="card-foot" style={{ marginTop: 14 }}>
        <span className="faint" style={{ fontSize: 12.5 }}>
          Read straight from your site — correct anything.
        </span>
        {/* Only claim file grounding when at least one inference cites a source. */}
        {conf && (
          <ConfidenceBadge
            level={conf}
            title={shown.some((it) => it.source) ? undefined : CONF_TITLE_UNVERIFIED}
          />
        )}
      </div>
    </div>
  );
}
