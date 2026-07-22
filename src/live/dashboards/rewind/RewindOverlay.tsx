// RewindOverlay — Weekly Rewind: a full-screen, Wrapped-style recap of the check ledger's last 7
// days. Every slide is a direct derivation of ledger.ts's weeklyRewind() plus predictions.ts's
// weeklyTally() applied per-dashboard — zero extra model calls, and a slide with nothing honest to
// show simply never renders (see buildRewindSlides). The caller owns mounting/unmounting and the
// route; this only knows how to present whatever the ledger actually holds.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { useFocusTrap } from '../../useFocusTrap';
import { useCountUp } from '../../../canvas/lib/motion';
import { useLedger } from '../useLedger';
import { useDashboards } from '../useDashboards';
import { weeklyRewind, type WeeklyRewind } from '../ledger';
import { chipForEntry, formatLogTime, type LogChipTone } from '../checkLogModel';
import type { PredictionGrade } from '../types';
import {
  buildRewindSlides,
  collectWeekGrades,
  pickBestCallQuote,
  resolveViewSlides,
  sumWeeklyTally,
  type CallQuote,
  type GradedCall,
  type WeekTally,
} from './rewindModel';
import './rewind.css';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekdayInitial(dateISO: string): string {
  // byDay's dates are UTC-sliced ISO days (see weeklyRewind) — read the weekday back off the
  // same UTC basis so a label never drifts a day from the bar it sits under.
  return WEEKDAY_INITIALS[new Date(`${dateISO}T00:00:00Z`).getUTCDay()];
}

