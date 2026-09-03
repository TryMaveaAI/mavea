// CardEditor.tsx — the one sheet used everywhere a card is created or edited: reviewing the cards
// suggested from an answer (add), typing a brand-new card (add), and editing an existing one (edit).
// Add mode opens pre-filled with a suggestion the user can rewrite, extend, or trim before saving —
// nothing reaches the deck until they hit Save. When a block has no inherent Q/A, the suggestion is
// a deterministic seed that an optional `enrich` thunk refines in place (unless the user has already
// started editing). Same overlay contract as SrsReview (position:fixed scrim, Escape closes).
import './flashcards.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { addCards, updateCard } from './store';
import type { AddOpts, SrsCard, SrsSource } from './store';
import type { DraftCard } from './suggestCards';
import { useFocusTrap } from '../useFocusTrap';

interface EditorCard {
  front: string;
  back: string;
}

interface AddProps {
  mode: 'add';
  /** The suggested card(s) to start from (real Q/A pairs, or a single seed). */
  initial: DraftCard[];
  /** Default deck for the saved cards. */
  deck: string;
  origin: 'block' | 'manual';
  source?: SrsSource;
  /** Heading shown in the sheet (e.g. the block's label or "New card"). */
  heading?: string;
  /** Optional model refinement for a seeded card — replaces the seed if the user hasn't edited. */
  enrich?: () => Promise<DraftCard[]>;
  decks?: string[];
  onClose: () => void;
  onSaved: (added: SrsCard[]) => void;
}

interface EditProps {
  mode: 'edit';
  card: SrsCard;
  decks?: string[];
  onClose: () => void;
  onSaved?: () => void;
}

type Props = AddProps | EditProps;

function toEditor(cards: DraftCard[]): EditorCard[] {
  const rows = cards.map((c) => ({ front: c.front ?? '', back: c.back ?? '' }));
  return rows.length ? rows : [{ front: '', back: '' }];
}

