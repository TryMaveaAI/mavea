import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { HighlightsnippetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HighlightsnippetProps & { delay?: number };

export function Highlightsnippet({
  title,
  icon = 'quote',
  iconColor = 'var(--presence)',
  quote,
  phrase,
  source,
  locator,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.quote;
  // toggle whether the key phrase is emphasized; default ON (the point of the block)
  const [lit, setLit] = useState<boolean>(true);

  const idx = phrase ? quote.indexOf(phrase) : -1;
  let body: ReactNode;
  if (idx >= 0) {
    body = (
      <>
        {quote.slice(0, idx)}
        <mark
          className={`hs-mark ${lit ? 'on' : ''}`}
          style={{ ['--hl' as string]: color } as CSSProperties}
        >
          {quote.slice(idx, idx + phrase.length)}
        </mark>
        {quote.slice(idx + phrase.length)}
      </>
    );
  } else {
    body = quote;
  }

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <figure className="hs-fig" style={{ ['--hl' as string]: color } as CSSProperties}>
        <span className="hs-quote-glyph">&ldquo;</span>
        <blockquote className="hs-quote">{body}</blockquote>
      </figure>

      <div className="hs-foot">
        {source && (
          <span className="hs-chip mono">
            <Icon.globe className="hs-chip-ic" /> {source}
            {locator && <span className="hs-loc faint"> · {locator}</span>}
          </span>
        )}
        <button
          className={`hs-toggle ${lit ? 'on' : ''}`}
          onClick={() => setLit((l) => !l)}
          style={{ ['--hl' as string]: color } as CSSProperties}
        >
          {lit ? <Icon.eye className="hs-toggle-ic" /> : <Icon.eyeOff className="hs-toggle-ic" />}
          {lit ? 'Highlighted' : 'Plain'}
        </button>
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