function formatFullDate(at: number): string {
  return new Date(at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function delayStyle(ms: number): CSSProperties {
  return { ['--d' as string]: `${ms}ms` } as CSSProperties;
}

function SearchesSlide({ rewind }: { rewind: WeeklyRewind }): ReactElement {
  const count = useCountUp(rewind.totalSearches, { duration: 1400 });
  const max = Math.max(1, ...rewind.byDay.map((d) => d.searches));
  return (
    <>
      <p className="rw-eyebrow rw-child" style={delayStyle(20)}>
        This week
      </p>
      <p className="rw-figure rw-child" style={delayStyle(90)}>
        {count}
      </p>
      <p className="rw-figure-label rw-child" style={delayStyle(170)}>
        search{rewind.totalSearches === 1 ? '' : 'es'}, all week
      </p>
      <div className="rw-bars rw-child" style={delayStyle(260)}>
        {rewind.byDay.map((day) => (
          <div
            className="rw-bar"
            key={day.date}
            title={`${day.searches} search${day.searches === 1 ? '' : 'es'}`}
          >
            <div className="rw-bar-track">
              <div className="rw-bar-fill" style={{ height: `${(day.searches / max) * 100}%` }} />
            </div>
            <span className="rw-bar-day">{weekdayInitial(day.date)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function MomentSlide({ rewind }: { rewind: WeeklyRewind }): ReactElement | null {
  const moment = rewind.topMoment;
  if (!moment) return null;
  const chip = chipForEntry(moment);
  const tone: LogChipTone = chip?.tone ?? 'plain';
  return (
    <>
      <p className="rw-eyebrow rw-child" style={delayStyle(20)}>
        The moment that mattered
      </p>
      <div className="rw-moment rw-child" data-tone={tone} style={delayStyle(110)}>
        <p className="rw-moment-text">{moment.text}</p>
        <div className="rw-moment-meta">
          {chip && <span className="rw-moment-chip">{chip.label}</span>}
          <span className="rw-moment-time">
            {formatFullDate(moment.at)} · {formatLogTime(moment.at)}
          </span>
        </div>
      </div>
    </>
  );
}

const CHIP_GLYPH: Record<PredictionGrade['result'], string> = { hit: '✓', miss: '✗', unclear: '—' };

function CallsSlide({
  tally,
  grades,
  quote,
}: {
  tally: WeekTally;
  grades: GradedCall[];
  quote: CallQuote | null;
}): ReactElement {
  const hits = useCountUp(tally.hits, { duration: 1200 });
  const total = useCountUp(tally.total, { duration: 1200 });
  return (
    <>
      <p className="rw-eyebrow rw-child" style={delayStyle(20)}>
        Call record
      </p>
      <p className="rw-figure rw-child" style={delayStyle(90)}>
        {hits}/{total}
      </p>
      <p className="rw-figure-label rw-child" style={delayStyle(170)}>
        calls graded this week
      </p>
      <div className="rw-chips rw-child" style={delayStyle(250)} role="list">
        {grades.map(({ grade }, i) => (
          <span
            key={`${grade.at}-${i}`}
            className={`rw-chip rw-chip--${grade.result}`}
            role="listitem"
            title={grade.expected}
          >
            {CHIP_GLYPH[grade.result]}
          </span>
        ))}
      </div>
      {quote && (
        <p className="rw-quote rw-child" style={delayStyle(330)}>
          &ldquo;{quote.expected}
          {quote.note ? ` — ${quote.note}` : ''}&rdquo;
          <span className="rw-quote-attr">{quote.dashboardTitle}</span>
        </p>
      )}
    </>
  );
}

function SavedSlide({ rewind }: { rewind: WeeklyRewind }): ReactElement {
  const count = useCountUp(rewind.estSavedPerMonth, { duration: 1400 });
  return (
    <>
      <p className="rw-eyebrow rw-child" style={delayStyle(20)}>
        If you keep this up
      </p>
      <p className="rw-figure rw-child" style={delayStyle(90)}>
        {count}
      </p>
      <p className="rw-figure-label rw-child" style={delayStyle(170)}>
        searches saved / month
      </p>
      <p className="rw-caption rw-child" style={delayStyle(250)}>
        Applying Mavéa's suggestions this week is projected to save about {rewind.estSavedPerMonth}{' '}
        searches a month — a rate estimate from real cadence changes, not a count of searches
        actually skipped this week.
      </p>
    </>
  );
}

function FallbackSlide(): ReactElement {
  return (
    <p className="rw-fallback-text rw-child" style={delayStyle(40)}>
      Nothing to look back on yet — come back after a week of checks.
    </p>
  );
}

export interface RewindOverlayProps {
  onClose: () => void;
}

export function RewindOverlay({ onClose }: RewindOverlayProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  // Frozen at mount rather than re-read live: a recap is a snapshot of the week as it stood when
  // you opened it — the slide set/count must not shift under you mid-browse just because a
  // background refresh appended a ledger entry while this was open.
  const [now] = useState(() => Date.now());
  const ledger = useLedger();
  const dashboards = useDashboards();

  const rewind = useMemo(() => weeklyRewind(ledger, now), [ledger, now]);
  const tally = useMemo(() => sumWeeklyTally(dashboards, now), [dashboards, now]);
  const grades = useMemo(() => collectWeekGrades(dashboards, now), [dashboards, now]);
  const quote = useMemo(() => pickBestCallQuote(dashboards, now), [dashboards, now]);
  const realSlides = useMemo(() => buildRewindSlides(rewind, tally), [rewind, tally]);
  const slides = useMemo(() => resolveViewSlides(realSlides), [realSlides]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex((i) => Math.min(i, slides.length - 1));
  }, [slides.length]);

  const goPrev = (): void => setIndex((i) => Math.max(0, i - 1));
  const goNext = (): void => setIndex((i) => Math.min(slides.length - 1, i + 1));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    }
  };

  const canNavigate = slides.length > 1;

  return (
    // A story-viewer's arrow/space keys are standard dialog behavior, not a bolted-on control —
    // kept on this same node (rather than a separate interactive wrapper) so it shares focus with
    // useFocusTrap's own Tab/Escape listener instead of splitting keyboard handling across two
    // elements.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="rw-overlay"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Weekly Rewind"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="rw-chrome">
        {canNavigate && (
          <span className="rw-counter" aria-live="polite">
            {index + 1} of {slides.length}
          </span>
        )}
        <button type="button" className="rw-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="rw-stage">
        {canNavigate && (
          <button
            type="button"
            className="rw-zone rw-zone--prev"
            aria-label="Previous slide"
            onClick={goPrev}
            disabled={index === 0}
          />
        )}
        {slides.map((id, i) => (
          <div className="rw-slide" key={id} data-active={i === index || undefined}>
            {id === 'searches' && <SearchesSlide rewind={rewind} />}
            {id === 'moment' && <MomentSlide rewind={rewind} />}
            {id === 'calls' && <CallsSlide tally={tally} grades={grades} quote={quote} />}
            {id === 'saved' && <SavedSlide rewind={rewind} />}
            {id === 'fallback' && <FallbackSlide />}
          </div>
        ))}
        {canNavigate && (
          <button
            type="button"
            className="rw-zone rw-zone--next"
            aria-label="Next slide"
            onClick={goNext}
            disabled={index === slides.length - 1}
          />
        )}
      </div>

      {canNavigate && (
        <div className="rw-dots">
          {slides.map((id, i) => (
            <button
              key={id}
              type="button"
              className="rw-dot"
              data-active={i === index || undefined}
              aria-label={`Go to slide ${i + 1} of ${slides.length}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
