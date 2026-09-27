// Every control filled from an accent — solid, mixed or a gradient, at rest and in each state,
// under each @media condition it is restyled in — is judged at every stop of its fill against the
// ink the cascade actually gives it, and against every ink drawn inside it (an icon, a label, SVG
// text over its shape). It is judged in every skin the app can paint it in: stock and each
// template, dark and light, inside the Study desk (which rebinds the accent) and inside every
// export and slide skin's embedded figure. A colour the markup sets per card (`--nav-c`) or a
// property no stylesheet declares is judged as each skin's accent and its second hue in turn.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bridgeVars } from '../src/canvas/embed';
import { SKINS } from '../src/export/skins/registry';
import { paletteFor as docPalette } from '../src/export/skins/sections/figurePalette';
import { SLIDE_SKINS } from '../src/slides/skins/registry';
import { paletteFor as slidePalette } from '../src/slides/skins/layouts/figurePalette';
import {
  Resolver,
  SCOPES,
  STUDY,
  TEMPLATES,
  auditInk,
  contrast,
  markupVars,
  over,
  parsePath,
  parseSheet,
  readRules,
  scopeName,
  type Host,
  type Scope,
} from './helpers/cssInk';

/** Controls whose only content is an icon: WCAG's 3:1 for graphical objects applies. */
const ICON_ONLY = new Set(['.mic-btn', '.send-btn']);
/** The persona accents a replay or gallery card carries inline as --accent. */
const personas = [
  ...readFileSync('src/demo/cast.ts', 'utf8').matchAll(/accent:\s*'(#[0-9a-f]{6})'/gi),
].map((m) => m[1]);

const rules = readRules();
const resolver = new Resolver(rules);

/** Each export and slide skin, as the wrapper its embedded figures sit in. */
const embedHosts: Host[] = [
  ...Object.entries(SKINS).map(([id, skin]) => ({ id, palette: docPalette(skin) })),
  ...Object.entries(SLIDE_SKINS).map(([id, skin]) => ({ id, palette: slidePalette(skin) })),
].map(({ id, palette }) => ({
  selector: `.figure-embed[data-theme-mode='${palette.dark ? 'dark' : 'light'}']`,
  inline: bridgeVars(palette),
  name: `embed:${id}`,
}));
const EMBED_SCOPES: Scope[] = embedHosts.flatMap((host) =>
  (['dark', 'light'] as const).map((theme) => ({ template: null, theme, host })),
);

/** Where a stylesheet paints: the landing only in stock (templates are a Live skin, dropped when
 *  Live unmounts); the canvas also inside the desk, and its blocks inside an embedded figure; the
 *  desk's own sheet only inside the desk. The reel paints in its palettes, judged below. */
const paints = (file: string, scope: Scope) => {
  if (file.startsWith('src/clip/reel/')) return false;
  if (scope.host?.name?.startsWith('embed:'))
    return file.startsWith('src/canvas/blocks/') || file.startsWith('src/canvas/embed/');
  if (file.startsWith('src/canvas/study/')) return scope.host === STUDY;
  if (scope.host && !file.startsWith('src/canvas/')) return false;
  if (scope.template && file.startsWith('src/flagship/')) return false;
  return true;
};
const markup = markupVars();

const report = (findings: { ratio: number; floor: number; where: string }[]) =>
  findings
    .sort((a, b) => a.ratio - b.ratio)
    .map((f) => `${f.ratio.toFixed(2)} < ${f.floor} ${f.where}`);

