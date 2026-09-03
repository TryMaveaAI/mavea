// attachments.ts — turn a user-picked File into the small, provider-agnostic shape the
// Live turn carries. The composer hands us raw File objects; adapters need base64 + mime.
// This is the one place that reads the file, so the size/type guards live here and every
// surface inherits them. We keep it tiny and dependency-free: images and PDFs only, the
// two things the BYOK vision providers can actually read (Anthropic/Gemini take PDFs too).

/** A file the user attached, encoded for transport to the model. `data` is raw base64
 *  (no data: prefix) so each adapter can wrap it in its own native part shape. */
export interface Attachment {
  /** Original filename, shown in the staged-files chip and used in the text-only fallback. */
  name: string;
  /** MIME type, e.g. 'image/png' or 'application/pdf'. */
  mime: string;
  /** Base64-encoded bytes, no `data:…;base64,` prefix. */
  data: string;
  /** Byte size of the decoded file (used for the budget guard + the chip label). */
  size: number;
  /** Prism/Synthesis can retain the browser File and avoid a 4/3-size base64 copy until a provider
   *  genuinely needs the binary. Normal Live attachments keep using `data` for compatibility. */
  file?: File;
  /** Archive members have no File handle. Their transferable buffer replaces a duplicated base64
   *  string and is handed to the extraction worker only when the source is mapped. */
  bytes?: ArrayBuffer;
}

/** Hard caps so an attachment can never blow the request body or the model's context. Documents get
 *  a bigger ceiling than images: explodable docs (PDF/Word/PowerPoint) are processed CLIENT-SIDE for
 *  the explode map (text extracted locally; Office binaries never reach the model), so a large paper
 *  or deck is fine — only what's actually sent to the model is bounded by the image cap. Oversized or
 *  too-many files are rejected, not truncated. */
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB — images sent to the model
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024; // 40 MB — PDF/Office, mostly handled locally

// Office Open XML MIME types — Word (.docx), PowerPoint (.pptx), Excel (.xlsx). Google
// Docs/Slides/Sheets export as these, so accepting them covers Google too. They aren't sent to the
// LLM natively (only PDFs/images are); their value is the "explode" map, which extracts their text
// client-side (officeDoc.ts).
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const OFFICE_MIMES = new Set([DOCX_MIME, PPTX_MIME, XLSX_MIME]);
const OFFICE_EXT = /\.(docx|pptx|xlsx)$/i;
// The pre-2007 binary Office formats. They are NOT OOXML — there is no zip to read — so the
// extractor cannot open one, and refusing it as a plain "unsupported file type. Try a Word doc"
// named the wrong cause at the exact reader who had just dropped a Word doc.
const LEGACY_OFFICE_EXT = /\.(doc|ppt|xls)$/i;

// Plain-text / data formats Prism can explode directly: the file bytes ARE the text, so there's no
// archive to unzip and no vision needed — just smart per-format paging for grounding (textDoc.ts).
// CSV/TSV (data tables), TXT/Markdown (notes/docs), and JSON/code/config (structured text).
const TEXT_EXT =
  /\.(csv|tsv|txt|text|md|markdown|json|jsonl|ndjson|ya?ml|toml|xml|log|tab|js|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|cs|sh|sql|css|html?)$/i;

/** The file kinds we accept. Images work on every vision provider; PDFs only on the ones
 *  that read documents natively (Anthropic, Gemini) — elsewhere they degrade to a text
 *  note (see toUserParts in the adapters), never a silent drop. Office + plain-text/data files are
 *  accepted for the explode map (text extracted client-side); they aren't forwarded as attachments. */
export const ACCEPTED_TYPES = `image/*,application/pdf,text/*,application/json,${DOCX_MIME},${PPTX_MIME},${XLSX_MIME},.docx,.pptx,.xlsx,.csv,.tsv,.txt,.md,.json,.yaml,.yml,.log`;

export function isImage(a: Attachment): boolean {
  return a.mime.startsWith('image/');
}
export function isPdf(a: Attachment): boolean {
  return a.mime === 'application/pdf';
}
/** A Word/PowerPoint/Excel document we can explode (text extracted client-side). Falls back to the
 *  file extension because some browsers report an empty MIME for these. */
