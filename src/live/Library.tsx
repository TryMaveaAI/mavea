// The Library — the canvases you've generated, still here, ready to pick back up. Each card retells
// its conversation honestly: the ask you spoke, then the real blocks the answer held (via momentsFor,
// nothing summarized or invented) and an honest "saved 2h ago". There is intentionally NO "since you
// left" delta or LIVE badge: a client-only BYOK app isn't quietly re-measuring anything, so a change
// number would be invented. Two ways to browse: "Recent" is the flat newest-first stream; "By topic"
// collapses a run of related asks into one thread (groupByTopic) so the same subject reads as a
// single card, not a wall of look-alikes. Tap a card to resume; "live" only ever means a real re-ask.
import { useMemo, useState } from 'react';
import { LIBRARY_CAP } from './library/store';
import type { LibraryEntry } from './library/store';
import { groupByTopic, type TopicGroup } from './library/grouping';
import { momentsFor, type MomentIcon } from './library/moments';
import { formatAgo } from './library/time';
import { Icon } from '../icons/icons';
import './library.css';
import { sentenceCase } from '../lib/sentenceCase';

/** Rotating, purely-decorative accents so the wall of cards has rhythm (matches the design tokens). */
const ACCENTS = ['var(--presence)', 'var(--insight)', 'var(--warning)'] as const;

/** The small leading glyph for a moment row — the mic for the ask itself, ✦ for a found insight,
 *  ⊞ for the evidence blocks around it. */
function MomentGlyph({ icon }: { icon: MomentIcon }) {
  if (icon === 'ask') return <Icon.mic />;
  return <span aria-hidden>{icon === 'finding' ? '✦' : '⊞'}</span>;
}

interface Props {
  entries: LibraryEntry[];
  onResume: (entry: LibraryEntry) => void;
  onRemove?: (id: string) => void;
  heading?: string;
  sub?: string;
}

/** Everything searchable about an entry, lowercased once: its title, the ask, and the
 *  real moment rows a card shows — so search finds what the eye can see. */
/** How a saved canvas is named on screen. The model's own `title` when it wrote one, otherwise the
 *  reader's question — which is stored exactly as they typed it, so it is shown back to them as a
 *  sentence rather than as raw input. */
function entryLabel(e: LibraryEntry): string {
  return sentenceCase(e.title || e.question);
}

