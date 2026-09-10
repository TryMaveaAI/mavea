// breakpoints.mjs — the breakpoint ladder, as data both stylelint and the tests can import.
//
// A custom property is not valid inside @media, so the ladder cannot live in tokens-base.css as a
// token; it lives there as the DOCUMENTED contract (the layout-contract comment says what each step
// is for) and here as the numbers stylelint enforces. tests/responsive-contract.test.ts fails the
// moment the two disagree.

/** Window widths, in px, a media query may name. */
export const BREAKPOINT_WIDTHS = [
  360, 430, 480, 560, 640, 720, 768, 900, 1024, 1200, 1280, 1600, 1920,
];

/** Window heights, in px, a media query may name. */
export const BREAKPOINT_HEIGHTS = [650, 700, 820, 900];
