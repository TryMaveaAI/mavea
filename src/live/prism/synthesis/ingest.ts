// synthesis/ingest.ts — turn a folder (or a multi-file drop) into a corpus. The composer caps at a
// handful of attachments; a Synthesis World wants a whole pile — a directory of papers, a quarter of
// team notes, a data room. A `webkitdirectory` input or a folder drop hands us many File objects; this
// filters them to the explodable kinds, bounds the count, and encodes each into the same Attachment
// shape the rest of Prism uses (reusing attachments.ts's per-file type/size guards). No new dependency.
import { fileToPrismAttachment, type Attachment } from '../../attachments';

/** A hard ceiling on corpus size, so a stray "select my whole drive" can't try to encode 10k files.
 *  Well above the design's "80 papers" target; the frugal pipeline stays O(N/B) regardless. */
export const MAX_CORPUS_SOURCES = 200;

// The file kinds a corpus can be built from — PDFs, Office docs, and plain-text/data files. Mirrors
// attachments.ts's explodable set at the FILENAME level (a folder drop gives us names + bytes, and
// browsers often report an empty MIME for these, so extension is the reliable signal).
const CORPUS_EXT =
  /\.(pdf|docx|pptx|xlsx|csv|tsv|txt|text|md|markdown|json|jsonl|ndjson|ya?ml|toml|xml|log|tab|js|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|cs|sh|sql|css|html?)$/i;
/** Skip the noise a real folder carries — VCS internals, dependency trees, build output, OS cruft.
 *  Shared with the ZIP reader (ingestZip.ts) so a ZIPPED project folder is filtered exactly like the
 *  same folder dropped directly: without this, a zipped repo's node_modules/ and dist/ arrived as
 *  hundreds of "sources" that crowded the real documents out from under the corpus cap. */
export const SKIP_PATH =
  /(^|\/)(\.git|node_modules|\.DS_Store|__pycache__|\.venv|dist|build|__MACOSX)(\/|$)/i;

/** The files in a drop worth treating as sources: explodable by extension, not obvious noise. Pure —
 *  reads only `name`/`webkitRelativePath`, so it's testable without encoding bytes. */
export function corpusCandidates(files: readonly File[]): File[] {
  return files.filter((f) => {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return CORPUS_EXT.test(f.name) && !SKIP_PATH.test(path);
  });
}

export interface CorpusIngestResult {
  sources: Attachment[];
  /** How many candidate files were dropped (over the cap, too large, or failed to read). */
  skipped: number;
}

/**
 * Encode a folder/multi-file drop into a corpus. Filters to explodable files, caps the count, and runs
 * each through attachments.ts's guarded encoder (oversized/unsupported files are skipped, never fatal).
 * Sequential so a 200-file folder doesn't spike memory decoding everything at once on weak hardware.
 */
export async function filesToCorpus(
  files: readonly File[],
  opts: { max?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<CorpusIngestResult> {
  const { max = MAX_CORPUS_SOURCES, onProgress } = opts;
  const candidates = corpusCandidates(files);
  const capped = candidates.slice(0, max);
  const sources: Attachment[] = [];
  for (let i = 0; i < capped.length; i += 1) {
    const res = await fileToPrismAttachment(capped[i]);
    if (res.ok && res.attachment) sources.push(res.attachment);
    onProgress?.(i + 1, capped.length);
  }
  // Against candidates (post-filter), not the raw drop — files.length also counts things that were
  // never candidates at all (.git internals, images, dotfiles), which this field's own contract excludes.
  return { sources, skipped: candidates.length - sources.length };
}
