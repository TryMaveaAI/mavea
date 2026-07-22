// Regression coverage for the export "no-squish" contract. A handful of labels are short,
// fixed-format strings by construction (the brand wordmark, "FIG. N", "SCALE 1–N", the footer
// page count) — these keep a hard `white-space: nowrap` (+ `flexShrink: 0` where they share a row
// with content that can shrink) because they must never wrap, under any circumstance. Everything
// else that must render as a single line but ISN'T bounded by construction (a real section
// heading, a computed stat, a metric tile value) instead renders through `FitLine`, which measures
// its own natural width after mount and shrinks it visually via `transform: scale()` rather than
// ever wrapping or overflowing its box. Genuinely long, data-bearing content (a distributionBars
// label) gets neither treatment — it wraps normally at word boundaries, like ordinary text.
//
// jsdom has no text layout engine, so these tests confirm the MECHANISM — which elements carry a
// permanent nowrap, which route through FitLine's own forced-nowrap inner span, and which are left
// free to wrap — rather than an actual pixel measurement. See export-fixes.test.ts and the
// FitLine unit coverage in export-paginate.test.ts-adjacent files for the numeric scale math.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SectionHeading } from '../src/export/skins/sections/parts';
import { DistributionBars, MetricTiles } from '../src/export/skins/sections/data';
import {
  StandardFooter,
  StandardMasthead,
  StandardRunningHeader,
} from '../src/export/skins/chrome/standard';
import { EditorialMasthead, SwissMasthead } from '../src/export/skins/chrome/mastheads';
import { editorial, swiss } from '../src/export/skins/registry';
import type {
  DistributionBarsData,
  ExportMeta,
  MetricTilesData,
} from '../src/export/model/ExportDoc';

function mount(el: ReturnType<typeof createElement>): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(el));
  return host;
}

/** Every span the host contains, for a coarse "none of these ever wrap" sweep. */
function spanTexts(host: HTMLDivElement): { el: HTMLElement; nowrap: boolean }[] {
  return Array.from(host.querySelectorAll('span')).map((el) => ({
    el: el as HTMLElement,
    nowrap: (el as HTMLElement).style.whiteSpace === 'nowrap',
  }));
}

/** The single deepest (childless) element whose own text is exactly `text` — the actual
 *  text-bearing leaf, as opposed to an ancestor wrapper (e.g. FitLine's outer box) that merely
 *  contains the same text via its descendant. */
function leafFor(host: HTMLElement, text: string): HTMLElement {
  const matches = Array.from(host.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.children.length === 0 && el.textContent?.trim() === text,
  );
  expect(matches, `exactly one leaf for "${text}"`).toHaveLength(1);
  return matches[0];
}

const META: ExportMeta = {
  title: 'The State of Urban Mobility',
  sub: 'A field study',
  topic: 'Strategy',
  sources: [],
  generatedAt: Date.now(),
};

describe('SectionHeading — fig/trailing are bounded (permanent nowrap); label is not (FitLine)', () => {
  it('fig and trailing carry nowrap + flexShrink:0, so the row shrink never touches them', () => {
    const host = mount(
      createElement(SectionHeading, {
        skin: editorial,
        label: 'Rollout',
        fig: '3',
        trailing: 'Scale 1–3',
      }),
    );
    for (const text of ['FIG. 3', 'Scale 1–3']) {
      const leaf = leafFor(host, text);
      expect(leaf.style.whiteSpace, text).toBe('nowrap');
      expect(leaf.style.flexShrink, text).toBe('0');
    }
  });

  it('label routes through FitLine: its text-bearing leaf forces nowrap, but the box around it does not — that box is what absorbs the row squeeze', () => {
    const host = mount(createElement(SectionHeading, { skin: editorial, label: 'Rollout' }));
    const leaf = leafFor(host, 'Rollout');
    expect(leaf.style.whiteSpace).toBe('nowrap');
    const outer = leaf.parentElement as HTMLElement;
    expect(outer.style.whiteSpace).not.toBe('nowrap');
    expect(outer.style.overflow).toBe('hidden');
  });

  it('a long real heading still renders as a single FitLine leaf, never split across multiple nowrap spans', () => {
    const longHeading = 'A Comprehensive Multi-Stakeholder Governance Framework Review';
    const host = mount(createElement(SectionHeading, { skin: editorial, label: longHeading }));
    expect(() => leafFor(host, longHeading)).not.toThrow();
  });
});

