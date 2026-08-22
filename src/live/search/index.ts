// index.ts — the search-provider registry + the "should we search?" gate.
// Web search is OFF by default; when the user turns on Real-time search, grounding runs through
// the model provider's OWN native web tool. Keyless Wikipedia is NOT a default or a user-selectable
// mode — it exists only as a narrow 429 fallback for non-volatile queries (see generateLive), and
// can never serve live data (scores, today's weather, this weekend's fixtures). getSearchProvider
// falls back to it for any unknown/keyless id so that one fallback path always resolves.
import type { SearchProvider, SearchProviderId } from './types';
import { wikipediaProvider } from './wikipedia';
import { braveProvider } from './brave';
import { tavilyProvider } from './tavily';

const REGISTRY: Record<SearchProviderId, SearchProvider> = {
  wikipedia: wikipediaProvider,
  brave: braveProvider,
  tavily: tavilyProvider,
};

export function getSearchProvider(id?: SearchProviderId): SearchProvider {
  return (id && REGISTRY[id]) || wikipediaProvider;
}

// Words that signal an answer benefits from fresh/factual grounding. Kept
// deliberately conservative: searching adds latency, so we only do it when the
// question looks like a lookup, not a creative/opinion/coding prompt.
const FRESH_HINTS =
  /\b(latest|current|currently|today|tonight|tomorrow|now|recent|recently|this (week|weekend|month|year)|upcoming|next (?:week(?:end)?|month|game|match|season)|fixtures?|schedule[ds]?|line[- ]?ups?|kick[- ]?off|who(?:'s| is| are)? (?:playing|plays)|202\d|news|update|price|cost|stock|scores?|weather|forecast|release[ds]?|version|who(?:'s| is| are| was)|what(?:'s| is| are| was)|when (is|was|did)|where (is|was)|how (much|many)|population|capital|ceo|founded|net worth|statistics?|stats)\b/i;

// A trip/travel ask anchored to an explicit near-future calendar date ("plan a trip to Chicago
// from July 3", "visiting Tokyo in December") genuinely benefits from live grounding — weather,
// event schedules, hours, and prices for THOSE specific dates — even though it names none of the
// generic lookup words above. Requires a travel-planning word near a month+day mention (not just
// any date anywhere) so a settled, non-travel mention of a date ("my birthday is June 3rd") stays
// quiet.
const MONTH_DAY =
  `(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|` +
  `sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`;
const TRIP_DATE_HINT = new RegExp(
  `\\b(?:trip|visit(?:ing)?|travel(?:l?ing)?|vacation|itinerary|going to|flying to|heading to)\\b` +
    `[\\s\\S]{0,40}${MONTH_DAY}`,
  'i',
);

// A PUBLIC EVENT anchored to a specific date benefits from live grounding just like a trip does
// ("World Cup games on July 19", "matches this Saturday", "the concert on the 14th") — the schedule
// shifts and isn't in the model's training. Same structure as TRIP_DATE_HINT but keyed on
// event/schedule words instead of travel ones, and it also accepts a bare weekday, so an exact date
// finally triggers a search. Scoped to public-event words (game/match/concert/…) — NOT "birthday"
// or "meeting" — so a settled personal date ("my birthday is June 3rd") still stays quiet.
const DAY_OF_WEEK = `(?:this |next )?(?:mon|tue(?:s)?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?`;
// Public-event NOUNS only — deliberately NOT "schedule"/"meeting"/"appointment", so a personal
// calendar action ("schedule a meeting for Friday") doesn't trip the live-search nudge.
const EVENT_WORD =
  `(?:games?|match(?:es)?|fixtures?|kick[- ]?off|final|semi[- ]?finals?|` +
  `playoffs?|tournament|concert|gig|screening|premiere|festival|match[- ]?up)`;
const EVENT_DATE = `(?:${MONTH_DAY}|\\b${DAY_OF_WEEK}\\b|\\bthe \\d{1,2}(?:st|nd|rd|th)\\b)`;
const EVENT_DATE_HINT = new RegExp(
  `\\b${EVENT_WORD}\\b[\\s\\S]{0,40}${EVENT_DATE}|${EVENT_DATE}[\\s\\S]{0,40}\\b${EVENT_WORD}\\b`,
  'i',
);

/** Cheap, deterministic heuristic: does this prompt likely need web grounding? */
export function needsFreshInfo(userText: string): boolean {
  const t = userText.trim();
  if (t.length < 3) return false;
  return FRESH_HINTS.test(t) || TRIP_DATE_HINT.test(t) || EVENT_DATE_HINT.test(t);
}

// The VOLATILE subset of fresh queries: facts that change by the hour/minute and that an
// encyclopedia (Wikipedia) genuinely cannot answer — a live score, a current market price,
// today's weather, a breaking headline. Wikipedia must NEVER be cited for these: doing so
// dresses a stale or irrelevant article up as a live source (the "real-data-only" violation).
// Only a true real-time source (provider-native grounding or a keyed web provider) may serve
// them; absent that, the honest answer is "I can't get this live."
//
// Every branch is deliberately TIGHT so a SETTLED fact never trips it (which would wrongly
// suppress a correct answer with a "no live access" refusal): a sports branch needs a game/
// match context, a market term must sit next to a price word ("what is bitcoin" stays a concept
// question, not a live one), and a specific past year flips the ask back to history via
// PAST_ANCHOR ("who won the 2018 final" is settled, not live).
const LIVE_HINTS = new RegExp(
  [
    `live score|final score|half[- ]?time|who'?s winning`,
    `who won (?:the )?(?:game|match|race|fight|bout|series|final)`,
    // The music/quality sense of "scores" (a composer's, Metacritic's, a review's) is evergreen,
    // not live — excluded by the word right before it, so "which composers wrote scores for
    // famous games" or "the video games with the best review scores" never trips the live gate
    // (a wrong trip becomes a wrongful "no live access" refusal when search is off).
    `(?<!\\b(?:wrote|writes|writing|composed|film|music|movie|metacritic|review|test|exam)\\s)\\bscores?\\b(?=.*\\b(?:today|tonight|last night|now|live|games?|match(?:es)?)\\b)`,
    // The mirror direction — "the games and the scores" names the game context BEFORE the score
    // word, which the lookahead above can't see, and a present-tense games+scores ask with no
    // date means NOW (the reported miss: it fell through to a stale "yesterday's games" answer).
    // Kept tight: a determiner'd, non-video/board/card game word and a short gap to the score
    // word, so evergreen asks ("top 10 video games by metacritic scores") stay quiet and
    // PAST_ANCHOR still wins.
    `\\b(?:the|today'?s|tonight'?s|current)\\s+(?:\\w+\\s+){0,2}?(?<!\\b(?:video|board|card)\\s)(?:games?|match(?:es)?)\\b[^.?!]{0,30}\\bscores?\\b`,
    `\\bstandings?\\b|league table`,
    // A sport/event SCHEDULE tied to a near-future window (this weekend's games, tonight's
    // fixtures, tomorrow's matches) shifts with the live tournament calendar, so an encyclopedia
    // can't be trusted for it — only real-time grounding. Tight: needs a schedule word AND a
    // near-future time, so "who won the group stage" (settled) stays quiet.
    `\\b(?:games?|matches|match|fixtures?|schedule|kick[- ]?off|line[- ]?ups?|who plays)\\b(?=.*\\b(?:this weekend|tonight|today|tomorrow|this week|upcoming|right now)\\b)`,
    `\\b(?:stock|share|crypto|bitcoin|ethereum|btc|eth)\\b.{0,15}\\b(?:price|value|worth|quote|trading|rate)\\b`,
    `stock market|market cap|exchange rate|gas prices?`,
    `\\bweather\\b|\\bforecast\\b|temperature (?:right now|today|outside)`,
    `breaking news|latest (?:news|headlines?)|today'?s (?:news|headlines?)|news (?:right now|today)`,
    `right now|at the moment|as we speak`,
  ].join('|'),
  'i',
);

// A specific past year or explicit historical framing makes a question SETTLED — even if it
// names a score or a winner — so the model/encyclopedia can answer it. Erring broad here is
// safe: it only ever RELAXES the live-refusal, never causes one.
const PAST_ANCHOR = /\b(?:1\d{3}|20[0-2]\d|in \d{4}|back in|years? ago|all[-\s]?time)\b/i;

/** Does this prompt need genuinely LIVE data (sub-daily volatility) that Wikipedia cannot
 *  supply? When true, only a real-time source is acceptable — never the encyclopedic fallback. */
export function needsLiveData(userText: string): boolean {
  const t = userText.trim();
  if (t.length < 3) return false;
  if (PAST_ANCHOR.test(t)) return false; // a dated/historical ask is settled, not live
  // A public event on a specific (non-past) date — this Saturday's games, the match on July 19 —
  // is a shifting schedule an encyclopedia can't be trusted for, so it routes to real-time (or the
  // "turn on Real-time search" nudge when search is off) rather than a confident stale answer.
  return LIVE_HINTS.test(t) || EVENT_DATE_HINT.test(t);
}

// Conversational scaffolding we strip before handing a question to a keyword search engine:
// a leading "what is / how does / tell me about …" opener and a trailing "…, and how has it
// changed recently / right now / today" clause. Without this, the raw sentence is sent verbatim
// and the engine's full-text match drifts onto noise words (it once returned "Charlie Kirk" for
// "current population of Tokyo"). Stripping to the core entity makes the top hits relevant.
const LEAD_SCAFFOLD =
  /^(?:what(?:'s| is| are| was| were)?|who(?:'s| is| are| was| were)?|when (?:is|was|did|will)|where (?:is|are|was)|how (?:much|many|do|does|did|has|have)|tell me about|give me|show me|can you (?:tell me|show me)?|could you|please|i want to know|do you know)\s+/i;
const TRAIL_SCAFFOLD =
  /[,;]?\s*(?:and how (?:has|have|did|does) .+|right now|at the moment|currently|today|recently|these days|this (?:week|month|year)|so far)\s*$/i;

/** Reduce a conversational question to a tight keyword query for a full-text search engine.
 *  Strips question openers and trailing time clauses, drops the trailing "?", and caps the
 *  length — so the search matches the SUBJECT, not the sentence. Falls back to the original
 *  text if stripping would empty it. Never throws. */
export function searchQuery(userText: string): string {
  const cleaned = userText
    .trim()
    .replace(/[?!.]+$/, '')
    .replace(LEAD_SCAFFOLD, '')
    .replace(TRAIL_SCAFFOLD, '')
    .replace(/\s+/g, ' ')
    .trim();
  const q = cleaned.length >= 3 ? cleaned : userText.trim();
  return q.length > 96 ? q.slice(0, 96).trim() : q;
}

// A number followed by a result-ish noun ("10 sources", "12 articles", "8 results"), or a
// leading "top N" — the explicit counts a user gives when they want more than the default few.
const COUNT_NOUN =
  /\b(\d{1,3})\s+(?:results?|sources?|articles?|links?|headlines?|items?|examples?|options?|ideas?|entries?|citations?|references?)\b/i;
const TOP_N = /\btop\s+(\d{1,3})\b/i;

/** Pull an explicit result count out of the question ("give me 10 sources", "top 20") so a
 *  search can honor it instead of a fixed default. Returns undefined when no count is named. */
export function requestedResultCount(userText: string): number | undefined {
  const m = userText.match(COUNT_NOUN) ?? userText.match(TOP_N);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

export type { SearchProvider, SearchResult, SearchProviderId } from './types';
