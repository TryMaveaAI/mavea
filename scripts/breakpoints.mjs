// breakpoints.mjs — the breakpoint ladder, as data both stylelint and the tests can import.
//
// A custom property is not valid inside @media, so the ladder cannot live in tokens-base.css as a
// token; it lives there as the DOCUMENTED contract (the layout-contract comment says what each step
// is for) and here as the numbers stylelint enforces. tests/responsive-contract.test.ts fails the
// moment the two disagree.

/** Window widths, in px, a media query may name. */
export const BREAKPOINT_WIDTHS = [
  360, 430, 480, 560, 640, 720, 768, 900, 1024, 1200, 1280, 1600, 1920, 2560,
];

/** Window heights, in px, a media query may name. 500 is a phone on its side (844×390,
 *  932×430): a wide-enough window that is still a phone, so it takes the compact layout. 1500 is a
 *  4K display at 1× (3840×2025 inside the browser): with 2560 it tells that apart from an ultrawide,
 *  which is as wide but no taller than a laptop. */
export const BREAKPOINT_HEIGHTS = [500, 650, 700, 820, 900, 1500];
