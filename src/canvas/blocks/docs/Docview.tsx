import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DocViewProps, DocBlock } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DocViewProps & { delay?: number };

// A PDF/page-style document viewer — the "you uploaded a file, here's what's in it" surface.
// Renders a paper with structured content, and supports IN-DOCUMENT SPOTLIGHT: when a block is
// marked `spot`, the rest of the page dims and that passage is highlighted with a margin note,
// so Mavéa can point you at exactly the line that matters inside a long document.
export function Docview({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  source,
  page,
  blocks,
  note,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const hasSpot = blocks.some((b) => b.spot);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className={'doc-view' + (hasSpot ? ' has-spot' : '')}>
        <div className="doc-view-bar">
          <span className="doc-view-file">
            <Icon.doc className="doc-view-fileic" /> {source ?? 'Document'}
          </span>
          {page && (
            <span className="doc-view-page">
              p. {page.n} / {page.of}
            </span>
          )}
        </div>

        <div className="doc-view-page-surface">
          {blocks.map((b, i) => (
            <DocLine key={i} b={b} spotlit={hasSpot && !!b.spot} dimmed={hasSpot && !b.spot} />
          ))}

          {hasSpot && note && (
            <div className="doc-view-note">
              <span className="doc-view-note-pin" />
              <span dangerouslySetInnerHTML={richInnerHtml(note)} />
            </div>
          )}
        </div>
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

function DocLine({ b, spotlit, dimmed }: { b: DocBlock; spotlit: boolean; dimmed: boolean }) {
  const cls = `doc-view-${b.kind}` + (spotlit ? ' spotlit' : '') + (dimmed ? ' dimmed' : '');
  // spotlit block is the called-out passage Mavéa points at inside the document
  return (
    <div
      className={cls}
      dangerouslySetInnerHTML={richInnerHtml(b.text)}
      {...(spotlit ? { 'data-mark': 'underline' } : {})}
    />
  );
}
