import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PodcastPlannerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PodcastPlannerProps & { delay?: number };

// An episode-planning card: a guest header atop an agenda-style topic list, each topic tagged
// with its chapter timecode chip when `chapters` covers that position. Chapters are matched to
// topics by index — a real, given timecode is never guessed onto a topic that has none.
export function PodcastPlanner({
  title,
  icon = 'mic',
  iconColor = 'var(--presence)',
  guest,
  topics,
  chapters,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.mic;
  const safeTopics = Array.isArray(topics) ? topics : [];
  const safeChapters = Array.isArray(chapters) ? chapters : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {guest && (
        <div className="pp-guest">
          <Icon.chat className="ic" style={{ width: 13, height: 13 }} />
          <span className="pp-guest-label">Guest</span>
          <span className="pp-guest-name">{guest}</span>
        </div>
      )}

      {safeTopics.length > 0 && (
        <ol className="pp-topics">
          {safeTopics.map((topic, i) => {
            const chapter = safeChapters[i];
            return (
              <li key={i} className="pp-topic">
                <span className="pp-topic-num">{i + 1}</span>
                <span className="pp-topic-text">{topic}</span>
                {chapter?.timecode && <span className="pp-timecode">{chapter.timecode}</span>}
              </li>
            );
          })}
        </ol>
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