describe('DistributionBars — the total is unbounded (FitLine), labels wrap, values stay bounded', () => {
  const data: DistributionBarsData = {
    heading: 'Where the budget goes',
    total: '$1.2 B',
    bars: [
      { label: 'Operations', pct: 0.46, value: '46%' },
      { label: 'Capital', pct: 0.31, value: '31%' },
    ],
  };

  it('the big total figure renders through FitLine, not a hardcoded nowrap span', () => {
    const host = mount(createElement(DistributionBars, { skin: editorial, data }));
    const leaf = leafFor(host, '$1.2 B');
    expect(leaf.style.whiteSpace).toBe('nowrap');
    expect((leaf.parentElement as HTMLElement).style.whiteSpace).not.toBe('nowrap');
  });

  it('bar labels are real content: no nowrap, free to wrap, and claim the row (flex-grow) so a wrapped line stops short of the value', () => {
    const host = mount(createElement(DistributionBars, { skin: editorial, data }));
    const label = leafFor(host, 'Operations');
    expect(label.style.whiteSpace).not.toBe('nowrap');
    expect(label.style.flexGrow).toBe('1');
    expect(label.style.flexShrink).toBe('1');
  });

  it('bar values stay bounded: nowrap + flexShrink:0, so they never wrap or get squeezed by a wrapped label', () => {
    const host = mount(createElement(DistributionBars, { skin: editorial, data }));
    const value = leafFor(host, '46%');
    expect(value.style.whiteSpace).toBe('nowrap');
    expect(value.style.flexShrink).toBe('0');
  });

  it('a genuinely long bar label no longer forces a hardcoded nowrap anywhere in the row', () => {
    const longLabel: DistributionBarsData = {
      bars: [{ label: 'Field operations across every regional distribution center', pct: 0.5 }],
    };
    const host = mount(createElement(DistributionBars, { skin: editorial, data: longLabel }));
    const spans = spanTexts(host).filter((s) => s.el.textContent?.trim());
    expect(spans.some((s) => !s.nowrap)).toBe(true);
  });
});

describe('MetricTiles — tile values are unbounded (FitLine)', () => {
  const data: MetricTilesData = {
    heading: 'Key metrics',
    tiles: [{ value: '$482,910,004', label: 'Revenue' }],
  };

  it('a tile value renders through FitLine, not a plain unscaled div', () => {
    const host = mount(createElement(MetricTiles, { skin: editorial, data }));
    const leaf = leafFor(host, '$482,910,004');
    expect(leaf.style.whiteSpace).toBe('nowrap');
    expect((leaf.parentElement as HTMLElement).style.whiteSpace).not.toBe('nowrap');
  });
});

describe('Masthead/footer chrome — brand, tagline, and kicker are bounded; still never wrap', () => {
  it('StandardMasthead protects the wordmark, tagline, and topic kicker', () => {
    const host = mount(createElement(StandardMasthead, { meta: META, skin: editorial }));
    const spans = spanTexts(host);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });

  it('EditorialMasthead protects the same three labels', () => {
    const host = mount(createElement(EditorialMasthead, { meta: META, skin: editorial }));
    // Excludes the standalone accent-period span after the headline — a single "." never wraps,
    // nowrap or not, so it isn't part of this contract.
    const spans = spanTexts(host).filter((s) => (s.el.textContent?.trim().length ?? 0) > 1);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });

  it('SwissMasthead protects its wordmark, tagline, and topic kicker', () => {
    const host = mount(createElement(SwissMasthead, { meta: META, skin: swiss }));
    const spans = spanTexts(host).filter((s) => s.el.textContent?.trim());
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });

  it('StandardRunningHeader protects the wordmark (the topic/title fallback ellipsizes instead)', () => {
    const host = mount(createElement(StandardRunningHeader, { meta: META, skin: editorial }));
    const [wordmark] = spanTexts(host);
    expect(wordmark.nowrap).toBe(true);
  });

  it('StandardFooter protects the brand line and the page counter', () => {
    const host = mount(
      createElement(StandardFooter, { meta: META, skin: editorial, page: 1, total: 8 }),
    );
    const spans = spanTexts(host);
    expect(spans).toHaveLength(2);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });
});
