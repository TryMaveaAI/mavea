import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const stylelintEntry = require.resolve('stylelint');
const micromatchEntry = createRequire(stylelintEntry).resolve('micromatch');
const bracesEntry = createRequire(micromatchEntry).resolve('braces');
interface Ast {
  type: string;
  nodes: Ast[];
  parent?: Ast;
}
interface Braces {
  (input: string): string[];
  parse(input: string): Ast;
  compile(input: string | Ast): string;
  stringify(input: string | Ast): string;
  expand(input: string | Ast): string[];
}
const braces: Braces = require(bracesEntry);
const rejected = /Brace nesting exceeds maximum depth \(128\)/;

function nestedAst(depth: number): Ast {
  let node: Ast = { type: 'root', nodes: [] };
  for (let i = 0; i < depth; i++) {
    node = { type: 'root', nodes: [node] };
  }
  return node;
}

describe('braces recursion security boundary', () => {
  it('preserves ordinary glob compilation, expansion and stringification', () => {
    const pattern = 'a/{b,c}/{1..3}';
    expect(braces.compile(pattern)).toBe('a/(b|c)/([1-3])');
    expect(braces.stringify(pattern)).toBe(pattern);
    expect(braces.expand(pattern)).toEqual(['a/b/1', 'a/b/2', 'a/b/3', 'a/c/1', 'a/c/2', 'a/c/3']);
    expect(braces.compile('\\{literal\\}')).toBe('{literal}');
    expect(braces.stringify('{'.repeat(127) + 'a,b' + '}'.repeat(127))).toBe(
      '{'.repeat(127) + 'a,b' + '}'.repeat(127),
    );
  });

  for (const opening of ['{', '(']) {
    for (const closing of ['', opening === '{' ? '}' : ')']) {
      it(`rejects excessive ${opening} nesting with closing ${closing || 'missing'}`, () => {
        const pattern = opening.repeat(3000) + 'a,b' + closing.repeat(3000);
        for (const run of [braces, braces.parse, braces.compile, braces.stringify, braces.expand]) {
          expect(() => run(pattern)).toThrow(rejected);
        }
      });
    }
  }

  for (const method of ['compile', 'stringify', 'expand'] as const) {
    it(`bounds ${method} for caller-supplied deep and cyclic ASTs`, () => {
      expect(() => braces[method](nestedAst(3000))).toThrow(rejected);
      const cyclic: Ast = { type: 'root', nodes: [] };
      cyclic.nodes.push(cyclic);
      expect(() => braces[method](cyclic)).toThrow(rejected);
    });
  }

  it('bounds cyclic parent links during expansion', () => {
    const parent: Ast = { type: 'paren', nodes: [] };
    parent.parent = parent;
    const child: Ast = { type: 'paren', nodes: [], parent };
    parent.nodes.push(child);
    expect(() => braces.expand(parent)).toThrow(rejected);
  });
});
