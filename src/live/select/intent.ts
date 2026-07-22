// intent.ts — classify WHAT KIND of answer an ask wants, beyond its data shape.
//
// shapes.ts asks "what will the data look like"; this asks "what is the user trying to DO" —
// decide, plan, weigh a risk, troubleshoot, learn, reflect — and how heavy the stakes are.
// Those signals pick the story arc (see ../story/arcs) and let the canvas dial novelty and
// playfulness DOWN for weighty topics. Same spirit as shapes.ts / complexity.ts: a small,
// word-bounded, zero-dep ruleset that never throws and is identical on every model. Generous
// (an ask can carry several signals) and conservative (no match → all false / no domain, and
// the caller falls back to a neutral arc rather than over-fitting a guess).
import type { ChatMessage } from '../providers/types';

export type IntentDomain =
  | 'career'
  | 'money'
  | 'health'
  | 'legal'
  | 'relationship'
  | 'tech'
  | 'travel'
  | 'learning';

export interface IntentSignals {
  /** weighing a choice — "should I", "is it worth", "which is better" */
  decision: boolean;
  /** an explicit head-to-head — "vs", "compare", "pros and cons" */
  comparison: boolean;
  /** the downside — risk, danger, what could go wrong */
  risk: boolean;
  /** reaching a goal over time — a plan, roadmap, schedule */
  planning: boolean;
  /** something is broken — debug, fix, why isn't it working */
  troubleshoot: boolean;
  /** understanding a concept — explain, how does X work, teach me */
  learning: boolean;
  /** generating ideas — brainstorm, names, imagine */
  creative: boolean;
  /** projecting alternate timelines — "what if", "what happens if", stay-or-go forks */
  whatIf: boolean;
  /** a personal / emotional question — feelings, a relationship, a life choice */
  reflection: boolean;
  /** high stakes — a money/health/legal/life decision that's hard to reverse */
  highStakes: boolean;
  /** emotionally weighty or sensitive — handle with care, never gamify */
  serious: boolean;
  /** the topic area, when one is clear (drives safety + tone) */
  domain?: IntentDomain;
}

interface Rule {
  key: keyof IntentSignals;
  test: RegExp;
}