export function isOffice(a: Attachment): boolean {
  return OFFICE_MIMES.has(a.mime) || OFFICE_EXT.test(a.name);
}
/** A plain-text / data file (CSV, TSV, TXT, Markdown, JSON, code) — explodable as raw text. Excludes
 *  PDFs/images/Office, which have their own paths. Matches by MIME (text/*, application/json) or
 *  extension, since browsers often report an empty or generic MIME for these. */
export function isText(a: Attachment): boolean {
  if (isImage(a) || isPdf(a) || isOffice(a)) return false;
  return (
    a.mime.startsWith('text/') ||
    a.mime === 'application/json' ||
    /\b(json|xml|yaml|csv|javascript|typescript)\b/.test(a.mime) ||
    TEXT_EXT.test(a.name)
  );
}
/** A Word document (.docx) — reflowable text, unlike a PowerPoint deck's slides or an Excel
 *  workbook's sheets, which each get their own surface. Falls back to the extension, matching
 *  {@link isOffice}'s reasoning. */
export function isDocx(a: Attachment): boolean {
  return a.mime === DOCX_MIME || /\.docx$/i.test(a.name);
}
/** A comma/tab-separated data file the typed-dataset connector can parse into columns. Matches by
 *  extension (browsers often report text/plain for these) or an explicit CSV/TSV MIME. */
export function isCsv(a: Attachment): boolean {
  return (
    /\.(csv|tsv|tab)$/i.test(a.name) ||
    a.mime === 'text/csv' ||
    a.mime === 'text/tab-separated-values'
  );
}
/** An Excel workbook the typed-dataset connector can parse cell-by-cell. */
export function isXlsx(a: Attachment): boolean {
  return a.mime === XLSX_MIME || /\.xlsx$/i.test(a.name);
}
/** A PowerPoint deck — its slides get their own surface (SlideSurface for real text, ImageSurface
 *  for a deck exported as pictures). Falls back to the extension, matching {@link isOffice}'s
 *  reasoning (some browsers report an empty MIME for these). */
export function isPptx(a: Attachment): boolean {
  return a.mime === PPTX_MIME || /\.pptx$/i.test(a.name);
}
/** Anything Prism can split into a claim map: a PDF, an Office doc, a plain-text/data file — or a
 *  picture, which mapClaims reads as a one-page deck on the vision path. Images belong here because
 *  the pickers offer them: without it the Go hub's Prism card staged the screenshot it had just
 *  asked for and then opened nothing at all. */
export function isExplodable(a: Attachment): boolean {
  return isPdf(a) || isOffice(a) || isText(a) || isImage(a);
}

/** A coarse kind the SELECTOR reasons over — an attached spreadsheet/CSV is a tabular medium the
 *  answer should ground in a table, a PDF is a document, an image may be a receipt/screenshot. Used
 *  (via generateLive) to steer component selection toward the right base for what the user uploaded,
 *  independent of the transport encoding. */
export type AttachmentKind = 'image' | 'pdf' | 'sheet' | 'text' | 'other';
export function attachmentKind(a: Attachment): AttachmentKind {
  if (isXlsx(a) || isCsv(a)) return 'sheet'; // check before isText (a .csv is also text)
  if (isImage(a)) return 'image';
  if (isPdf(a)) return 'pdf';
  if (isText(a)) return 'text';
  return 'other';
}

/** Reason a file was rejected, so the UI can tell the user WHY (not just that it failed). */
export type AttachmentError = 'too-large' | 'unsupported' | 'legacy-office';

export interface EncodeResult {
  ok: boolean;
  attachment?: Attachment;
  error?: AttachmentError;
}

/** Is this picked file a text/data file (CSV, TXT, Markdown, JSON, code)? The {@link isText}
 *  reasoning, applied to a File's metadata before it is read. */
