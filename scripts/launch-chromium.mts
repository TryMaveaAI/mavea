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

export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  const executablePath = chromiumExecutable();
  if (!executablePath) return chromium.launch(options);
  return chromium.launch({ ...options, executablePath });
}
