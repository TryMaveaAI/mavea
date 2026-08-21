// Copy shown to users about somebody else's models is a claim this project would have to stand
// behind. So the rule across every provider-facing string is: describe what MAVÉA requires, what
// THIS turn did, or a provider's own published terms — never characterise another company's
// service as slow, unreliable, or low-quality.
//
// It is also the accurate framing, which is why the rule survives review. A long turn is usually
// this app's own reasoning budget (effort.ts promotes a hard ask to extended reasoning on the
// default Balanced dial, and reasoning tokens stream invisibly — see providers/anthropic.ts), not
// the provider. And a model without JSON mode is not "ignoring" a request; it does not implement
// one. Both earlier drafts said otherwise.
//
// jsdom parses no CSS and renders no copy here, so these scan the source — the same idiom
// responsive-css-guards.test.ts uses for a defect a render cannot show.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../src/live/providers/info';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/** Words that turn a description into a claim about someone else's product. Applied ONLY to the
 *  extracted user-facing strings — never to whole files, whose comments quote these words on
 *  purpose to explain why they are banned. */
const DISPARAGING =
  /\bignores?\b|\bignoring\b|\bunreliable\b|\bbroken\b|\bbuggy\b|\blow[-\s]quality\b|\bpoor(ly)?\b|\bworse\b|\bshoddy\b|\bfails? to\b|\bcan(no|')t\b/i;

/** Pull the literal a named `const X =` is assigned, so comments around it are never scanned. */
function literalOf(source: string, name: string): string {
  const m = new RegExp(`const ${name} =\\s*\\n?\\s*'([^']*)'`).exec(source);
  expect(m, `${name} should be a single-quoted string literal`).toBeTruthy();
  return m![1];
}

describe('user-facing provider copy makes no claim about a third party', () => {
  it('the prose-collapse message describes this turn and Mavéa’s requirement, nothing else', () => {
    const msg = literalOf(read('src/live/generateLive.ts'), 'PROSE_COLLAPSE_MSG');
    expect(msg).not.toMatch(DISPARAGING);
    // It must still be USEFUL: name what happened and what to do about it.
    expect(msg).toMatch(/structured/i);
    expect(msg).toMatch(/Mavéa needs/i);
    // ...and never generalise about a class of other people's models.
    expect(msg).not.toMatch(/preview and reasoning|some models\b/i);
  });

  it('the model-picker note states how long a turn takes, not how good anyone else is', () => {
    const src = read('src/live/setup/ModelSelect.tsx');
    for (const name of ['base']) {
      const m = /const base =\s*\n?\s*'([^']*)'/.exec(src);
      expect(m, `ModelSelect ${name} literal`).toBeTruthy();
      expect(m![1]).not.toMatch(DISPARAGING);
      expect(m![1]).toMatch(/how long a turn takes/i);
    }
  });

  it('every provider hint and model note stays descriptive', () => {
    for (const p of PROVIDERS) {
      expect(p.hint, `${p.id} hint`).not.toMatch(DISPARAGING);
      for (const [model, note] of Object.entries(p.modelNotes ?? {})) {
        expect(note, `${p.id} · ${model}`).not.toMatch(DISPARAGING);
      }
    }
  });
});

// The landing shows mock cards full of invented figures — an ARR, a growth percentage, a regional
// split. They demonstrate the product; they are not anyone's real numbers and not a claim about
// Mavéa's own performance. Every section that renders them says so ON SCREEN, because a code
// comment saying "illustrative" is invisible to the person reading the page — which is exactly how
// WowFeatures came to show a $15.1M ARR with no label while its sibling section carried one.
describe('landing copy labels invented figures as illustrative', () => {
  /** Sections whose mock cards render concrete figures a reader could otherwise take as real. */
  const FIGURE_SECTIONS = [
    'src/flagship/sections/WowFeatures.tsx',
    'src/flagship/sections/SeeDontRead.tsx',
  ];

  it('every section that renders invented figures carries an on-screen note', () => {
    for (const rel of FIGURE_SECTIONS) {
      const src = read(rel);
      // The label must be rendered TEXT, not a comment: require it inside a JSX element.
      expect(src, `${rel} must label its figures on screen`).toMatch(
        />\s*Illustrative numbers\s*</,
      );
    }
  });

  it('the landing claims no endorsement it does not have', () => {
    const flagship = FIGURE_SECTIONS.concat([
      'src/flagship/sections/DemoGallery.tsx',
      'src/flagship/sections/HonestByDesign.tsx',
    ])
      .map(read)
      .join('\n');
    expect(flagship).not.toMatch(/trusted by|used by \d|as seen (in|on)|award[- ]winning|#1\b/i);
  });
});