function searchText(e: LibraryEntry): string {
  const { moments } = momentsFor(e);
  return [e.title, e.question, ...moments.map((m) => m.text)].join(' ').toLowerCase();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many cards show before "Show all" — two calm rows so the hub stays compact and the
 *  composer is never crowded; search always shows all hits. */
const VISIBLE_CAP = 6;

/** How many conversations a thread lists before "+N more" — enough to show the shape of a thread
 *  without a group card growing taller than a screenful. */
const GROUP_PREVIEW = 4;

/** A single saved canvas — the standalone card. Used for every tile in Recent, and for a one-off
 *  subject in By-topic. Deliberately unchanged: title → moments → saved/Resume, uniform in size. */
function SoloCard({
  entry,
  accent,
  onResume,
  onRemove,
}: {
  entry: LibraryEntry;
  accent: string;
  onResume: (e: LibraryEntry) => void;
  onRemove?: (id: string) => void;
}) {
  const { moments, more } = momentsFor(entry);
  const blockCount = entry.spec.blocks.length;
  return (
    <div className="lib-card" style={{ ['--lib-accent' as string]: accent }}>
      <button
        type="button"
        className="lib-open"
        onClick={() => onResume(entry)}
        aria-label={`Resume "${entryLabel(entry)}"`}
      >
        <div className={'lib-card-head' + (onRemove ? ' has-remove' : '')}>
          <span className="lib-dot" />
          <span className="lib-card-title">{entryLabel(entry)}</span>
          <span className="lib-count tab-num">{blockCount}</span>
        </div>
        <ul className="lib-moments">
          {moments.map((m, j) => (
            <li key={j} className="lib-moment">
              <span className="lib-moment-icon">
                <MomentGlyph icon={m.icon} />
              </span>
              <span className="lib-moment-text">{m.text}</span>
            </li>
          ))}
          {more > 0 && (
            <li className="lib-moment lib-moment-more">
              + {more} more {more === 1 ? 'moment' : 'moments'}
            </li>
          )}
        </ul>
        <div className="lib-meta">
          <span>saved {formatAgo(entry.savedAt)}</span>
          <span className="lib-resume">Resume →</span>
        </div>
      </button>
      {onRemove && (
        <button
          type="button"
          className="lib-remove"
          aria-label={`Remove "${entryLabel(entry)}" from your library`}
          onClick={() => onRemove(entry.id)}
        >
          <Icon.x />
        </button>
      )}
    </div>
  );
}

/** A thread of related canvases (By-topic, 2+ members): a named header over a list of the
 *  conversations, each one tap from resuming — so the same subject reads as one tidy card. */
function GroupCard({
  group,
  accent,
  onResume,
  onRemove,
}: {
  group: TopicGroup;
  accent: string;
  onResume: (e: LibraryEntry) => void;
  onRemove?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.entries : group.entries.slice(0, GROUP_PREVIEW);
  const hidden = group.entries.length - shown.length;
  const count = group.entries.length;
  const latest = group.entries[0]; // newest-first
  return (
    <div className="lib-card lib-group" style={{ ['--lib-accent' as string]: accent }}>
      <div className="lib-card-head">
        <span className="lib-dot" />
        <span className="lib-card-title">{group.name}</span>
        <span className="lib-count tab-num" aria-label={`${count} conversations`}>
          {count}
        </span>
      </div>
      <ul className="lib-sessions">
        {shown.map((e) => (
          <li key={e.id} className="lib-session">
            <button
              type="button"
              className="lib-session-open"
              onClick={() => onResume(e)}
              aria-label={`Resume "${entryLabel(e)}"`}
            >
              <span className="lib-session-title">{entryLabel(e)}</span>
              <span className="lib-session-ago">{formatAgo(e.savedAt)}</span>
            </button>
            {onRemove && (
              <button
                type="button"
                className="lib-session-remove"
                aria-label={`Remove "${entryLabel(e)}" from your library`}
                onClick={() => onRemove(e.id)}
              >
                <Icon.x />
              </button>
            )}
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button type="button" className="lib-session-more" onClick={() => setExpanded(true)}>
              + {hidden} more {hidden === 1 ? 'conversation' : 'conversations'}
            </button>
          </li>
        )}
      </ul>
      <div className="lib-meta">
        <span>latest {formatAgo(latest.savedAt)}</span>
        <span className="lib-group-count">
          {count} conversation{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

export function Library({ entries, onResume, onRemove, heading = 'Your library', sub }: Props) {
  const [query, setQuery] = useState('');
  // 'recent' keeps the saved order (newest first); 'topic' clusters related canvases into threads so
  // the same subject reads as a single card instead of a wall of look-alikes.
  const [tab, setTab] = useState<'recent' | 'topic'>('recent');
  const [expanded, setExpanded] = useState(false);
  // Each entry's haystack is built once per library load, not once per keystroke — searchText
  // walks every block of every saved canvas, so rebuilding it inside the filter made typing in
  // a well-used library cost entries × blocks string work per character.
  const haystacks = useMemo(() => new Map(entries.map((e) => [e.id, searchText(e)])), [entries]);
  const groups = useMemo<TopicGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const list = q ? entries.filter((e) => (haystacks.get(e.id) ?? '').includes(q)) : entries;
    if (tab === 'topic') return groupByTopic(list);
    // Recent: every canvas stands alone, newest first — one singleton thread each, saved order kept.
    return list.map((e) => ({ id: e.id, name: entryLabel(e), entries: [e] }));
  }, [entries, haystacks, query, tab]);
  // Browsing stays capped so the hub (and its type bar) never drowns in cards; a search
  // is already a filter, so its hits all show.
  const capped = !expanded && !query.trim() && groups.length > VISIBLE_CAP;
  const shown = capped ? groups.slice(0, VISIBLE_CAP) : groups;
  if (entries.length === 0) return null;
  const thisWeek = entries.filter((e) => Date.now() - e.savedAt < WEEK_MS).length;
  const withTools = entries.length >= 3;
  return (
    <section className="library" aria-label="Your library">
      <div className="library-head">
        <h2 className="library-title">{heading}</h2>
        <p className="library-sub">
          {sub ?? 'Every canvas stays here after the conversation — tap one to pick it back up.'}
        </p>
        <p className="library-count">
          {/* "all time" was never true — the store keeps the most recent LIBRARY_CAP and drops the
              rest, so a conversation could vanish with nothing on screen having said it might.
              State the cap instead, and say plainly what happens at it. */}
          {thisWeek} this week · {entries.length} of {LIBRARY_CAP} kept on this device
          {entries.length >= LIBRARY_CAP && ' · saving another drops the oldest'}
        </p>
      </div>
      {withTools && (
        <div className="library-tools">
          <label className="lib-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search moments"
              aria-label="Search your conversations"
            />
          </label>
          <div className="lib-tabs" role="tablist" aria-label="Sort conversations">
            {(['recent', 'topic'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={'lib-tab' + (tab === t ? ' on' : '')}
                onClick={() => setTab(t)}
              >
                {t === 'recent' ? 'Recent' : 'By topic'}
              </button>
            ))}
          </div>
        </div>
      )}
      {shown.length === 0 && (
        <p className="library-none">Nothing matches “{query.trim()}” — try fewer words.</p>
      )}
      <div className="library-grid">
        {shown.map((g, i) => {
          const accent = ACCENTS[i % ACCENTS.length];
          return g.entries.length === 1 ? (
            <SoloCard
              key={g.id}
              entry={g.entries[0]}
              accent={accent}
              onResume={onResume}
              onRemove={onRemove}
            />
          ) : (
            <GroupCard
              key={g.id}
              group={g}
              accent={accent}
              onResume={onResume}
              onRemove={onRemove}
            />
          );
        })}
      </div>
      {capped && (
        <button type="button" className="lib-more-btn" onClick={() => setExpanded(true)}>
          Show all {groups.length}
        </button>
      )}
    </section>
  );
}
