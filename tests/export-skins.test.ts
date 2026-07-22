import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SKINS, SKIN_ORDER, suggestSkin } from '../src/export/skins/registry';
import { SHARED_SECTIONS } from '../src/export/skins/sections';
import { StandardMasthead } from '../src/export/skins/chrome/standard';
import { EditorialMasthead } from '../src/export/skins/chrome/mastheads';
import type { SkinId } from '../src/export/skins/types';
import type { ExportMeta, SectionKind } from '../src/export/model/ExportDoc';

const ALL_SKINS: SkinId[] = [
  'editorial',
  'swiss',
  'terminal',
  'executive',
  'luxury',
  'medical',
  'school',
  'financial',
  'research',
  'legal',
];

const ALL_KINDS: SectionKind[] = [
  'findingCallout',
  'spotlightCard',
  'figureGrid',
  'figure',
  'rankedList',
  'ratingMatrix',
  'checklist',
  'metricTiles',
  'distributionBars',
  'verticalTimeline',
  'numberedMilestones',
  'specTable',
  'contents',
  'sourcesAppendix',
  'prose',
];

describe('skin registry', () => {
  it('defines all 10 skins, in order, each well-formed', () => {
    expect(new Set(SKIN_ORDER)).toEqual(new Set(ALL_SKINS));
    expect(SKIN_ORDER).toHaveLength(10);
    for (const id of ALL_SKINS) {
      const s = SKINS[id];
      expect(s.id).toBe(id);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.brand.name.length).toBeGreaterThan(0);
      // Full chrome — a bespoke or standard masthead, plus a running header and footer.
      expect(typeof s.chrome.masthead).toBe('function');
      expect(typeof s.chrome.runningHeader).toBe('function');
      expect(typeof s.chrome.footer).toBe('function');
      // Fonts are self-hosted (public/fonts/), not fetched from the Google Fonts CDN.
      expect(s.fonts.hrefs.length).toBeGreaterThan(0);
      for (const href of s.fonts.hrefs) {
        expect(href.startsWith('/fonts/')).toBe(true);
      }
      expect(s.fonts.faces.length).toBeGreaterThan(0);
      // Core token coverage so a section never reads `undefined` into a CSS value.
      for (const key of [
        'pageBg',
        'ink',
        'muted',
        'faint',
        'accent',
        'tint',
        'rule',
        'track',
        'padding',
      ] as const) {
        expect(s.tokens[key], `${id}.${key}`).toBeTruthy();
      }
    }
  });

  it('gives 9 templates a bespoke masthead and only Terminal the standard one', () => {
    // Editorial (accent-period headline) and Executive (CONFIDENTIAL banner) now ship bespoke
    // mastheads too; only Terminal keeps the standard header — its identity is the dark console body.
    const bespoke: SkinId[] = [
      'editorial',
      'swiss',
      'executive',
      'luxury',
      'medical',
      'school',
      'financial',
      'research',
      'legal',
    ];
    for (const id of bespoke) {
      expect(SKINS[id].chrome.masthead, `${id} should have a bespoke masthead`).not.toBe(
        StandardMasthead,
      );
    }
    expect(SKINS.terminal.chrome.masthead).toBe(StandardMasthead);
  });

  it('wires the per-skin section overrides (Financial/Swiss/Terminal ledgers & grids)', () => {
    expect(typeof SKINS.financial.sections.specTable).toBe('function');
    expect(typeof SKINS.swiss.sections.specTable).toBe('function');
    expect(typeof SKINS.terminal.sections.specTable).toBe('function');
    // Skins without an override keep an empty map (they inherit the shared renderers).
    expect(SKINS.editorial.sections.specTable).toBeUndefined();
    // Financial carries up/down colours for its signed-delta ledger.
    expect(SKINS.financial.tokens.pos).toBeTruthy();
    expect(SKINS.financial.tokens.neg).toBeTruthy();
  });

  it('has a shared renderer for every section archetype', () => {
    expect(new Set(Object.keys(SHARED_SECTIONS))).toEqual(new Set(ALL_KINDS));
    for (const kind of ALL_KINDS) expect(typeof SHARED_SECTIONS[kind]).toBe('function');
  });
});

describe('suggestSkin', () => {
  it('routes a domain to a fitting template, defaulting to editorial', () => {
    expect(suggestSkin('Finance')).toBe('financial');
    expect(suggestSkin('Personal finance & investing')).toBe('financial');
    expect(suggestSkin('Health')).toBe('medical');
    expect(suggestSkin('Legal')).toBe('legal');
    expect(suggestSkin('Research')).toBe('research');
    expect(suggestSkin('Education')).toBe('school');
    expect(suggestSkin('Software engineering')).toBe('terminal');
    expect(suggestSkin('Travel')).toBe('editorial');
    expect(suggestSkin(undefined)).toBe('editorial');
  });
});

function meta(overrides: Partial<ExportMeta> = {}): ExportMeta {
  return { title: 'Quarterly review', sources: [], generatedAt: Date.now(), ...overrides };
}

describe('masthead issue numbering', () => {
  it('falls back to "No. 01" when a single-answer export never sets an ordinal', () => {
    const html = renderToStaticMarkup(
      createElement(StandardMasthead, { meta: meta(), skin: SKINS.terminal }),
    );
    expect(html).toContain('No. 01');
  });

  it("shows the primary answer's real session position for a multi-answer export", () => {
    const html = renderToStaticMarkup(
      createElement(StandardMasthead, { meta: meta({ num: 3 }), skin: SKINS.terminal }),
    );
    expect(html).toContain('No. 03');
    expect(html).not.toContain('No. 01');
  });

  it('a bespoke masthead (Editorial) also honours meta.num, still defaulting to 01', () => {
    const bare = renderToStaticMarkup(
      createElement(EditorialMasthead, { meta: meta(), skin: SKINS.editorial }),
    );
    expect(bare).toContain('No. 01');

    const numbered = renderToStaticMarkup(
      createElement(EditorialMasthead, { meta: meta({ num: 5 }), skin: SKINS.editorial }),
    );
    expect(numbered).toContain('No. 05');
  });
});

describe('SourcesAppendix — link safety', () => {
  const render = (items: { name: string; url?: string }[]) =>
    renderToStaticMarkup(
      createElement(SHARED_SECTIONS.sourcesAppendix, {
        data: { items },
        skin: SKINS.editorial,
      }),
    );

  it('renders a genuine http(s) source url as a real, safely-attributed <a href>', () => {
    const html = render([
      { name: 'Wikipedia: Chicago', url: 'https://en.wikipedia.org/wiki/Chicago' },
    ]);
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Chicago"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it('never turns a javascript:/data: scheme into a clickable href — model output is not trusted', () => {
    const html = render([
      { name: 'Malicious', url: 'javascript:alert(1)' },
      { name: 'Also bad', url: 'data:text/html,<script>alert(1)</script>' },
    ]);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Malicious');
    expect(html).toContain('Also bad');
  });

  it('renders a source with no url as plain text, no link implied', () => {
    const html = render([{ name: 'Field notes' }]);
    expect(html).not.toContain('<a ');
    expect(html).toContain('Field notes');
  });
});
