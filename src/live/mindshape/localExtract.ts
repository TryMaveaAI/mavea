// localExtract.ts — zero-latency provisional atom extraction from a raw STT transcript.
// Pure, synchronous, no API calls — runs on every interim transcript update (<500ms).
// Heuristics only; the model refine pass promotes forming→stable and catches the rest.
// Every atom carries a real `quote` span; validate.ts drops any without one.
import type { MindAtom, MindAtomKind } from './types';

const LABEL_MAX = 80; // a short summarizing phrase/sentence (matches the model's label budget)
const QUOTE_MAX = 120;

function clamp(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Drop the trailing word of an INTERIM (still-being-spoken) transcript — the word currently coming
 * through the STT, which is often only half-heard ("India" still arriving as "Ind"). Feeding that
 * half-word to the live tagging (the ghost glimpses, the mind-map preview) makes a small model riff
 * on a truncated token — "tell me about Ind" became a card titled "The Essence of IND". The COMPLETED
 * utterance is always used whole (it's final); this only guards the live, mid-speech partial. A partial
 * that already ends on a word boundary (trailing space / sentence punctuation) is returned unchanged.
 */
export function completeWordsOnly(partial: string): string {
  if (!partial) return '';
  // ends on a boundary → the last word is finished, nothing in progress
  if (/[\s.!?,;:]$/.test(partial)) return partial.trim();
  const trimmed = partial.trimEnd();
  // a single in-progress word with no boundary yet → nothing complete to show
  if (!/\s/.test(trimmed)) return '';
  return trimmed.replace(/\S+$/, '').trim();
}

/** Light clause segmentation for raw STT text (punctuation not guaranteed).
 *  Splits on explicit punctuation first, then common discourse pivot words
 *  that typically start a new clause in spoken English. */
function segmentText(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, '$1\x00')
    .replace(
      /\s+(?=\b(?:but |and i |and she |and he |and they |and dad|and mom|and my |so i |so she |so he |honestly |actually |i keep |i also |i've |i just |the thing is |i mean |i don't know)\b)/gi,
      '\x00',
    )
    .split('\x00')
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

/** Take the clause itself as the quote, capped at QUOTE_MAX. */
function quoteFor(clause: string): string {
  return clamp(clause.trim(), QUOTE_MAX);
}

/** Strip leading filler words and capitalize the result for a rough label. */
function labelFrom(clause: string): string {
  const stripped = clause.replace(
    /^(?:okay|so|like|i mean|well|um|uh|you know|honestly|actually|look|i just|and|but|i think|i guess|i suppose|you see)\s+/gi,
    '',
  );
  const cap = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return clamp(cap, LABEL_MAX);
}

// Family/relationship titles used as proper names (e.g. "Dad's not getting any younger").
const FAMILY_TITLE =
  /\b(Dad|Mom|Mum|Papa|Mama|Grandpa|Grandma|Grandad|Nan|Nana|Uncle|Auntie)\b(?:'s)?/;

// Relationship words indicating a person is mentioned ("my partner", "my boss", etc.).
const RELATIONSHIP_WORD =
  /\b(?:my|his|her|their|our)\s+(dad|father|mom|mother|sister|brother|son|daughter|wife|husband|partner|friend|boss|manager|co-?founder|colleague|mentor|coach|therapist|doctor|lawyer|ex)\b/i;

// Named person: proper-noun starting a clause + action verb immediately after.
const NAMED_PERSON =
  /\b([A-Z][a-z]{2,12})(?:'s)?\s+(?:just|started|always|keeps?|is|was|has|have|said|told|wants?|needs?|feels?|thinks?|loves?|hates?|came|went|left|got|has|moved|called|texted)\b/;

// Months, city names, and other common non-person proper nouns to exclude.
const NON_PERSON_WORDS = new Set([
  'March',
  'January',
  'February',
  'April',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'Seattle',
  'Austin',
  'Portland',
  'Chicago',
  'Boston',
  'Denver',
  'Atlanta',
  'New',
  'York',
  'Los',
  'San',
  'Las',
]);

const OPTION_PATTERN =
  /\b(?:should i|whether to|thinking about|considering|one option|maybe i should|alternatively|or i could|or i might|could (?:also )?(?:go|stay|take|move|leave|try|do|join|accept|turn)|(?:an?|this|that|the)\s+offer|an? (?:opportunity|position|role|deal)|option (?:is|would be))\b/i;

const FEAR_PATTERN =
  /\b(?:scared|afraid|fear|worried about|anxious|terrified|dreading|dread|what if|might fail|not (?:going to )?work|won'?t work|going wrong|could go wrong|nervous|i'?m (?:just |really )?scared|i'?m worried)\b/i;

const CONSTRAINT_PATTERN =
  /\b(?:can'?t|cannot|have to|has to|must|deadline|budget|mortgage|my lease|loan|runway|no choice|tied (?:to|down)|stuck|limited|only (?:have|got) (?:\w+ )?\d|only \d+ months?|no time|no money|not (?:enough|possible)|running out)\b/i;

const OPEN_LOOP_PATTERN =
  /(?:\?)|(?:\b(?:i don'?t know|not sure|can'?t decide|i keep going back and forth|i keep (?:asking|wondering|second.?guessing)|haven'?t decided|still figuring|up in the air|i wonder|no idea|is it even|is it the right|is this (?:the right|a|even)|what (?:do|should) i)\b)/i;

const WANT_PATTERN =
  /\b(?:i (?:really )?want|i wish|i hope|would (?:really )?love|i'?ve always wanted|would like|i dream|my goal|i aspire|i'?m looking for|i need (?:to )?(?:feel|be|have|find|do)|i want to (?:feel|be|have|find|do))\b/i;

/** Extract provisional atoms from a raw transcript. Returns forming atoms — the model
 *  promotes them to stable and adds what heuristics miss. */
export function localExtract(transcript: string): MindAtom[] {
  const segs = segmentText(transcript);
  const atoms: MindAtom[] = [];
  const seenLabels = new Set<string>(); // dedup by normalized label

  let personIdx = 0;
  let optionIdx = 0;
  let fearIdx = 0;
  let constraintIdx = 0;
  let loopIdx = 0;
  let wantIdx = 0;

  function push(id: string, kind: MindAtomKind, rawLabel: string, clause: string): void {
    const lbl = typeof rawLabel === 'string' ? clamp(rawLabel, LABEL_MAX) : labelFrom(clause);
    const key = `${kind}:${lbl.toLowerCase().slice(0, 20)}`;
    if (seenLabels.has(key)) return;
    seenLabels.add(key);
    const q = quoteFor(clause);
    if (!q) return;
    atoms.push({
      id,
      kind,
      label: lbl,
      quote: q,
      status: 'forming',
      confidence: 'said',
      weight: 1,
    });
  }

  for (const seg of segs) {
    // ── Persons ──────────────────────────────────────────────────────────────
    const relMatch = seg.match(RELATIONSHIP_WORD);
    if (relMatch) {
      const word = relMatch[1];
      const name = word.charAt(0).toUpperCase() + word.slice(1);
      push(`per_${personIdx++}`, 'person', name, seg);
    }

    const familyMatch = seg.match(FAMILY_TITLE);
    if (familyMatch && !relMatch) {
      push(`per_${personIdx++}`, 'person', familyMatch[1], seg);
    }

    const namedMatch = seg.match(NAMED_PERSON);
    if (namedMatch) {
      const name = namedMatch[1];
      if (!NON_PERSON_WORDS.has(name)) {
        push(`per_${personIdx++}`, 'person', name, seg);
      }
    }

    // ── Options ───────────────────────────────────────────────────────────────
    if (OPTION_PATTERN.test(seg)) {
      push(`opt_${optionIdx++}`, 'option', labelFrom(seg), seg);
    }

    // ── Fears ────────────────────────────────────────────────────────────────
    if (FEAR_PATTERN.test(seg)) {
      push(`fea_${fearIdx++}`, 'fear', labelFrom(seg), seg);
    }

    // ── Constraints ──────────────────────────────────────────────────────────
    if (CONSTRAINT_PATTERN.test(seg)) {
      push(`con_${constraintIdx++}`, 'constraint', labelFrom(seg), seg);
    }

    // ── Open loops ───────────────────────────────────────────────────────────
    if (OPEN_LOOP_PATTERN.test(seg)) {
      push(`loo_${loopIdx++}`, 'open_loop', labelFrom(seg), seg);
    }

    // ── Wants ────────────────────────────────────────────────────────────────
    if (WANT_PATTERN.test(seg)) {
      push(`wan_${wantIdx++}`, 'want', labelFrom(seg), seg);
    }
  }

  return atoms;
}

// ── Transcript shape heuristics (used to drive the live map, not to extract atoms) ────────────

/** How many distinct thoughts a stretch of speech holds. One long utterance often carries several
 *  ("I want to learn this but I'm worried it's abstract and I also need a plan"), so counting VAD
 *  segments under-reports — we segment the words into clauses instead. Floors at 1 for real speech. */
export function countThoughts(transcript: string): number {
  const segs = segmentText(transcript);
  if (segs.length > 0) return segs.length;
  return transcript.trim() ? 1 : 0;
}

// A crisp question opener — these usually want a direct answer, not a thinking map.
const QUESTION_LEAD =
  /^(?:what(?:'s|s)?|how|why|who|when|where|which|whose|is|are|am|can|could|do|does|did|should|would|will|may|might)\b/i;

const RAMBLE_MIN_WORDS = 14; // a longer single-thought utterance still reads as thinking aloud

/** Does this utterance read as thinking aloud (worth opening the live map) rather than a quick
 *  question to answer directly? Several thoughts in one breath always maps; a single-clause
 *  question — however long — is still a question and answers directly; otherwise a longer
 *  exploratory utterance maps. Heuristic and intentionally easy to tune. */
export function looksLikeThinkingAloud(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (countThoughts(t) >= 2) return true; // genuine multi-thought ramble always maps
  const isQuestion = QUESTION_LEAD.test(t) || t.endsWith('?');
  if (isQuestion) return false; // a single-thought question (any length) → answer it directly
  return t.split(/\s+/).length >= RAMBLE_MIN_WORDS;
}
