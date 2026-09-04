// Production-faithful browser smoke for the local voice path. Unlike a curl health check this
// proves the app can create/unlock WebAudio, pass the Kokoro gate, receive PCM through Vite's
// same-origin proxy, and schedule samples to the output device.
import { launchChromium } from './launch-chromium.mts';
import { LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION } from '../src/legal/acceptance.js';

function flag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

const base = flag('url', 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await launchChromium({ headless: true });
const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await context.newPage();
const failures: string[] = [];

await page.addInitScript(
  ([key, version]) => {
    localStorage.setItem(key, JSON.stringify({ version, acceptedAt: new Date(0).toISOString() }));
  },
  [LEGAL_ACCEPTANCE_STORAGE_KEY, LEGAL_ACCEPTANCE_VERSION] as const,
);

page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => failures.push(`page: ${error.message}`));

try {
  await page.goto(`${base}/#/live?voice-smoke=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.mavea-app.with-rail').waitFor({ state: 'visible', timeout: 30_000 });
  // A real trusted gesture gives WebAudio the same autoplay permission as the user's first tap.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const result = await page.evaluate(async () => {
    const energy = await import('/src/voice/voiceEnergy.ts');
    const kokoro = await import('/src/voice/kokoro.ts');
    energy.unlockAudio();
    const beganAt = performance.now();
    const line = kokoro.speakKokoroLine(
      'Lisbon is all about pacing yourself between the steep hills, the incredible viewpoints, and the food. I mapped out three balanced days for you.',
      'mavea',
    );
    const started = await Promise.race([
      line.started,
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 30_000)),
    ]);
    const state = energy.sharedAudioContext()?.state ?? 'unavailable';
    kokoro.cancelKokoro();
    return { started, state, startMs: Math.round(performance.now() - beganAt) };
  });
  if (!result.started) failures.push('Kokoro produced no scheduled audio within 30 seconds');
  if (result.state !== 'running') failures.push(`AudioContext is ${result.state}`);
  console.log(
    `${result.started && result.state === 'running' ? 'PASS' : 'FAIL'} voice browser path: ` +
      `audio scheduled=${result.started}, first audio=${result.startMs}ms, AudioContext=${result.state}`,
  );
  for (const failure of failures) console.log(`  ${failure}`);
  if (failures.length) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
