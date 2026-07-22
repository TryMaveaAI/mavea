import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { safeHttpUrl } from '../../../lib/sourceHost';
import type { PdfreaderProps, DocBlock } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PdfreaderProps & { delay?: number };

/** A PDF may execute active content in its browsing context, so model output never goes straight
 *  into an iframe. Only ordinary http(s) URLs on this app's own origin may be framed. External
 *  http(s) documents stay useful as explicit links; javascript:/data:/blob:/file: are rejected. */
function sameOriginFrameUrl(raw: string | undefined): string | null {
  if (!raw || typeof window === 'undefined') return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Do not turn this into a general same-origin iframe primitive. Only a real PDF asset or the
    // audited PDF forwarder is eligible; app routes/HTML remain impossible to frame here.
    if (!url.pathname.toLowerCase().endsWith('.pdf') && url.pathname !== '/pdf') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

// A plain scrollable PDF reader: stacked paper sheets in a scroll area you page through, with
// a page counter that tracks where you are. Where `docview` says "look at THIS passage"
// (spotlight), this just lets you read the whole document. Reuses the docview line styles so
// the typography matches across both. Page tracking is offsetTop-based — cheap, no observers.
export function Pdfreader({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  source,
  file,
  embedSrc,
  pages = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frameUrl = sameOriginFrameUrl(embedSrc) ?? sameOriginFrameUrl(file);
  const externalUrl = frameUrl ? null : safeHttpUrl(file ?? '');

  const onScroll = () => {
    const c = scrollRef.current;
    if (!c) return;
    const top = c.scrollTop + 48; // bias toward the sheet occupying the upper area
    let cur = 1;
    for (let i = 0; i < sheetRefs.current.length; i++) {
      const el = sheetRefs.current[i];
      if (el && el.offsetTop <= top) cur = i + 1;
    }
    if (cur !== page) setPage(cur);
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="doc-view">
        <div className="doc-view-bar">
          <span className="doc-view-file">
            <Icon.doc className="doc-view-fileic" /> {source ?? 'Document'}
          </span>
          <span className="doc-view-page">{file ? 'PDF' : `p. ${page} / ${pages.length}`}</span>
        </div>
        {frameUrl ? (
          // <object type="application/pdf"> is blocked by CSP object-src:'none'. The iframe is
          // same-origin by construction, matching frame-src/default-src 'self'.
          <iframe
            className="pr-embed"
            src={frameUrl}
            title={source || title}
            sandbox=""
            referrerPolicy="no-referrer"
          />
        ) : file ? (
          <div className="pr-file-fallback">
            {externalUrl ? (
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                Open the PDF in a new tab ↗
              </a>
            ) : (
              <span>This PDF link could not be verified.</span>
            )}
          </div>
        ) : (
          <div className="pr-scroll" ref={scrollRef} onScroll={onScroll}>
            {pages.map((pg, i) => (
              <div
                key={i}
                className="pr-sheet"
                ref={(el) => {
                  sheetRefs.current[i] = el;
                }}
              >
                <span className="pr-sheet-no">{i + 1}</span>
                {pg.blocks.map((b, j) => (
                  <PrLine key={j} b={b} />
                ))}
              </div>
            ))}
          </div>
        )}
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

function PrLine({ b }: { b: DocBlock }) {
  return <div className={`doc-view-${b.kind}`} dangerouslySetInnerHTML={richInnerHtml(b.text)} />;
}
