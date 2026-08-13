import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DistinctionCard } from '../src/canvas/blocks/reference/DistinctionCard';
import type { DistinctionCardProps } from '../src/canvas/blocks/reference/types';
import { CATALOG_REFERENCE } from '../src/canvas/blocks/catalog/families/reference';
import { detectDomains, domainFitsOrNeutral, blockDomainsOf } from '../src/live/select/domains';
import { detectRequested } from '../src/live/select/shapes';

// The block is sized for the two or three terms people actually confuse, but a live reply
// decides the term count — the column math, the degenerate-data guards, and the accent
// allowlist all have to hold on whatever arrives, not just on the authored demo.

const AFFECT_EFFECT: DistinctionCardProps = {
  title: 'Affect vs effect',
  terms: [
    {
      term: 'affect',
      tag: 'verb',
      gist: 'to influence something',
      example: 'The rain affected it.',
    },
    {
      term: 'effect',
      tag: 'noun',
      gist: 'the result of influence',
      example: 'The rain had an effect.',
    },
  ],
  discriminator: 'Swap in "influence" and it still reads → affect. Swap in "result" → effect.',
  commonMistake: 'Writing "the affects of the storm" when you mean its results.',
};

/** The inline column counts the term grid was laid out with: the full-width one and the
 *  step-down a mid-width card falls back to. */
function columns(container: HTMLElement): { wide: string; narrow: string } | null {
  const grid = container.querySelector<HTMLElement>('.dcd-terms');
  if (!grid) return null;
  return {
    wide: grid.style.getPropertyValue('--dcd-cols'),
    narrow: grid.style.getPropertyValue('--dcd-cols-narrow'),
  };
}

function terms(n: number): DistinctionCardProps['terms'] {
  return Array.from({ length: n }, (_, i) => ({ term: `t${i}`, gist: `g${i}` }));
}

