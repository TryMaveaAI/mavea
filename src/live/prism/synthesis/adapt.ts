// synthesis/adapt.ts — present a settled corpus as a PrismSpec so the SHARED Prism view renders it
// with full richness (typed cards, source panels, cross-source threads, the whole toolbar) instead of a
// lesser parallel view. The mapping is 1:1: documents = sources, regions = themes (claim.region is
// already the theme name, so layout() clusters by theme unchanged), claims + threads reused verbatim.
// The corpus-only objects (gaps, consensus, the lens) travel separately as CorpusChrome — this file
// only handles the part that IS Prism. Pure.
import type { PrismSpec } from '../types';
import type { CorpusSpec } from './types';

export function corpusToPrismSpec(spec: CorpusSpec): PrismSpec {
  return {
    documents: spec.sources.map((s) => ({
      fileName: s.fileName,
      pageCount: s.pageCount,
      ...(s.slideImages ? { slideImages: s.slideImages } : {}),
    })),
    fileName: spec.sources[0]?.fileName ?? 'corpus',
    pageCount: spec.pageCount,
    claims: spec.claims,
    // Theme names, in theme order — matches claim.region and layoutCorpus's region keys, so the shared
    // layout() places cards identically to where the corpus objects were positioned against.
    regions: spec.themes.map((t) => t.name),
    threads: spec.threads,
  };
}