describe('text on an accent fill', () => {
  it('clears 4.5:1 (3:1 for an icon) at every stop, in every state, skin and host', () => {
    // Stock and six templates, each dark and light, each with and without the Study desk.
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(SCOPES).toHaveLength((TEMPLATES.length + 1) * 4);
    expect(embedHosts.length).toBeGreaterThanOrEqual(6);
    const { findings, checked } = auditInk(rules, {
      scopes: [...SCOPES, ...EMBED_SCOPES],
      personas,
      markup,
      paints,
      iconOnly: ICON_ONLY,
    });
    expect(checked).toBeGreaterThan(5000);
    const worst = report(findings);
    if (process.env.INK_DUMP) writeFileSync(process.env.INK_DUMP, worst.join('\n'));
    expect(worst).toEqual([]);
  });

  describe('catches what a rule-by-rule reading misses', () => {
    // Each case is a real shape of bug, appended to the real stylesheets so it resolves through
    // the real tokens. The last one is the control: a correct rule must not be flagged.
    const synthetic = (css: string) => {
      const sheet = parseSheet('synthetic.css', css, 9999);
      return report(
        auditInk([...rules, ...sheet], {
          scopes: SCOPES.filter((s) => !s.host),
          paints: (file) => file === 'synthetic.css',
          markup,
        }).findings,
      );
    };

    it('a per-card colour the markup sets inline', () => {
      expect(synthetic('.syn-pin { background: var(--pc); color: #fff; }')).not.toEqual([]);
    });

    it('a state that fills a control whose base rule sets the ink', () => {
      const css = '.syn-b { color: var(--presence); } .syn-b.on { background: var(--presence); }';
      expect(synthetic(css).some((f) => f.includes('.syn-b.on'))).toBe(true);
    });

    it('an icon inside the fill that sets its own ink', () => {
      const css =
        '.syn-box { background: var(--presence); color: var(--on-presence); }' +
        ' .syn-box .ic { color: var(--presence); }';
      expect(synthetic(css).some((f) => f.includes('.ic(color)'))).toBe(true);
    });

    it('SVG text drawn in the same colour as the shape under it', () => {
      const css =
        '.syn-pin-dot { fill: var(--text-primary); }' +
        ' .syn-pin-num { fill: var(--text-primary); font-size: 10px; text-anchor: middle; }';
      expect(synthetic(css).some((f) => f.includes('.syn-pin-num(fill)'))).toBe(true);
    });

    it('an ink one @media condition swaps in', () => {
      const css =
        '.syn-m { background: var(--presence); color: var(--on-presence); }' +
        ' @media (width <= 720px) { .syn-m { color: var(--presence); } }';
      expect(synthetic(css).some((f) => f.includes('@media (width <= 720px)'))).toBe(true);
    });

    it('a hover that brightens the fill and its ink together', () => {
      // White on a fill that only just carries it, pushed lighter.
      const css =
        '.syn-h { background: color-mix(in oklab, var(--presence) 0%, #6d6d6d); color: #fff; }' +
        ' .syn-h:hover { filter: brightness(1.2); }';
      expect(synthetic(css).some((f) => f.includes('.syn-h:hover'))).toBe(true);
      expect(synthetic(css).some((f) => /\.syn-h stock/.test(f))).toBe(false);
    });

    it('but not a control that reads the derived ink', () => {
      expect(
        synthetic('.syn-ok { background: var(--presence); color: var(--on-presence); }'),
      ).toEqual([]);
    });
  });
});

