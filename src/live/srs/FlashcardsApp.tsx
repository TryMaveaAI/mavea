// FlashcardsApp.tsx — the manage surface at #/flashcards: see every card, organise it (decks +
// tags + smart filters), search, edit, remove, and launch a focused study session. Mirrors the
// Dashboards surface (hash sub-route + a store-subscription hook). Lazy-loaded, so none of this
// reaches the eager bundle. Real-data-only: an empty deck shows an explainer, never sample cards.
import './flashcards.css';
// The workspace skin's token rebinds live here; without it this surface would set data-template
// and nothing would change.
import '../../styles/templates.css';
import { homeTarget } from '../../lib/homeTarget';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  getCounts,
  moveDeck,
  removeCards,
  selectCards,
  setStudyStyle,
  setSuspended,
  setSuspendedMany,
} from './store';
import type { CardFilter, SrsCard, StudyStyle } from './store';
import { studyCopy } from './copy';
import { useSrsRevision } from './useSrsCards';
import { flashHref, parseRoute, useHash } from './route';
import { SrsReview } from './SrsReview';
import type { SrsReviewScope } from './SrsReview';
import { CardEditor } from './CardEditor';
import { Icon } from '../../icons/icons';
import { applyTheme, readTheme } from '../../lib/theme';
import { mountTemplateSkin } from '../templates';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';

// Named for what the user GETS, not for the algorithm. "Spaced review" is a term of art that a
// first-timer can't decode, and the choice is worthless if they can't tell the options apart.
const STYLE_CHOICES: Array<{ value: StudyStyle; label: string }> = [
  { value: 'collection', label: 'Just save them' },
  { value: 'spaced', label: 'Help me remember' },
];

/**
 * The row's state, in the vocabulary of the active study style. A plain collection has no notion
 * of a schedule, so it reports whether you have looked at the card rather than when it is owed.
 */
function rowStatus(card: SrsCard, style: StudyStyle, now: number): { label: string; cls: string } {
  const copy = studyCopy(style);
  if (card.suspended) return { label: copy.status.parked, cls: 'is-suspended' };
  if (style === 'collection')
    return card.seen
      ? { label: copy.status.touched, cls: 'is-seen' }
      : { label: copy.status.fresh, cls: 'is-new' };
  if (card.reps === 0) return { label: copy.status.fresh, cls: 'is-new' };
  return card.nextReview <= now
    ? { label: 'Due', cls: 'is-due' }
    : { label: copy.status.touched, cls: 'is-sched' };
}

