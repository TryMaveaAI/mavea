// grouping.ts — what "By topic" should actually do. A voice-first back-and-forth naturally produces
// several saved canvases about one subject (you ask, refine, ask again), and shelving them as a wall
// of near-identical cards makes the redundancy louder, not quieter. This clusters entries into
// threads by the real words of their title + ask — with the model's own `topic` as a gentle
// tie-breaker — and names each thread from the words its members share. Nothing is summarized or
// invented: a thread's name is always words the entries themselves used (or the model's topic, or a
// member's title). Pure and deterministic, like moments.ts — it reuses the Atlas's tested text
// primitives so the Library and the Atlas cluster by the same honest signal.
import type { LibraryEntry } from './store';
import { cosine, termVector } from '../atlas/similarity';
import { salientTerms } from '../atlas/neighborhoods';

/** A thread of related canvases the user can pick any one of back up. */
export interface TopicGroup {
  id: string;
  /** Human label for the thread: the shared subject words, else the model topic, else a title. */
  name: string;
  /** Members, newest first (the saved order is already newest-first). */
  entries: LibraryEntry[];
}

/** The model's 1–3 word `topic` is a hint, not the driver: weighted low so genuine shared subject
 *  WORDS form threads and the domain only nudges near-ties. A personal library wants tight threads
 *  ("your batting-average thread"), not broad domain buckets that bond every Finance question. */
const TOPIC_WEIGHT = 1;
/** Cosine above which an entry joins an existing thread. Set just above the value two canvases reach
 *  by sharing only the topic token (~0.33) so the domain alone never bonds them; a real same-subject
 *  overlap (shared subject words) sits well above it (~0.5+). Tuned in library-grouping.test.ts. */
const JOIN_THRESHOLD = 0.4;

interface Cluster {
  entries: LibraryEntry[];
  /** Summed term vectors of the members — the thread's centre of mass for the join test. */
  centroid: Map<string, number>;
  /** salient term → how many members carry it, so the name reflects the majority, not one outlier. */
  df: Map<string, number>;
  /** First-seen order of salient terms, so a two-word name reads in its natural order. */
  order: string[];
  /** salient term → the actual casing an entry used for it ("Tokyo", not the lowercased term
   *  "tokyo" salientTerms matches on), so a thread name quotes the entries verbatim — a proper
   *  noun keeps its capital instead of `sentence()` inventing a casing no entry ever wrote. */
  caseMap: Map<string, string>;
}

function absorb(c: Cluster, entry: LibraryEntry, vec: Map<string, number>, terms: string[]): void {
  c.entries.push(entry);
  for (const [term, w] of vec) c.centroid.set(term, (c.centroid.get(term) ?? 0) + w);
  const termSet = new Set(terms);
  for (const term of termSet) {
    if (!c.df.has(term)) c.order.push(term);
    c.df.set(term, (c.df.get(term) ?? 0) + 1);
  }
  for (const raw of [entry.title, entry.question].join(' ').split(/[^a-zA-Z0-9$%]+/)) {
    const w = raw.trim();
    if (!w) continue;
    const lower = w.toLowerCase();
    if (termSet.has(lower) && !c.caseMap.has(lower)) c.caseMap.set(lower, w);
  }
}

/** Newest save in a cluster — orders threads so the one you touched last leads ("pick up where you
 *  left off"). */
function freshest(c: Cluster): number {
  let max = 0;
  for (const e of c.entries) if (e.savedAt > max) max = e.savedAt;
  return max;
}

/** Capitalize the first letter only — a thread name reads as a calm label ("Batting average"), not
 *  a shout or Title Case. */
function sentence(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function nameFor(c: Cluster): string {
  const first = c.entries[0];
  if (c.entries.length === 1) return (first.title || first.question).trim();
  // Words the majority of members share — the thread's real subject, in first-seen order.
  const need = Math.max(2, Math.ceil(c.entries.length / 2));
  const shared = c.order.filter((term) => (c.df.get(term) ?? 0) >= need);
  if (shared.length) {
    const words = shared.slice(0, 2).map((term) => c.caseMap.get(term) ?? term);
    return sentence(words.join(' '));
  }
  // No common word (bonded only by the model topic) — name it by that topic, else the newest title.
  const topic = c.entries.find((e) => e.topic?.trim())?.topic?.trim();
  return topic ? sentence(topic) : (first.title || first.question).trim();
}

/**
 * Cluster entries (newest-first) into topic threads. Greedy single pass: each entry joins the
 * existing thread it's most similar to above {@link JOIN_THRESHOLD}, else opens a new one. Threads
 * come back freshest-first; members keep their newest-first order. Deterministic — same input, same
 * output — so the view never reshuffles between renders.
 */
export function groupByTopic(entries: readonly LibraryEntry[]): TopicGroup[] {
  const clusters: Cluster[] = [];
  for (const e of entries) {
    const terms = salientTerms(e);
    const vec = termVector(terms, e.topic, TOPIC_WEIGHT);
    let best: Cluster | null = null;
    let bestScore = JOIN_THRESHOLD;
    for (const c of clusters) {
      const score = cosine(vec, c.centroid);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best) {
      absorb(best, e, vec, terms);
    } else {
      const fresh: Cluster = {
        entries: [],
        centroid: new Map(),
        df: new Map(),
        order: [],
        caseMap: new Map(),
      };
      absorb(fresh, e, vec, terms);
      clusters.push(fresh);
    }
  }
  clusters.sort((a, b) => freshest(b) - freshest(a));
  return clusters.map((c) => ({
    id: 'grp-' + c.entries[0].id,
    name: nameFor(c),
    entries: c.entries,
  }));
}
