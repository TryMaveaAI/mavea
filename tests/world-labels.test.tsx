// world-labels.test.tsx — a label that paints nothing.
//
// A node label is model-authored and only has to be non-EMPTY to survive the coercion gate. U+200B is
// not whitespace, so a zero-width label passes every trim and then paints nothing: a card with no
// name, a lever with no name. `edge-label-degenerates` is the fixture that finds it, and it found it
// on the first look.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { humanizeSlug, readableLabel } from '../src/live/world/labels';
import { coerceWorldSpec } from '../src/live/world/validate';
import { allWorldScenario } from '../src/live/world/scenarios/index';
import { WorldOverlay } from '../src/live/world/WorldOverlay';

afterEach(cleanup);

const DEGENERATE = allWorldScenario('edge-label-degenerates')!.spec;
const FALLBACK = 'an unnamed cause';

describe('readableLabel', () => {
  it('keeps a label that paints something, trimmed', () => {
    expect(readableLabel('Cheap credit')).toBe('Cheap credit');
    expect(readableLabel('  Cheap credit  ')).toBe('Cheap credit');
    // A single glyph is a real label — short is not the same as absent.
    expect(readableLabel('Ω')).toBe('Ω');
    // And so is one led by an emoji, or written right-to-left.
    expect(readableLabel('🚨 Line 4 halted')).toBe('🚨 Line 4 halted');
  });

  it('replaces one that paints NOTHING, whatever kind of nothing it is', () => {
    expect(readableLabel('​')).toBe(FALLBACK); // zero-width space — survives trim()
    expect(readableLabel('‍⁠﻿')).toBe(FALLBACK); // ZWJ, word joiner, BOM
    expect(readableLabel('   ')).toBe(FALLBACK);
    expect(readableLabel('')).toBe(FALLBACK);
    expect(readableLabel(undefined)).toBe(FALLBACK);
  });

  it("takes the caller's own wording for the fallback", () => {
    expect(readableLabel('​', 'this link')).toBe('this link');
  });
});

describe('a child that arrived with an id and no label', () => {
  it('reads its words out of the slug rather than printing one', () => {
    // Seen on a real turn: the model returned children with ids and no labels, and the coercer's
    // fallback put "consumer-switch-to-digit" on a card beside a sibling reading "Digital imaging
    // displaced consumer demand for film". Nothing is invented — the words are the model's own; only
    // the formatting was machine-shaped.
    const spec = coerceWorldSpec(
      {
        title: 'Why did it collapse?',
        outcomeId: 'out',
        nodes: [
          {
            id: 'shift',
            label: 'Digital imaging displaced film',
            role: 'root',
            depth: 0,
            tier: 'T0',
            children: [{ id: 'consumer-switch-to-digital' }, { id: 'incumbent-incentives' }],
          },
          { id: 'out', label: 'It collapsed', role: 'outcome', depth: 1, tier: 'T0' },
        ],
        edges: [{ from: 'shift', to: 'out', sign: 1, tier: 'T0' }],
      },
      '',
    )!;
    expect(spec.nodes[0].children?.map((c) => c.label)).toEqual([
      'Consumer switch to digital',
      'Incumbent incentives',
    ]);
  });

  it('leaves a label the model DID write completely alone', () => {
    // Real labels carry hyphens that mean something; de-hyphenating those would corrupt them.
    const spec = coerceWorldSpec(
      {
        title: 'Why did it collapse?',
        outcomeId: 'out',
        nodes: [
          {
            id: 'shift',
            label: 'Loans by grade',
            role: 'root',
            depth: 0,
            tier: 'T0',
            children: [
              { id: 'alt-a', label: 'Alt-A' },
              { id: 'retail', label: 'Third-party retail expansion' },
            ],
          },
          { id: 'out', label: 'It collapsed', role: 'outcome', depth: 1, tier: 'T0' },
        ],
        edges: [{ from: 'shift', to: 'out', sign: 1, tier: 'T0' }],
      },
      '',
    )!;
    expect(spec.nodes[0].children?.map((c) => c.label)).toEqual([
      'Alt-A',
      'Third-party retail expansion',
    ]);
  });

  it('humanizes only the separators, and survives a degenerate slug', () => {
    expect(humanizeSlug('fixed-cost-burden')).toBe('Fixed cost burden');
    expect(humanizeSlug('snake_case_too')).toBe('Snake case too');
    expect(humanizeSlug('a')).toBe('A');
    expect(humanizeSlug('-')).toBe('-');
  });
});

describe('the world surface, on labels that are barely labels', () => {
  it('gives every CARD a name, including the zero-width one', () => {
    const { container } = render(<WorldOverlay spec={DEGENERATE} />);
    const labels = [...container.querySelectorAll<HTMLElement>('.mv-node .mv-label')].map(
      (el) => el.textContent ?? '',
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const text of labels) {
      expect(text.replace(/[\p{Cf}\p{Cc}]/gu, '').trim(), 'a card painted no name').not.toBe('');
    }
    expect(labels.some((t) => t === FALLBACK)).toBe(true);
  });

  it('gives every LEVER a name too — the rail had a blank slider', () => {
    const { container } = render(<WorldOverlay spec={DEGENERATE} />);
    const levers = [...container.querySelectorAll<HTMLElement>('.tr-levers label')].map(
      (el) => el.textContent ?? '',
    );
    for (const text of levers) {
      expect(text.replace(/[\p{Cf}\p{Cc}]/gu, '').trim(), 'a lever painted no name').not.toBe('');
    }
  });
});
