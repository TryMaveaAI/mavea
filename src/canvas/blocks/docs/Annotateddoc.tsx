import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AnnotateddocProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AnnotateddocProps & { delay?: number };

/** One stretch of a paragraph: either plain text, or the text of a highlight phrase (`h` is
 *  the index of the highlight it matched). Which one is currently selected is deliberately not
 *  part of this — it's a paint on top of the runs, so selecting a note never re-splits the text. */
interface Run {
  key: string;
  text: string;
  h?: number;
}

export function Annotateddoc({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  docName,
  paragraphs,
  highlights,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  // default active = first highlight (looks intentional in the revealed state)
  const [active, setActive] = useState<number>(0);

  // Split each paragraph into runs, wrapping the first match of each highlight phrase. This is
  // a scan of every phrase over every paragraph, so it keys off the text alone — nothing here
  // changes when a different note is selected.
  const paraRuns = useMemo(() => {
    return paragraphs.map((para, pi) => {
      // collect [start,end,hlIndex] spans for phrases present in this paragraph
      const spans: { s: number; e: number; h: number }[] = [];
      highlights.forEach((h, hi) => {
        const idx = para.indexOf(h.phrase);
        if (idx >= 0) spans.push({ s: idx, e: idx + h.phrase.length, h: hi });
      });
      spans.sort((a, b) => a.s - b.s);
      const out: Run[] = [];
      let cur = 0;
      spans.forEach((sp, k) => {
        if (sp.s < cur) return; // overlap guard
        if (sp.s > cur) out.push({ key: `t${pi}-${k}`, text: para.slice(cur, sp.s) });
        out.push({ key: `h${pi}-${k}`, text: para.slice(sp.s, sp.e), h: sp.h });
        cur = sp.e;
      });
      if (cur < para.length) out.push({ key: `t${pi}-end`, text: para.slice(cur) });
      return out;
    });
  }, [paragraphs, highlights]);

  const note = highlights[active];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ad-body">
        <div className="ad-doc">
          {docName && <div className="ad-docname mono faint">{docName}</div>}
          {paraRuns.map((runs, pi) => (
            <p key={pi} className="ad-para">
              {runs.map((run) => {
                if (run.h === undefined) return <span key={run.key}>{run.text}</span>;
                const hi = run.h;
                const on = active === hi;
                return (
                  // A <span> (not <mark>) so it can carry the click-to-select role — <mark> has
                  // an implicit non-interactive role that a11y lint rightly rejects pairing with
                  // role="button"; the highlight look comes entirely from .ad-mark, not the tag.
                  <span
                    key={run.key}
                    className={`ad-mark ${on ? 'on' : ''}`}
                    style={
                      {
                        ['--hl' as string]: highlights[hi].color || 'var(--presence)',
                      } as CSSProperties
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`Show note ${hi + 1}`}
                    onMouseEnter={() => setActive(hi)}
                    onClick={() => setActive(hi)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActive(hi);
                      }
                    }}
                    // the active highlight phrase is the called-out span Mavéa points at
                    data-mark={on ? 'underline' : undefined}
                  >
                    {run.text}
                    <sup className="ad-mark-num tab-num">{hi + 1}</sup>
                  </span>
                );
              })}
            </p>
          ))}
        </div>
        <div className="ad-margin">
          {note && (
            <div
              key={active}
              className="ad-note"
              style={{ ['--hl' as string]: note.color || 'var(--presence)' } as CSSProperties}
            >
              <div className="ad-note-head">
                <span className="ad-note-num tab-num">{active + 1}</span>
                {note.author && <span className="ad-note-author">{note.author}</span>}
              </div>
              <div className="ad-note-body" dangerouslySetInnerHTML={richInnerHtml(note.note)} />
            </div>
          )}
          <div className="ad-dots">
            {highlights.map((h, i) => (
              <button
                key={i}
                className={`ad-dot ${active === i ? 'on' : ''}`}
                style={{ ['--hl' as string]: h.color || 'var(--presence)' } as CSSProperties}
                onClick={() => setActive(i)}
                aria-label={`Note ${i + 1}`}
              />
            ))}
          </div>
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
