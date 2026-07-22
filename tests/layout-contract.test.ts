import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// The smart-layout guarantee rests on a small set of shared CSS rules: the overflow net and the
// .card-frame contract. They protect EVERY block — including ones authored long after this — so
// they must never be quietly deleted or weakened. jsdom can't measure layout, so this is a
// source-level regression guard: it asserts the load-bearing rules are still present, and that
// the dynamic-text slots never pin themselves to a single line (which would clip a long caption
// or title instead of wrapping it — the exact failure this system exists to prevent).

const css = readFileSync(join(__dirname, '../src/styles/visualizations-extra.css'), 'utf8');

describe('shared overflow net is present', () => {
  it('clips card content as the last-resort backstop', () => {
    expect(css).toMatch(/\.card\s*\{[^}]*overflow:\s*hidden/s);
  });
  it('lets grid cells shrink below their content', () => {
    expect(css).toMatch(/\.card-grid\s*>\s*\[class\*='col-'\]\s*\{[^}]*min-width:\s*0/s);
  });
  it('caps embedded media to the card width', () => {
    expect(css).toMatch(/:where\(\.card\)\s*:where\(img,\s*svg,\s*video,\s*canvas\)/);
  });
  it('caps fixed-width and stretched SVGs too, not only width="100%"', () => {
    expect(css).toMatch(/svg\[width\$='px'\]/);
    expect(css).toMatch(/svg\[preserveAspectRatio='none'\]/);
  });
});

describe('even rows: a card fills its stretched grid cell', () => {
  // The grid stretches each col-* cell to its row's tallest block, but a plain .card then sits at
  // its OWN content height inside that cell — leaving a ragged transparent gap below a short card
  // next to a tall one (verified live: a 231px card floating in a 236px cell; a short insight next
  // to a map, far worse). Making the cell a flex column + flex-growing the DIRECT card child fills
  // the cell so the row reads even. This was reverted once by mistake when the spotlight scale(1.03)
  // confounded a browser measurement, so guard it at the source level (jsdom can't measure fill).
  it('the col cell is a flex column', () => {
    expect(css).toMatch(
      /\.card-grid\s*>\s*\[class\*='col-'\]\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s,
    );
  });
  it('the direct card child flex-grows to fill the cell', () => {
    expect(css).toMatch(/\.card-grid\s*>\s*\[class\*='col-'\]\s*>\s*\.card\s*\{[^}]*flex:\s*1/s);
  });
});

describe('.card-grid holds a definite width so it cannot collapse in a flex parent', () => {
  // .depth-section (the "sections" teaching layout) and its Go-deeper drawers are flex columns
  // that wrap cards in an INNER .card-grid. .card-grid uses `margin: 0 auto` to center — but an
  // auto cross-axis margin on a flex item suppresses `align-items: stretch`, so without an
  // explicit width the grid falls back to its content size and repeat(12, 1fr) + min-width:0
  // cells collapse to min-content (every card shredded into a ~1-char column). The `width: 100%`
  // makes the cross size definite so the grid always fills its column. Removing it regresses the
  // sectioned/drawer layout — this guards it (jsdom can't measure the collapse itself).
  it('the base .card-grid rule declares width: 100%', () => {
    expect(css).toMatch(/\.card-grid\s*\{[^}]*\bwidth:\s*100%/s);
  });

  // Permanent guard for the whole class, not just today's rule: ANY grid container that lays out
  // the responsive card system (a repeat() multi-track template) AND centers with an auto
  // cross-axis margin is one flex parent away from the min-content collapse above. Every such
  // container must pin width:100%. This scan fails if a future card-container grid is added
  // without it — so the fix can't silently regress anywhere in this file.
  it('every repeat()-grid that centers with auto-margin also pins width:100%', () => {
    const offenders: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = m;
      const isGrid = /display:\s*grid/.test(body);
      const isTracked = /grid-template-columns:[^;]*repeat\(/.test(body);
      const autoCentered = /margin(-inline)?:\s*(0\s+)?auto|margin:\s*auto/.test(body);
      const pinned = /\bwidth:\s*100%/.test(body);
      if (isGrid && isTracked && autoCentered && !pinned) offenders.push(sel.trim());
    }
    expect(offenders, `repeat()-grids centered with auto-margin but missing width:100%`).toEqual(
      [],
    );
  });
});

