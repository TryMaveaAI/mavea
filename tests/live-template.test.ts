import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TEMPLATES,
  TEMPLATE_KEY,
  DEFAULT_LIVE_TEMPLATE,
  readTemplate,
  persistTemplate,
  applyTemplate,
  clearTemplate,
  prewarmTemplateFonts,
  applyStartupTemplate,
  mountTemplateSkin,
} from '../src/live/templates';

const CONTRACT = [
  '--app-bg',
  '--surface-default',
  '--surface-deep',
  '--surface-elevated',
  '--surface-elevated-2',
  '--surface-glass',
  '--surface-glass-strong',
  '--line',
  '--line-soft',
  '--line-strong',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-faint',
  '--presence',
  '--presence-soft',
  '--presence-deep',
  '--glow-presence',
  '--topic-tint',
  '--shadow-raised',
  '--shadow-floating',
  '--shadow-modal',
  '--font',
  '--font-display',
  '--font-body',
  '--font-voice',
  '--font-ui',
  '--font-data',
  '--voice-size',
  '--voice-lh',
  '--voice-weight',
  '--r-sm',
  '--r-md',
  '--r-lg',
  '--r-xl',
  '--card-gap',
  '--card-pad',
  '--card-radius',
  '--hero-radius',
  '--content-measure',
  '--section-rule',
  '--motion-enter',
  '--app-anchor',
  '--scrim-rgb',
  '--grid-line',
  '--grid-strong',
  '--track',
  '--hover-line',
  '--cell-empty',
  '--slide-bg',
  '--replay-bg',
  '--replay-stage-bg',
  '--glow-insight',
  '--glow-warning',
];

const css = readFileSync(join(__dirname, '../src/styles/templates.css'), 'utf8');
const premiumCss = css.split('PREMIUM PERSONA SYSTEM · v2')[1] ?? '';
const typeRolesCss = readFileSync(join(__dirname, '../src/styles/type-roles.css'), 'utf8');
const setupWizardCss = readFileSync(join(__dirname, '../src/styles/setup-wizard.css'), 'utf8');
const blockRe = /:root\[data-template='([a-z]+)'\](\[data-theme='light'\])?\s*\{([^}]*)\}/g;
const blocks: Array<{ id: string; light: boolean; body: string }> = [];
for (let match = blockRe.exec(premiumCss); match; match = blockRe.exec(premiumCss)) {
  blocks.push({ id: match[1], light: Boolean(match[2]), body: match[3] });
}

function resolvedBody(id: string, light: boolean): string {
  return blocks
    .filter((block) => block.id === id && (!block.light || light))
    .map((block) => block.body)
    .join('\n');
}

function token(body: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const values = [...body.matchAll(new RegExp(`${escaped}\\s*:\\s*([^;]+);`, 'g'))];
  return values.at(-1)?.[1].trim() ?? '';
}