describe('DistinctionCard', () => {
  it('renders both terms and anchors on the discriminating rule', () => {
    const { container, getByText } = render(<DistinctionCard {...AFFECT_EFFECT} />);
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(2);
    expect(columns(container)).toEqual({ wide: '2', narrow: '2' });
    expect(getByText(AFFECT_EFFECT.discriminator)).toBeTruthy();
    // The rule is what the live annotation layer should underline — not one of the terms.
    expect(container.querySelector('[data-mark]')).toBe(container.querySelector('.dcd-rule-text'));
  });

  it('gives three terms their own column each', () => {
    const props: DistinctionCardProps = {
      ...AFFECT_EFFECT,
      terms: [...AFFECT_EFFECT.terms, { term: 'impact', gist: 'both, informally' }],
    };
    const { container } = render(<DistinctionCard {...props} />);
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(3);
    // Three across a wide card, but only two once the card narrows — the third wraps rather
    // than the row splitting into slivers.
    expect(columns(container)).toEqual({ wide: '3', narrow: '2' });
  });

  // The count the layout could most plausibly "silently break" at: a fourth panel must add a
  // ROW, never a fourth column.
  it('wraps a fourth term onto a second row instead of adding a fourth column', () => {
    const { container } = render(<DistinctionCard {...AFFECT_EFFECT} terms={terms(4)} />);
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(4);
    expect(columns(container)).toEqual({ wide: '2', narrow: '2' });
  });

  it('wraps a longer list onto balanced rows instead of crushing the panels', () => {
    const { container } = render(<DistinctionCard {...AFFECT_EFFECT} terms={terms(5)} />);
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(5);
    // 5 across rows of at most 3 → 3 + 2, never five slivers in one row.
    expect(columns(container)).toEqual({ wide: '3', narrow: '2' });
  });

  // The layout's one invariant, stated over every count a reply could arrive with rather than
  // over the handful spelled out above.
  it('never lays out more than three columns, at any term count', () => {
    for (let n = 1; n <= 40; n += 1) {
      const { container, unmount } = render(
        <DistinctionCard {...AFFECT_EFFECT} terms={terms(n)} />,
      );
      const cols = columns(container);
      expect(container.querySelectorAll('.dcd-term')).toHaveLength(n);
      expect(Number(cols?.wide)).toBeGreaterThanOrEqual(1);
      expect(Number(cols?.wide)).toBeLessThanOrEqual(3);
      expect(Number(cols?.narrow)).toBeLessThanOrEqual(2);
      unmount();
    }
  });

  it('renders a single term without collapsing the grid', () => {
    const { container } = render(
      <DistinctionCard {...AFFECT_EFFECT} terms={[AFFECT_EFFECT.terms[0]]} />,
    );
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(1);
    expect(columns(container)).toEqual({ wide: '1', narrow: '1' });
    expect(container.querySelector('.dcd-empty')).toBeNull();
  });

  it('keeps the panels when the reply omitted the discriminator', () => {
    const loose = {
      ...AFFECT_EFFECT,
      discriminator: undefined,
      commonMistake: undefined,
    } as unknown as DistinctionCardProps;
    const { container } = render(<DistinctionCard {...loose} />);
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(2);
    expect(container.querySelector('.dcd-rule')).toBeNull();
    expect(container.querySelector('.dcd-mistake')).toBeNull();
    // Two labelled panels are still an answer — the empty state is for having nothing at all.
    expect(container.querySelector('.dcd-empty')).toBeNull();
  });

  it('omits the example line for a term that has no example', () => {
    const { container, getByText } = render(
      <DistinctionCard
        {...AFFECT_EFFECT}
        terms={[{ term: 'affect', gist: 'to influence something' }]}
      />,
    );
    expect(container.querySelector('.dcd-gist')).toBeTruthy();
    expect(getByText('to influence something')).toBeTruthy();
    expect(container.querySelector('.dcd-example')).toBeNull();
    expect(container.querySelector('.dcd-term-tag')).toBeNull();
  });

  it('still shows the rule when only the rule survived', () => {
    const loose = {
      title: 'Just the test',
      terms: [],
      discriminator: 'Past tense → -ed.',
    } as unknown as DistinctionCardProps;
    const { container, getByText } = render(<DistinctionCard {...loose} />);
    expect(container.querySelector('.dcd-terms')).toBeNull();
    expect(getByText('Past tense → -ed.')).toBeTruthy();
    expect(container.querySelector('.dcd-empty')).toBeNull();
  });

  it('drops unusable terms and hides the rule when the model sent none', () => {
    const loose = {
      title: 'Half an answer',
      terms: [null, { term: '  ', gist: 'blank name' }, { term: 'condo' }],
      discriminator: '   ',
    } as unknown as DistinctionCardProps;
    const { container } = render(<DistinctionCard {...loose} />);
    expect(container.querySelectorAll('.dcd-term')).toHaveLength(1);
    expect(container.querySelector('.dcd-rule')).toBeNull();
    expect(container.querySelector('.dcd-empty')).toBeNull();
  });

  it('falls back to the empty state with nothing to tell apart', () => {
    const { container } = render(
      <DistinctionCard {...({ title: 'Nothing yet' } as unknown as DistinctionCardProps)} />,
    );
    expect(container.querySelector('.dcd-empty')).toBeTruthy();
  });

  it('survives a non-array terms prop', () => {
    const loose = {
      title: 'Bad shape',
      terms: 'affect and effect',
      discriminator: 'Swap in "influence".',
    } as unknown as DistinctionCardProps;
    const { container } = render(<DistinctionCard {...loose} />);
    expect(container.querySelector('.dcd-terms')).toBeNull();
    expect(container.querySelector('.dcd-rule-text')).toBeTruthy();
  });

  it('ignores a colour outside the design system rather than passing it to style', () => {
    const loose = {
      ...AFFECT_EFFECT,
      terms: [{ term: 'affect', gist: 'to influence', color: 'url(#injected)' }],
    } as unknown as DistinctionCardProps;
    const { container } = render(<DistinctionCard {...loose} />);
    const panel = container.querySelector<HTMLElement>('.dcd-term');
    expect(panel?.style.getPropertyValue('--dcd-c')).toBe('var(--presence)');
  });

  it('renders long model strings in full, as escaped text', () => {
    const long = 'Kubernetes'.repeat(24);
    const { container, getByText } = render(
      <DistinctionCard
        title={long}
        terms={[
          { term: long, tag: long, gist: `${long} is the one that scales.`, example: long },
          { term: 'b', gist: 'b' },
        ]}
        discriminator={`${long}?`}
        discriminatorLabel={long}
        commonMistake={long}
      />,
    );
    // Nothing is truncated in the DOM — wrapping is CSS's job (pinned below), not the JSX's.
    expect(container.querySelector('.dcd-term-name')?.textContent).toBe(long);
    expect(getByText(`${long}?`)).toBeTruthy();
    // Model text goes through React text nodes, so markup in it is inert.
    const injected = '<img src=x onerror=alert(1)>';
    const { container: c2 } = render(
      <DistinctionCard
        title="t"
        terms={[{ term: injected, gist: injected }]}
        discriminator={injected}
      />,
    );
    expect(c2.querySelector('img')).toBeNull();
    expect(c2.querySelector('.dcd-term-name')?.textContent).toBe(injected);
  });
});

