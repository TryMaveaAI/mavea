// copy.ts — every user-visible string that differs between the two study styles, in one place.
//
// The collection style exists so that someone who just wants a pile of cards is never handed a
// schedule they didn't ask for. That promise is only as good as the vocabulary: one stray "Due" or
// "Suspended" in a heading, a button title, or an aria-label puts them back in Anki. Keeping the
// forked strings here (a leaf module with no imports beyond types) means a new surface has exactly
// one place to reach for, and a single test can walk every rendered string against the words that
// must never appear.
import type { CardFilter, StudyStyle } from './store';

export interface StyleFilter {
  key: CardFilter;
  label: string;
  /**
   * Whether to show the tally beside the label. Off for the collection style's narrowing filters:
   * "Unseen 37" is unread-email framing — a number that only shrinks if you do the work — whereas
   * "All 42" is just inventory.
   */
  showCount: boolean;
}

export interface StyleCopy {
  /** The study overlay's header eyebrow. */
  eyebrow: string;
  /** The study overlay's accessible name. A screen-reader user hears this instead of the eyebrow. */
  dialogLabel: string;
  /** Shown when the queue is empty. */
  emptyHead: string;
  emptySub: string;
  doneHead: string;
  doneSub: (good: number, total: number) => string;
  /** Shown on the done screen when the scope still holds cards this session didn't reach. */
  moreLeft: string;
  /** Curated and ordered by importance — never alphabetical. */
  filters: StyleFilter[];
  /** Adjective for the Review button when a narrowing filter is active. */
  filterAdjective: Partial<Record<CardFilter, string>>;
  /** Row status pills. `touched` is the majority state, so it must read as calm, not as debt. */
  status: { parked: string; fresh: string; touched: string };
  /** The park/suspend action, so a row's pill and its own button never disagree. */
  parkVerb: { park: string; unpark: string; title: string };
}

const SPACED: StyleCopy = {
  eyebrow: 'REVIEW',
  dialogLabel: 'Review your cards',
  emptyHead: 'Nothing ready',
  emptySub: 'No cards are ready to study here yet.',
  doneHead: 'Session done',
  doneSub: (good, total) => `${good} of ${total} answered confidently.`,
  moreLeft: "That's this round. The rest will keep.",
  filters: [
    { key: 'all', label: 'All', showCount: true },
    { key: 'due', label: 'Due', showCount: true },
    { key: 'new', label: 'New', showCount: true },
    { key: 'struggling', label: 'Struggling', showCount: true },
    { key: 'suspended', label: 'Suspended', showCount: true },
  ],
  filterAdjective: { due: 'Due', new: 'New', struggling: 'Struggling' },
  status: { parked: 'Suspended', fresh: 'New', touched: 'Scheduled' },
  parkVerb: { park: 'Suspend', unpark: 'Unsuspend', title: 'Suspend (skip in reviews)' },
};

const COLLECTION: StyleCopy = {
  eyebrow: 'FLASHCARDS',
  dialogLabel: 'Flip through your cards',
  emptyHead: 'Nothing to flip',
  emptySub: 'No cards here yet. Tap "Cards" on any answer to start a pile.',
  doneHead: 'Done',
  doneSub: (good, total) => `You got ${good} of ${total}.`,
  moreLeft: "That's this round. The rest will keep.",
  filters: [
    { key: 'all', label: 'All', showCount: true },
    { key: 'unseen', label: 'Unseen', showCount: false },
    { key: 'missed', label: 'Missed', showCount: false },
    { key: 'suspended', label: 'Parked', showCount: false },
  ],
  filterAdjective: { unseen: 'Unseen', missed: 'Missed' },
  status: { parked: 'Parked', fresh: 'Unseen', touched: 'Seen' },
  parkVerb: { park: 'Park', unpark: 'Unpark', title: 'Park (skip in reviews)' },
};

const BY_STYLE: Record<StudyStyle, StyleCopy> = { spaced: SPACED, collection: COLLECTION };

export function studyCopy(style: StudyStyle): StyleCopy {
  return BY_STYLE[style];
}

/**
 * Words that must never reach a user who kept a plain pile of cards. Exported so the guard test
 * and this module can't drift apart.
 */
export const SCHEDULING_WORDS =
  /\b(due|overdue|scheduled|spaced|suspend\w*|struggl\w*|SRS|repetition)\b/i;
