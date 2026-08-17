// ground/evidence.ts — a grounding corpus that remembers WHERE each passage came from.
//
// A verbatim check proves the words are real. It does not prove which source they are real IN — and
// until this existed, the answer to that was whatever URL the model happened to write beside the
// quote. That is the one gap a quote gate cannot close by itself: legitimate text attached to the
// wrong provenance still reads as a receipt. So the corpus keeps each source's own excerpt, and a
// verified quote is attributed by WHERE IT MATCHED. The model proposes the words; Mavéa decides
// what they came from, and the two can never disagree.
import { normalizePdfText } from './verbatim';
import { hostOf } from './citation';

/** Where a passage came from. Every field here is Mavéa's own — never model-authored. */
export interface EvidenceSource {
  /** 'web' grounds at T2, 'file' at T1 — the same split why/corpus has always drawn. */
  kind: 'web' | 'file';
  title?: string;
  url?: string;
  host?: string;
}

/** One source and the text a quote from it must appear in. */
export interface EvidenceChunk {
  source: EvidenceSource;
  text: string;
}

export interface EvidenceCorpus {
  /** What the prompt shows and the verbatim grounder searches. */
  text: string;
  /** The same material, still divided by source, so a verified quote can be attributed. */
  chunks: readonly EvidenceChunk[];
}

export const EMPTY_CORPUS: EvidenceCorpus = { text: '', chunks: [] };

/** A corpus with no source provenance: a flat body of text, which is what a caller has when its
 *  evidence arrived already concatenated. Quotes still ground against it; nothing can be attributed
 *  to a source, so a receipt built from one keeps whatever it was handed. */
export const textCorpus = (text: string): EvidenceCorpus => ({ text, chunks: [] });

/** How a source is rendered for the model. The EXCERPT is the whole point: a corpus of titles and
 *  URLs carries no sentence to quote, so every figure a model proposes fails the verbatim gate and
 *  the world comes out ungrounded no matter how good the evidence behind it was. */
function render(chunk: EvidenceChunk): string {
  const { source, text } = chunk;
  const head = source.url ? `${source.title ?? source.url}\n${source.url}` : (source.title ?? '');
  return [head, text].filter((s) => s.trim()).join('\n');
}

/**
 * Assemble the corpus, capped. Chunks are taken whole and in order until the cap is reached — a
 * half-truncated excerpt is a passage whose end nobody can quote, so a chunk that does not fit is
 * dropped rather than cut, and what remains is exactly what a quote can be checked against.
 */
export function buildCorpus(chunks: readonly EvidenceChunk[], maxChars: number): EvidenceCorpus {
  const kept: EvidenceChunk[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const block = render(chunk);
    // A source with no excerpt still belongs here — a model's native grounding returns a bare URL,
    // and that source is real even though nothing in it can be quoted. It contributes its name, not
    // a sentence, which is exactly the evidence it is.
    if (!block.trim()) continue;
    const cost = block.length + (blocks.length ? 2 : 0);
    if (used + cost > maxChars) continue;
    used += cost;
    blocks.push(block);
    kept.push({ source: chunk.source, text: block });
  }
  return { text: blocks.join('\n\n'), chunks: kept };
}

/** A web result as a chunk. `host` is derived here so a receipt never wears a host the model chose. */
export function webChunk(source: { title: string; url?: string; snippet?: string }): EvidenceChunk {
  return {
    source: {
      kind: 'web',
      title: source.title,
      ...(source.url ? { url: source.url, host: hostOf(source.url) } : {}),
    },
    text: source.snippet ?? '',
  };
}

/**
 * Attribute an ALREADY-VERIFIED quote to the source whose text actually contains it, or null when
 * no single chunk does. Each chunk is normalized once, because a causal web attributes every quote
 * on every node and every edge against the same handful of sources.
 *
 * Null is not a failure — a corpus with no chunk provenance (the why machine's flat string) simply
 * has nothing to attribute, and the caller keeps whatever it had.
 */
export function makeAttributor(corpus: EvidenceCorpus): (quote: string) => EvidenceSource | null {
  const normalized = corpus.chunks.map((c) => ({
    source: c.source,
    text: normalizePdfText(c.text),
  }));
  return (quote: string): EvidenceSource | null => {
    const q = normalizePdfText(quote);
    if (!q) return null;
    const hits = normalized.filter((c) => c.text.includes(q));
    // Exactly one, or none. A sentence two sources both carry is evidence Mavéa cannot attribute
    // to either without guessing, and guessing the provenance is the thing this module exists to
    // stop — the quote still grounds, it just does not get to name a URL.
    return hits.length === 1 ? hits[0].source : null;
  };
}
