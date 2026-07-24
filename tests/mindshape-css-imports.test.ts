// MindShape ("Watch Me Think") must carry its own styles. The live overlay and the read-only
// viewer mount the component DIRECTLY — the diagrams registry chunk (whose styles.css once held
// every .ms-* rule) is not loaded on those routes, which is exactly how the surface shipped as
// raw unstyled HTML on a fresh session. Unit tests strip CSS (vite test.css: false), so this
// guards the import graph at the source level instead.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'src/canvas/blocks/diagrams/';
const component = readFileSync(DIR + 'MindShape.tsx', 'utf8');
const mindshapeCss = readFileSync(DIR + 'mindshape.css', 'utf8');
const registryCss = readFileSync(DIR + 'styles.css', 'utf8');

// The load-bearing looks of the surface: stage takeover, exit button, question, cards, action
// chips, and the plan checklist — the pieces that rendered as bare HTML when the import broke.
const LOAD_BEARING = [
  '.ms-stage-fill',
  '.ms-exit',
  '.ms-center-question',
  '.ms-card',
  '.ms-action-btn',
  '.ms-plan-check',
];

describe('MindShape styles ride with the component', () => {
  it('MindShape.tsx imports its base stylesheet directly', () => {
    expect(component).toContain("import './mindshape.css'");
    expect(component).toContain("import './mindshape-world.css'");
  });

  it('the base stylesheet actually holds the load-bearing rules', () => {
    for (const sel of LOAD_BEARING) expect(mindshapeCss, sel).toContain(sel);
  });

  it('the registry sheet no longer duplicates them (one source of truth)', () => {
    expect(registryCss).not.toMatch(/\.ms-/);
  });
});
