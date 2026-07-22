/** CSP-safe recursive-descent math expression evaluator.
 *
 *  Supports: numbers, variables, +  -  *  /  ^, unary minus,
 *  and the standard functions sin/cos/tan/sqrt/abs/exp/log/ln/pi/e.
 *  No eval() or new Function() — safe under strict CSP.
 */

type Tok =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'lp' }
  | { k: 'rp' };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let s = '';
      while (i < src.length && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) s += src[i++];
      toks.push({ k: 'num', v: parseFloat(s) });
    } else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let s = '';
      while (
        i < src.length &&
        ((src[i] >= 'a' && src[i] <= 'z') ||
          (src[i] >= 'A' && src[i] <= 'Z') ||
          (src[i] >= '0' && src[i] <= '9') ||
          src[i] === '_')
      )
        s += src[i++];
      toks.push({ k: 'id', v: s });
    } else if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      toks.push({ k: 'op', v: c });
      i++;
    } else if (c === '(') {
      toks.push({ k: 'lp' });
      i++;
    } else if (c === ')') {
      toks.push({ k: 'rp' });
      i++;
    } else {
      i++;
    }
  }
  return toks;
}

class P {
  private toks: Tok[];
  private pos = 0;
  private vars: Record<string, number>;

  constructor(toks: Tok[], vars: Record<string, number>) {
    this.toks = toks;
    this.vars = vars;
  }

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private eat(): Tok {
    return this.toks[this.pos++];
  }

  parse(): number {
    return this.expr();
  }

  // expr = term (('+' | '-') term)*
  private expr(): number {
    let v = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.k !== 'op' || (t.v !== '+' && t.v !== '-')) break;
      this.eat();
      const r = this.term();
      v = t.v === '+' ? v + r : v - r;
    }
    return v;
  }

  // term = factor (('*' | '/') factor)*
  private term(): number {
    let v = this.factor();
    for (;;) {
      const t = this.peek();
      if (t?.k !== 'op' || (t.v !== '*' && t.v !== '/')) break;
      this.eat();
      const r = this.factor();
      v = t.v === '*' ? v * r : v / r;
    }
    return v;
  }

  // factor = unary ('^' factor)?   (right-assoc)
  private factor(): number {
    const base = this.unary();
    const t = this.peek();
    if (t?.k === 'op' && t.v === '^') {
      this.eat();
      return Math.pow(base, this.factor());
    }
    return base;
  }

  // unary = '-' unary | primary
  private unary(): number {
    const t = this.peek();
    if (t?.k === 'op' && t.v === '-') {
      this.eat();
      return -this.unary();
    }
    return this.primary();
  }

  // primary = num | '(' expr ')' | id | id '(' expr (',' expr)* ')'
  private primary(): number {
    const t = this.peek();
    if (!t) return 0;
    if (t.k === 'num') {
      this.eat();
      return t.v;
    }
    if (t.k === 'lp') {
      this.eat();
      const v = this.expr();
      if (this.peek()?.k === 'rp') this.eat();
      return v;
    }
    if (t.k === 'id') {
      this.eat();
      const nm = t.v.toLowerCase();
      // Function call
      if (this.peek()?.k === 'lp') {
        this.eat(); // lp
        const a = this.expr();
        if (this.peek()?.k === 'rp') this.eat();
        switch (nm) {
          case 'sin':
            return Math.sin(a);
          case 'cos':
            return Math.cos(a);
          case 'tan':
            return Math.tan(a);
          case 'sqrt':
            return Math.sqrt(a);
          case 'abs':
            return Math.abs(a);
          case 'exp':
            return Math.exp(a);
          case 'log':
          case 'ln':
            return Math.log(a);
          case 'asin':
            return Math.asin(a);
          case 'acos':
            return Math.acos(a);
          case 'atan':
            return Math.atan(a);
          default:
            return 0;
        }
      }
      // Named constant
      if (nm === 'pi') return Math.PI;
      if (nm === 'e') return Math.E;
      // Variable lookup — try original case then lowercase
      return this.vars[t.v] ?? this.vars[nm] ?? 0;
    }
    return 0;
  }
}

function evalExpr(src: string, vars: Record<string, number>): number {
  return new P(tokenize(src), vars).parse();
}

/** Build an evaluator for an expression in one variable `t`. Returns null if src is empty. */
export function makeEval1(expr: string): ((t: number) => number) | null {
  if (!expr.trim()) return null;
  return (t: number) => evalExpr(expr, { t });
}

/** Build an evaluator for an expression in two variables `x` and `y`. Returns null if src is empty. */
export function makeEval2(expr: string): ((x: number, y: number) => number) | null {
  if (!expr.trim()) return null;
  return (x: number, y: number) => evalExpr(expr, { x, y });
}
