// Regression guard against present.css accumulating dead selectors again — this is the file a
// Jul 10 2026 pass trimmed by ~370 lines (a persona theming system + a pre-unification deck DOM
// structure, both replaced by the shared slide-skin system, left every selector unreachable).
// Every class token the stylesheet defines must still be reachable from a real render: either it
// literally appears in a .ts/.tsx source file, or it matches one of the two documented exceptions
// below. A token that matches neither is a selector nothing can ever apply — dead CSS.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith('.ts') || e.name.endsWith('.tsx') ? [p] : [];
  });
}

// Class names built at runtime by string/template concatenation rather than written literally —
// a plain-text scan of the .tsx source can't see the assembled result, only the static prefix.
const DYNAMIC_PREFIXES: readonly string[] = [
  // PresentationDeck.tsx: `preso-slide-anim preso-dir-${dir}` where dir is 'next' | 'prev'.
  // Only 'prev' gets its own animation-direction rule; 'next' rides the unmodified base class.
  'preso-dir',
  // PresentationDeck.tsx: `preso-curtain preso-curtain-${mode}` where mode is 'black' | 'white'.
  'preso-curtain',
];

// Classes applied purely through CSS combinators (a state class toggled by a sibling/ancestor, or
// a browser pseudo-state) that no JS/TSX ever needs to spell out by name. None exist in this file
// today — every state class here (.is-active/.is-open/.is-on) is toggled by literal string
// concatenation in the component, so a plain scan already finds it. Kept as a documented, explicit
// hook so a legitimate future case has somewhere sanctioned to go instead of weakening the scan.
const COMBINATOR_ONLY: readonly string[] = [];

const cssPath = join(__dirname, '../src/live/present/present.css');
const css = readFileSync(cssPath, 'utf8');

const srcDir = join(__dirname, '../src');
const allSource = sourceFiles(srcDir)
  .filter((f) => f !== cssPath)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

function extractClassTokens(text: string): string[] {
  const tokens = new Set<string>();
  const re = /\.([A-Za-z][A-Za-z0-9_-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tokens.add(m[1]);
  return [...tokens].sort();
}

function extractAttrSelectorValues(text: string, attr: string): string[] {
  const values = new Set<string>();
  const re = new RegExp(`\\[${attr}=(['"])([^'"]*)\\1\\]`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) values.add(m[2]);
  return [...values];
}

describe('present.css — every class selector resolves to a real render', () => {
  const tokens = extractClassTokens(css);

  it('found a non-trivial number of class selectors to check (sanity check on the scan itself)', () => {
    expect(tokens.length).toBeGreaterThan(40);
  });

  it('every class token appears in source or is a documented dynamic/combinator exception', () => {
    const unresolved = tokens.filter((t) => {
      if (allSource.includes(t)) return false;
      if (DYNAMIC_PREFIXES.some((prefix) => t.startsWith(prefix))) return false;
      if (COMBINATOR_ONLY.includes(t)) return false;
      return true;
    });
    expect(unresolved).toEqual([]);
  });
});

describe('present.css — the retired persona theming system stays retired', () => {
  // The old data-preso values (boardroom/pitch/classroom/report/bold) drove a five-way token
  // rebind that a 2026-07-10 pass deleted as dead: data-preso is set at runtime to a slide-skin
  // id (folio/meridian/noir/north/lumen/grid/terra/cobalt/press/sol — see personas.ts), never to
  // one of these. If one of these five strings ever reappears as a data-preso attribute-selector
  // value, the dead persona-rebind mechanism is growing back.
  const RETIRED_PERSONA_IDS = ['boardroom', 'pitch', 'classroom', 'report', 'bold'];

  it('data-preso attribute selectors never target a retired persona id', () => {
    const values = extractAttrSelectorValues(css, 'data-preso');
    for (const id of RETIRED_PERSONA_IDS) {
      expect(values).not.toContain(id);
    }
  });
});