export function CardEditor(p: Props): ReactElement {
  const shellRef = useRef<HTMLDivElement>(null);
  // Open on the first field, not on ✕ — this is a sheet you have come here to type in, and the
  // first focusable in DOM order is the close button.
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  useFocusTrap(shellRef, { initialFocus: firstFieldRef });

  const [rows, setRows] = useState<EditorCard[]>(() =>
    p.mode === 'add' ? toEditor(p.initial) : [{ front: p.card.front, back: p.card.back }],
  );
  const [deck, setDeck] = useState(() => (p.mode === 'add' ? p.deck : p.card.deck));
  const [tags, setTags] = useState<string[]>(() =>
    p.mode === 'add' ? dedupeTags(p.initial.flatMap((c) => (c.tag ? [c.tag] : []))) : p.card.tags,
  );
  const [tagDraft, setTagDraft] = useState('');
  const [drafting, setDrafting] = useState(false);

  // Tracks whether the user has touched the suggestion; if so, an arriving model draft won't clobber.
  const dirtyRef = useRef(false);

  // Seed → model-refined suggestion (add mode only). Cancels cleanly if the sheet closes first.
  const enrich = p.mode === 'add' ? p.enrich : undefined;
  useEffect(() => {
    if (!enrich) return;
    let cancelled = false;
    setDrafting(true);
    enrich()
      .then((drafted) => {
        if (cancelled || dirtyRef.current || drafted.length === 0) return;
        setRows(toEditor(drafted));
      })
      .catch(() => {
        /* draftCardsFromBlock already degrades to [] — nothing to do */
      })
      .finally(() => {
        if (!cancelled) setDrafting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enrich]);

  const setRow = (i: number, patch: Partial<EditorCard>): void => {
    dirtyRef.current = true;
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const addRow = (): void => {
    dirtyRef.current = true;
    setRows((rs) => [...rs, { front: '', back: '' }]);
  };
  const removeRow = (i: number): void => {
    dirtyRef.current = true;
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  };

  const commitTag = (): void => {
    const t = tagDraft.trim().replace(/,$/, '').trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags((ts) => [...ts, t]);
    setTagDraft('');
  };

  const valid = rows.filter((r) => r.front.trim() && r.back.trim());
  const canSave = valid.length > 0 && deck.trim().length > 0;

  const save = useCallback((): void => {
    if (!canSave) return;
    const trimmedDeck = deck.trim();
    const trimmedTags = dedupeTags(tags);
    if (p.mode === 'add') {
      const opts: AddOpts = {
        deck: trimmedDeck,
        tags: trimmedTags,
        origin: p.origin,
        ...(p.source ? { source: p.source } : {}),
      };
      const added = addCards(
        valid.map((r) => ({ front: r.front, back: r.back })),
        opts,
      );
      p.onSaved(added);
    } else {
      const r = valid[0];
      updateCard(p.card.id, { front: r.front, back: r.back, deck: trimmedDeck, tags: trimmedTags });
      p.onSaved?.();
    }
    p.onClose();
    // p is stable for the sheet's lifetime; rows/deck/tags drive the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, deck, tags, rows]);

  // Escape closes; ⌘/Ctrl+Enter saves from anywhere in the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        p.onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, p]);

  const heading =
    p.mode === 'edit' ? 'Edit card' : (p.heading ?? (rows.length > 1 ? 'Add cards' : 'Add card'));
  const decks = p.decks ?? [];

  // The scrim stays presentational — a role="button" wrapper around the dialog is a nested
  // interactive, and Escape plus the ✕ button already give the keyboard the same exit. Only a
  // click landing directly on the backdrop closes it; anything on the sheet's content is left alone.
  const closeOnBackdrop = (e: { target: EventTarget; currentTarget: EventTarget }): void => {
    if (e.target === e.currentTarget) p.onClose();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="fc-scrim" onClick={closeOnBackdrop}>
      <div
        className="fc-ed-shell"
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
      >
        <div className="fc-ed-head">
          <div className="fc-ed-title">{heading}</div>
          {drafting && <span className="fc-ed-drafting">Drafting a suggestion…</span>}
          <button type="button" className="fc-ed-close" aria-label="Close" onClick={p.onClose}>
            ✕
          </button>
        </div>

        <div className="fc-ed-body">
          {rows.map((r, i) => (
            <div className="fc-ed-card" key={i}>
              {p.mode === 'add' && rows.length > 1 && (
                <div className="fc-ed-card-head">
                  <span className="fc-ed-card-n">Card {i + 1}</span>
                  <button
                    type="button"
                    className="fc-ed-row-remove"
                    aria-label={`Remove card ${i + 1}`}
                    onClick={() => removeRow(i)}
                  >
                    Remove
                  </button>
                </div>
              )}
              <label className="fc-ed-field">
                <span className="fc-ed-label">Front · question</span>
                <textarea
                  ref={i === 0 ? firstFieldRef : undefined}
                  className="fc-ed-input"
                  rows={2}
                  value={r.front}
                  placeholder="What is the cue?"
                  onChange={(e) => setRow(i, { front: e.target.value })}
                />
              </label>
              <label className="fc-ed-field">
                <span className="fc-ed-label">Back · answer</span>
                <textarea
                  className="fc-ed-input"
                  rows={3}
                  value={r.back}
                  placeholder="The shortest complete answer"
                  onChange={(e) => setRow(i, { back: e.target.value })}
                />
              </label>
            </div>
          ))}

          {p.mode === 'add' && (
            <button type="button" className="fc-ed-add-row" onClick={addRow}>
              + Add another card
            </button>
          )}

          <div className="fc-ed-meta">
            <label className="fc-ed-field">
              <span className="fc-ed-label">Deck</span>
              <input
                className="fc-ed-input"
                list="fc-deck-options"
                value={deck}
                placeholder="General"
                onChange={(e) => setDeck(e.target.value)}
              />
              <datalist id="fc-deck-options">
                {decks.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>

            <div className="fc-ed-field">
              <span className="fc-ed-label">Tags</span>
              <div className="fc-ed-tags">
                {tags.map((t) => (
                  <span className="fc-ed-tag" key={t}>
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove tag ${t}`}
                      onClick={() => setTags((ts) => ts.filter((x) => x !== t))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  className="fc-ed-tag-input"
                  value={tagDraft}
                  placeholder={tags.length ? 'Add tag…' : 'Add a tag…'}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      commitTag();
                    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                      setTags((ts) => ts.slice(0, -1));
                    }
                  }}
                  onBlur={commitTag}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="fc-ed-foot">
          <button type="button" className="fc-btn" onClick={p.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="fc-btn fc-btn-primary"
            disabled={!canSave}
            onClick={save}
          >
            {p.mode === 'edit'
              ? 'Save'
              : valid.length > 1
                ? `Add ${valid.length} cards`
                : 'Add card'}
          </button>
        </div>
      </div>
    </div>
  );
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
