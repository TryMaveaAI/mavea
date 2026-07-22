// expr.ts — a tiny SAFE arithmetic evaluator for livecompute's what-if formula.
//
// The formula comes from model output, so it is never passed to eval()/Function() (which would let
// untrusted text run code). Instead we tokenize → shunting-yard → evaluate RPN, supporting only
// numbers, variable names, the operators + - * / ^, parentheses, and unary +/-. Anything malformed,
// any unknown variable, or any illegal character yields NaN — the surface then shows "—" rather than
// a wrong or dangerous result.

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

function tokenize(s: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i + 1;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    if ('+-*/^()'.includes(c)) {
      out.push(c);
      i++;
      continue;
    }
    return null; // illegal character → reject (never executes anything)
  }
  return out;
}

const isNumTok = (t: string) => (t[0] >= '0' && t[0] <= '9') || t[0] === '.';

/** Evaluate a restricted arithmetic expression over `vars`. Returns NaN on any error. */
export function safeEval(expr: string, vars: Record<string, number>): number {
  const toks = tokenize(expr || '');
  if (!toks || !toks.length) return NaN;

  // Shunting-yard → RPN.
  const rpn: string[] = [];
  const ops: string[] = [];
  let prev: 'val' | 'op' | 'lparen' | null = null;
  for (const tk of toks) {
    if (isNumTok(tk) || /[a-zA-Z_]/.test(tk[0])) {
      rpn.push(tk);
      prev = 'val';
    } else if (tk === '(') {
      ops.push(tk);
      prev = 'lparen';
    } else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') rpn.push(ops.pop() as string);
      if (!ops.length) return NaN;
      ops.pop();
      prev = 'val';
    } else {
      let op = tk;
      if ((op === '-' || op === '+') && (prev === null || prev === 'op' || prev === 'lparen')) {
        op = op === '-' ? 'u-' : 'u+';
      }
      const prec = (o: string) => (o === 'u-' || o === 'u+' ? 4 : (PREC[o] ?? 0));
      const rightAssoc = op === '^' || op === 'u-' || op === 'u+';
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === '(') break;
        if (prec(top) > prec(op) || (prec(top) === prec(op) && !rightAssoc))
          rpn.push(ops.pop() as string);
        else break;
      }
      ops.push(op);
      prev = 'op';
    }
  }
  while (ops.length) {
    const o = ops.pop() as string;
    if (o === '(') return NaN; // mismatched parenthesis
    rpn.push(o);
  }

  // Evaluate RPN.
  const st: number[] = [];
  for (const t of rpn) {
    if (t === 'u-') {
      if (!st.length) return NaN;
      st.push(-(st.pop() as number));
    } else if (t === 'u+') {
      if (!st.length) return NaN;
    } else if (t in PREC) {
      if (st.length < 2) return NaN;
      const b = st.pop() as number;
      const a = st.pop() as number;
      st.push(
        t === '+'
          ? a + b
          : t === '-'
            ? a - b
            : t === '*'
              ? a * b
              : t === '/'
                ? a / b
                : Math.pow(a, b),
      );
    } else if (isNumTok(t)) {
      const n = Number(t);
      if (!isFinite(n)) return NaN;
      st.push(n);
    } else {
      const v = vars[t];
      if (typeof v !== 'number' || !isFinite(v)) return NaN;
      st.push(v);
    }
  }
  return st.length === 1 && isFinite(st[0]) ? st[0] : NaN;
}
