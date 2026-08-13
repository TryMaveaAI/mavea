import { render, fireEvent } from '@testing-library/react';
import { DosDonts } from '../src/canvas/blocks/layout/DosDonts';
import { VariantSwitch } from '../src/canvas/blocks/layout/VariantSwitch';
import type { DosDontsProps, VariantSwitchProps } from '../src/canvas/blocks/layout/types';
import { enforceComponentContentBudget } from '../src/canvas/blocks/catalog/contentBudget';
import { CATALOG_LAYOUT } from '../src/canvas/blocks/catalog/families/layout';
import type { ComponentMeta } from '../src/canvas/blocks/catalog/meta';

function metaFor(type: string): ComponentMeta {
  const meta = CATALOG_LAYOUT.find((m) => m.type === type);
  if (!meta) throw new Error(`${type} is missing from the layout catalog`);
  return meta;
}

describe('dosdonts smoke', () => {
  it('renders even pairs with both column headers', () => {
    const props: DosDontsProps = {
      title: 'Phone screen',
      pairs: [
        { do: 'Ask about the team', dont: 'Ask about salary', why: 'Order matters.' },
        { do: 'Name one number', dont: 'List every task', hazard: false, topic: 'Impact' },
      ],
    };
    const { container, getByText } = render(<DosDonts {...props} />);
    expect(container.querySelector('.lay-dd-heads')).toBeTruthy();
    expect(container.querySelectorAll('.lay-dd-cell')).toHaveLength(4);
    expect(container.querySelectorAll('.lay-dd-cell.solo')).toHaveLength(0);
    getByText('Order matters.');
  });

  it('spans the row when a pair has no counterpart (4 dos, 1 dont)', () => {
    const props: DosDontsProps = {
      title: 'Uneven',
      pairs: [{ do: 'A', dont: 'Z' }, { do: 'B' }, { do: 'C', dont: '   ' }, { do: 'D' }],
    };
    const { container } = render(<DosDonts {...props} />);
    expect(container.querySelectorAll('.lay-dd-cell')).toHaveLength(5);
    expect(container.querySelectorAll('.lay-dd-cell.solo')).toHaveLength(3);
    expect(container.querySelector('.lay-dd')?.className).not.toContain('lay-dd--single');
    // The headers count what is actually shown, so a blank side never inflates its tally.
    expect([...container.querySelectorAll('.lay-dd-count')].map((n) => n.textContent)).toEqual([
      '4',
      '1',
    ]);
  });

  it('collapses to one column when a whole side is missing', () => {
    const { container } = render(<DosDonts title="All dos" pairs={[{ do: 'A' }, { do: 'B' }]} />);
    expect(container.querySelector('.lay-dd')?.className).toContain('lay-dd--single');
    expect(container.querySelector('.lay-dd-heads')).toBeNull();
    // the per-cell side tag is always in the DOM so CSS can reveal it here
    expect(container.querySelectorAll('.lay-dd-tag')).toHaveLength(2);
  });

  it('flags a hazard on the dont side and survives an empty set', () => {
    const { container } = render(
      <DosDonts title="Safety" pairs={[{ do: 'Vent the room', dont: 'Mix them', hazard: true }]} />,
    );
    const cells = container.querySelectorAll<HTMLElement>('.lay-dd-cell');
    expect(cells[1].style.getPropertyValue('--dd')).toBe('var(--danger)');

    const empty = render(<DosDonts title="Nothing" pairs={[{ why: 'orphan' }]} />);
    expect(empty.container.querySelector('.lay-dd-empty')).toBeTruthy();
    expect(empty.container.querySelectorAll('.lay-dd-cell')).toHaveLength(0);
  });

  it('degrades instead of throwing on loose model JSON', () => {
    // A thrown block is not a degraded block: BlockBoundary's fallback is `null`, so the whole
    // card would disappear with no message. Every shape here used to throw.
    const notAnArray = {
      title: 'Object where an array belongs',
      pairs: { do: 'Ask about the team' },
    } as unknown as DosDontsProps;
    const { container } = render(<DosDonts {...notAnArray} />);
    expect(container.querySelector('.lay-dd-empty')).toBeTruthy();

    const junkEntries = {
      title: 'Half-shaped pairs',
      pairs: [null, 'a bare string', { do: 'Keep it to one number', topic: 7, why: { any: 'ok' } }],
    } as unknown as DosDontsProps;
    const loose = render(<DosDonts {...junkEntries} />);
    expect(loose.container.querySelectorAll('.lay-dd-cell')).toHaveLength(1);
    // A non-string topic/why is dropped rather than printed as "[object Object]".
    expect(loose.container.querySelector('.lay-dd-topic')).toBeNull();
    expect(loose.container.querySelector('.lay-dd-why')).toBeNull();
  });

  it('teaches the exact pair keys, and leads the blurb with what a user actually says', () => {
    const meta = metaFor('dosdonts');
    const blurb = meta.blurb.toLowerCase();
    // The blurb is what the model reads when picking a block; the likeliest utterance has to be
    // in it, at the front, or the phrase that names this component never reaches the menu.
    expect(blurb.indexOf("dos and don'ts")).toBeGreaterThanOrEqual(0);
    expect(blurb.indexOf("dos and don'ts")).toBeLessThan(24);

    const hints = meta.propHints ?? {};
    // `do`/`dont` have no alias path (the pair's text lives in either side, so there is no
    // itemShapes text field to rename onto): a side sent as `avoid` is projected away silently.
    expect(hints.pairs).toContain('`do`');
    expect(hints.pairs).toContain('`dont`');
    expect(hints['pairs[].dont']).toContain('no apostrophe');
    // The generic coercer reads /\boptional\b/ in a nested hint to allow a missing field. Lose
    // that word and every pair without a `dont` — the uneven case above — becomes invalid.
    expect(hints['pairs[].dont']).toMatch(/\boptional\b/i);
  });
});

