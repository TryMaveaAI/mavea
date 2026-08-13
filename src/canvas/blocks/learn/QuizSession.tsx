import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import { reportQuizResult } from './quizResult';
import type { QuizOption, QuizSessionProps, QuizSessionQuestion } from './types';

type Props = QuizSessionProps & { delay?: number };

/** Missed questions listed in full on the wrap-up before the rest collapse into a count — a
 *  40-question run can miss 30 and the review list still has to fit a card. */
const MAX_MISSED_SHOWN = 6;

/** One question the run can actually grade, read defensively out of whatever the model sent. */
interface RunQuestion {
  prompt: string;
  tag: string | null;
  options: QuizOption[];
  /** Index of the first option marked correct. Never negative — a question without one is
   *  dropped before it gets here. */
  answerIdx: number;
  explanation: string | null;
}

/** State of the round in progress. A retry re-queues ONLY what was missed, but the wrap-up is
 *  still scored against the whole deck (see `deckTally`) — a learner who fixes 3 of the 4 they
 *  missed is at 19/20, not 3/4. */
interface RunState {
  /** Indices into the normalized deck, in ask order, for this round. */
  queue: number[];
  /** Cursor into `queue`; equal to its length once the round is finished. */
  pos: number;
  /** The learner's pick per deck index — null until they commit to one. */
  picks: (number | null)[];
  /** 1-based; greater than 1 means this round is a retry of the previous one's misses. */
  round: number;
}

/** Options may be any length in real data, so past Z fall back to a number rather than
 *  wrapping into punctuation. */
function optionLabel(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

function normalizeOptions(raw: unknown): QuizOption[] {
  if (!Array.isArray(raw)) return [];
  const out: QuizOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Partial<QuizOption>;
    if (typeof o.text !== 'string' || !o.text.trim()) continue;
    const opt: QuizOption = { text: o.text, correct: o.correct === true };
    if (typeof o.feedback === 'string' && o.feedback.trim()) opt.feedback = o.feedback;
    out.push(opt);
  }
  return out;
}

/** The deck, filtered down to what a graded run can honestly ask. */
function normalizeQuestions(raw: unknown): RunQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: RunQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Partial<QuizSessionQuestion>;
    const prompt = typeof q.question === 'string' ? q.question.trim() : '';
    const options = normalizeOptions(q.options);
    const answerIdx = options.findIndex((o) => o.correct);
    // No prompt, fewer than two real choices, or nothing marked correct → the component can't
    // grade it, so it never joins the run. Dropping beats scoring an unanswerable question.
    if (!prompt || options.length < 2 || answerIdx < 0) continue;
    out.push({
      prompt,
      tag: typeof q.tag === 'string' && q.tag.trim() ? q.tag.trim() : null,
      options,
      answerIdx,
      explanation: typeof q.explanation === 'string' && q.explanation.trim() ? q.explanation : null,
    });
  }
  return out;
}

/** Content fingerprint of a normalized deck. The reset below CANNOT key on array identity: a
 *  caller that rebuilds `questions` on every render (a fixture mapper, the export/paginate measure
 *  pass) would make an identity check permanently true and set state every render. Recomputed only
 *  when the `questions` reference changes, alongside the deck itself. */
function deckSignature(deck: readonly RunQuestion[]): string {
  return JSON.stringify(deck.map((q) => [q.prompt, q.answerIdx, q.options.length]));
}

function firstRound(count: number): RunState {
  return {
    queue: Array.from({ length: count }, (_, i) => i),
    pos: 0,
    picks: Array.from({ length: count }, () => null),
    round: 1,
  };
}

