// streamParse.ts — narration-first incremental parsing. As raw JSON streams in,
// we want to SPEAK the "narration" sentence the instant it's complete — before the
// blocks finish generating. A full JSON.parse can't do that (the object isn't
// closed yet), so this scans the partial buffer for a COMPLETE "narration" string
// value and returns it (unescaped), or null if it hasn't fully arrived. Pure +
// unit-tested. This is what makes a 1–2s turn feel instant.

function unescapeChar(c: string): string {
  switch (c) {
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case 'r':
      return '\r';
    case '"':
      return '"';
    case '\\':
      return '\\';
    case '/':
      return '/';
    default:
      return c; // \uXXXX and unknowns: keep the char (good enough for a spoken line)
  }
}

/**
 * Cursor-holding scanner for ONE top-level string field of a streaming JSON buffer — the
 * incremental engine behind `extractStringField`/`extractNarrationProgress`, in the same style as
 * `ArrayStreamScanner` below. A Live answer arrives as hundreds of small deltas, and re-walking the
 * whole buffer (rebuilding the value character by character from index 0) on each delta made the
 * per-turn narration parse O(chunks × buffer). This scanner keeps its phase and cursor across
 * `scan` calls, so a whole turn costs one pass over the stream and `progress()` is a state read.
 *
 * Same tolerances as the pure functions it powers: leading prose before the key, a needle or an
 * escape split across chunks (the dangling backslash is left for the next scan, so the text so far
 * is byte-identical to a from-scratch walk of the same buffer), and a first occurrence whose value
 * is not a string (permanently null, exactly like the from-scratch walk that re-finds it).
 */
export class StringFieldScanner {
  private readonly needle: string;
  /** Where the next scan resumes: a search floor in 'key'/'colon', the walk cursor after. */
  private from = 0;
  /** 'never' = the first occurrence's value is not a string — progress stays null for good. */
  private phase: 'key' | 'colon' | 'quote' | 'value' | 'done' | 'never' = 'key';
  private text = '';

  constructor(key: string) {
    this.needle = `"${key}"`;
  }

  /** Advance over `buf`'s unseen tail. `buf` must extend the previously scanned buffer. */
  scan(buf: string): void {
    if (this.phase === 'done' || this.phase === 'never') return;
    if (this.phase === 'key') {
      const k = buf.indexOf(this.needle, this.from);
      if (k < 0) {
        // Not here yet. Back the floor up so a needle split across deltas is still found.
        this.from = Math.max(0, buf.length - this.needle.length + 1);
        return;
      }
      this.phase = 'colon';
      this.from = k + this.needle.length;
    }
    if (this.phase === 'colon') {
      const c = buf.indexOf(':', this.from);
      if (c < 0) {
        this.from = buf.length;
        return;
      }
      this.phase = 'quote';
      this.from = c + 1;
    }
    if (this.phase === 'quote') {
      while (this.from < buf.length && /\s/.test(buf[this.from])) this.from++;
      if (this.from >= buf.length) return; // opening quote not here yet
      if (buf[this.from] !== '"') {
        this.phase = 'never'; // a number/null/object value — this field will never read as a string
        return;
      }
      this.phase = 'value';
      this.from++;
    }
    while (this.from < buf.length) {
      const ch = buf[this.from];
      if (ch === '\\') {
        const next = buf[this.from + 1];
        if (next === undefined) return; // escape split across chunks — resume at it next scan
        this.text += unescapeChar(next);
        this.from += 2;
        continue;
      }
      if (ch === '"') {
        this.phase = 'done'; // closing quote → the value is complete
        return;
      }
      this.text += ch;
      this.from++;
    }
  }

  /** The value so far (`done` once its closing quote arrived), or null while the opening quote
   *  hasn't arrived — the exact contract of `extractNarrationProgress`. */
  progress(): { text: string; done: boolean } | null {
    if (this.phase === 'done') return { text: this.text, done: true };
    if (this.phase === 'value') return { text: this.text, done: false };
    return null;
  }

  /** The complete value, or null until its closing quote arrives — the exact contract of
   *  `extractStringField`. */
  value(): string | null {
    return this.phase === 'done' ? this.text : null;
  }
}

/**
 * Return the fully-arrived value of a top-level string field from a partial JSON
 * buffer, or null if the key/value hasn't completed yet. Tolerant of leading
 * prose/fences. Used for narration-first speech and the streaming title.
 * (Pure convenience over StringFieldScanner — callers on a hot per-delta path
 * hold a scanner instead, so the buffer is only ever walked once.)
 */
