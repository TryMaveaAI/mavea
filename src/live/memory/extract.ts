// extract.ts — a conservative, zero-cost heuristic that captures durable facts the user
// states about THEMSELVES, straight from their own words. It's the reliable fallback to the
// model's in-turn `memory` field: frontier models surface facts well, but small/local models
// often don't, so without this, memory silently does nothing on a local setup.
//
// HONESTY: this reads only the user's LITERAL statement and lightly rewrites the first-person
// opener to a short third-person note — it never invents. It is deliberately conservative:
// it fires only on clear "I'm / I have / I like / I work / my X is" self-statements and
// returns [] for everything else (questions, commands, small talk), to avoid noise. Whatever
// it captures is tagged 'inferred' and is editable/deletable by the user.

/** First-person verbs → their third-person form (so we don't mis-conjugate, e.g. study→studies). */
const VERB_3P: Record<string, string> = {
  like: 'Likes',
  love: 'Loves',
  prefer: 'Prefers',
  enjoy: 'Enjoys',
  hate: 'Hates',
  dislike: 'Dislikes',
  need: 'Needs',
  want: 'Wants',
  own: 'Owns',
  use: 'Uses',
  drive: 'Drives',
  play: 'Plays',
  speak: 'Speaks',
  work: 'Works',
  live: 'Lives',
  study: 'Studies',
  train: 'Trains',
  teach: 'Teaches',
  code: 'Codes',
  run: 'Runs',
  cook: 'Cooks',
  travel: 'Travels',
};

const MAX_FACTS = 3;
const MIN_TAIL = 3;
const MAX_LEN = 140;

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Turn one first-person clause into a short third-person fact, or '' if it isn't a clear
 *  durable self-statement. Tail casing is preserved from the original (so "November" stays). */
function factFromClause(clause: string): string {
  const c = clause.trim().replace(/\s+/g, ' ');
  if (!c || c.length > MAX_LEN || c.includes('?')) return '';
  const lower = c.toLowerCase();

  let m: RegExpMatchArray | null;
  // "I'm a teacher" / "I am an engineer" → "Is a teacher"
  if ((m = c.match(/^i(?:'m| am)\s+(an?\s+.+)/i))) return capTail(`Is ${m[1]}`);
  // "I'm vegetarian" / "I am running a marathon in November" → "Vegetarian" / "Running …"
  if ((m = c.match(/^i(?:'m| am)\s+(.+)/i))) return capTail(m[1]);
  // "I have a cat" / "I've got two kids" → "Has a cat"
  if ((m = c.match(/^i(?:'ve| have)\s+(?:got\s+)?(.+)/i))) return capTail(`Has ${m[1]}`);
  // "my name is Alex" / "my goal is to run a marathon" → "Name is Alex"
  if ((m = c.match(/^my\s+(.+?)\s+(is|are)\s+(.+)/i))) return capTail(`${m[1]} ${m[2]} ${m[3]}`);
  // "I prefer trains" / "I work as a nurse" → "Prefers trains" / "Works as a nurse"
  if ((m = lower.match(/^i\s+(\w+)\s+(.+)/))) {
    const three = VERB_3P[m[1]];
    if (three) {
      // re-slice the tail from the ORIGINAL clause to keep its casing
      const tail = c.slice(c.toLowerCase().indexOf(m[2]));
      return capTail(`${three} ${tail}`);
    }
  }
  return '';
}

function capTail(fact: string): string {
  const f = cap(fact.trim().replace(/\s+/g, ' '));
  // Drop a trivial tail like "Is ok" / a stub — require some substance after the verb.
  return f.length >= MIN_TAIL + 3 && f.length <= MAX_LEN ? f : '';
}

/**
 * Extract durable user facts from a message, as a fallback to the model's own memory field.
 * Conservative by design — returns [] unless the user clearly stated something lasting about
 * themselves. Never invents; only rewrites the user's own words to a short third-person note.
 */
export function extractUserFacts(userText: string): string[] {
  if (!userText) return [];
  const clauses = userText.split(/[.!?\n]+|,?\s+\band\b\s+/i);
  const out: string[] = [];
  for (const clause of clauses) {
    const fact = factFromClause(clause);
    if (fact && !out.includes(fact)) out.push(fact);
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}
