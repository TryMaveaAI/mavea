// encode.ts — pure-JS Model2Vec static text embedding (the runtime half of the semantic index).
//
// Model2Vec encodes a string with NO neural network: tokenize (BERT WordPiece) -> look up each
// token's row in a [vocab x dim] matrix -> mean-pool -> L2-normalize. That is the whole forward
// pass — a handful of integer-indexed adds — so it runs in well under a millisecond on the weakest
// CPU, needs no WASM/threads/GPU, and exactly reproduces minishlab/potion-base-8M (verified to
// cosine 1.0 against the Python reference; see tests/semantic-encode.test.ts and build-semantic-index.py).
//
// Everything here is allocation-light and dependency-free. The matrix ships int8 (one global scale);
// we accumulate the integer rows and apply the scale once at the end, so the 7MB matrix is the only
// large resident allocation and a query embed touches just its few token rows.

/** The BERT-style tokenizer parameters the matrix was built with (from index.json). */
export interface TokenizerParams {
  lowercase: boolean;
  stripAccents: boolean;
  handleChineseChars: boolean;
  /** Continuing-subword prefix, '##'. */
  prefix: string;
  /** The unknown-token string, '[UNK]'. */
  unkToken: string;
  /** Words longer than this are emitted as a single [UNK] (BERT's max_input_chars_per_word). */
  maxChars: number;
}

/** The loaded static model: the int8 matrix + its scale, the token→id vocab, and tokenizer params. */
export interface StaticModel {
  matrix: Int8Array; // row-major [vocabSize * dim]
  scale: number;
  dim: number;
  vocab: Map<string, number>;
  unkId: number;
  params: TokenizerParams;
}

const isWhitespace = (cp: number): boolean =>
  cp === 0x20 ||
  cp === 0x09 ||
  cp === 0x0a ||
  cp === 0x0d ||
  /\p{Zs}/u.test(String.fromCodePoint(cp));

const isControl = (cp: number): boolean => {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return false; // tabs/newlines are whitespace, not control
  return /\p{Cc}|\p{Cf}/u.test(String.fromCodePoint(cp));
};

/** BERT's punctuation rule: the ASCII punctuation blocks PLUS any Unicode punctuation category. */
const isPunct = (cp: number): boolean => {
  if (
    (cp >= 33 && cp <= 47) ||
    (cp >= 58 && cp <= 64) ||
    (cp >= 91 && cp <= 96) ||
    (cp >= 123 && cp <= 126)
  ) {
    return true;
  }
  return /\p{P}/u.test(String.fromCodePoint(cp));
};

/** The CJK blocks BERT puts spaces around so each ideograph tokenizes on its own. */
const isChinese = (cp: number): boolean =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x20000 && cp <= 0x2a6df) ||
  (cp >= 0x2a700 && cp <= 0x2b73f) ||
  (cp >= 0x2b740 && cp <= 0x2b81f) ||
  (cp >= 0x2b820 && cp <= 0x2ceaf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x2f800 && cp <= 0x2fa1f);

/** BertNormalizer: clean control/whitespace, space CJK, strip accents, lowercase — IN THAT ORDER
 *  (strip-accents before lowercase, matching the HF reference). */
function normalize(text: string, p: TokenizerParams): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0 || cp === 0xfffd || isControl(cp)) continue; // clean_text drops these
    if (isWhitespace(cp)) {
      out += ' ';
      continue;
    }
    if (p.handleChineseChars && isChinese(cp)) out += ` ${ch} `;
    else out += ch;
  }
  if (p.stripAccents) out = out.normalize('NFD').replace(/\p{Mn}/gu, '');
  if (p.lowercase) out = out.toLowerCase();
  return out;
}

/** BertPreTokenizer: split on whitespace, then peel each punctuation char into its own token. */
function preTokenize(text: string): string[] {
  const words: string[] = [];
  for (const chunk of text.split(/\s+/)) {
    if (!chunk) continue;
    let cur = '';
    for (const ch of chunk) {
      if (isPunct(ch.codePointAt(0)!)) {
        if (cur) {
          words.push(cur);
          cur = '';
        }
        words.push(ch);
      } else {
        cur += ch;
      }
    }
    if (cur) words.push(cur);
  }
  return words;
}

/** Greedy longest-match WordPiece over one word → token ids ([UNK] for an unmatched/over-long word). */
function wordPiece(word: string, m: StaticModel): number[] {
  const chars = [...word];
  if (chars.length > m.params.maxChars) return [m.unkId];
  const ids: number[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let id = -1;
    while (end > start) {
      const piece = (start > 0 ? m.params.prefix : '') + chars.slice(start, end).join('');
      const found = m.vocab.get(piece);
      if (found !== undefined) {
        id = found;
        break;
      }
      end -= 1;
    }
    if (id === -1) return [m.unkId]; // any unmatched span makes the whole word unknown (BERT rule)
    ids.push(id);
    start = end;
  }
  return ids;
}

/** Tokenize `text` to matrix row ids — no special tokens, exactly what Model2Vec means over. */
export function tokenizeIds(text: string, m: StaticModel): number[] {
  const ids: number[] = [];
  for (const word of preTokenize(normalize(text, m.params))) {
    for (const id of wordPiece(word, m)) ids.push(id);
  }
  return ids;
}

/**
 * Embed `text` to a unit vector in the model's space: mean of its embedding rows, L2-normalized.
 * Returns a zero vector for empty/all-unknown input with no rows to average (the caller treats a
 * zero vector as "no signal", never a match). Pure and fast — one Float64 accumulator, scale once.
 */
export function embed(text: string, m: StaticModel): Float32Array {
  const ids = tokenizeIds(text, m);
  const out = new Float32Array(m.dim);
  if (ids.length === 0) return out;
  const acc = new Float64Array(m.dim); // sum int8 rows exactly, then scale + normalize once
  for (const id of ids) {
    const base = id * m.dim;
    for (let d = 0; d < m.dim; d++) acc[d] += m.matrix[base + d];
  }
  let norm = 0;
  const invN = 1 / ids.length;
  for (let d = 0; d < m.dim; d++) {
    const v = acc[d] * m.scale * invN;
    out[d] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    const inv = 1 / norm;
    for (let d = 0; d < m.dim; d++) out[d] *= inv;
  }
  return out;
}

/** Cosine of two L2-normalized vectors (a plain dot product). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