describe('.card-frame contract is present', () => {
  for (const sel of ['.card-frame', '.card-frame > .cf-body', '.card-text-safe', '.cf-scroll']) {
    it(`defines ${sel}`, () => {
      expect(css).toContain(sel);
    });
  }
  it('relaxes opt-in aspect ratios on narrow cards via container query', () => {
    expect(css).toMatch(/@container\s*\(max-width:\s*360px\)/);
  });
  it('bounds the many-items scroll region to a sane height', () => {
    expect(css).toMatch(/\.cf-scroll\s*\{[^}]*max-block-size/s);
  });
});

describe('dynamic-text slots wrap rather than clip', () => {
  // These slots hold model/user text of unbounded length; nowrap would push it past the card.
  for (const slot of ['.cf-title', '.cf-caption', '.card-text-safe', '.cf-eyebrow']) {
    it(`${slot} never sets white-space: nowrap`, () => {
      const block = new RegExp(`\\${slot}[^{]*\\{([^}]*)\\}`, 'g');
      for (const m of css.matchAll(block)) {
        expect(m[1]).not.toMatch(/white-space:\s*nowrap/);
      }
    });
  }
});

// Two failures the browser audit caught at the narrowest breakpoint, where a card is only wide
// enough for two or three words per line. Neither is visible to jsdom — it has no layout engine —
// and both were invisible locally too, because macOS renders these faces narrower than CI's Linux
// does. Pin the fixes at the source level so the next edit can't quietly undo them.
describe('narrow-card layout fixes stay in place', () => {
  const flows = readFileSync(join(__dirname, '../src/canvas/blocks/flows/styles.css'), 'utf8');
  const docs = readFileSync(join(__dirname, '../src/canvas/blocks/docs/styles.css'), 'utf8');

  it('the business-canvas framework chip can break — it holds a prop, not a fixed string', () => {
    const rule = /\.fl-bc-variant\s*\{([^}]*)\}/s.exec(flows)?.[1] ?? '';
    expect(rule).toBeTruthy();
    // `nowrap` made "Business Model Canvas" one unbreakable token, wider than a 280px card.
    expect(rule).not.toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('clinical-timeline events keep their natural height inside the scrolling column', () => {
    const rule = /\.ct-event\s*\{([^}]*)\}/s.exec(docs)?.[1] ?? '';
    expect(rule).toBeTruthy();
    // `.ct-events` is a flex column with a max-height, so without this its children shrink below
    // their own content and each event's text spills into the one below it.
    expect(rule).toMatch(/flex-shrink:\s*0/);
  });

  it('the banner row wraps so its call to action never overflows the card', () => {
    const display = readFileSync(
      join(__dirname, '../src/canvas/blocks/display/styles.css'),
      'utf8',
    );
    const rule = /\.bn-banner\s*\{([^}]*)\}/s.exec(display)?.[1] ?? '';
    expect(rule).toBeTruthy();
    // `.bn-action` deliberately stays nowrap and does not shrink, so a long label would be pushed
    // straight out of the card unless the row itself can wrap.
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
  });

  it('compare-bars rows keep their natural height inside the scrolling column', () => {
    const tables = readFileSync(join(__dirname, '../src/canvas/blocks/tables/styles.css'), 'utf8');
    const rule = /\.cb-row\s*\{([^}]*)\}/s.exec(tables)?.[1] ?? '';
    expect(rule).toBeTruthy();
    // Same shape as `.ct-event`: `.cb` is a flex column with a max-height, so without this its
    // rows are squeezed below their own content and the labels are visually cut.
    expect(rule).toMatch(/flex-shrink:\s*0/);
  });
});
