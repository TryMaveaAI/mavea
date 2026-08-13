// Baked Prism analyses of REAL public documents of VARIOUS types (see scripts/build-tour-prism.mts),
// fetched from trusted online sources. Each entry ships the grounded map AND the document bytes —
// every source is freely redistributable (US-government works, BSD/MIT data + readmes) — so the
// tour's drill-in renders the real page with the quote highlighted, exactly like a live explode.
// The generated JSON carries whole documents, so it loads lazily: the Live chunk stays lean and the
// bytes only arrive when the tour's Prism chapter actually opens.
import type { Attachment } from '../../live/attachments';
import type { PrismSpec } from '../../live/prism/types';

interface PrismDocRaw {
  id: string;
  type: string;
  name: string;
  mime: string;
  url: string;
  proposed: number;
  data: string;
  size: number;
  spec: PrismSpec;
}

export interface TourPrismDoc {
  id: string;
  type: string;
  name: string;
  /** The real document — bytes included, so DocPageView renders actual pages. */
  doc: Attachment;
  spec: PrismSpec;
  /** Honest count of claims the model proposed before grounding (for "N grounded of M"). */
  proposed: number;
}

/** Show one strong example of each type first (PDF → CSV → JSON → Markdown), then the rest. */
const ORDER = ['nasa-cfd', 'fomc', 'weather', 'cars', 'react-readme'];

let cache: TourPrismDoc[] | null = null;

/** Load the baked documents (lazy — the fixture carries real document bytes). */
export async function loadTourPrism(): Promise<TourPrismDoc[]> {
  if (cache) return cache;
  const raw = (await import('./prism.generated.json')) as unknown as {
    default: { docs: PrismDocRaw[] };
  };
  const docs = [...raw.default.docs].sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  cache = docs.map((d) => ({
    id: d.id,
    type: d.type,
    name: d.name,
    doc: { name: d.name, mime: d.mime, data: d.data, size: d.size },
    spec: d.spec,
    proposed: d.proposed,
  }));
  return cache;
}
