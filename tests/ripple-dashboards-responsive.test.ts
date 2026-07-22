// Guards against the responsive regressions found in a launch-readiness pass: Ripple's top bar and
// Dashboards' sticky nav clipped/overlapped their own content below ~430px (a flex item with
// white-space: nowrap can't shrink without min-width: 0, so ellipsis never kicks in and the row just
// overflows), and Ripple's rail+main stayed side-by-side at phone widths, squeezing the main pane to
// an unusable sliver. jsdom has no real layout engine, so this can't be caught by rendering — it's a
// source-scan for the exact CSS shape that fixed it, the same idiom as
// tests/canvas-svg-label-patterns.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/** The declaration block for the first `selector { ... }` rule found (not nested at-rules). */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, (c) => '\\' + c);
  const m = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`selector not found in stylesheet: ${selector}`);
  return m[1]!;
}

describe('Ripple overlay — the top bar reflows instead of clipping', () => {
  const css = readFileSync(join(__dirname, '../src/live/ripple/ripple.css'), 'utf8');

  it('.ripple-head wraps its two clusters onto separate rows when they do not fit', () => {
    expect(ruleBody(css, '.ripple-head')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('.ripple-head-right (stats + P0 badge + icon buttons) can also wrap internally', () => {
    expect(ruleBody(css, '.ripple-head-right')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the nowrap monospace identity fields declare min-width: 0 so their ellipsis can engage', () => {
    // .ripple-repo, .ripple-pr, .ripple-branch, .ripple-stat share one rule body.
    const body = ruleBody(css, '.ripple-repo,\n.ripple-pr,\n.ripple-branch,\n.ripple-stat');
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  it('below tablet width the rail stacks above the main pane instead of squeezing it', () => {
    const mobile = /@media \(max-width: 720px\) \{([\s\S]*?)\n\}\n\n/.exec(css)?.[1];
    expect(mobile, 'expected a max-width: 720px block after the rail/main rules').toBeTruthy();
    expect(mobile).toMatch(/\.ripple-body\s*\{[^}]*flex-direction:\s*column/);
    expect(mobile).toMatch(/\.ripple-rail\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('the scrim uses the shared scrim token, not a raw color, behind its blur', () => {
    expect(ruleBody(css, '.ripple-scrim')).toMatch(/var\(--scrim-rgb\)/);
  });
});

describe('Dashboards — the sticky top bar and tile grid reflow instead of clipping', () => {
  // The topbar + home tile grid live in dash-home.css (DashTopBar/DashboardHome); detail/settings/
  // overview chrome — .dash-detail-title included — stayed behind in dashboards.css.
  const homeCss = readFileSync(join(__dirname, '../src/live/dashboards/dash-home.css'), 'utf8');
  const css = readFileSync(join(__dirname, '../src/live/dashboards/dashboards.css'), 'utf8');

  it('.dash-topbar-scroll scrolls horizontally rather than forcing the sticky bar to overflow', () => {
    const body = ruleBody(homeCss, '.dash-topbar-scroll');
    expect(body).toMatch(/min-width:\s*0/);
    expect(body).toMatch(/overflow-x:\s*auto/);
  });

  it('.dash-topbar-brand and .dash-topbar-link never shrink below their own content (the scroll row does)', () => {
    expect(ruleBody(homeCss, '.dash-topbar-brand')).toMatch(/flex:\s*none/);
    expect(ruleBody(homeCss, '.dash-topbar-link')).toMatch(/flex:\s*none/);
  });

  it('the tracking grid can shrink its column below 300px on a phone narrower than that', () => {
    expect(homeCss).toMatch(/\.dash-track-grid\s*\{[^}]*minmax\(min\(\d+px, 100%\), 1fr\)/);
  });

  it('the empty dashboard hero overrides centered auto margins and fills the compact main column', () => {
    const body = ruleBody(homeCss, '.dash-home-main > .dash-empty--hero');
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/margin:\s*0/);
    expect(body).toMatch(/max-width:\s*none/);
  });

  it('a long dashboard title ellipsizes instead of forcing the detail header to overflow', () => {
    const body = ruleBody(css, '.dash-detail-title');
    // A flex item defaults to min-width: auto (its full text width) — it must be capped below
    // that (a small floor is fine, unlike the old bare `flex: none`) for the ellipsis to engage.
    expect(body).toMatch(/min-width:\s*\d/);
    expect(body).toMatch(/text-overflow:\s*ellipsis/);
  });
});
