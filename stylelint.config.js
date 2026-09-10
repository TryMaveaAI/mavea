// stylelint.config.js — the responsive layout contract, enforced statically.
//
// Prettier already formats CSS, so there is deliberately no stylistic preset here: every rule below
// stops a specific responsive regression — a fixed width that overflows a phone, a px font size that
// ignores the reader's text-size knob, a one-off breakpoint that disagrees with the ladder by a
// pixel. The ladder itself is documented once, in src/styles/tokens-base.css; the numbers here
// mirror it and a test (tests/responsive-contract.test.ts) fails if the two drift apart.
//
// An exception is spelled out where it lives:
//   /* stylelint-disable-next-line <rule> -- why this one is safe */
// The description is mandatory (reportDescriptionlessDisables) and a disable that no longer
// suppresses anything is itself an error (reportNeedlessDisables), so the list of exceptions can
// only shrink honestly.

import { BREAKPOINT_HEIGHTS, BREAKPOINT_WIDTHS } from './scripts/breakpoints.mjs';

const px = (values) => values.map((v) => `${v}px`);

/** A bare px length of 64 or more. Below that a value is a control, an icon or a hairline
 *  (the largest control in the app is 56px); at or above it, a box the layout depends on. */
const CONTAINER_PX = '/^(6[4-9]|[7-9]\\d|\\d{3,})(\\.\\d+)?px$/';

/** A `font` shorthand whose SIZE term is a bare px number — `650 11px/1 var(--font)` — as opposed
 *  to one carrying a token or a bounded clamp(). */
const FONT_SHORTHAND_PX = '/(^|\\s)\\d+(\\.\\d+)?px(\\/|\\s)/';

export default {
  plugins: ['stylelint-declaration-strict-value'],
  reportDescriptionlessDisables: true,
  reportNeedlessDisables: true,
  rules: {
    // Range syntax only: `(width <= 720px)`. Two rules written as max-width: 720px / min-width:
    // 721px leave a 720.5px window matching neither.
    'media-feature-range-notation': 'context',
    // Every width/height a media query names must be on the ladder.
    'media-feature-name-value-allowed-list': {
      width: px(BREAKPOINT_WIDTHS),
      height: px(BREAKPOINT_HEIGHTS),
    },
    // `vh` is the unit that jumps when a phone's URL bar slides away. dvh follows the visible
    // viewport, svh is its smallest size — one of those is always what was meant.
    'unit-disallowed-list': ['vh'],
    'declaration-property-value-disallowed-list': {
      // A fixed inline size is what turns a narrow card into a horizontal scroll. Fluidise it
      // (`min(240px, 100%)`), or say why the box must stay wider than its frame. Heights and
      // max-* caps are deliberately not here: a fixed height never squeezes the inline axis, a
      // max-* yields to the container by definition, and both failure modes (vertical clipping,
      // a cap wider than the window) are measured directly by audit:ui and audit:surfaces.
      '/^(width|min-width|inline-size|min-inline-size|flex-basis)$/': [CONTAINER_PX],
      // Vertical text is a layout that refuses to reflow; it is also what the geometry suite's
      // vertical-text detector flags when a column collapses to a few pixels wide.
      'writing-mode': ['/.*/'],
      // nowrap makes a line as wide as its longest word decides. It is fine on a single term and
      // fatal on prose, so every one states which it is.
      'white-space': ['nowrap'],
      font: [FONT_SHORTHAND_PX],
    },
    // Type comes from the fluid ramp. A token, a token-based expression, or a bounded fluid
    // expression (clamp/min/max state their own floor and ceiling) — never a bare px, and never a
    // px inside calc(), which is how the reader's text-size knob used to be bypassed.
    'scale-unlimited/declaration-strict-value': [
      ['font-size'],
      {
        ignoreVariables: true,
        ignoreFunctions: false,
        ignoreValues: {
          'font-size': [
            'inherit',
            'initial',
            'unset',
            'smaller',
            'larger',
            '0',
            '/^(?!.*\\d(\\.\\d+)?px).+$/',
            '/^(clamp|min|max)\\(/',
          ],
        },
        message:
          'font-size must come from the --fs-* ramp (tokens-base.css) or a bounded fluid expression, not a fixed px',
      },
    ],
  },
  overrides: [
    {
      // The ramp defines itself in px and vi; that is the one place a pixel belongs.
      files: ['src/styles/tokens-base.css'],
      rules: {
        'scale-unlimited/declaration-strict-value': null,
      },
    },
  ],
};