export function FlashcardsApp(): ReactElement {
  // Back goes where you came from — Live if you have a session, the front door otherwise.
  const home = homeTarget();
  const hash = useHash();
  const route = parseRoute(hash);
  // Honor the saved appearance on this standalone surface (the home/Live appliers don't run here):
  // light/dark first, then the chosen workspace skin, so this page looks like the rest of the app
  // rather than a bolted-on tool. mountTemplateSkin re-asserts the brightness and hands the page
  // back on unmount.
  useEffect(() => applyTheme(readTheme()), []);
  useEffect(() => mountTemplateSkin(document), []);
  // Re-render whenever the store changes; the reads below are cheap over a bounded deck, so they run
  // each render rather than being memoised against an external-store revision counter.
  useSrsRevision();

  const deck = route.view === 'deck' ? (route.deck ?? null) : null;
  const [filter, setFilter] = useState<CardFilter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [studying, setStudying] = useState<SrsReviewScope | null>(null);
  const [editing, setEditing] = useState<SrsCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTo, setMoveTo] = useState('');

  const counts = getCounts();
  const copy = studyCopy(counts.style);
  // The style can change underneath this view (from Settings, or another tab), and the filter that
  // was active may no longer exist in the new vocabulary. Derive rather than reach for an effect:
  // an unknown filter falls back to All instead of silently selecting nothing.
  const activeFilter: CardFilter = copy.filters.some((f) => f.key === filter) ? filter : 'all';
  const cards = selectCards({
    deck: deck ?? undefined,
    tag: tag ?? undefined,
    filter: activeFilter,
    search,
  });
  const deckNames = counts.decks.map((d) => d.name);

  // Only what is on screen can be acted on: the bulk bar is read as "these rows", so a selection
  // made in one deck must never be what Delete or Move quietly operates on after the user has
  // switched scope.
  const selIds = cards.filter((c) => selected.has(c.id)).map((c) => c.id);
  const toggleSel = (id: string): void =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSel = (): void => {
    setSelected(new Set());
    setConfirmDelete(false);
    setMoveTo('');
  };
  // …and the leftover selection is dropped outright the moment the scope changes, so it can't come
  // back when the user navigates in again. Adjusted during render (React's documented alternative
  // to a reset effect), same as activeFilter above — no second commit with a stale bulk bar.
  const scopeKey = JSON.stringify([deck, tag, activeFilter, search]);
  const [lastScope, setLastScope] = useState(scopeKey);
  if (lastScope !== scopeKey) {
    setLastScope(scopeKey);
    clearSel();
  }
  const allSelected = cards.length > 0 && cards.every((c) => selected.has(c.id));
  const toggleAll = (): void =>
    setSelected(allSelected ? new Set() : new Set(cards.map((c) => c.id)));

  const studyScope: SrsReviewScope = {
    deck: deck ?? undefined,
    tag: tag ?? undefined,
    filter: activeFilter === 'suspended' ? 'all' : activeFilter,
  };
  // The label must reflect what Study will actually queue: the sidebar's smart filter narrows
  // studyScope silently (it's the same `filter` state), so a selected "Due"/"New"/"Struggling"
  // has to show up here too — otherwise "Study All cards" would launch a Due-only session while
  // still claiming to study everything.
  const scopeName = deck ?? (tag ? `#${tag}` : null);
  const filterAdj = copy.filterAdjective[activeFilter];
  const studyLabel = filterAdj
    ? scopeName
      ? `${filterAdj} · ${scopeName}`
      : `${filterAdj} cards`
    : (scopeName ?? 'All cards');

  const anySuspendedSelected = selIds.some((id) => cards.find((c) => c.id === id)?.suspended);

  return (
    <div className="mavea-app fc-app">
      {/* ── top nav ── */}
      <header className="fc-nav">
        <button
          type="button"
          className="fc-nav-back"
          onClick={() => {
            window.location.hash = home.href;
          }}
        >
          <Icon.chevL /> {home.label}
        </button>
        <div className="fc-nav-title">
          Flashcards
          <span className="fc-nav-sub">
            {counts.total} card{counts.total !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="fc-nav-actions">
          <button type="button" className="fc-btn" onClick={() => setAdding(true)}>
            <Icon.plus /> New card
          </button>
          <button
            type="button"
            className="fc-btn fc-btn-primary"
            disabled={counts.total === 0}
            onClick={() => setStudying(studyScope)}
          >
            <Icon.play /> Study {studyLabel}
          </button>
        </div>
      </header>

      <div className="fc-body">
        {/* ── sidebar ── */}
        <aside className="fc-side">
          <div className="fc-side-group">
            <div className="fc-side-eyebrow">Study</div>
            {copy.filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={'fc-side-item' + (activeFilter === f.key ? ' is-active' : '')}
                onClick={() => setFilter(f.key)}
              >
                <span>{f.label}</span>
                {f.showCount && <span className="fc-side-count">{counts[f.key]}</span>}
              </button>
            ))}
          </div>

          <div className="fc-side-group">
            <div className="fc-side-eyebrow">Decks</div>
            <button
              type="button"
              className={'fc-side-item' + (deck === null ? ' is-active' : '')}
              onClick={() => {
                window.location.hash = flashHref.gallery;
              }}
            >
              <span>All decks</span>
            </button>
            {counts.decks.map((d) => (
              <button
                key={d.name}
                type="button"
                className={'fc-side-item' + (deck === d.name ? ' is-active' : '')}
                onClick={() => {
                  window.location.hash = flashHref.deck(d.name);
                }}
              >
                <span className="fc-side-name">{d.name}</span>
                {d.due > 0 && <span className="fc-side-badge">{d.due}</span>}
              </button>
            ))}
          </div>

          {counts.tags.length > 0 && (
            <div className="fc-side-group">
              <div className="fc-side-eyebrow">Tags</div>
              <div className="fc-side-tags">
                {counts.tags.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    className={'fc-tag-chip' + (tag === t.name ? ' is-active' : '')}
                    onClick={() => setTag((cur) => (cur === t.name ? null : t.name))}
                  >
                    {t.name}
                    <span className="fc-tag-n">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* How the pile behaves. It lives here, not only in Live's settings, because the person
              who decides they want a schedule after all is looking at their cards when they decide
              it — and nothing here is destructive, so it can be flipped back at any time. */}
          {counts.total > 0 && (
            <div className="fc-side-group fc-side-style">
              <div className="fc-side-eyebrow">Study style</div>
              <div className="fc-style-seg" role="radiogroup" aria-label="Study style">
                {STYLE_CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={counts.style === c.value}
                    className={'fc-style-opt' + (counts.style === c.value ? ' is-active' : '')}
                    onClick={() => setStudyStyle(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="fc-style-note">
                {counts.style === 'collection'
                  ? 'A plain pile you flip through whenever you like.'
                  : 'Cards come back just before you would forget them.'}
              </p>
            </div>
          )}
        </aside>

        {/* ── main list ── */}
        <main className="fc-main">
          <FeatureUseNotice kind="learning" />
          <div className="fc-toolbar">
            <div className="fc-search">
              <input
                type="search"
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search cards"
              />
            </div>
            {cards.length > 0 && (
              <button type="button" className="fc-selectall" onClick={toggleAll}>
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
            )}
          </div>

          {selIds.length > 0 && (
            <div className="fc-bulk" role="region" aria-label="Bulk actions">
              <span className="fc-bulk-n">{selIds.length} selected</span>
              <div className="fc-bulk-move">
                <input
                  list="fc-bulk-decks"
                  className="fc-bulk-input"
                  placeholder="Move to deck…"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && moveTo.trim()) {
                      moveDeck(selIds, moveTo.trim());
                      clearSel();
                    }
                  }}
                />
                <datalist id="fc-bulk-decks">
                  {deckNames.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <button
                type="button"
                className="fc-btn fc-btn-sm"
                onClick={() => {
                  setSuspendedMany(selIds, !anySuspendedSelected);
                  clearSel();
                }}
              >
                {anySuspendedSelected ? copy.parkVerb.unpark : copy.parkVerb.park}
              </button>
              {confirmDelete ? (
                <button
                  type="button"
                  className="fc-btn fc-btn-sm fc-btn-danger"
                  onClick={() => {
                    removeCards(selIds);
                    clearSel();
                  }}
                >
                  Confirm delete {selIds.length}
                </button>
              ) : (
                <button
                  type="button"
                  className="fc-btn fc-btn-sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
              <button type="button" className="fc-bulk-clear" onClick={clearSel}>
                Cancel
              </button>
            </div>
          )}

          {cards.length === 0 ? (
            <div className="fc-empty">
              <div className="fc-empty-icon" aria-hidden="true">
                <Icon.layers />
              </div>
              <div className="fc-empty-head">
                {counts.total === 0 ? 'No flashcards yet' : 'Nothing here'}
              </div>
              <div className="fc-empty-sub">
                {counts.total === 0
                  ? 'Tap “Cards” on any answer to turn it into flashcards, or make one by hand.'
                  : 'No cards match this filter. Try “All”, another deck, or clear the search.'}
              </div>
              {counts.total === 0 && (
                <button
                  type="button"
                  className="fc-btn fc-btn-primary"
                  onClick={() => setAdding(true)}
                >
                  <Icon.plus /> New card
                </button>
              )}
            </div>
          ) : (
            <ul className="fc-list">
              {cards.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  checked={selected.has(card.id)}
                  onToggle={() => toggleSel(card.id)}
                  onEdit={() => setEditing(card)}
                  style={counts.style}
                  onSuspend={() => setSuspended(card.id, !card.suspended)}
                  onDelete={() => removeCards([card.id])}
                  onTag={(t) => setTag(t)}
                />
              ))}
            </ul>
          )}
        </main>
      </div>

      {studying && (
        <SrsReview
          scope={studying}
          title={`STUDY · ${studyLabel}`}
          onClose={() => setStudying(null)}
        />
      )}
      {adding && (
        <CardEditor
          mode="add"
          initial={[{ front: '', back: '' }]}
          deck={deck ?? 'General'}
          origin="manual"
          heading="New card"
          decks={deckNames}
          onSaved={() => undefined}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <CardEditor mode="edit" card={editing} decks={deckNames} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CardRow({
  card,
  checked,
  onToggle,
  onEdit,
  style,
  onSuspend,
  onDelete,
  onTag,
}: {
  card: SrsCard;
  checked: boolean;
  onToggle: () => void;
  onEdit: () => void;
  style: StudyStyle;
  onSuspend: () => void;
  onDelete: () => void;
  onTag: (t: string) => void;
}): ReactElement {
  const [confirm, setConfirm] = useState(false);
  // Arming a row for deletion has to be escapable, so the confirm button disarms on blur — and it
  // takes focus the moment it appears, without which the blur can never fire (Safari doesn't focus
  // a button on click). Imperative, not the autoFocus prop, like the rest of this app's surfaces.
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);
  const parkVerb = studyCopy(style).parkVerb;
  const status = rowStatus(card, style, Date.now());

  return (
    <li className={'fc-row' + (checked ? ' is-checked' : '')}>
      <input
        type="checkbox"
        className="fc-row-check"
        checked={checked}
        onChange={onToggle}
        aria-label={`Select card: ${card.front}`}
      />
      <div className="fc-row-main">
        <div className="fc-row-front">{card.front}</div>
        <div className="fc-row-back">{card.back}</div>
        <div className="fc-row-meta">
          <span className={'fc-status ' + status.cls}>{status.label}</span>
          <span className="fc-row-deck">{card.deck}</span>
          {card.tags.map((t) => (
            <button key={t} type="button" className="fc-row-tag" onClick={() => onTag(t)}>
              {t}
            </button>
          ))}
          {card.origin === 'auto' && <span className="fc-row-origin">auto</span>}
        </div>
      </div>
      <div className="fc-row-actions">
        <button type="button" className="fc-icon-btn" aria-label="Edit card" onClick={onEdit}>
          <Icon.edit />
        </button>
        <button
          type="button"
          className="fc-icon-btn"
          aria-label={`${card.suspended ? parkVerb.unpark : parkVerb.park} card`}
          title={card.suspended ? parkVerb.unpark : parkVerb.title}
          onClick={onSuspend}
        >
          {card.suspended ? <Icon.play /> : <Icon.clock />}
        </button>
        {confirm ? (
          <button
            type="button"
            className="fc-icon-btn fc-icon-danger"
            aria-label="Confirm delete"
            ref={confirmRef}
            onClick={onDelete}
            onBlur={() => setConfirm(false)}
          >
            <Icon.check />
          </button>
        ) : (
          <button
            type="button"
            className="fc-icon-btn"
            aria-label="Delete card"
            onClick={() => setConfirm(true)}
          >
            <Icon.x />
          </button>
        )}
      </div>
    </li>
  );
}
