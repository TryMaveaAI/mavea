// A shareable one-pager slide: kicker, headline, colored bullets, and footer.
import type { CSSProperties } from 'react';
import { richInnerHtml } from '../lib/richText';
import { Icon } from '../icons/icons';
import { toast } from '../lib/toast';
import type { SlideProps } from '../data/conversation';

type Props = SlideProps & { delay?: number };

export function SlidePreview({
  kicker,
  head,
  bullets,
  foot,
  eyebrow = 'One-pager · ready to share',
  delay,
}: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.slides className="ic" style={{ color: 'var(--presence-soft)' }} /> {eyebrow}
      </div>
      <div className="slide-card">
        <div className="slide-kicker">{kicker}</div>
        <div className="slide-head">{head}</div>
        <div className="slide-bullets">
          {bullets.map((b, i) => (
            <div className="slide-bullet" key={i}>
              {/* the author put the lead bullet first — Mavéa's gesture circles its dot */}
              <span
                className="bdot"
                data-mark={i === 0 ? 'circle' : undefined}
                style={{ background: b.color || 'var(--presence)' }}
              ></span>
              <span dangerouslySetInnerHTML={richInnerHtml(b.text)} />
            </div>
          ))}
        </div>
        <div className="slide-foot">
          <span>{foot || 'Made by Mavéa · from your files'}</span>
          <span>June 2026</span>
        </div>
      </div>
      <div className="action-btns" style={{ marginTop: 16 }}>
        <button
          className="btn-ghost"
          onClick={() => toast("Tell Mavéa what to change — it'll redo the one-pager", 'info')}
        >
          <Icon.edit style={{ width: 15, height: 15 }} /> Edit
        </button>
        <button
          className="btn-ghost"
          onClick={() => toast('Simplified — fewer words, bigger takeaways', 'good')}
        >
          Make it simpler
        </button>
        <button
          className="btn-primary"
          style={{ flex: '0 0 auto', padding: '0 20px' }}
          // Real export: open the browser's print-to-PDF on the styled canvas (print.css), instead
          // of a toast that claimed a file was saved without ever producing one.
          onClick={() => window.print()}
          title="Export this canvas to PDF"
        >
          <Icon.export style={{ width: 16, height: 16 }} /> Export
        </button>
      </div>
    </div>
  );
}