export function extractStringField(buf: string, name: string): string | null {
  const s = new StringFieldScanner(name);
  s.scan(buf);
  return s.value();
}

/** Narration-first: the spoken line, the instant it has fully streamed in. */
export function extractNarration(buf: string): string | null {
  return extractStringField(buf, 'narration');
}

/**
 * The narration value SO FAR — the in-progress prefix even before its closing quote arrives, plus a
 * `done` flag once it has. This is what lets the voice start on the FIRST sentence instead of waiting
 * for the whole spoken line to finish streaming: a caller speaks each completed sentence as it forms.
 * Returns null only when the narration field's opening quote hasn't arrived yet. Tolerant of an escape
 * split across chunks (it stops before the dangling backslash and resumes next chunk).
 * (Pure convenience over StringFieldScanner — the per-delta caller holds a scanner.)
 */
export function extractNarrationProgress(buf: string): { text: string; done: boolean } | null {
  const s = new StringFieldScanner('narration');
  s.scan(buf);
  return s.progress();
}

/**
 * The index of the LAST sentence-ending punctuation mark in `text` that is followed by
 * whitespace and sits OUTSIDE any [[shown|said]] pronunciation-twin span (see lib/spokenText.ts)
 * — open or closed. A period inside a span (e.g. "[[i.e. this|that is this]]") must never look
 * like a sentence end: splitting there would chop the annotation in half, corrupting both the
 * displayed and spoken text for that chunk. Returns null when no such boundary exists yet.
 */
function lastSentenceEnd(text: string): number | null {
  let inSpan = false;
  let last: number | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[' && text[i + 1] === '[') {
      inSpan = true;
      i++;
      continue;
    }
    if (inSpan && text[i] === ']' && text[i + 1] === ']') {
      inSpan = false;
      i++;
      continue;
    }
    if (!inSpan && /[.!?]/.test(text[i]) && /\s/.test(text[i + 1] ?? '')) {
      last = i;
    }
  }
  return last;
}

/**
 * Given the narration-so-far and how many characters were already spoken, return the next chunk that
 * is safe to speak NOW: everything up to the last sentence boundary (or all of it once `done`). Empty
 * when no new complete sentence has formed yet. Keeps the spoken stream a sentence (not a word) at a
 * time, so playback is natural while still starting as early as possible.
 */
export function nextSpeakableChunk(
  text: string,
  spokenLen: number,
  done: boolean,
): { chunk: string; consumed: number } {
  if (text.length <= spokenLen) return { chunk: '', consumed: spokenLen };
  if (done) return { chunk: text.slice(spokenLen).trim(), consumed: text.length };
  // Find the last sentence-ending punctuation in the un-spoken tail; speak up to and including it.
  const tail = text.slice(spokenLen);
  const end = lastSentenceEnd(tail);
  if (end === null) return { chunk: '', consumed: spokenLen };
  return { chunk: tail.slice(0, end + 1).trim(), consumed: spokenLen + end + 1 };
}

/**
 * Extract the COMPLETE object elements from a streaming top-level array field (by key)
 * so a caller can reveal each one the moment it closes (vs. waiting for the whole reply).
 * Scans the array tracking string-escaping + brace depth; a half-written trailing element
 * is simply omitted until its closing brace arrives, and nested arrays/objects inside an
 * element are handled (only `{`/`}` move object depth; the array terminator is the `]` at
 * depth 0). Returns raw objects (the caller's validator coerces them). Pure + cheap — safe
 * to call on every streamed chunk.
 */
export function completedArrayItems(buf: string, key: string): unknown[] {
  const k = buf.indexOf(`"${key}"`);
  if (k < 0) return [];
  let i = buf.indexOf('[', k);
  if (i < 0) return [];
  i++; // past the opening [
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (; i < buf.length; i++) {
    const ch = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(buf.slice(start, i + 1)));
        } catch {
          /* malformed element — skip it, keep the rest */
        }
        start = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break; // end of this array (inner `]` of a nested array sits at depth > 0)
    }
  }
  return out;
}

/** The canvas reveal: complete objects from the streaming "blocks" array. */
export function completedBlocks(buf: string): unknown[] {
  return completedArrayItems(buf, 'blocks');
}

