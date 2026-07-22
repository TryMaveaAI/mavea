import { type CSSProperties, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { ReadingListProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ReadingListProps & { delay?: number };

// Cycled per row when a title has no other way to visually distinguish itself on a shelf —
// the same "cycle a small token palette" approach as tierlist's DEFAULT_TIER_COLORS, not a
// hash-derived hue (which would need a color outside the design system).
const COVER_GRADIENTS = [
  'linear-gradient(160deg, var(--presence), var(--presence-deep))',
  'linear-gradient(160deg, var(--insight), var(--presence-deep))',
  'linear-gradient(160deg, var(--warning), var(--presence-deep))',
  'linear-gradient(160deg, var(--presence-soft), var(--insight))',
  'linear-gradient(160deg, var(--insight-soft), var(--presence))',
];

const STATUS_LABEL: Record<string, string> = {
  reading: 'Reading',
  queued: 'Queued',
  done: 'Done',
};

function statusColor(status: string): string {
  if (status === 'reading') return 'var(--presence)';
  if (status === 'done') return 'var(--insight)';
  return 'var(--text-muted)';
}

// A book-club / personal reading tracker: a cover swatch and status pill per book, an
// optional star rating, and a per-book expandable section for book-club discussion questions.
export function ReadingList({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  books,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const safeBooks = Array.isArray(books) ? books : [];
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <ul className="rl-books">
        {safeBooks.map((book, i) => {
          const status = book?.status && STATUS_LABEL[book.status] ? book.status : 'queued';
          const rating = Number.isFinite(book?.rating)
            ? Math.min(5, Math.max(0, book?.rating as number))
            : undefined;
          const questions = Array.isArray(book?.discussionQuestions)
            ? (book?.discussionQuestions ?? []).filter(
                (q): q is string => typeof q === 'string' && !!q,
              )
            : [];
          const isOpen = expanded.has(i);
          return (
            <li
              key={i}
              className="rl-book m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span
                className="rl-cover"
                aria-hidden="true"
                style={{ background: COVER_GRADIENTS[i % COVER_GRADIENTS.length] }}
              />
              <div className="rl-book-body">
                <div className="rl-book-head">
                  <span className="rl-book-title">{book?.title}</span>
                  <span className="rl-status-pill" style={{ color: statusColor(status) }}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="rl-book-meta">
                  <span className="rl-author">{book?.author}</span>
                  {rating !== undefined && (
                    <span className="rl-stars" aria-hidden="true">
                      <span className="rl-stars-fill" style={{ width: (rating / 5) * 100 + '%' }}>
                        {'★★★★★'}
                      </span>
                      <span className="rl-stars-track">{'★★★★★'}</span>
                    </span>
                  )}
                </div>
                {questions.length > 0 && (
                  <div className="rl-questions-section">
                    <button className="rl-questions-toggle" onClick={() => toggle(i)}>
                      <Icon.chat className="ic" style={{ width: 12, height: 12 }} />
                      {isOpen
                        ? 'Hide discussion questions'
                        : `${questions.length} discussion question${questions.length > 1 ? 's' : ''}`}
                    </button>
                    {isOpen && (
                      <ol className="rl-questions-list">
                        {questions.map((q, qi) => (
                          <li key={qi} className="rl-question">
                            {q}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
