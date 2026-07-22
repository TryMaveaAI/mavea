// bend.ts — the arithmetic behind bendable answers. The model ships a block with ONE
// draggable input and formulas describing how its outputs follow; dragging recomputes
// locally through THIS evaluator. Honesty is the whole design: the formula is
// model-authored, shown to the user, and evaluated by a whitelist parser — digits, x,
// + - * / ( ) and nothing else. Never eval(), never new Function().

/** Tokens a bend formula may contain. Anything else makes the formula invalid. */
const TOKEN = /\d+(?:\.\d+)?|[x+\-*/()]/gy;

type Tok = number | 'x' | '+' | '-' | '*' | '/' | '(' | ')';

function tokenize(formula: string): Tok[] | null {
  const src = formula.replace(/\s+/g, '');
  if (!src) return null;
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(src);
    if (!m) return null;
    const t = m[0];
    out.push(t === 'x' || '+-*/()'.includes(t) ? (t as Tok) : Number(t));
    i = TOKEN.lastIndex;
  }
  return out;
}

/** Recursive-descent over the token list: expr → term (± term)*, term → factor (✕ factor)*,
 *  factor → number | x | (expr) | -factor. */
function parse(toks: Tok[], x: number): number | null {
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];
  const next = (): Tok | undefined => toks[pos++];

  function factor(): number | null {
    const t = next();
    if (t === undefined) return null;
    if (typeof t === 'number') return t;
    if (t === 'x') return x;
    if (t === '-') {
      const f = factor();
      return f === null ? null : -f;
    }
    if (t === '(') {
      const e = expr();
      if (e === null || next() !== ')') return null;
      return e;
    }
    return null;
  }

  function term(): number | null {
    let v = factor();
    if (v === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const f = factor();
      if (f === null) return null;
      v = op === '*' ? v * f : v / f;
    }
    return v;
  }

  function expr(): number | null {
    let v = term();
    if (v === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const t = term();
      if (t === null) return null;
      v = op === '+' ? v + t : v - t;
    }
    return v;
  }

  const v = expr();
  return pos === toks.length && v !== null && Number.isFinite(v) ? v : null;
}

/** Evaluate a bend formula at x. Null on any syntax error or non-finite result. */
export function evaluateBend(formula: string, x: number): number | null {
  const toks = tokenize(formula);
  return toks ? parse(toks, x) : null;
}

/** A formula is valid when it parses, references x, and evaluates finitely at a probe. */
export function isValidBendFormula(formula: string): boolean {
  if (formula.length > 120) return false;
  const toks = tokenize(formula);
  if (!toks || !toks.includes('x')) return false;
  return parse(toks, 1) !== null;
}

/** Compact display for recomputed outputs: thousands grouping, sensible decimals. */
export function formatBendValue(v: number): string {
  const abs = Math.abs(v);
  const decimals = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2;
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