function luminance(hex: string): number {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('premium templates.css contract', () => {
  it('declares a dark and light identity for all six templates', () => {
    for (const template of TEMPLATES) {
      expect(blocks.some((block) => block.id === template.id && !block.light)).toBe(true);
      expect(blocks.some((block) => block.id === template.id && block.light)).toBe(true);
    }
  });

  it.each(CONTRACT)('every resolved dark/light identity binds %s', (name) => {
    for (const template of TEMPLATES) {
      for (const light of [false, true]) {
        const body = resolvedBody(template.id, light);
        expect(
          token(body, name),
          `${template.id} ${light ? 'light' : 'dark'} misses ${name}`,
        ).not.toBe('');
      }
    }
  });

  it('keeps spoken-answer sizes fluid from phones through wide displays', () => {
    const sizes = [...(typeRolesCss + premiumCss).matchAll(/--voice-size:\s*([^;]+);/g)].map(
      (match) => match[1],
    );
    expect(sizes.length).toBeGreaterThanOrEqual(7);
    expect(sizes.every((size) => size.startsWith('clamp('))).toBe(true);
    expect(sizes.every((size) => /calc\([^)]*vw/.test(size))).toBe(true);
  });

  it('keeps primary, secondary, muted, and accent text at WCAG AA across all 12 identities', () => {
    for (const template of TEMPLATES) {
      for (const light of [false, true]) {
        const body = resolvedBody(template.id, light);
        const surfaces = [token(body, '--surface-default'), token(body, '--surface-elevated')];
        const foregrounds = [
          token(body, '--text-primary'),
          token(body, '--text-secondary'),
          token(body, '--text-muted'),
          token(body, '--presence'),
        ];
        for (const foreground of foregrounds) {
          expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
          for (const surface of surfaces) {
            expect(
              contrast(foreground, surface),
              `${template.id} ${foreground} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('gives every identity a friendly mascot palette without the old red or brown overrides', () => {
    const friendlyCss = premiumCss.split('MASCOT FRIENDLINESS SAFETY')[1] ?? '';
    for (const template of TEMPLATES) {
      expect(friendlyCss).toContain(`:root[data-template='${template.id}'] .presence`);
    }
    expect(friendlyCss).not.toMatch(/#(?:870d3a|a11048|1c1813|332c24|4a3404|6a4a06)/i);
    expect((friendlyCss.match(/--mascot-bell-1:/g) ?? []).length).toBe(11);
  });
});

describe('template persona and local-font manifest', () => {
  it('gives every template a unique role, geometry, and complete preview story', () => {
    expect(new Set(TEMPLATES.map((template) => template.persona)).size).toBe(TEMPLATES.length);
    expect(new Set(TEMPLATES.map((template) => template.preview.geometry)).size).toBe(
      TEMPLATES.length,
    );
    for (const template of TEMPLATES) {
      expect(template.tagline.length).toBeGreaterThan(20);
      expect(template.bestFor.length).toBeGreaterThan(20);
      expect(template.preview.fontRole).toBeTruthy();
      expect(template.preview.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('serves every declared face locally and keeps its OFL attribution', () => {
    const fontsCss = readFileSync(join(__dirname, '../public/fonts/fonts.css'), 'utf8');
    const license = readFileSync(join(__dirname, '../public/fonts/LICENSE.txt'), 'utf8');
    const files = [...fontsCss.matchAll(/url\('\/fonts\/([^']+\.woff2)'\)/g)].map(
      (match) => match[1],
    );
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const file of files)
      expect(existsSync(join(__dirname, '../public/fonts', file))).toBe(true);
    for (const family of [
      'Hanken Grotesk',
      'Newsreader',
      'IBM Plex Mono',
      'Lora',
      'Space Grotesk',
      'Bodoni Moda',
      'Source Serif 4',
      'Libre Franklin',
      'IBM Plex Sans',
      'Instrument Serif',
      'Archivo',
    ]) {
      expect(fontsCss).toContain(`font-family: '${family}'`);
      expect(license).toContain(family);
    }
    expect(fontsCss).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(readFileSync(join(__dirname, '../src/live/templates.ts'), 'utf8')).not.toMatch(
      /fonts\.(googleapis|gstatic)\.com/,
    );
  });

  it('keeps the Appearance identity control available during first-use setup', () => {
    expect(setupWizardCss).toMatch(/\.in-wizard \.topbar\s*\{[^}]*display:\s*none/s);
    expect(setupWizardCss).toMatch(
      /\.setup-nav > \.appearance-picker\s*\{[^}]*justify-self:\s*end/s,
    );
    expect(setupWizardCss).toMatch(
      /@media \(max-width: 430px\)[\s\S]*\.setup-back\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(setupWizardCss).toMatch(
      /@media \(max-width: 430px\)[\s\S]*\.const-step \+ \.const-step::before\s*\{[^}]*width:\s*8px/s,
    );
  });
});

describe('template apply / persist / clear', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.template;
    delete document.documentElement.dataset.theme;
  });

  it('falls back to the Live default on absence or garbage', () => {
    expect(readTemplate()).toBe(DEFAULT_LIVE_TEMPLATE);
    localStorage.setItem(TEMPLATE_KEY, 'not-a-template');
    expect(readTemplate()).toBe(DEFAULT_LIVE_TEMPLATE);
    persistTemplate('console');
    expect(readTemplate()).toBe('console');
  });

  it('every template follows the stored light/dark preference without overwriting it', () => {
    localStorage.setItem('mavea-theme', 'light');
    for (const template of TEMPLATES) {
      applyTemplate(document, template.id);
      expect(document.documentElement.dataset.template).toBe(template.id);
      expect(document.documentElement.dataset.theme).toBe('light');
    }
    localStorage.setItem('mavea-theme', 'dark');
    applyTemplate(document, 'console');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('mavea-theme')).toBe('dark');
  });

  it('Original has an explicit Live skin and clearTemplate removes it on exit', () => {
    localStorage.setItem('mavea-theme', 'light');
    applyTemplate(document, 'default');
    expect(document.documentElement.dataset.template).toBe('default');
    clearTemplate(document);
    expect(document.documentElement.dataset.template).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('mountTemplateSkin applies the persisted identity and teardown hands the page back', () => {
    localStorage.setItem('mavea-theme', 'light');
    persistTemplate('daylight');
    const teardown = mountTemplateSkin(document);
    expect(document.documentElement.dataset.template).toBe('daylight');
    expect(document.documentElement.dataset.theme).toBe('light');
    teardown();
    expect(document.documentElement.dataset.template).toBeUndefined();
  });

  it('prewarms only self-hosted CSS faces through the Font Loading API', () => {
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    prewarmTemplateFonts(document, 'ink');
    expect(load).toHaveBeenCalledWith("600 28px 'Bodoni Moda'");
    expect(load).toHaveBeenCalledWith("400 16px 'Source Serif 4'");
    expect(document.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
  });

  it('applyStartupTemplate only acts on a Live load', () => {
    persistTemplate('console');
    applyStartupTemplate(document, '#/gallery');
    expect(document.documentElement.dataset.template).toBeUndefined();
    applyStartupTemplate(document, '#/live');
    expect(document.documentElement.dataset.template).toBe('console');
  });
});
