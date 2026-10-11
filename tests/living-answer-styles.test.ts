import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// The Live chrome's redesign ("the living answer") is four sheets layered over the surface:
// the room, the ask bar, the Go hub and the stage. They were sized to perform identically on a weak
// integrated-GPU laptop and a workstation, which jsdom cannot measure — so, like
// perf-lite-css.test.ts, this is a SOURCE-level contract on the properties that decide that:
// nothing animates at rest, nothing pins a compositor layer, every motion yields to the lite tier
// and to reduced motion, and the mood wash interpolates through a registered property rather
// than repainting a gradient every frame.

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const SHEETS = [
  'src/styles/living-answer-room.css',
  'src/styles/living-answer-ask.css',
  'src/styles/living-answer-go.css',
  'src/styles/living-answer-stage.css',
] as const;

const sheets = SHEETS.map((file) => ({ file, css: strip(read(file)) }));
const liveApp = read('src/live/LiveApp.tsx');

describe('living answer — the sheets reach the Live surface', () => {
  // Cascade order is import order: a sheet that overrides the dock, the wizard and the
  // turn-state chrome at equal specificity must be injected after the components that import
  // those sheets, i.e. after every import in the file that is not one of them.
  const lastOtherImport = Math.max(
    ...[...liveApp.matchAll(/^import .*$/gm)]
      .filter((m) => !m[0].includes('living-answer-'))
      .map((m) => m.index ?? -1),
  );

  it.each(SHEETS)('%s is imported by LiveApp after every other sheet it overrides', (file) => {
    const name = file.slice(file.lastIndexOf('/') + 1);
    const at = liveApp.indexOf(`'../styles/${name}'`);
    expect(at, `${name} must be imported from LiveApp.tsx`).toBeGreaterThan(0);
    expect(lastOtherImport).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(lastOtherImport);
  });
});