/**
 * The incremental sibling of `completedArrayItems`, for the one caller where the pure rescan
 * is too dear: the canvas "blocks" stream. A Live answer arrives as hundreds of small deltas
 * over a buffer that grows to tens of KB, and re-walking the whole buffer (and re-parsing every
 * finished block) on each delta made the per-turn parse cost O(chunks × buffer) — work that
 * lands exactly while the canvas is animating its reveal. This scanner keeps its cursor and
 * string/escape/brace state across `scan` calls, so a whole turn costs ONE pass over the stream
 * and each element is `JSON.parse`d once, the moment its closing brace arrives.
 *
 * `scan` takes the caller's whole accumulated buffer — each call an extension of the last — and
 * only reads the unseen tail. Holding the caller's string (not a private copy) is deliberate:
 * the turn already retains that buffer for the final parse, so the scanner adds indices, not a
 * second copy of the stream.
 *
 * It also answers the skeleton's question — the TYPE of the block still being written — from the
 * same walk. The model emits each block's `"type"` as its first key, so the kind of the in-flight
 * block is knowable hundreds of tokens before the block closes; `pendingType()` reads it from the
 * unclosed trailing element (and caches it until that element completes).
 *
 * Same tolerances as the pure functions: leading prose before the key, braces/brackets inside
 * strings, split escapes, a malformed element (skipped, the rest kept), and a truncated tail
 * (the unfinished element is simply never emitted).
 */
export class ArrayStreamScanner {
  /** Complete elements in arrival order — a live read-only view (it grows across scans), so
   *  callers that hand it off snapshot it first. Only the scanner itself may append. */
  private readonly parsed: unknown[] = [];
  private readonly needle: string;
  private buf = '';
  /** Where the next scan resumes: a search floor in 'key'/'bracket', the walk cursor after. */
  private from = 0;
  private phase: 'key' | 'bracket' | 'elements' | 'done' = 'key';
  private depth = 0;
  private inStr = false;
  private esc = false;
  /** Index of the unclosed trailing element's `{`, or -1 between elements. */
  private start = -1;
  private knownType: string | null = null;

  constructor(key: string) {
    this.needle = `"${key}"`;
  }

  get items(): readonly unknown[] {
    return this.parsed;
  }

  /** Advance over `buf`'s unseen tail. `buf` must extend the previously scanned buffer. */
  scan(buf: string): void {
    if (this.phase === 'done') return;
    this.buf = buf;
    if (this.phase === 'key') {
      const k = buf.indexOf(this.needle, this.from);
      if (k < 0) {
        // Not here yet. Back the floor up so a needle split across deltas is still found.
        this.from = Math.max(0, buf.length - this.needle.length + 1);
        return;
      }
      this.phase = 'bracket';
      this.from = k + this.needle.length;
    }
    if (this.phase === 'bracket') {
      const b = buf.indexOf('[', this.from);
      if (b < 0) {
        this.from = buf.length;
        return;
      }
      this.phase = 'elements';
      this.from = b + 1;
    }
    let i = this.from;
    for (; i < buf.length; i++) {
      const ch = buf[i];
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (ch === '\\') this.esc = true;
        else if (ch === '"') this.inStr = false;
        continue;
      }
      if (ch === '"') this.inStr = true;
      else if (ch === '{') {
        if (this.depth === 0) {
          this.start = i;
          this.knownType = null;
        }
        this.depth++;
      } else if (ch === '}') {
        this.depth--;
        if (this.depth === 0 && this.start >= 0) {
          try {
            this.parsed.push(JSON.parse(buf.slice(this.start, i + 1)));
          } catch {
            /* malformed element — skip it, keep the rest */
          }
          this.start = -1;
        }
      } else if (ch === ']' && this.depth === 0) {
        this.phase = 'done';
        this.buf = ''; // the stream is consumed — release the reference
        break;
      }
    }
    this.from = i;
  }

  /** The unclosed trailing element's `"type"`, or null between elements / before it arrives /
   *  after the array closes. Bounded by the size of that one element, not the buffer. */
  pendingType(): string | null {
    if (this.phase === 'done' || this.start < 0) return null;
    if (this.knownType) return this.knownType;
    const m = /"type"\s*:\s*"([a-z0-9-]+)"/i.exec(this.buf.slice(this.start));
    if (m) this.knownType = m[1];
    return this.knownType;
  }
}