// Each matching rule flips one boolean signal. Word-bounded so a substring can't trip a rule.
const RULES: Rule[] = [
  {
    key: 'decision',
    test: /\b(should i|should we|worth it|is it worth|which (?:one|should|is better)|do i (?:need|have to)|ought i|better to|or should i)\b/,
  },
  {
    key: 'comparison',
    test: /\b(vs\.?|versus|compare\w*|comparison|pros and cons|trade-?offs?|better than|which is better)\b/,
  },
  {
    key: 'risk',
    test: /\b(risk\w*|danger\w*|downside|what could go wrong|threat\w*|is it safe|safe to|consequenc\w*|backfire|red flags?|pitfalls?)\b/,
  },
  {
    key: 'planning',
    test: /\b(roadmap|schedule|timeline|milestone\w*|strateg\w*|prepare for|get ready|launch|plan (?:to|for|a|my|out)|over the next \d+|in \d+ (?:weeks?|months?|days?))\b/,
  },
  {
    key: 'troubleshoot',
    test: /\b(troubleshoot|debug|not working|isn'?t working|won'?t \w+|broken|\berror\b|\bbug\b|fix\b|stopped working|fail(?:s|ing|ed)?|why (?:is|does|won'?t|isn'?t|can'?t))\b/,
  },
  {
    key: 'learning',
    test: /\b(explain|how does|how do .* work|what is|what are|teach me|help me understand|learn\b|tell me about|why does|the difference between|concept of|crash course|walk me through|for (?:my|an?|the|our) (?:\w+ )?(?:interview|exam|test|midterm|final)|study for)\b/,
  },
  {
    key: 'creative',
    test: /\b(brainstorm|ideas? for|come up with|imagine|invent|design a|creative|name (?:my|a|some|ideas)|suggest (?:some )?\w+ (?:names|ideas))\b/,
  },
  {
    key: 'whatIf',
    test: /\b(what (?:if|happens if|would happen)|if i (?:do|don'?t|take|stay|leave|wait)|either way|both (?:paths|options|ways)|play(?:ed)? out|scenario\w*|down the road|in (?:each|both) cases?|stay or (?:go|leave|take)|futures?\b)\b/,
  },
  {
    key: 'reflection',
    test: /\b(my (?:friend|partner|relationship|boyfriend|girlfriend|marriage|spouse|boss|family|mom|dad|kid)|feel(?:ing)?\b|emotionally|am i (?:wrong|right|overreacting|the problem)|should i feel|drain(?:s|ing|ed)?|toxic|healthy (?:relationship|friendship)|cope\b|burn(?:t|ed)?\s?out|overwhelm\w*|anxious|lonely)\b/,
  },
  {
    key: 'highStakes',
    test: /\b(quit (?:my|the|this) (?:job|career)|get married|getting married|divorce|buy a (?:house|home)|mortgage|life savings|career change|drop out|move (?:abroad|across|countr|to another)|surgery|diagnos\w*|lawsuit|\bsue\b|custody|life-?changing)\b/,
  },
  {
    key: 'serious',
    test: /\b(grief|grieving|death|dying|depress\w*|suicid\w*|self-?harm|abuse|trauma|addiction|crisis|terminal|miscarriage)\b/,
  },
];

// Topic area — first match in priority order wins. Drives safety + tone, not the arc directly.
const DOMAIN_RULES: { domain: IntentDomain; test: RegExp }[] = [
  {
    domain: 'health',
    test: /\b(health\w*|symptom\w*|doctor|medic\w*|diagnos\w*|disease|surgery|mental health|therap\w*|depress\w*|anxiety)\b/,
  },
  {
    domain: 'legal',
    test: /\b(legal|lawyer|attorney|lawsuit|\bsue\b|court|custody|rights\b|contract\b)\b/,
  },
  {
    domain: 'money',
    test: /\b(money|budget|invest\w*|savings|\bdebt\b|loan|mortgage|finance\w*|retire\w*|taxe?s?\b|salary)\b/,
  },
  {
    domain: 'career',
    test: /\b(job\b|career|\bwork\b|boss|promotion|freelanc\w*|resume|interview|fired|laid off|quit)\b/,
  },
  {
    domain: 'relationship',
    test: /\b(relationship|friend\w*|partner|boyfriend|girlfriend|marriage|spouse|dating|breakup|family)\b/,
  },
  {
    domain: 'travel',
    test: /\b(travel|trip|vacation|flight|hotel|itinerary|destination|visit\b)\b/,
  },
  {
    domain: 'tech',
    test: /\b(code|coding|software|\bapp\b|\bapi\b|database|server|deploy|programming|website|algorithm)\b/,
  },
  {
    domain: 'learning',
    test: /\b(study|course|exam|tutorial|homework|\bclass\b|lesson|curriculum)\b/,
  },
];

function priorUserText(history?: ChatMessage[]): string {
  if (!history) return '';
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return '';
}

/**
 * Classify the user's intent. Returns all-false / no-domain when nothing matches — the signal
 * for the caller to use a neutral arc rather than over-fit. `serious` is treated as a superset:
 * any high-stakes ask is also serious (the canvas should never gamify it).
 */
export function analyzeIntent(userText: string, history?: ChatMessage[]): IntentSignals {
  const text = userText.toLowerCase();
  const prior = priorUserText(history).toLowerCase();
  const hay = prior ? `${text} ${prior}` : text;

  const out: IntentSignals = {
    decision: false,
    comparison: false,
    risk: false,
    planning: false,
    troubleshoot: false,
    learning: false,
    creative: false,
    whatIf: false,
    reflection: false,
    highStakes: false,
    serious: false,
  };

  for (const rule of RULES) {
    if (rule.test.test(hay)) (out[rule.key] as boolean) = true;
  }
  // A high-stakes or personal ask is, by definition, one to handle with care.
  if (out.highStakes || out.reflection) out.serious = true;

  for (const d of DOMAIN_RULES) {
    if (d.test.test(hay)) {
      out.domain = d.domain;
      break;
    }
  }

  return out;
}

/**
 * Map the detected intent signals onto the component-intent vocabulary that `ComponentMeta.intents`
 * uses ('decide' | 'compare' | 'plan' | 'explain' | 'comfort' | 'reflect' | 'howto' | 'draft' |
 * 'reference' | 'quantify' …). This is the join the selector was missing: shape detection answers
 * "what will the data look like", but a vague-but-purposeful ask ("is this friendship draining?",
 * "should I take the job?") often trips NO shape while clearly carrying an intent — so without this
 * the selector falls back to a random draw even though we know the user's NEED. Returning the
 * matching intent tokens lets rank.ts boost components built for that need. Empty when the ask
 * carries no clear intent (a truly open "surprise me" stays fully varied).
 */
export function intentTokens(s: IntentSignals): string[] {
  const out = new Set<string>();
  if (s.decision) out.add('decide');
  if (s.comparison) {
    out.add('compare');
    out.add('decide');
  }
  if (s.risk) out.add('decide');
  if (s.planning) {
    out.add('plan');
    out.add('howto');
  }
  if (s.troubleshoot) {
    out.add('howto');
    out.add('explain');
  }
  if (s.learning) {
    out.add('explain');
    out.add('reference');
  }
  if (s.creative) out.add('draft');
  if (s.whatIf) out.add('decide');
  if (s.reflection) {
    out.add('reflect');
    out.add('comfort');
  }
  return [...out];
}