// A graded run of questions, held entirely in local state. One question on screen at a time; the
// explanation stays hidden until the learner has committed to an answer, an answered question
// locks (navigating back reviews it, it never re-scores), and the wrap-up can re-queue just the
// misses for a second round — though the score is always out of the WHOLE deck, so a retry can
// only ever move it up. Every number shown — answered, correct, percent — is counted from the
// learner's own picks against the model's own answer key; nothing is invented.
export function QuizSession({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  subject,
  questions,
  passMark,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  const { deck, deckKey } = useMemo(() => {
    const list = normalizeQuestions(questions);
    return { deck: list, deckKey: deckSignature(list) };
  }, [questions]);

  const [run, setRun] = useState<RunState>(() => firstRound(deck.length));
  const [runKey, setRunKey] = useState(deckKey);
  // React's own "reset state when the prop it derives from changes" pattern: a new question list
  // (a fresh turn, or the gallery swapping fixtures under an already-mounted card) starts a clean
  // run instead of leaving the cursor pointing into a deck that no longer exists. Keyed on the
  // deck's CONTENT, never its array identity — a caller that rebuilds `questions` each render
  // would otherwise setState forever. `active` is used for the rest of THIS render so it never
  // reads the stale round.
  let active = run;
  if (runKey !== deckKey) {
    active = firstRound(deck.length);
    setRunKey(deckKey);
    setRun(active);
  }

  const { queue, pos, picks, round } = active;
  const total = queue.length;
  const done = pos >= total;
  const current = done ? null : (deck[queue[pos]] ?? null);
  const picked = done ? null : picks[queue[pos]];
  const pickedOption = current !== null && picked !== null ? current.options[picked] : undefined;
  const answered = pickedOption !== undefined;
  const gotIt = pickedOption?.correct === true;

  /** This round only — the questions actually in front of the learner. Drives the rail and its
   *  label while the round is running. */
  const roundTally = useMemo(() => {
    let correct = 0;
    let answeredCount = 0;
    for (const id of queue) {
      const p = picks[id];
      if (p === null || p === undefined) continue;
      answeredCount += 1;
      if (deck[id]?.options[p]?.correct) correct += 1;
    }
    return { correct, answeredCount };
  }, [queue, picks, deck]);

  /** The WHOLE deck, however many rounds it took — what the wrap-up scores. Scoring the retry
   *  round on its own told a learner who went 16/20 and then fixed 3 of the 4 misses that they
   *  had dropped to 75%; they are at 19/20. Anything not answered correctly (wrong, or never
   *  answered at all) is still open, so it's both a miss and what a retry re-queues. */
  const deckTally = useMemo(() => {
    const missed: number[] = [];
    let correct = 0;
    deck.forEach((q, id) => {
      const p = picks[id];
      if (p !== null && p !== undefined && q.options[p]?.correct) correct += 1;
      else missed.push(id);
    });
    return { correct, missed };
  }, [deck, picks]);

  const percent = deck.length > 0 ? Math.round((deckTally.correct / deck.length) * 100) : 0;
  const threshold =
    typeof passMark === 'number' && Number.isFinite(passMark)
      ? Math.round(Math.min(100, Math.max(0, passMark)))
      : null;
  const passed = threshold === null ? null : percent >= threshold;

  const choose = (optIdx: number) => {
    if (current === null || answered) return;
    setRun((s) => {
      const id = s.queue[s.pos];
      if (id === undefined || s.picks[id] !== null) return s; // a graded pick is final
      const next = s.picks.slice();
      next[id] = optIdx;
      return { ...s, picks: next };
    });
    reportQuizResult(current.prompt, current.options[optIdx]?.correct === true);
  };

  const step = (d: number) =>
    setRun((s) => ({ ...s, pos: Math.max(0, Math.min(s.queue.length, s.pos + d)) }));

  const retryMissed = () => {
    const again = deckTally.missed;
    if (again.length === 0) return;
    setRun((s) => {
      const next = s.picks.slice();
      for (const id of again) next[id] = null; // only the re-queued ones open back up
      return { queue: again, pos: 0, picks: next, round: s.round + 1 };
    });
  };

  const restart = () => setRun(firstRound(deck.length));

  const outcome = (id: number): 'ok' | 'no' | 'todo' => {
    const p = picks[id];
    if (p === null || p === undefined) return 'todo';
    return deck[id]?.options[p]?.correct ? 'ok' : 'no';
  };

  // While a round runs the rail is that round's questions; the wrap-up widens it to the whole
  // deck, so the ticks and the score always count the same set of questions.
  const deckIds = useMemo(() => Array.from({ length: deck.length }, (_, i) => i), [deck.length]);
  const railIds = done ? deckIds : queue;

  // The rail is one labelled graphic rather than N focusable ticks — a 40-question run would
  // otherwise bury the Back/Next controls under 40 tab stops for no gain.
  const railLabel = done
    ? `Finished: ${deckTally.correct} of ${deck.length} correct`
    : `Question ${pos + 1} of ${total} — ${roundTally.answeredCount} answered, ${roundTally.correct} correct`;
  const announcement = done
    ? `Session complete. ${deckTally.correct} of ${deck.length} correct, ${percent} percent.`
    : answered
      ? `${gotIt ? 'Correct' : 'Not quite'}. Question ${pos + 1} of ${total}.`
      : '';
  const nextLabel = pos >= total - 1 ? 'See score' : answered ? 'Next' : 'Skip';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {subject && <span className="lr-qs-subject">{subject}</span>}
      </div>

      {deck.length === 0 ? (
        <div className="lr-qs-empty">No gradeable questions in this set.</div>
      ) : (
        <>
          <div className="lr-qs-head">
            <div className="lr-qs-rail" role="img" aria-label={railLabel}>
              {railIds.map((id, i) => (
                <span
                  key={id}
                  className={`lr-qs-tick is-${outcome(id)}${!done && i === pos ? ' is-now' : ''}`}
                />
              ))}
            </div>
            <span className="lr-qs-count tab-num">
              {done ? `${deckTally.correct}/${deck.length}` : `${pos + 1}/${total}`}
            </span>
          </div>

          {/* Always mounted so every verdict and the final score are announced, whichever phase
              the run is in. Visually hidden — the same words are on screen already. */}
          <p className="lr-qz-sr" role="status">
            {announcement}
          </p>

          {current !== null && (
            // Keyed on the question so moving through the run replays the entrance instead of
            // swapping text in place.
            <div key={queue[pos]} className="lr-qs-ask m-fade-rise">
              {current.tag && <span className="lr-qs-tag">{current.tag}</span>}
              <div className="lr-qz-q" dangerouslySetInnerHTML={richInnerHtml(current.prompt)} />

              <div className="lr-qz-opts" role="group" aria-label="Answer options">
                {current.options.map((o, i) => {
                  // After answering: mark the correct option and (if wrong) the chosen one.
                  const state = !answered
                    ? ''
                    : o.correct
                      ? ' is-correct'
                      : i === picked
                        ? ' is-wrong'
                        : ' is-dim';
                  return (
                    <button
                      key={i}
                      className={'lr-qz-opt' + state + (i === picked ? ' is-picked' : '')}
                      // Same rule as Quiz: the correct option only becomes the card's salient
                      // datum once the learner has answered, so gesture/spotlight can never ring
                      // the right answer early and give the question away.
                      data-mark={answered && o.correct ? 'circle' : undefined}
                      onClick={() => choose(i)}
                      // aria-disabled, never the `disabled` attribute: disabling the button the
                      // learner just pressed drops focus to <body>, so a keyboard user would have
                      // to tab from the top of the page back to "Next" on EVERY question of the
                      // run. `choose` is the real guard — a graded pick is already final there.
                      aria-disabled={answered}
                    >
                      <span className="lr-qz-mark" aria-hidden="true">
                        {answered && o.correct ? (
                          <Icon.check />
                        ) : answered && i === picked ? (
                          <Icon.x />
                        ) : (
                          <span className="lr-qz-letter">{optionLabel(i)}</span>
                        )}
                      </span>
                      <span
                        className="lr-qz-opttext"
                        dangerouslySetInnerHTML={richInnerHtml(o.text)}
                      />
                      {answered && (o.correct || i === picked) && (
                        <span className="lr-qz-sr">
                          {o.correct ? '— correct answer' : '— your answer, incorrect'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {pickedOption && (
                <div className={'lr-qz-result ' + (gotIt ? 'ok' : 'no')}>
                  <strong>{gotIt ? 'Correct' : 'Not quite'}</strong>
                  {/* per-option feedback first, then the general explanation */}
                  {pickedOption.feedback && (
                    <span dangerouslySetInnerHTML={richInnerHtml(pickedOption.feedback)} />
                  )}
                  {!gotIt && (
                    <span className="lr-qz-reveal">
                      Answer:{' '}
                      <b
                        dangerouslySetInnerHTML={richInnerHtml(
                          current.options[current.answerIdx].text,
                        )}
                      />
                    </span>
                  )}
                  {current.explanation && (
                    <span
                      className="lr-qz-explain"
                      dangerouslySetInnerHTML={richInnerHtml(current.explanation)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Outside the keyed question so advancing doesn't yank the button out from under the
              keyboard focus that just pressed it. */}
          {!done && (
            <div className="lr-qs-nav">
              <button className="mini-btn lr-qs-back" onClick={() => step(-1)} disabled={pos === 0}>
                <Icon.chevL /> Back
              </button>
              <button className="mini-btn accent" onClick={() => step(1)}>
                {nextLabel} <Icon.chevR />
              </button>
            </div>
          )}

          {done && (
            <div className="lr-qs-wrap m-fade-rise">
              <div className="lr-qs-score">
                <span className="lr-qs-score-v tab-num">
                  {deckTally.correct}
                  <span className="lr-qs-score-of">/{deck.length}</span>
                </span>
                <span className="lr-qs-score-k">
                  {percent}% correct{round > 1 ? ` · retry round ${round}` : ''}
                </span>
                {passed !== null && (
                  <span className={'lr-qs-chip' + (passed ? ' is-pass' : ' is-short')}>
                    {passed ? `Passed · ${threshold}% needed` : `${threshold}% needed to pass`}
                  </span>
                )}
              </div>

              {deckTally.missed.length === 0 ? (
                <p className="lr-qs-clean">Every question right — nothing left to review.</p>
              ) : (
                <>
                  <p className="lr-qs-review-k">Review these {deckTally.missed.length}</p>
                  <ul className="lr-qs-missed">
                    {deckTally.missed.slice(0, MAX_MISSED_SHOWN).map((id, i) => {
                      const q = deck[id];
                      return (
                        <li
                          key={id}
                          className="lr-qs-missed-item m-stagger-item m-fade-rise"
                          style={{ ['--i' as string]: i } as CSSProperties}
                        >
                          <span
                            className="lr-qs-missed-q"
                            dangerouslySetInnerHTML={richInnerHtml(q.prompt)}
                          />
                          <span className="lr-qs-missed-a">
                            Answer:{' '}
                            <b
                              dangerouslySetInnerHTML={richInnerHtml(q.options[q.answerIdx].text)}
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {deckTally.missed.length > MAX_MISSED_SHOWN && (
                    <p className="lr-qs-more">
                      +{deckTally.missed.length - MAX_MISSED_SHOWN} more to review
                    </p>
                  )}
                </>
              )}

              <div className="lr-qs-nav">
                {deckTally.missed.length > 0 && (
                  <button className="mini-btn accent" onClick={retryMissed}>
                    <Icon.refresh /> Retry {deckTally.missed.length} missed
                  </button>
                )}
                <button className="mini-btn" onClick={restart}>
                  Start over
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
