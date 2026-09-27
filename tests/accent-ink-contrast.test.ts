// Every control filled from an accent — solid, mixed or a gradient, at rest and on hover, focus
// and press — is judged at every stop of its fill against the ink it actually sets, in every skin
// the app can paint it in: stock and each template, dark and light, and, for the canvas blocks the
// Study desk hosts, inside the desk, which rebinds the accent. Hand-picked lists missed the hover
// fills and the gradients' deep ends; this walks the stylesheets instead.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  Resolver,
  SCOPES,
  TEMPLATES,
  contrast,
  fillStops,
  readRules,
  rootMatches,
  scopeName,
  splitRoot,
  splitTop,
  type Rule,
} from './helpers/cssInk';

/** A fill counts as an accent fill when it reads one of these. */
const ACCENT = /var\(--(presence|accent|insight|nav-c|tone|geo-c)\b/;
/** The states a control is restyled in, stripped to find the control itself. */
const STATE = /((:hover|:focus|:focus-visible|:focus-within|:active|:disabled)|:not\([^)]*\))+$/;
/** Controls whose only content is an icon: WCAG's 3:1 for graphical objects applies. */
const ICON_ONLY = new Set(['.mic-btn', '.send-btn', '.fl-dock-send', '.fl-dock-mic']);
/** What the markup sets inline: the persona accent a replay or gallery card carries, and the
 *  per-card colours the nav, map and landing blocks default to the accent. */
const personas = [
  ...readFileSync('src/demo/cast.ts', 'utf8').matchAll(/accent:\s*'(#[0-9a-f]{6})'/gi),
].map((m) => m[1]);
const INLINE = {
  '--nav-c': 'var(--presence)',
  '--tone': 'var(--presence)',
  '--geo-c': 'var(--presence)',
};

const rules = readRules();
const resolver = new Resolver(rules);
const bgOf = (r: Rule) =>
  r.decls.get('background') ?? r.decls.get('background-color') ?? r.decls.get('background-image');

interface Finding {
  where: string;
  ratio: number;
  floor: number;
}

function audit(): { findings: Finding[]; checked: number } {
  const groups = new Map<string, Rule[]>();
  for (const r of rules) {
    const { rest } = splitRoot(r.selector);
    if (!rest) continue;
    const key = `${r.file}|${rest.replace(STATE, '')}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const findings: Finding[] = [];
  let checked = 0;
  for (const [key, group] of groups) {
    if (!group.some((r) => ACCENT.test(bgOf(r) ?? ''))) continue;
    const [file, base] = key.split('|');
    const variants = [...new Set(group.map((r) => splitRoot(r.selector).rest))].filter(
      // An inactive control is exempt from contrast minimums.
      (v) => !/:disabled|\[aria-disabled/.test(v),
    );
    // Custom properties the control sets on itself.
    const own = Object.fromEntries(
      group.flatMap((r) => [...r.decls].filter(([n]) => n.startsWith('--'))),
    );
    for (const scope of SCOPES) {
      if (scope.study && !file.startsWith('src/canvas/')) continue;
      // Templates are a Live skin, dropped when Live unmounts: the landing only paints stock.
      if (scope.template && file.startsWith('src/flagship/')) continue;
      const live = group.filter((r) => rootMatches(splitRoot(r.selector).cond, scope));
      const last = (sel: string, pick: (r: Rule) => string | undefined) =>
        live
          .filter((r) => splitRoot(r.selector).rest === sel)
          .map(pick)
          .filter((v): v is string => !!v)
          .at(-1);
      for (const variant of variants) {
        const bg = last(variant, bgOf) ?? last(base, bgOf);
        const ink =
          last(variant, (r) => r.decls.get('color')) ?? last(base, (r) => r.decls.get('color'));
        if (!bg || !ink || !ACCENT.test(bg) || /inherit|currentcolor|transparent/i.test(ink))
          continue;
        for (const accent of /var\(--accent\b/.test(bg + ink) ? personas : ['']) {
          const on = resolver.on({ ...INLINE, ...own, ...(accent ? { '--accent': accent } : {}) });
          const where = `${file} ${variant} ${scopeName(scope)}${accent ? ' ' + accent : ''}`;
          const floor = ICON_ONLY.has(base) ? 3 : 4.5;
          try {
            const text = on.color(ink, scope);
            for (const stop of splitTop(bg).flatMap(fillStops)) {
              if (!/var\(|#|rgb|oklch|color-mix|\bwhite\b|\bblack\b/.test(stop)) continue;
              // A surface tinted with the accent is still a surface: its text is ordinary text.
              if (/var\(--(surface|bg|app-bg)\b/.test(stop)) continue;
              const fill = on.color(stop, scope);
              if (fill[3] < 0.95) continue; // a tint over whatever lies beneath, not a fill
              checked++;
              const ratio = contrast(fill, text);
              if (ratio < floor) findings.push({ where: `${where} @ ${stop}`, ratio, floor });
            }
          } catch (e) {
            // A var() nothing declares makes the whole declaration invalid at computed time, as
            // CSS does: that background paints nothing, or that ink is inherited. Anything else
            // this evaluator cannot read is a gap in it, and fails.
            if (!/^unresolved /.test((e as Error).message)) {
              findings.push({ where: `${where}: ${(e as Error).message}`, ratio: 0, floor });
            }
          }
        }
      }
    }
  }
  return { findings, checked };
}

describe('text on an accent fill', () => {
  it('clears 4.5:1 (3:1 for an icon) at every stop, in every state and skin', () => {
    // Stock and six templates, each dark and light, each with and without the Study desk.
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(SCOPES).toHaveLength((TEMPLATES.length + 1) * 4);
    const { findings, checked } = audit();
    expect(checked).toBeGreaterThan(500);
    const worst = findings
      .sort((a, b) => a.ratio - b.ratio)
      .map((f) => `${f.ratio.toFixed(2)} < ${f.floor} ${f.where}`);
    if (process.env.INK_DUMP) writeFileSync(process.env.INK_DUMP, worst.join('\n'));
    expect(worst).toEqual([]);
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
  const sheet = rules.filter((r) => r.file === 'src/clip/reel/reel.css');
  const palettes = sheet
    .map((r) => /^\.reel\[data-palette='(\w+)'\]$/.exec(r.selector)?.[1])
    .filter((p): p is string => !!p);
  const own = (selector: string, supports: boolean) =>
    Object.fromEntries(
      sheet
        .filter((r) => r.selector === selector && r.supports === supports)
        .flatMap((r) => [...r.decls].filter(([n]) => n.startsWith('--'))),
    );

  it('clears 4.5:1 for every palette', () => {
    expect(palettes).toHaveLength(4);
    const scope = SCOPES[0];
    const findings: string[] = [];
    for (const palette of palettes) {
      const on = resolver.on({
        ...own('.reel', true),
        ...own(`.reel[data-palette='${palette}']`, false),
      });
      for (const [fill, ink] of PAIRS) {
        const ratio = contrast(on.color(fill, scope), on.color(ink, scope));
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