describe('living answer — performs the same on any machine', () => {
  it.each(sheets)('$file never pins a layer or blurs in the paint path', ({ css }) => {
    expect(css).not.toMatch(/will-change/);
    expect(css).not.toMatch(/filter:\s*[^;]*blur\(/);
  });

  // An endless loop is allowed only as feedback for something happening (the composing ring),
  // and then it must read `--reactive-play` so the visibility layer can pause it off-screen and
  // its selector must be gated on that state — never on the resting chrome.
  it.each(sheets)('$file loops only on a live state, and pauses off-screen', ({ css }) => {
    for (const block of css.matchAll(/([^{}]+)\{([^}]*\binfinite\b[^}]*)\}/g)) {
      expect(block[1]).toMatch(/:has\(|\[data-|:disabled|\.is-/);
      expect(block[2]).toMatch(/animation-play-state:\s*var\(--reactive-play/);
    }
  });

  it.each(sheets)('$file routes every backdrop blur through the lite-tier tokens', ({ css }) => {
    for (const m of css.matchAll(/backdrop-filter:\s*([^;]+);/g)) {
      expect(m[1].trim()).toMatch(/^var\(--(glass-blur|bar-glass-blur)/);
    }
  });

  it.each(sheets)('$file yields its motion to the lite tier and to reduced motion', ({ css }) => {
    const animates = /@keyframes/.test(css) || /animation:/.test(css);
    if (!animates) return;
    expect(css).toMatch(/:root\[data-perf='lite'\][^{]*\{[^}]*animation:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none/);
  });

  it.each(sheets)('$file sets type from the ramp, never in pixels', ({ css }) => {
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
  });
});

describe('living answer — the room follows the face', () => {
  const room = sheets[0].css;

  it('registers the mood colour so the wash can interpolate instead of repainting', () => {
    expect(room).toMatch(/@property\s+--room-a\s*\{[^}]*syntax:\s*'<color>'/);
    expect(room).toMatch(/@property\s+--room-a\s*\{[^}]*inherits:\s*true/);
  });

  it('reads the mood off the locked face without restyling it', () => {
    // Mavéa's own face only: a rehearsal table and a diagram draw faces of their own inside Live.
    expect(room).toMatch(/\.live-voice:has\(\.presence-positioner > \.presence\[data-emotion=/);
    expect(room).not.toMatch(/:has\(\.presence\[/);
    // The face is DOM- and style-locked: the room may READ its attributes, never paint its parts.
    expect(room).not.toMatch(/\.(mascot|jelly|bell|curtain|eye|blink|aura)\b[^{]*\{/);
    expect(room).not.toMatch(/--mascot-[a-z0-9-]+\s*:/);
  });
});

// In a production build templates.css is a shared asset that the Live chunk's preload list puts
// AFTER this chunk's own sheet, the reverse of dev. A living-answer rule that only TIES a template
// rule on specificity therefore wins in `pnpm dev` and loses on a cold production load — the dock
// went flat and the hub's eyebrows went back to tracked capitals, visible only in `pnpm preview`.
// So no rule here may rely on order against the template sheet: wherever both can reach the same
// element and set the same property, the living-answer rule must outrank it.
describe('living answer — outranks the template sheet, never merely follows it', () => {
  type Spec = [number, number, number];
  const cmp = (x: Spec, y: Spec) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

  // Selectors Level 4: :where() counts nothing; :not/:is/:has count their most specific argument.
  function specificity(selector: string): Spec {
    const spec: Spec = [0, 0, 0];
    let s = selector.replace(/:where\([^()]*\)/g, '');
    s = s.replace(/:(?:not|is|has)\(([^()]*)\)/g, (_, args: string) => {
      const best = args.split(',').map(specificity).sort(cmp).at(-1) ?? [0, 0, 0];
      for (let i = 0; i < 3; i++) spec[i] += best[i];
      return '';
    });
    spec[2] += (s.match(/::[\w-]+/g) ?? []).length;
    s = s.replace(/::[\w-]+/g, '');
    spec[0] += (s.match(/#[\w-]+/g) ?? []).length;
    spec[1] += (s.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length;
    spec[2] += (s.match(/(?:^|[\s>+~])[a-z][\w-]*/g) ?? []).length;
    return spec;
  }

  // A shorthand reaches the longhands a template rule may set.
  const LONGHANDS: Record<string, string[]> = {
    font: ['font-family', 'font-size', 'font-weight', 'line-height'],
    background: ['background-color', 'background-image'],
    border: ['border-color', 'border-width', 'border-style'],
    'border-top': ['border-top-color', 'border-top-width'],
    'border-bottom': ['border-bottom-color', 'border-bottom-width'],
  };
  const properties = (body: string) => {
    const out = new Set<string>();
    for (const decl of body.split(';')) {
      const name = decl.split(':')[0]?.trim();
      if (!name) continue;
      out.add(name);
      for (const longhand of LONGHANDS[name] ?? []) out.add(longhand);
    }
    return out;
  };
  const classesOf = (compound: string) => compound.match(/\.[\w-]+/g) ?? [];
  // The compounds a selector walks through, and the one it lands on. Classes inside :not() are
  // what the element must NOT have, so they are not part of what it needs.
  const compounds = (selector: string) =>
    selector
      .replace(/:not\([^()]*\)/g, '')
      .split(/\s*[>+~]\s*|\s+/)
      .filter(Boolean);

  interface Rule {
    selector: string;
    spec: Spec;
    ancestors: string[];
    subject: string[];
    props: Set<string>;
  }
  const rulesOf = (css: string): Rule[] => {
    const out: Rule[] = [];
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const props = properties(block[2]);
      for (const raw of block[1].split(',')) {
        const selector = raw.trim();
        if (!selector || selector.startsWith('@')) continue;
        const parts = compounds(selector);
        const subject = classesOf(parts.at(-1) ?? '');
        if (subject.length === 0) continue;
        out.push({
          selector,
          spec: specificity(selector),
          ancestors: parts.slice(0, -1).flatMap(classesOf),
          subject,
          props,
        });
      }
    }
    return out;
  };

  const template = rulesOf(strip(read('src/styles/templates.css')));

  // A template rule can reach what a living-answer rule styles when it asks for no class the
  // living-answer selector does not already walk through or land on.
  const reaches = (t: Rule, r: Rule) =>
    t.subject.every((c) => r.subject.includes(c)) &&
    t.ancestors.every((c) => r.ancestors.includes(c) || r.subject.includes(c));

  it.each(sheets)('$file wins on specificity wherever a template rule can reach it', ({ css }) => {
    const losses: string[] = [];
    for (const rule of rulesOf(css)) {
      for (const t of template) {
        if (!reaches(t, rule)) continue;
        const shared = [...rule.props].filter((p) => t.props.has(p));
        if (shared.length === 0) continue;
        if (cmp(rule.spec, t.spec) <= 0) {
          losses.push(
            `"${rule.selector}" ${rule.spec} ties or loses to "${t.selector}" ${t.spec} on ${shared.join(', ')}`,
          );
        }
      }
    }
    expect(losses).toEqual([]);
  });
});
