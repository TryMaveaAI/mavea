// Neighborhoods — the atlas's clustering. When a conversation carries a model-provided
// topic (e.g. "Finance", "Biology") those are used directly as neighborhood names; records
// pre-dating the topic field fall back to keyword extraction. Both paths produce the same
// Neighborhood shape, so the map treats them identically.
import { CHAPTER_PALETTE } from '../scrubber/chapters';
import type { AtlasRecord } from './store';

export interface Neighborhood {
  id: string;
  /** Semantic topic name, uppercased — either from the model or the members' dominant word. */
  name: string;
  color: string;
  /** Newest first, same order the records arrived in. */
  records: AtlasRecord[];
}

/** Words that carry no subject: question scaffolding, fillers, and the verbs every ask uses.
 *  The third line is generic logistics/format vocabulary — "travel", "guide", "comparison" —
 *  that appears across wholly unrelated topics. Left in, a single shared filler like "travel"
 *  would bond a Lisbon trip to a Boston trip to a question about bird flight, producing an
 *  over-broad neighborhood named after whichever real word happened to recur most. Treating
 *  them as stopwords means only genuine subject words can form (and name) a neighborhood. */
const STOPWORDS = new Set(
  (
    'a about an and are as at be but by can could did do does for from get got had has have how i if in into is it its just like make makes me my of on or our out over should so than that the their them then there these they this to up us using vs was we what when where which who why will with would you your ' +
    'show tell give explain help plan build need want know think really actually basically thing things way ways lot bit versus more most less few new old big small good bad best worst right wrong top ' +
    'travel trip trips logistics comparison comparisons compare guide guides tips itinerary booking ticket tickets flight flights fare fares route routes commute transit directions'
  ).split(' '),
);

/** The record's salient vocabulary — title words first (the answer's own subject), then the ask's. */
export function salientTerms(record: Pick<AtlasRecord, 'title' | 'question'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of [record.title, record.question]) {
    for (const raw of source.toLowerCase().split(/[^a-z0-9$%]+/)) {
      const w = raw.trim();
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      if (!seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    }
  }
  return out;
}

interface Working {
  records: AtlasRecord[];
  /** term → how many members carry it; used for name resolution and trail placement. */
  terms: Map<string, number>;
  /** Set when the cluster was seeded by an LLM-provided topic; overrides the dominant-term name. */
  topicName?: string;
}

function overlap(terms: string[], cluster: Working): number {
  let n = 0;
  for (const t of terms) if (cluster.terms.has(t)) n += 1;
  return n;
}

function bumpTerms(counts: Map<string, number>, terms: readonly string[]): void {
  for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
}

function dominantTerm(cluster: Working): string {
  let best = '';
  let bestN = 0;
  for (const [term, n] of cluster.terms) {
    if (n > bestN || (n === bestN && term < best)) {
      best = term;
      bestN = n;
    }
  }
  return best;
}

function fallbackName(r: Pick<AtlasRecord, 'title' | 'question'>): string {
  const first = (r.title || r.question).trim().split(/\s+/)[0];
  return (first || 'moment').toLowerCase();
}

/**
 * Cluster records into neighborhoods. Records with a model-provided `topic` are grouped
 * directly by that topic (no keyword work needed — the model already did the semantics).
 * Legacy records without a topic fall back to the old greedy keyword clustering.
 */
export function clusterRecords(records: readonly AtlasRecord[]): Neighborhood[] {
  // Phase 1: group records that carry a model topic
  const topicMap = new Map<string, Working>();
  const orphans: AtlasRecord[] = [];

  for (const r of records) {
    const t = r.topic?.trim();
    if (t) {
      const key = t.toLowerCase();
      let c = topicMap.get(key);
      if (!c) {
        c = { records: [], terms: new Map(), topicName: t };
        topicMap.set(key, c);
      }
      c.records.push(r);
      bumpTerms(c.terms, salientTerms(r));
    } else {
      orphans.push(r);
    }
  }

  // Phase 2: keyword-cluster legacy records (no topic field)
  const legacyClusters = keywordCluster(orphans);

  // Merge and sort largest-first so the palette's boldest colors go to the busiest neighborhoods.
  const allClusters: Working[] = [...topicMap.values(), ...legacyClusters];
  allClusters.sort((a, b) => b.records.length - a.records.length);

  return allClusters.map((c, i) => {
    const rawName = c.topicName ?? dominantTerm(c) ?? fallbackName(c.records[0]);
    return {
      id: 'hood-' + rawName.toLowerCase().replace(/\s+/g, '-'),
      name: rawName.toUpperCase(),
      color: CHAPTER_PALETTE[i % CHAPTER_PALETTE.length],
      records: c.records,
    };
  });
}

/** Greedy single-pass keyword clustering for legacy records that pre-date the topic field. */
function keywordCluster(records: readonly AtlasRecord[]): Working[] {
  const clusters: Working[] = [];
  for (const r of records) {
    const terms = salientTerms(r);
    let best: Working | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      const score = overlap(terms, c);
      if (
        score > bestScore ||
        (score === bestScore && score > 0 && best && c.records.length > best.records.length)
      ) {
        best = c;
        bestScore = score;
      }
    }
    if (best && bestScore > 0) {
      best.records.push(r);
      bumpTerms(best.terms, terms);
    } else {
      const fresh: Working = { records: [r], terms: new Map() };
      bumpTerms(fresh.terms, terms.length ? terms : [fallbackName(r)]);
      clusters.push(fresh);
    }
  }
  return clusters;
}

/** How many of a neighborhood's records carry each salient term — the tally a chapter is scored
 *  against below. Counted from the records here rather than carried over from clustering, whose own
 *  tally also holds a stand-in name for any record with no salient vocabulary at all. Kept weakly
 *  against the neighborhood, which is rebuilt from scratch whenever the records change. */
const hoodTerms = new WeakMap<Neighborhood, Map<string, number>>();

function termCounts(hood: Neighborhood): Map<string, number> {
  let counts = hoodTerms.get(hood);
  if (!counts) {
    counts = new Map();
    for (const r of hood.records) bumpTerms(counts, salientTerms(r));
    hoodTerms.set(hood, counts);
  }
  return counts;
}

/** Where a piece of tonight's session belongs on the map — the neighborhood sharing its
 *  vocabulary, or none (tonight opened somewhere genuinely new). A neighborhood's score is how many
 *  of its records each shared term appears in, summed. */
export function placeText(text: string, hoods: readonly Neighborhood[]): number {
  const terms = salientTerms({ title: text, question: '' });
  let best = -1;
  let bestScore = 0;
  hoods.forEach((h, i) => {
    const counts = termCounts(h);
    let score = 0;
    for (const t of terms) score += counts.get(t) ?? 0;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}
