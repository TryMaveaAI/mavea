// Launch the repository's browser audits on both CI and older development Macs. New Playwright
// releases no longer publish their bundled Chromium for macOS 13, but an installed Chrome still
// speaks the same automation protocol. Prefer the hermetic bundle when present; otherwise use a
// known system browser (or an explicit env override) instead of making every audit fail at launch.
import { existsSync } from 'node:fs';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

const SYSTEM_CHROMIUM = [
  process.env.MAVEA_CHROMIUM_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter((path): path is string => !!path);

export function chromiumExecutable(): string | undefined {
  const bundled = chromium.executablePath();
  if (bundled && existsSync(bundled)) return undefined;
  return SYSTEM_CHROMIUM.find((path) => existsSync(path));
}

/** Flags that make GLYPH METRICS the same number twice.
 *
 *  These gates measure rendered geometry, and the geometry of text is decided by the rasteriser:
 *  hinting nudges a glyph to the pixel grid, subpixel positioning lets it sit between pixels, and
 *  both are tuned per platform and per font. That is how `audit:ui` could trip on claimgrid at
 *  390px on one run and pass on the next over a byte-identical tree — a label a fraction of a
 *  pixel wider crossed an overlap threshold. Turning all three off costs nothing the audits care
 *  about (they never compare screenshots, only boxes) and makes a verdict reproducible, which is
 *  what a gate has to be before it can run on every push. */
const DETERMINISTIC_TEXT = [
  '--font-render-hinting=none',
  '--disable-font-subpixel-positioning',
  '--disable-lcd-text',
];

export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  const args = [...DETERMINISTIC_TEXT, ...(options.args ?? [])];
  const executablePath = chromiumExecutable();
  if (!executablePath) return chromium.launch({ ...options, args });
  return chromium.launch({ ...options, args, executablePath });
}