describe('accent text on a surface', () => {
  // Text set in an accent reads against the panel it sits on, not a fill of its own, so the audit
  // above never sees it. These are the ones the app sets.
  const on = (host: Host, scope: Omit<Scope, 'host'>) => ({
    scope: { ...scope, host },
    media: null,
  });
  const hostPath = (h: Host) => parsePath(h.selector);
  const strong = parsePath('.dz-zoom strong');
  const eyebrow = parsePath('.ripple-eyebrow');
  const panel = (value: string, ctx: ReturnType<typeof on>) => {
    const base = resolver.color('var(--surface-default)', ctx);
    return value
      .split(' over ')
      .reverse()
      .reduce((under, layer) => over(resolver.color(layer, ctx), under), base);
  };

  it('Deep Zoom sets each scale colour legibly on its zoom button', () => {
    const findings: string[] = [];
    for (const theme of ['dark', 'light'] as const) {
      for (let depth = 0; depth < 10; depth++) {
        const host = {
          selector: '.deepzoom-app',
          inline: { '--dz-current': `var(--dz-${depth})` },
        };
        const ctx = on(host, { template: null, theme });
        const bg = panel(
          'color-mix(in oklab, var(--dz-current) 20%, var(--surface-glass)) over var(--surface-default)',
          ctx,
        );
        const ink = resolver.winner(['color'], [...hostPath(host), ...strong], ctx)!.value;
        const ratio = contrast(bg, over(resolver.color(ink, ctx, strong), bg));
        if (ratio < 4.5) findings.push(`${ratio.toFixed(2)} ${theme} --dz-${depth}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it("Ripple's simulator eyebrow reads over the panel's accent glow", () => {
    const findings: string[] = [];
    for (const scope of SCOPES.filter((s) => !s.host)) {
      const host = { selector: '.ripple-impact-simulator-copy' };
      const ctx = { scope: { ...scope, host }, media: null };
      // The glow's core and the band's wash both sit under the eyebrow's first letters.
      const bg = panel(
        'color-mix(in oklab, var(--presence) 24%, transparent) over color-mix(in oklab, var(--presence) 9%, transparent) over var(--surface-elevated)',
        ctx,
      );
      const ink = resolver.winner(['color'], [...hostPath(host), ...eyebrow], ctx)!.value;
      const ratio = contrast(bg, over(resolver.color(ink, ctx, eyebrow), bg));
      if (ratio < 4.5) findings.push(`${ratio.toFixed(2)} ${scopeName(ctx.scope)}`);
    }
    expect(findings).toEqual([]);
  });
});

describe('quiet text on the surface a card gives it', () => {
  // Secondary labels a card sets on its own recessed or tinted surface: each ink as the cascade
  // resolves it, over the backgrounds the named ancestors paint (outermost first).
  const CASES: [ink: string, surfaces: string[]][] = [
    ['.kpi-sub', []],
    ['.cau-legend .cau-legend-item--weight', []],
    ['.term-bar .term-bar-label', ['.term-bar']],
    ['.cb-chrome .cb-lang', ['.cb-chrome', '.cb-lang']],
    ['.cb-frame .tok-comment', ['.cb-frame']],
    ['.timeline .tl-body .tl-time', ['.timeline .tl-body']],
  ];

  it.each(CASES)('%s clears 4.5:1 in every skin', (ink, surfaces) => {
    const findings: string[] = [];
    for (const scope of SCOPES.filter((s) => !s.host)) {
      const ctx = { scope, media: null };
      const bg = surfaces.reduce(
        (under, sel) => {
          const w = resolver.winner(['background', 'background-color'], parsePath(sel), ctx);
          return w ? over(resolver.color(w.value, ctx, parsePath(sel)), under) : under;
        },
        resolver.color('var(--surface-default)', ctx),
      );
      const path = parsePath(ink);
      const w = resolver.winner(['color'], path, ctx)!;
      const ratio = contrast(bg, over(resolver.color(w.value, ctx, path), bg));
      if (ratio < 4.5) findings.push(`${ratio.toFixed(2)} ${scopeName(scope)}`);
    }
    expect(findings).toEqual([]);
  });
});

describe('text on a reel palette fill', () => {
  // The reel's fills are set inline by its templates, so the pairs are named here: each fill with
  // the ink reel.css derives for it, and the accent gradient's bounded far stop with the accent's.
  const PAIRS: [fill: string, ink: string][] = [
    ['var(--reel-accent)', 'var(--reel-on-accent)'],
    ['var(--reel-accent-2-fill)', 'var(--reel-on-accent)'],
    ['var(--reel-accent-2)', 'var(--reel-on-accent-2)'],
    ['var(--reel-orb-1)', 'var(--reel-on-orb-1)'],
  ];
  const palettes = rules
    .filter((r) => r.file === 'src/clip/reel/reel.css')
    .map((r) => /^\.reel\[data-palette='(\w+)'\]$/.exec(r.selector)?.[1])
    .filter((p): p is string => !!p);

  it('clears 4.5:1 for every palette', () => {
    expect(palettes).toHaveLength(4);
    const findings: string[] = [];
    for (const palette of palettes) {
      const host = { selector: `.reel[data-palette='${palette}']` };
      const ctx = { scope: { template: null, theme: 'dark' as const, host }, media: null };
      for (const [fill, ink] of PAIRS) {
        const ratio = contrast(resolver.color(fill, ctx), resolver.color(ink, ctx));
        if (ratio < 4.5) findings.push(`${ratio.toFixed(2)} ${palette} ${ink} on ${fill}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('never hard-codes white on a palette fill in a template', () => {
    // A template's text on a palette fill reads the derived ink; a literal white read 1.9-3.4:1 on
    // the lighter palettes.
    const templates = readdirSync('src/clip/reel/templates', { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ f, src: readFileSync(`src/clip/reel/templates/${f}`, 'utf8') }));
    const offenders = templates.flatMap(({ f, src }) =>
      [...src.matchAll(/\{[^{}]*var\(--reel-(accent|orb-1)[^{}]*\}/g)]
        .filter(([block]) => /(color|fill|ink):\s*(\w+\s*\?\s*)?'#fff'/.test(block))
        .map(([block]) => `${f}: ${block.slice(0, 80)}`),
    );
    expect(offenders).toEqual([]);
  });
});
