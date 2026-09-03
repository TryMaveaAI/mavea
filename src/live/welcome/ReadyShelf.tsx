// ReadyShelf.tsx — the one thing on the welcome hub that isn't waiting for you to have a question.
//
// Everything else in Mavéa starts with the user arriving with something to ask, which is a weak
// reason to come back: curiosity is bursty, not habitual. This is the counterweight — a quiet shelf
// of work already begun, so there's a reason to open the app with nothing particular in mind.
//
// Three rules keep it a shelf and not a chore list:
//   · It PULLS, never pushes. It sits here when you look; it never interrupts, never notifies.
//   · It renders NOTHING when there's nothing real — no empty state, no "you're all caught up!".
//   · It reports only what actually exists on this device. No deltas, no "since you left", no
//     streaks — this app can't measure what happened while it was closed, so it doesn't pretend to.
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useStudyPrompt } from '../srs/useStudy';
import { getCourses, getProgress } from '../course/store';
import { Icon } from '../../icons/icons';
import './ready-shelf.css';

/** Above this, a raw count reads as a debt rather than an invitation. */
const COUNT_CAP = 99;

interface ShelfItem {
  key: string;
  icon: ReactElement;
  title: string;
  sub: string;
  action: string;
  onPick: () => void;
}

function capped(n: number): string {
  return n > COUNT_CAP ? `${COUNT_CAP}+` : String(n);
}

/** The course you're partway through, if there is exactly one worth resuming. */
function courseInProgress(): { title: string; sub: string } | null {
  for (const course of getCourses()) {
    const progress = getProgress(course.id);
    const total = course.lessons.length;
    if (!total) continue;
    const done = course.lessons.filter((l) => progress.lessons[l.id]?.status === 'done').length;
    if (done >= total) continue;
    if (done === 0 && progress.current === 0) continue;
    return {
      title: course.title,
      sub: `Lesson ${Math.min(progress.current + 1, total)} of ${total}`,
    };
  }
  return null;
}

export function ReadyShelf({ onStudy }: { onStudy: () => void }): ReactElement | null {
  const cards = useStudyPrompt();
  const items = useMemo<ShelfItem[]>(() => {
    const out: ShelfItem[] = [];
    if (cards) {
      out.push({
        key: 'cards',
        icon: <Icon.layers />,
        title: `${capped(cards.count)} card${cards.count === 1 ? '' : 's'}`,
        sub: cards.label,
        action: 'Review',
        onPick: onStudy,
      });
    }
    const course = courseInProgress();
    if (course) {
      out.push({
        key: 'course',
        icon: <Icon.play />,
        title: course.title,
        sub: course.sub,
        action: 'Continue',
        onPick: () => {
          window.location.hash = '#/courses';
        },
      });
    }
    return out;
  }, [onStudy, cards]);

  if (!items.length) return null;

  return (
    <section className="ready-shelf go-study">
      <span className="card-eyebrow">Ready when you are</span>
      <ul className="ready-list">
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" className="ready-item" onClick={item.onPick}>
              <span className="ready-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="ready-copy">
                <span className="ready-title">{item.title}</span>
                <span className="ready-sub">{item.sub}</span>
              </span>
              <span className="ready-go">{item.action}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