// jsdom does no layout, so the wrapping guarantees the long-string case depends on are pinned
// against the stylesheet itself: every slot that carries model text must be able to break an
// unbroken run, and the grid tracks must be able to shrink below their content.
describe('DistinctionCard styles', () => {
  const sheet = readFileSync(join(__dirname, '../src/canvas/blocks/reference/styles.css'), 'utf8');
  // Only the block's own section, so a `.dcd-*` selector that went missing can't be satisfied by
  // an unrelated rule elsewhere in the family sheet.
  const css = sheet.slice(sheet.indexOf('── distinctioncard ──'));

  function rule(selector: string): string {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, `${selector} missing from styles.css`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  }

  it.each([
    '.dcd-term-name',
    '.dcd-term-tag',
    '.dcd-gist',
    '.dcd-example',
    '.dcd-rule-text',
    '.dcd-rule-label',
    '.dcd-mistake-text',
  ])('%s can break a long unbroken string', (selector) => {
    expect(rule(selector)).toContain('overflow-wrap: anywhere');
  });

  it('lets the term tracks and panels shrink below their content', () => {
    expect(rule('.dcd-terms')).toContain('minmax(0, 1fr)');
    expect(rule('.dcd-term')).toContain('min-width: 0');
  });

  it('drives every column count from the data, never a hard-coded N', () => {
    // Both breakpoints must read the inline custom property; a literal here would reintroduce
    // the fixed-N assumption the component exists to avoid.
    expect(rule('.dcd-terms')).toContain('repeat(var(--dcd-cols, 2)');
    expect(css).toContain('repeat(var(--dcd-cols-narrow, 2)');
  });
});

// Retrieval, not rendering: a block is only as good as the asks it survives to be offered for.
describe('distinctioncard catalog meta', () => {
  const meta = CATALOG_REFERENCE.find((m) => m.type === 'distinctioncard');

  it('is registered', () => {
    expect(meta).toBeTruthy();
  });

  // "What's the difference between X and Y" is a SHAPE of question, not a subject — the confusable
  // pair can be grammar, meteorology, housing, networking, biology. So the block must stay
  // domain-neutral: rank.ts applies domainFitsOrNeutral as a HARD filter on the candidate pool,
  // and the ask's own domains are keyword-detected, which puts a subject tag on a collision course
  // with the shorthand phrasing (see the two tests below).
  it('carries no domains, so the sanity gate never drops it', () => {
    expect(meta?.domains).toBeUndefined();
  });

  /** rank.ts's actual candidate predicate for this block: an explicitly-pinned type bypasses the
   *  domain gate, so the two have to be evaluated together, not the gate alone. */
  function offered(ask: string, domains: readonly string[] | undefined): boolean {
    if (detectRequested(ask).includes('distinctioncard')) return true;
    return domainFitsOrNeutral(
      blockDomainsOf({ type: 'distinctioncard', domains: domains as string[] | undefined }),
      detectDomains(ask),
    );
  }

  it.each([
    "what's the difference between affect and effect",
    'affect vs effect',
    'weather vs climate',
    'apartment vs condo',
    'how is a condo different from an apartment',
    'difference between weather and climate',
    'mitosis vs meiosis',
    'http vs https',
    "their vs there vs they're",
    'is it fewer or less',
    'I keep confusing affect and effect, which is which',
  ])('is offered for %j', (ask) => {
    expect(offered(ask, meta?.domains)).toBe(true);
  });

  // The test above must not pass vacuously — the block's keyword pin in shapes.ts rescues the
  // long phrasings ("difference between X and Y", "how is X different from Y") from the gate
  // regardless. What the {education, language} tag actually broke was the SHORTHAND: a bare
  // "X vs Y" has no pin, and the `vs` itself reads as the `decision` domain, so the tag dropped
  // the commonest way people type this ask. That is the regression this pins.
  it('proves the tag had teeth — a subject tag drops the bare "X vs Y" shorthand', () => {
    const shorthand = [
      'affect vs effect',
      'weather vs climate',
      'apartment vs condo',
      'mitosis vs meiosis',
      'http vs https',
      "their vs there vs they're",
    ];
    expect(shorthand.filter((ask) => !offered(ask, ['education', 'language']))).toEqual(shorthand);
  });

  // The blurb is the retrieval index — it is what the prompt menu shows the model and what the
  // semantic index embeds. It has to contain the words a user actually types.
  it.each([
    "what's the difference between",
    'how is x different from',
    'which is which',
    'keep confusing',
  ])('advertises the literal phrasing %j', (phrase) => {
    expect(meta?.blurb.toLowerCase()).toContain(phrase);
  });

  it('declares every prop exactly once, and only real props', () => {
    const declared = [...(meta?.requires ?? []), ...(meta?.optional ?? [])];
    expect(new Set(declared).size).toBe(declared.length);
    expect(new Set(declared)).toEqual(
      new Set([
        'title',
        'terms',
        'discriminator',
        'icon',
        'iconColor',
        'discriminatorLabel',
        'commonMistake',
        'footer',
      ]),
    );
  });

  it('keeps the intents that describe the ask', () => {
    expect(meta?.intents).toEqual(['explain', 'teach', 'reference']);
  });
});