function isTextFile(file: File): boolean {
  const mime = file.type;
  return (
    !mime.startsWith('image/') &&
    mime !== 'application/pdf' &&
    !OFFICE_MIMES.has(mime) &&
    (mime.startsWith('text/') ||
      mime === 'application/json' ||
      /\b(json|xml|yaml|csv|javascript|typescript)\b/.test(mime) ||
      TEXT_EXT.test(file.name))
  );
}

/** The size cap this picked file is held to. Exported so the surface that REPORTS a rejection names
 *  the same number the guard applied — quoting the image cap at a 20 MB CSV told its owner to give
 *  up on a file that would have been accepted. */
export function attachmentSizeLimit(file: File): number {
  const isDoc =
    file.type === 'application/pdf' ||
    OFFICE_MIMES.has(file.type) ||
    /\.(pdf|docx|pptx|xlsx)$/i.test(file.name) ||
    isTextFile(file);
  return isDoc ? MAX_DOCUMENT_BYTES : MAX_ATTACHMENT_BYTES;
}

/** Validate from metadata alone so upload-first surfaces can stage instantly and defer file reads. */
export function attachmentFileError(file: File): AttachmentError | null {
  const mime = file.type;
  const accepted =
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    OFFICE_MIMES.has(mime) ||
    OFFICE_EXT.test(file.name) ||
    isTextFile(file);
  if (!accepted) return LEGACY_OFFICE_EXT.test(file.name) ? 'legacy-office' : 'unsupported';
  return file.size > attachmentSizeLimit(file) ? 'too-large' : null;
}

/** Read one File into an Attachment, enforcing the type + size guards. Never throws —
 *  a rejected file resolves with `ok:false` and a reason so the caller can surface it. */
export function fileToAttachment(file: File): Promise<EncodeResult> {
  const mime = file.type;
  const error = attachmentFileError(file);
  if (error) return Promise.resolve({ ok: false, error });

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL gives `data:<mime>;base64,<payload>` — adapters want the payload alone.
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const data = comma >= 0 ? result.slice(comma + 1) : '';
      if (!data) return resolve({ ok: false, error: 'unsupported' });
      resolve({ ok: true, attachment: { name: file.name, mime, data, size: file.size } });
    };
    reader.onerror = () => resolve({ ok: false, error: 'unsupported' });
    reader.readAsDataURL(file);
  });
}

/** Metadata-only encoder for document workbenches. Images still use the normal provider-ready path;
 *  PDFs/Office/text keep their File handle and defer both reading and base64 conversion. */
export function fileToPrismAttachment(file: File): Promise<EncodeResult> {
  const error = attachmentFileError(file);
  if (error) return Promise.resolve({ ok: false, error });
  if (file.type.startsWith('image/')) return fileToAttachment(file);
  return Promise.resolve({
    ok: true,
    attachment: {
      name: file.name,
      mime: file.type,
      data: '',
      size: file.size,
      file,
    },
  });
}

/** Return bytes immediately when an attachment is already memory-backed. File-backed documents
 *  intentionally return null so their read can stay deferred and asynchronous. */
export function attachmentBytesImmediate(a: Attachment): Uint8Array | null {
  if (a.bytes) return new Uint8Array(a.bytes);
  if (a.file) return null;
  const bin = atob(a.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Read an attachment without manufacturing an intermediate base64 string. */
export async function attachmentBytes(a: Attachment): Promise<Uint8Array> {
  const immediate = attachmentBytesImmediate(a);
  if (immediate) return immediate;
  return new Uint8Array(await a.file!.arrayBuffer());
}

/** Materialize provider transport only at the request boundary. Existing encoded attachments are
 *  returned unchanged so Live and all stored-data contracts remain compatible. */
export async function ensureAttachmentData(a: Attachment): Promise<Attachment> {
  if (a.data) return a;
  const bytes = await attachmentBytes(a);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { ...a, data: btoa(binary), file: undefined, bytes: undefined };
}

/** A short, human label for the staged-files chip / fallback note, e.g. "report.pdf · 1.2 MB". */
export function attachmentLabel(a: Attachment): string {
  const mb = a.size / (1024 * 1024);
  const size = mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(a.size / 1024))} KB`;
  return `${a.name} · ${size}`;
}
