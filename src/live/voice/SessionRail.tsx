// The slim session rail: the conversation as a chaptered table of contents, not a chat log.
// Each row is a moment (mono clock + the ask) grouped under its chapter; tapping one jumps
// the canvas — and the answer hero — back to that moment. The spoken answer lives on the
// stage now, so the rail's job is navigation, the way a margin index serves a document.
//
// A star (bookmark) icon on each row lets the user mark moments they want to return to.
// Bookmarks persist across page reloads (stored by frame timestamp in localStorage).
//
// Structural classnames (side-rail / rail-head / rail-chat / rail-mobile-toggle) are kept so
// the existing mobile bottom-sheet rules drive this rail unchanged.
import { useMemo, type ReactElement } from 'react';
import type { Chapter } from '../scrubber/chapters';
import type { TurnFrame } from '../history';
import { correctionMarks } from '../heal/corrections';
import { Icon } from '../../icons/icons';
import { fmtClock } from './clock';
import { useStudyPrompt } from '../srs/useStudy';

export function SessionRail({
  chapters,
  frames,
  currentIndex,
  onJump,
  onReplay,
  onOverview,
  resumed,
  chatOpen,
  onToggleChat,
  collapsed,
  onToggleCollapse,
  onOpenPast,
  onStudy,
  roomIndices,
  bookmarks,
  onToggleBookmark,
  onViewMindMap,
  onSeeTogether,
}: {
  chapters: Chapter[];
  frames: TurnFrame[];
  currentIndex: number;
  onJump: (index: number) => void;
  onReplay?: () => void;
  /** Zoom out to the whole-conversation Overview (the Mission-Control map of every chapter).
   *  Moved here from the old persistent scrubber strip, which was removed. */
  onOverview?: () => void;
  /** Open the study session. The rail decides whether to show it: a returning user usually lands
   *  straight on a restored canvas and never sees the welcome hub, so this is the one place the
   *  offer reaches them — and it stays hidden entirely when there is nothing to study. */
  onStudy?: () => void;
  /** A canvas restored from the Library, before any new turn — worth saying so. */
  resumed: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
  /** Desktop only: whether the rail is condensed to a slim strip (canvas takes the room). */
  collapsed?: boolean;
  /** Toggle the desktop collapse. When absent (e.g. the scripted Demo), no toggle renders. */
  onToggleCollapse?: () => void;
  /** Open the past-conversations library. When absent (no saved canvases), the footer is hidden. */
  onOpenPast?: () => void;
  /** Frame indices asked while presenting — questions from the room, labeled honestly. */
  roomIndices?: ReadonlySet<number>;
  /** Bookmarked frame keys (frame.at as string). */
  bookmarks?: ReadonlySet<string>;
  /** Toggle a bookmark for a frame key. */
  onToggleBookmark?: (key: string) => void;
  /** Open the read-only "Watch Me Think" map a turn grew from (only shown when the frame has one). */
  onViewMindMap?: (frameIndex: number) => void;
  /** Compose a whole chapter's turns onto one canvas ("See this thread together"). Always shown next
   *  to the chapter head for a consistent rail; disabled on single-moment chapters (nothing to
   *  compose — it's already fully on screen). */
  onSeeTogether?: (chapter: Chapter) => void;
}): ReactElement {
  // Subscribed, so finishing a session makes the offer disappear without a reload.
  const study = useStudyPrompt();
  const empty = chapters.length === 0;
  const corrected = useMemo(() => correctionMarks(frames), [frames]);
  return (
    <aside
      className={'side-rail' + (chatOpen ? ' chat-open' : '') + (collapsed ? ' is-collapsed' : '')}
    >
      <button
        type="button"
        className="rail-mobile-toggle"
        aria-expanded={chatOpen}
        onClick={onToggleChat}
      >
        <Icon.chat />
        {chatOpen ? 'Hide session' : 'This session'}
      </button>
      <div className="rail-head">
        {onToggleCollapse && (
          <button
            type="button"
            className="rail-collapse"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand the session panel' : 'Collapse the session panel'}
            title={collapsed ? 'Show this session' : 'Hide this session'}
          >
            <Icon.panelLeft />
          </button>
        )}
        <span className="rail-title sess-title">This session</span>
        {/* Replay + Overview are icon-only here — two text pills overflowed the narrow rail
            header and crowded the face. Tooltips + aria-labels keep them clear. */}
        {(onReplay || onOverview) && (
          <div className="rail-head-actions">
            {onReplay && (
              <button
                type="button"
                className="rail-history rail-icon"
                onClick={onReplay}
                title="Replay earlier answers"
                aria-label="Replay earlier answers"
              >
                <Icon.play />
              </button>
            )}
            {onOverview && (
              <button
                type="button"
                className="rail-history rail-icon"
                onClick={onOverview}
                title="Zoom out to the whole conversation"
                aria-label="Conversation overview"
              >
                <Icon.layers />
              </button>
            )}
          </div>
        )}
      </div>
      {onToggleCollapse && (
        <div className="rail-collapsed-label" aria-hidden="true">
          This session
        </div>
      )}
      <div className="rail-chat sess-list">
        {resumed && (
          <div className="sess-note" role="note">
            Resumed — picking back up where you left off.
          </div>
        )}
        {empty ? (
          <div className="sess-note">
            Topics can wander — cooking, markets, your fantasy lineup. Mavéa keeps the thread.
          </div>
        ) : (
          chapters.map((ch) => (
            <div key={ch.id} className="sess-chapter" style={{ ['--ch-c' as string]: ch.color }}>
              <div className="sess-chapter-head">
                <div className="sess-chapter-label" title={ch.title}>
                  {ch.title}
                </div>
                {/* Only when there is genuinely something to compose: a one-moment thread is
                    already fully on screen, and a disabled ghost there was pure noise. Always
                    visible (not hover-revealed) so the feature is discoverable the moment a
                    thread earns it. */}
                {onSeeTogether && ch.moments.length >= 2 && (
                  <button
                    type="button"
                    className="sess-together"
                    onClick={() => onSeeTogether(ch)}
                    title={`See all ${ch.moments.length} moments of this thread together on one canvas`}
                    aria-label={`See all ${ch.moments.length} moments of this thread together`}
                  >
                    <Icon.table />
                  </button>
                )}
              </div>
              {ch.moments.map((m) => {
                const mark = corrected.get(m.frameIndex);
                const frame = frames[m.frameIndex];
                const bKey = frame ? String(frame.at) : null;
                const isBookmarked = bKey ? (bookmarks?.has(bKey) ?? false) : false;
                return (
                  <div key={m.frameIndex} className="sess-row-wrap">
                    <button
                      type="button"
                      className={
                        'sess-row' +
                        (m.frameIndex === currentIndex ? ' is-current' : '') +
                        (mark ? ' is-corrected' : '') +
                        (isBookmarked ? ' is-bookmarked' : '')
                      }
                      onClick={() => onJump(m.frameIndex)}
                      aria-current={m.frameIndex === currentIndex ? 'true' : undefined}
                      // The ask itself is the tooltip so a clipped row stays fully readable on hover;
                      // a corrected moment appends its honest was→now after it.
                      title={
                        mark
                          ? `${m.question} · Corrected later — ${mark.note.what}: was ${mark.note.was}, now ${mark.note.now}`
                          : m.question
                      }
                    >
                      <span className="sess-time">{fmtClock(frame?.at)}</span>
                      <span className="sess-q">{m.question}</span>
                      {mark && <span className="sess-corrected">corrected</span>}
                      {roomIndices?.has(m.frameIndex) && (
                        <span className="sess-room">from the room</span>
                      )}
                    </button>
                    {onViewMindMap && frame?.mind && (
                      <button
                        type="button"
                        className="sess-mapview"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewMindMap(m.frameIndex);
                        }}
                        title="See the thinking map this answer grew from"
                        aria-label="View the thinking map"
                      >
                        <Icon.sparkle />
                      </button>
                    )}
                    {onToggleBookmark && bKey && (
                      <button
                        type="button"
                        className={`sess-bookmark${isBookmarked ? ' on' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBookmark(bKey);
                        }}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark this moment'}
                        aria-pressed={isBookmarked}
                        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this moment'}
                      >
                        {isBookmarked ? '★' : '☆'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      {(onOpenPast || (onStudy && study)) && (
        <div className="rail-foot">
          {onOpenPast && (
            <button type="button" className="rail-past" onClick={onOpenPast}>
              <Icon.clock />
              <span>Past conversations</span>
            </button>
          )}
          {onStudy && study && (
            <button type="button" className="rail-past" onClick={onStudy}>
              <Icon.layers />
              <span>
                {study.count} card{study.count === 1 ? '' : 's'} ready
              </span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
