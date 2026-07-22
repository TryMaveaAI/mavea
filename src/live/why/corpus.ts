// why/corpus.ts — assemble the grounding corpus for a live "why" question from the HONEST sources: the
// user's own attached files (→ T1 receipts) and free web search snippets (→ T2 receipts). Deliberately
// NOT the assistant's own prior answers — grounding a causal claim against the model's earlier output
// would be a fake receipt (citing itself). If both sources are empty, the corpus is empty and the
// causal web honestly degrades to all-T0 (qualitative, no numbers).
import { base64ToBytes, extractOfficePages } from '../prism/officeDoc';
import { isCsv, isOffice, isText, isXlsx, type Attachment } from '../attachments';
import { parseDataset } from '../data/parse';
import type { TypedDataset } from '../data/types';
import { getSearchProvider, searchQuery } from '../search/index';
import type { SearchProviderId } from '../search/types';

const MAX_ROWS = 200;
const MAX_CHARS = 8000;

/** A typed dataset as groundable lines: each row lists "column value" pairs with the verbatim tokens,
 *  so an explode-why quote like "revenue 1,200" grounds against it. */
function datasetToText(ds: TypedDataset): string {
  const lines: string[] = [`${ds.file}: ${ds.columns.map((c) => c.label).join(', ')}`];
  const n = Math.min(ds.rowCount, MAX_ROWS);
  for (let i = 0; i < n; i += 1) {
    lines.push(ds.columns.map((c) => `${c.label} ${c.raw[i] ?? ''}`.trim()).join(' | '));
  }
  return lines.join('\n');
}

/** Extract plain text from the user's attachments (CSV/XLSX as typed rows, text files raw, Office docs
 *  page text). PDFs/images are skipped here (no verbatim text path). Never throws. */
export async function attachmentsToText(attachments: readonly Attachment[]): Promise<string> {
  const parts: string[] = [];
  for (const a of attachments) {
    try {
      if (isCsv(a) || isXlsx(a)) {
        const { dataset } = await parseDataset(a, 0);
        if (dataset) parts.push(datasetToText(dataset));
      } else if (isText(a)) {
        parts.push(new TextDecoder('utf-8').decode(base64ToBytes(a.data)));
      } else if (isOffice(a)) {
        const pages = await extractOfficePages(a);
        if (pages) parts.push(pages.join('\n'));
      }
    } catch {
      /* skip an unreadable attachment — never block the corpus */
    }
  }
  return parts.join('\n\n');
}

/** Fetch web snippets for a question (keyless Wikipedia by default — free). Never throws. */
export async function webSnippets(
  question: string,
  opts: { enabled: boolean; providerId?: SearchProviderId; apiKey?: string },
): Promise<string> {
  if (!opts.enabled || !question.trim()) return '';
  try {
    const results = await getSearchProvider(opts.providerId).search(searchQuery(question), {
      apiKey: opts.apiKey,
      limit: 6,
    });
    return results.map((r) => `${r.title}. ${r.snippet}`).join('\n');
  } catch {
    return '';
  }
}

/** The full grounding corpus for a live Why Machine: attachments (T1) + web snippets (T2), capped. */
export async function assembleWhyCorpus(
  question: string,
  attachments: readonly Attachment[],
  search: { enabled: boolean; providerId?: SearchProviderId; apiKey?: string },
): Promise<string> {
  const [fromFiles, fromWeb] = await Promise.all([
    attachmentsToText(attachments),
    webSnippets(question, search),
  ]);
  return [fromFiles, fromWeb]
    .filter((s) => s.trim())
    .join('\n\n')
    .slice(0, MAX_CHARS);
}
