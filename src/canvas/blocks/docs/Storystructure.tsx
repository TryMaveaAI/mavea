import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { StorystructureProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StorystructureProps & { delay?: number };

/** Splits on runs of whitespace and drops empties, so a stray double-space or leading/trailing
 *  blank never inflates the count. Used only as a fallback when the caller omits `wordCount`. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// A journalism inverted-pyramid draft: the lede and nut graf called out in a highlighted block
// up top (the two sentences that carry the whole story), body paragraphs in reading order below,
// and any secondary background held behind a collapsible tail section — so a reader who stops
// after the first screen still has the whole story, and background never pushes it down.
export function Storystructure({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  lede,
  nutGraf,
  body,
  background,
  wordCountBudget,
  wordCount,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const paragraphs = Array.isArray(body) ? body.filter((p) => typeof p === 'string' && p) : [];
  const bg = Array.isArray(background) ? background.filter((p) => typeof p === 'string' && p) : [];
  const [showBg, setShowBg] = useState(false);

  if (!lede && !nutGraf && paragraphs.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No draft to show yet" />
      </div>
    );
  }

  const shownCount =
    typeof wordCount === 'number' && Number.isFinite(wordCount)
      ? wordCount
      : countWords([lede, nutGraf, ...paragraphs].filter(Boolean).join(' '));
  const overBudget =
    typeof wordCountBudget === 'number' &&
    Number.isFinite(wordCountBudget) &&
    shownCount > wordCountBudget;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {shownCount > 0 && (
        <div className="ss-wordcount tab-num faint">
          {shownCount.toLocaleString()}
          {typeof wordCountBudget === 'number' && Number.isFinite(wordCountBudget)
            ? ` / ${wordCountBudget.toLocaleString()} words`
            : ' words'}
          {overBudget && <span className="ss-wordcount-over"> · over budget</span>}
        </div>
      )}

      {(lede || nutGraf) && (
        <div className="ss-lede-block">
          {lede && <p className="ss-lede">{lede}</p>}
          {nutGraf && (
            <>
              <div className="ss-nutgraf-label">Nut graf</div>
              <p className="ss-nutgraf">{nutGraf}</p>
            </>
          )}
        </div>
      )}

      {paragraphs.length > 0 && (
        <div className="ss-body">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="ss-para m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              {p}
            </p>
          ))}
        </div>
      )}

      {bg.length > 0 && (
        <div className="ss-bg">
          <button
            className="ss-bg-toggle"
            onClick={() => setShowBg((v) => !v)}
            aria-expanded={showBg}
          >
            <Icon.chevR className={`ss-bg-toggle-ic${showBg ? ' open' : ''}`} />
            {showBg ? 'Hide background' : `Background (${bg.length})`}
          </button>
          {showBg && (
            <div className="ss-bg-body">
              {bg.map((p, i) => (
                <p key={i} className="ss-bg-para">
                  {p}
                </p>
              ))}
            </div>
          )}
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
