// textDoc.ts — extract per-"page" text from a plain-text / data attachment (CSV, TSV, TXT, Markdown,
// JSON, code). Unlike PDFs and Office files there's nothing to decode: the bytes ARE the text. The
// only work is smart, per-format paging, so each "page" is a sensible citable chunk for grounding:
//   - CSV/TSV → the header repeated atop each block of N data rows (so every page is self-describing)
//   - Markdown → one page per section (split on headings)
//   - JSON/code/config → the whole file (small) or fixed-size chunks (large)
//   - plain text → paragraph blocks, grouped to a comfortable page size
// This produces the same pages[] shape PDF/Office extraction returns, so the mapping pipeline is
// unchanged.
import type { Attachment } from '../attachments';

/** Decode a base64 attachment body to a UTF-8 string (honoring a BOM). */
function decodeText(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  // TextDecoder strips a UTF-8 BOM and handles multi-byte sequences atob() would otherwise mangle.
  return new TextDecoder('utf-8').decode(bytes);
}

const CSV_EXT = /\.(csv|tsv|tab)$/i;
const MD_EXT = /\.(md|markdown)$/i;
const JSON_EXT = /\.(json|jsonl|ndjson)$/i;
const CODE_EXT = /\.(ya?ml|toml|xml|js|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|cs|sh|sql|css|html?)$/i;

const ROWS_PER_PAGE = 40; // CSV/TSV data rows per page
const CHARS_PER_PAGE = 1600; // soft target for text/JSON/code paging

/** Split a CSV/TSV into pages of ROWS_PER_PAGE rows, each prefixed with the header so a cited page is
 *  self-describing. The delimiter is inferred (tab if the first line has more tabs than commas). */
function pageCsv(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // Drop a single trailing empty line (common), but keep blank rows inside the data.
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return [];
  const header = lines[0];
  const body = lines.slice(1);
  if (body.length === 0) return [header];
  const pages: string[] = [];
  for (let i = 0; i < body.length; i += ROWS_PER_PAGE) {
    pages.push([header, ...body.slice(i, i + ROWS_PER_PAGE)].join('\n'));
  }
  return pages;
}

/** Split Markdown into one page per top-level-ish section (a run starting at a #/##/### heading). A
 *  document with no headings falls back to paragraph paging. */
function pageMarkdown(text: string): string[] {
  const norm = text.replace(/\r\n?/g, '\n');
  const lines = norm.split('\n');
  const sections: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && cur.some((l) => l.trim())) {
      sections.push(cur.join('\n').trim());
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (cur.some((l) => l.trim())) sections.push(cur.join('\n').trim());
  const nonEmpty = sections.filter((s) => s.length > 0);
  return nonEmpty.length > 1 ? nonEmpty : pageText(text);
}

/** Plain text → paragraph blocks (split on blank lines), grouped up to ~CHARS_PER_PAGE per page so a
 *  long file isn't one giant page and a short one isn't fragmented. */
function pageText(text: string): string[] {
  const norm = text.replace(/\r\n?/g, '\n').trim();
  if (!norm) return [];
  const paras = norm
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return [norm];
  const pages: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (buf && buf.length + p.length > CHARS_PER_PAGE) {
      pages.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) pages.push(buf);
  return pages;
}

/** JSON / code / config → the whole file when it fits, else fixed ~CHARS_PER_PAGE chunks split on
 *  line boundaries so a page never cuts a token mid-line. */
function pageChunks(text: string): string[] {
  const norm = text.replace(/\r\n?/g, '\n').trim();
  if (!norm) return [];
  if (norm.length <= CHARS_PER_PAGE * 1.5) return [norm];
  const lines = norm.split('\n');
  const pages: string[] = [];
  let buf = '';
  for (const line of lines) {
    if (buf && buf.length + line.length > CHARS_PER_PAGE) {
      pages.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) pages.push(buf);
  return pages;
}

/**
 * Extract per-page text from a plain-text / data attachment, smart-paged by format. Returns null only
 * if the file is empty (so the caller can surface an honest error). Never throws.
 */
export function extractTextPages(doc: Attachment): string[] | null {
  let text: string;
  try {
    text = decodeText(doc.data);
  } catch {
    return null;
  }
  return extractTextPagesFromText(doc.name, doc.mime, text);
}

function extractTextPagesFromText(name: string, mime: string, text: string): string[] | null {
  if (!text.trim()) return null;
  let pages: string[];
  if (CSV_EXT.test(name) || mime === 'text/csv') pages = pageCsv(text);
  else if (MD_EXT.test(name)) pages = pageMarkdown(text);
  else if (JSON_EXT.test(name) || mime === 'application/json' || CODE_EXT.test(name))
    pages = pageChunks(text);
  else pages = pageText(text);
  return pages.length > 0 ? pages : null;
}

/** Worker entry: decode and page raw file bytes without ever producing a base64 copy. */
export function extractTextPagesFromBytes(
  name: string,
  mime: string,
  bytes: Uint8Array,
): string[] | null {
  return extractTextPagesFromText(name, mime, new TextDecoder('utf-8').decode(bytes));
}
