// levers/expr.ts — a tiny, SAFE arithmetic evaluator for lever formulas. Supports + - * / parentheses,
// unary minus, numeric literals, and identifiers (resolved from a bindings map). NO eval() — a hand-
// written tokenizer + recursive-descent parser — so a model-proposed formula can never execute
// anything but arithmetic. Any malformed formula, unknown identifier, or division by zero yields NaN
// (the caller treats a NaN node as unresolved, never as a wrong number). Pure + deterministic.

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      toks.push({ t: 'op', v: ch });
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) return null;
      toks.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j += 1;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    return null; // unexpected character
  }
  return toks;
}

/** Recursive-descent parser → evaluator in one pass, against a bindings map. Throws on any structural
 *  error; the public `evalExpr` catches and returns NaN. */
class Parser {
  private pos = 0;
  constructor(
    private readonly toks: Tok[],
    private readonly env: Readonly<Record<string, number>>,
  ) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }

  parse(): number {
    const v = this.expr();
    if (this.pos !== this.toks.length) throw new Error('trailing tokens');
    return v;
  }

  // expr := term (('+' | '-') term)*
  private expr(): number {
    let v = this.term();
    for (let t = this.peek(); t && t.t === 'op' && (t.v === '+' || t.v === '-'); t = this.peek()) {
      this.pos += 1;
      const rhs = this.term();
      v = t.v === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  // term := factor (('*' | '/') factor)*
  private term(): number {
    let v = this.factor();
    for (let t = this.peek(); t && t.t === 'op' && (t.v === '*' || t.v === '/'); t = this.peek()) {
      this.pos += 1;
      const rhs = this.factor();
      if (t.v === '/') {
        if (rhs === 0) throw new Error('division by zero');
        v = v / rhs;
      } else {
        v = v * rhs;
      }
    }
    return v;
  }

  // factor := '-' factor | '(' expr ')' | num | id
  private factor(): number {
    const t = this.peek();
    if (!t) throw new Error('unexpected end');
    if (t.t === 'op' && t.v === '-') {
      this.pos += 1;
      return -this.factor();
    }
    if (t.t === 'op' && t.v === '(') {
      this.pos += 1;
      const v = this.expr();
      const close = this.peek();
      if (!close || close.t !== 'op' || close.v !== ')') throw new Error('missing )');
      this.pos += 1;
      return v;
    }
    if (t.t === 'num') {
      this.pos += 1;
      return t.v;
    }
    if (t.t === 'id') {
      this.pos += 1;
      const val = this.env[t.v];
      if (val === undefined || !Number.isFinite(val)) throw new Error(`unbound: ${t.v}`);
      return val;
    }
    throw new Error('unexpected token');
  }
}

/** Evaluate `formula` against `env` (variable → number). Returns NaN on ANY error — malformed syntax,
 *  an unbound/unresolved identifier, or division by zero — so a bad formula never yields a wrong value. */
export function evalExpr(formula: string, env: Readonly<Record<string, number>>): number {
  const toks = tokenize(formula);
  if (!toks || toks.length === 0) return NaN;
  try {
    const v = new Parser(toks, env).parse();
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

/** The identifiers a formula references (for dependency wiring / validation). [] on a parse failure. */
export function identifiersIn(formula: string): string[] {
  const toks = tokenize(formula);
  if (!toks) return [];
  return [
    ...new Set(toks.filter((t): t is { t: 'id'; v: string } => t.t === 'id').map((t) => t.v)),
  ];
}