describe('variantswitch smoke', () => {
  const three: VariantSwitchProps = {
    title: 'Say it three ways',
    axis: 'Tone',
    subject: 'Chasing an unpaid invoice',
    variants: [
      { label: 'Warm', paragraphs: ['Hi there.', 'No rush at all.'], when: 'Long relationship' },
      { label: 'Neutral', paragraphs: ['Following up on invoice 204.'] },
      { label: 'Firm', paragraphs: ['Invoice 204 is 45 days overdue.', 'Please remit by Friday.'] },
    ],
  };

  it('switches the panel and moves the roving tabindex', () => {
    const { container, getByRole } = render(<VariantSwitch {...three} />);
    expect(container.querySelectorAll('.lay-vs-para')).toHaveLength(2);
    fireEvent.click(getByRole('tab', { name: 'Neutral' }));
    expect(container.querySelectorAll('.lay-vs-para')).toHaveLength(1);
    const chips = container.querySelectorAll('.lay-vs-chip');
    expect(chips[1].getAttribute('aria-selected')).toBe('true');
    expect(chips[0].getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(chips[1], { key: 'End' });
    expect(container.querySelectorAll('.lay-vs-chip')[2].getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('hides the switch for a single variant and clamps a stale index', () => {
    const one = render(
      <VariantSwitch title="One" variants={[{ label: 'Only', paragraphs: ['Just this.'] }]} />,
    );
    expect(one.container.querySelector('.lay-vs-chips')).toBeNull();
    expect(one.container.querySelector('.lay-vs-solo-label')?.textContent).toBe('Only');
    // With no tablist to point at, the panel is a named region rather than an orphan tabpanel.
    const solo = one.container.querySelector('.lay-vs-panel');
    expect(solo?.getAttribute('role')).toBe('group');
    expect(solo?.getAttribute('aria-labelledby')).toBe(
      one.container.querySelector('.lay-vs-solo-label')?.id,
    );

    const shrink = render(<VariantSwitch {...three} defaultVariant={9} />);
    // clamped to the last variant rather than rendering an undefined panel
    expect(shrink.container.querySelectorAll('.lay-vs-chip')[2].getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('degrades on missing text and an empty variant list', () => {
    const bare = render(
      <VariantSwitch
        title="Bare"
        variants={[
          { label: 'A', paragraphs: [] },
          { label: 'B', paragraphs: ['  '] },
        ]}
      />,
    );
    expect(bare.container.querySelector('.lay-vs-para')?.textContent).toBe(
      'No text for this version.',
    );

    const none = render(<VariantSwitch title="None" variants={[]} />);
    expect(none.container.querySelector('.lay-vs-empty')).toBeTruthy();
  });

  it('escapes model text rather than rendering it as markup', () => {
    const { container } = render(
      <VariantSwitch
        title="XSS"
        variants={[{ label: '<img src=x>', paragraphs: ['<script>alert(1)</script>'] }]}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('.lay-vs-para')?.textContent).toContain('<script>');
  });

  it('degrades instead of throwing on loose model JSON', () => {
    const notAnArray = {
      title: 'Object where an array belongs',
      variants: { Warm: ['Hi there.'] },
    } as unknown as VariantSwitchProps;
    const { container } = render(<VariantSwitch {...notAnArray} />);
    expect(container.querySelector('.lay-vs-empty')).toBeTruthy();

    const junkEntries = {
      title: 'Half-shaped variants',
      variants: [
        null,
        'a bare string',
        { label: '   ', paragraphs: ['dropped: an unlabelled chip is unpickable'] },
        { label: 'Firm', paragraphs: 'One paragraph sent as a lone string' },
      ],
    } as unknown as VariantSwitchProps;
    const loose = render(<VariantSwitch {...junkEntries} />);
    // One usable variant survives, and the lone string still reads as its one paragraph.
    expect(loose.container.querySelector('.lay-vs-solo-label')?.textContent).toBe('Firm');
    expect(loose.container.querySelectorAll('.lay-vs-para')).toHaveLength(1);
    expect(loose.container.querySelector('.lay-vs-para')?.textContent).toBe(
      'One paragraph sent as a lone string',
    );

    const wrongShapes = {
      title: 'Neither string nor array',
      variants: [{ label: 'Firm', paragraphs: { 0: 'nope' }, when: { any: 'ok' } }],
    } as unknown as VariantSwitchProps;
    const odd = render(<VariantSwitch {...wrongShapes} />);
    expect(odd.container.querySelector('.lay-vs-para')?.textContent).toBe(
      'No text for this version.',
    );
    expect(odd.container.querySelector('.lay-vs-when')).toBeNull();
  });

  it('makes the scrolling panel reachable from the keyboard and names it', () => {
    // The panel is `max-height: 460px; overflow-y: auto` and holds nothing focusable, so without
    // a tabindex of its own a keyboard-only reader can select a variant but never scroll it.
    const { container } = render(<VariantSwitch {...three} />);
    const panel = container.querySelector<HTMLElement>('.lay-vs-panel');
    expect(panel?.getAttribute('tabindex')).toBe('0');
    panel?.focus();
    expect(document.activeElement).toBe(panel);

    expect(panel?.getAttribute('role')).toBe('tabpanel');
    const panelId = panel?.getAttribute('id') ?? '';
    expect(panelId).not.toBe('');
    const active = container.querySelector('.lay-vs-chip.on');
    expect(active?.getAttribute('aria-controls')).toBe(panelId);
    expect(panel?.getAttribute('aria-labelledby')).toBe(active?.getAttribute('id'));

    // The label follows the selection — the panel is never named by a tab that isn't current.
    fireEvent.click(container.querySelectorAll('.lay-vs-chip')[2]);
    expect(container.querySelector('.lay-vs-panel')?.getAttribute('aria-labelledby')).toBe(
      container.querySelector('.lay-vs-chip.on')?.getAttribute('id'),
    );
  });

  it('keeps a real multi-paragraph rewrite whole through the runtime content budget', () => {
    // Every turn passes each block through enforceComponentContentBudget. `paragraphs` matches no
    // key regex in contentBudget.ts, so without the catalog's own budget each paragraph is cut at
    // the 240-grapheme default — mid-sentence, on the block whose whole job is longer rewrites.
    const para = 'Invoice 204 is now 45 days overdue and remains unpaid. '.repeat(10).trim();
    const subject = 'Chasing an unpaid invoice from a long-standing client who has gone quiet since the second reminder went out in March.'; // prettier-ignore
    expect(para.length).toBeGreaterThan(240);
    expect(subject.length).toBeGreaterThan(96);
    const raw = { title: 'Say it three ways', subject, variants: [{ label: 'Firm', paragraphs: [para] }] }; // prettier-ignore

    const budgeted = enforceComponentContentBudget(
      'variantswitch',
      raw,
      metaFor('variantswitch'),
    ) as unknown as VariantSwitchProps;
    const kept = render(<VariantSwitch {...budgeted} />);
    expect(kept.container.querySelector('.lay-vs-para')?.textContent).toBe(para);
    expect(kept.container.querySelector('.lay-vs-subject')?.textContent).toBe(subject);

    // Without the catalog entry the central fallbacks truncate both — the bug this pins.
    const unbudgeted = enforceComponentContentBudget(
      'variantswitch',
      raw,
    ) as unknown as VariantSwitchProps;
    const cut = render(<VariantSwitch {...unbudgeted} />);
    expect(cut.container.querySelector('.lay-vs-para')?.textContent).toHaveLength(240);
    expect(cut.container.querySelector('.lay-vs-subject')?.textContent).toHaveLength(96);
  });
});
