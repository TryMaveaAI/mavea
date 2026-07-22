// complexity.ts — how much canvas an ask deserves.
//
// The demos feel rich because every scripted answer is a full, varied spread; a real
// Live answer should feel the same — EXCEPT when the question is genuinely trivial
// ("what is 1+1"), where a wall of charts would be absurd. So we classify the ask into
// three buckets and let the rest of the pipeline scale to it:
//   - 'rich'  — the DEFAULT. Substantive, broad, or exploratory ("tell me about New
//               Jersey", "how does X work", anything with a data shape). Fill the screen
//               with many varied, advanced components, like a hand-built demo.
//   - 'lean'  — a genuinely trivial fact / arithmetic / definition. A couple of focused
//               blocks, no padding.
//   - 'brief' — the user EXPLICITLY asked for a short answer ("just tell me", "in one line",
//               "tl;dr", "briefly"). A tight 1-3 block reply, even for a substantive topic —
//               honoring the brevity they asked for beats a forced dashboard.
//
// Deliberately conservative: only an UNAMBIGUOUSLY trivial ask is 'lean' and only an EXPLICIT
// brevity cue is 'brief'; everything else (and anything uncertain) is 'rich', because the
// product's whole point is the rich answer. Same spirit as detectShapes — a small, word-bounded,
// zero-dep ruleset that never throws and is identical on every model.

export type AskComplexity = 'brief' | 'lean' | 'rich';

// Explicit BREVITY cues — the user wants a SHORT answer regardless of how broad the topic is
// ("briefly, how does inflation work?"). These beat a breadth framing but NOT the trivial
// patterns: a bare fact stays 'lean', which is already the tightest, most precise path. Kept to
// unambiguous "keep it short" phrasings so a substantive ask isn't wrongly truncated.
// NOTE: a bare speed word ("quickly", "fast") is deliberately NOT here — it means the user is in
// a HURRY to learn, not that they want one line. "teach me X quickly" must stay a full answer.
// Only an explicit make-it-short phrasing ("quick answer", "short version", "tl;dr") trims it.
const BRIEF =
  /\b(just (?:tell me|give me|the answer)|in one line|one[- ]liner|in a (?:sentence|word|line)|in a few words|brief(?:ly)?|tl;?dr|short (?:version|answer)|keep it (?:short|brief)|quick (?:answer|version|recap|rundown|summary)|in short|the short version|bottom line|in a nutshell|the gist)\b/;

// A breadth/exploration cue ALWAYS wins → 'rich', even if a trivial word also appears
// ("explain how to calculate compound interest" is a rich explainer, not arithmetic).
const BREADTH =
  /\b(tell me about|explain|overview|how (?:do|does|to|can|is|are|did|would|should)|why|guide|walk\s?(?:me\s)?through|break\s?down|breakdown|deep\s?dive|everything|compare|comparison|versus|vs\.?|pros and cons|plan|itinerary|roadmap|review|analy[sz]e|dashboard|trends?|history of|all about|summary of)\b/;

// A TEACHING / LEARNING framing always deserves a full canvas — a learner needs the whole picture,
// never a tiny one. Broader than BREADTH (catches "teach me X", "crash course", "for my interview")
// and, unlike a plain breadth cue, it survives a time-pressure word: "teach me X quickly" means
// "get me up to speed FAST", not "one line". Only an EXPLICIT make-it-short cue (BRIEF) still trims
// a teaching ask. Word-bounded so non-teaching words ("teachers union news") don't trip it.
const TEACHING =
  /\b(teach (?:me|us)|help me (?:understand|learn|grasp|wrap my head around)|walk me through|crash course|get (?:me |us )?up to speed|bring me up to speed|from scratch|(?:the )?(?:basics|fundamentals|essentials|core concepts|key concepts) of|study (?:for|guide|plan)|prep(?:are)? (?:me |us )?for (?:my |an? |the |our )?(?:\w+ )?(?:interview|exam|test|quiz|midterm|final|cert\w*)|(?:interview|exam) prep|tutorial|lesson on|learn (?:about |how )?[a-z]+)\b/;

// Unambiguously trivial asks → 'lean'. Each pattern is a single-fact / single-number ask.
const TRIVIAL: RegExp[] = [
  /^[\s\d().,+\-*/^%×÷=]+\??$/, //                         bare arithmetic: "1+1", "2 * (3+4)"
  /\bwhat(?:'s| is| are| was)?\s*[\d().,\s+\-*/^%×÷]+\s*\??$/, // "what is 12*9", "whats 5+5"
  /\b(calculate|compute|solve)\b/, //                      "calculate 15% of 200"
  /\b\d+(?:\.\d+)?\s*%\s*of\s+\d/, //                       "15% of 80"
  /\bconvert\b/, //                                        "convert 5 miles to km"
  /\bhow many\s+\w+\s+(?:in|are in|per)\b/, //              "how many cm in an inch"
  /\b\d+\s*[a-z]+\s+(?:in|to)\s+[a-z]+\b/, //               "5 miles in km", "32 f to c"
  /\b(define|definition of)\b/, //                         "define osmosis"
  /\bwhat does\s+.+\s+mean\b/, //                           "what does osmosis mean"
  /\bcapital of\b/, //                                     "capital of France"
];

/**
 * Classify how rich an answer's canvas should be. Returns 'rich' by default — only a
 * clearly trivial fact/arithmetic/definition (and not phrased as a broad explainer)
 * returns 'lean'. Never throws; empty input is treated as 'rich'.
 *
 * Order matters: a broad framing wins first, then the specific trivial patterns. (We do
 * NOT consult detectShapes here — its 'text' rule matches the bare "what is …" that opens
 * many trivial asks, which would wrongly force them rich.)
 */
export function classifyAsk(userText: string): AskComplexity {
  const text = userText.toLowerCase().trim();
  if (!text) return 'rich';
  const brief = BRIEF.test(text);
  // A teaching/learning framing wins before any breadth/trivial check: a learner gets the full
  // picture. It survives a time-pressure word but still yields to an EXPLICIT brevity cue
  // ("teach me X in one line" → brief).
  if (TEACHING.test(text)) return brief ? 'brief' : 'rich';
  // A broad/exploratory framing means the user wants depth — UNLESS they explicitly asked for
  // brevity. So "explain how to calculate compound interest" stays rich, but "briefly explain X"
  // (or "compare A and B, in short") becomes brief.
  if (BREADTH.test(text)) return brief ? 'brief' : 'rich';
  // No breadth cue. A trivial fact/arithmetic is lean even when phrased "briefly" — lean is already
  // the tightest, most precise path. An explicit brevity cue on a non-trivial ask → brief.
  if (TRIVIAL.some((re) => re.test(text))) return 'lean';
  if (brief) return 'brief';
  // Everything else (and anything uncertain) stays rich by default — the product's whole point.
  return 'rich';
}

/** True when the ask is a teaching/learning request that should land DEEP on the FIRST answer
 *  (so the user never has to follow up with "more in depth"). Shares the TEACHING ruleset with
 *  classifyAsk; the caller pairs this with 'rich' to drive a deeper block target + depth directive. */
export function isTeachingAsk(userText: string): boolean {
  return TEACHING.test(userText.toLowerCase());
}
