// extension-probe.mts — what a browser extension the reader installed can and cannot read.
//
// The legal copy says it plainly: an extension with access to this site can read the key, and
// Mavéa cannot prevent that. What it promises instead is narrower and testable — the key never
// sits in plain text in storage or in the DOM's attributes, the device key that seals it will not
// export, nothing survives "Forget everything on this device", and an extension WITHOUT access to
// the site learns nothing. This loads three real MV3 extensions (scripts/extension-probe/) into
// Chromium, one at a time, walks a reader through the gate, pastes a FAKE key with Remember on,
// asks each extension what it can see, forgets the device, and asks again.
//
// Verdicts: PASS (protected, as documented) · EXPECTED-EXPOSURE (readable, and documented as
// readable) · FAIL (a documented protection did not hold, or the harness never reached the state
// it meant to test). Exit 1 only on a FAIL. No request leaves the machine: every model-provider
// call and every off-origin request is aborted in the browser.
//
//   pnpm build && pnpm probe:extensions            (add --headed to watch it)
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';

const ROOT = join(import.meta.dirname, '..');
const EXTENSIONS_DIR = join(import.meta.dirname, 'extension-probe');
const OUT_FILE = join(ROOT, '.audit-out', 'extension-probe.json');
/** Shaped like a Gemini key so every code path treats it as one; it authorises nothing. */
const FAKE_KEY = 'AIza-fake-extension-probe-0000000000';
const HEADED = process.argv.includes('--headed');
/** `--only main-world` runs one extension (its directory name). */
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;

type Verdict = 'PASS' | 'EXPECTED-EXPOSURE' | 'FAIL';
interface Row {
  extension: string;
  phase: 'with key' | 'after Forget';
  check: string;
  verdict: Verdict;
  detail: string;
}

/** What `collect.js` reports from a content-script world. */
interface WorldFindings {
  error?: string;
  world: 'isolated' | 'main';
  href: string;
  htmlHasKey: boolean;
  attributesWithKey: string[];
  inputValueAttribute: boolean;
  inputValueProperty: boolean;
  localWithKey: string[];
  sessionWithKey: string[];
  secretsBlobPresent: boolean;
  maveaLocalKeys: string[];
  databases: { name: string; stores: { store: string; rows: number }[]; keyFound: boolean }[];
  idbError: string | null;
  cryptoKeys: {
    db: string;
    store: string;
    extractable: boolean;
    exportable: boolean;
    decryptsSavedKey: boolean;
  }[];
  maveaCaches: string[];
  cookieHasKey: boolean;
  vaultGlobals: string[];
  appDecryptReachable: boolean;
  configEvents: number;
  configEventsReadable: number;
  configEventHasKey: boolean;
  requestsSeen: number;
  requestsWithKey: { url: string; headers: string[] }[];
}

/** What the no-host worker reports. */
interface NoHostFindings {
  error?: string;
  tabCount: number;
  tabUrlVisible: boolean;
  tabTitleVisible: boolean;
  scriptingApi: boolean;
  cookiesApi: boolean;
  injected: boolean;
  messageAnswered: boolean;
  originReadable: boolean;
  ownStorageHasKey: boolean;
  ownDatabases: string[];
}

interface Extension {
  dir: string;
  label: string;
  kind: 'content' | 'no-host';
}

const EXTENSIONS: Extension[] = [
  { dir: 'broad-isolated', label: 'A broad host, isolated world', kind: 'content' },
  { dir: 'main-world', label: 'B main world', kind: 'content' },
  { dir: 'no-host', label: 'C no host permission', kind: 'no-host' },
];

const protect = (exposed: boolean): Verdict => (exposed ? 'FAIL' : 'PASS');
const documented = (exposed: boolean): Verdict => (exposed ? 'EXPECTED-EXPOSURE' : 'PASS');
const control = (held: boolean): Verdict => (held ? 'PASS' : 'FAIL');
const yesNo = (value: boolean) => (value ? 'yes' : 'no');
const list = (items: string[]) => (items.length ? items.join(', ') : 'none');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

/** The packaged CLI serves the production build exactly as a reader runs it. */
async function startServer(): Promise<{ origin: string; child: ChildProcess }> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [join(ROOT, 'bin/mavea.mjs'), '--port', String(port), '--no-open', '--no-voice'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const origin = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in 20s')), 20_000);
    let log = '';
    const onData = (chunk: Buffer) => {
      log += chunk.toString();
      if (log.includes(origin)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited (${code}): ${log.trim()}`));
    });
  });
  return { origin, child };
}

/** Each extension ships its own copy of the shared collector, as a real one would. */
async function assemble(extension: Extension, into: string): Promise<string> {
  const dir = join(into, extension.dir);
  await cp(join(EXTENSIONS_DIR, extension.dir), dir, { recursive: true });
  await cp(join(EXTENSIONS_DIR, 'shared', 'collect.js'), join(dir, 'collect.js'));
  return dir;
}

async function extensionWorker(context: BrowserContext): Promise<Worker> {
  const running = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  return running ?? context.waitForEvent('serviceworker', { timeout: 15_000 });
}

async function collect<T>(context: BrowserContext, origin: string): Promise<T> {
  const worker = await extensionWorker(context);
  return worker.evaluate(
    ([needle, at]) =>
      (
        globalThis as unknown as { probeCollect: (n: string, o: string) => Promise<unknown> }
      ).probeCollect(needle, at),
    [FAKE_KEY, origin] as const,
  ) as Promise<T>;
}

/** The reader's path: gate → key → Remember. Returns once the sealed copy is on disk and the
 *  app has tried to use the key (which the route aborts). */
async function enterKey(page: Page, origin: string, sent: { withKey: number }): Promise<void> {
  await page.goto(`${origin}/#/live`);
  await page.getByRole('checkbox').first().waitFor();
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Continue to Mavéa' }).click();
  await page.getByLabel('API key').fill(FAKE_KEY);
  const remember = page.getByRole('switch', { name: 'Remember this key on this device' });
  if ((await remember.getAttribute('aria-checked')) !== 'true') await remember.click();
  await page.waitForFunction(() => !!localStorage.getItem('mavea-live-v2:secrets'), null, {
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Test' }).click();
  const deadline = Date.now() + 10_000;
  while (sent.withKey === 0 && Date.now() < deadline) await page.waitForTimeout(100);
}

async function forgetDevice(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/#/live?settings=you`);
  await page.reload();
  await page.getByRole('tab', { name: 'Your data' }).click();
  await page.getByRole('button', { name: 'Forget everything on this device' }).click();
  await page.getByRole('button', { name: 'Confirm: forget everything on this device' }).click();
  // Forget ends in `location.replace(pathname)`; poll the URL rather than waiting on a navigation
  // event, which the replace can abort mid-flight.
  const deadline = Date.now() + 15_000;
  while (new URL(page.url()).hash.startsWith('#/live')) {
    if (Date.now() > deadline) throw new Error('Forget did not return to the landing in 15s');
    await page.waitForTimeout(100);
  }
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500); // let the landing boot and any late writer run
}

function worldRows(
  label: string,
  phase: Row['phase'],
  f: WorldFindings,
  sentWithKey: number,
): Row[] {
  const row = (check: string, verdict: Verdict, detail: string): Row => ({
    extension: label,
    phase,
    check,
    verdict,
    detail,
  });
  if (f.error) return [row('collector answered', 'FAIL', f.error)];
  const vault = f.cryptoKeys.filter((k) => k.db === 'mavea-key-vault');
  const idbWithKey = f.databases.filter((d) => d.keyFound).map((d) => d.name);
  const hookSaw = f.requestsWithKey.length > 0;
  const hookDetail = hookSaw
    ? `saw it in ${f.requestsWithKey.map((r) => `${r.headers.join('+')} → ${r.url}`).join('; ')}`
    : `${f.requestsSeen} requests seen through this world's fetch, none carrying the key`;

  if (phase === 'after Forget') {
    const anywhere =
      f.htmlHasKey ||
      f.attributesWithKey.length > 0 ||
      f.inputValueProperty ||
      f.localWithKey.length > 0 ||
      f.sessionWithKey.length > 0 ||
      idbWithKey.length > 0 ||
      f.cookieHasKey ||
      f.configEventHasKey ||
      hookSaw;
    const maveaDbs = f.databases.map((d) => d.name).filter((n) => /^mavea/i.test(n));
    return [
      row('key readable anywhere', protect(anywhere), `page: ${f.href}`),
      row('sealed key still stored', protect(f.secretsBlobPresent), 'mavea-live-v2:secrets'),
      row(
        'device key survives',
        protect(f.cryptoKeys.length > 0),
        `${f.cryptoKeys.length} CryptoKey(s)`,
      ),
      row('Mavéa databases survive', protect(maveaDbs.length > 0), list(maveaDbs)),
      row('Mavéa caches survive', protect(f.maveaCaches.length > 0), list(f.maveaCaches)),
      row('Mavéa localStorage left', protect(f.maveaLocalKeys.length > 0), list(f.maveaLocalKeys)),
    ];
  }

  return [
    row(
      'app sent the key (control)',
      control(sentWithKey > 0),
      `${sentWithKey} aborted /llm request(s) carried it`,
    ),
    row(
      'Remember sealed a copy (control)',
      control(f.secretsBlobPresent),
      'mavea-live-v2:secrets present',
    ),
    row('key in page HTML', protect(f.htmlHasKey), 'document.documentElement.outerHTML'),
    row(
      'key in a DOM attribute',
      protect(f.attributesWithKey.length > 0),
      list(f.attributesWithKey),
    ),
    row('key in an input value attribute', protect(f.inputValueAttribute), 'getAttribute("value")'),
    row(
      'key in input.value (live field)',
      documented(f.inputValueProperty),
      'the field the reader typed into',
    ),
    row('plaintext key in localStorage', protect(f.localWithKey.length > 0), list(f.localWithKey)),
    row('key in sessionStorage', protect(f.sessionWithKey.length > 0), list(f.sessionWithKey)),
    row(
      'plaintext key in IndexedDB',
      protect(idbWithKey.length > 0),
      f.idbError ?? `databases: ${list(f.databases.map((d) => d.name))}`,
    ),
    row(
      'vault CryptoKey is non-extractable',
      vault.length === 0 ? 'FAIL' : protect(vault.some((k) => k.extractable || k.exportable)),
      vault.length === 0
        ? 'no CryptoKey found in mavea-key-vault'
        : `${vault.length} key(s); exportKey raw/jwk ${vault.some((k) => k.exportable) ? 'SUCCEEDED' : 'threw'}`,
    ),
    row(
      'decrypt the saved blob with the vault key',
      documented(vault.some((k) => k.decryptsSavedKey)),
      'crypto.subtle.decrypt with the stored CryptoKey — non-extractable is not non-usable',
    ),
    row(
      'app decrypt reachable from this world',
      protect(f.appDecryptReachable),
      `globals matching /decrypt|vault|secret/: ${list(f.vaultGlobals)}`,
    ),
    row(
      'key in the config broadcast event',
      documented(f.configEventHasKey),
      `${f.configEvents} "mavea-live-v2" event(s), ${f.configEventsReadable} with a readable detail`,
    ),
    row(
      'key via a patched window.fetch',
      f.world === 'main' ? documented(hookSaw) : protect(hookSaw),
      hookDetail,
    ),
    row('key in document.cookie', protect(f.cookieHasKey), ''),
  ];
}

function noHostRows(label: string, phase: Row['phase'], f: NoHostFindings): Row[] {
  const row = (check: string, exposed: boolean, detail = ''): Row => ({
    extension: label,
    phase,
    check,
    verdict: protect(exposed),
    detail,
  });
  if (f.error)
    return [
      { extension: label, phase, check: 'worker answered', verdict: 'FAIL', detail: f.error },
    ];
  return [
    row('sees the app tab URL', f.tabUrlVisible, `${f.tabCount} tab(s) listed, none with a url`),
    row('sees any tab title', f.tabTitleVisible),
    row(
      'can inject a script',
      f.injected,
      `chrome.scripting ${f.scriptingApi ? 'present' : 'absent'}`,
    ),
    row('has the cookies API', f.cookiesApi),
    row('a page script answers it', f.messageAnswered),
    row('can read the app origin over fetch', f.originReadable, 'CORS'),
    row('key in its own storage', f.ownStorageHasKey, `own databases: ${list(f.ownDatabases)}`),
  ];
}

async function probe(extension: Extension, origin: string, scratch: string): Promise<Row[]> {
  const extensionDir = await assemble(extension, scratch);
  const profile = await mkdtemp(join(scratch, `${extension.dir}-profile-`));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', // the new headless mode; the headless shell cannot load extensions
    headless: !HEADED,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  const sent = { withKey: 0 };
  try {
    // Nothing leaves the machine: the provider proxy is answered by an abort, and so is any
    // request off the app's own origin (fonts, CDNs).
    await context.route(
      (url) =>
        url.protocol.startsWith('http') &&
        (url.origin !== origin || url.pathname.startsWith('/llm/')),
      async (route) => {
        const headers = await route.request().allHeaders();
        if (Object.values(headers).some((v) => v.includes(FAKE_KEY))) sent.withKey += 1;
        await route.abort();
      },
    );
    await extensionWorker(context);
    const page = context.pages()[0] ?? (await context.newPage());
    await enterKey(page, origin, sent);

    const rowsFor = async (phase: Row['phase']) =>
      extension.kind === 'content'
        ? worldRows(
            extension.label,
            phase,
            await collect<WorldFindings>(context, origin),
            sent.withKey,
          )
        : noHostRows(extension.label, phase, await collect<NoHostFindings>(context, origin));

    const rows = await rowsFor('with key');
    await forgetDevice(page, origin);
    rows.push(...(await rowsFor('after Forget')));
    return rows;
  } catch (error) {
    return [
      {
        extension: extension.label,
        phase: 'with key',
        check: 'probe ran to the end',
        verdict: 'FAIL',
        detail: String(error).split('\n').slice(0, 3).join(' | '),
      },
    ];
  } finally {
    await context.close();
  }
}

function printTable(rows: Row[]): void {
  const widths = [28, 13, 42, 18];
  const cell = (text: string, width: number) => text.padEnd(width).slice(0, width);
  const line = (cols: string[]) =>
    cols.map((c, i) => (i < widths.length ? cell(c, widths[i]) : c)).join('  ');
  console.log(line(['extension', 'phase', 'check', 'verdict', 'detail']));
  console.log('-'.repeat(130));
  for (const r of rows) console.log(line([r.extension, r.phase, r.check, r.verdict, r.detail]));
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error('extension-probe: no build found — run `pnpm build` first.');
    process.exit(1);
  }
  if (!existsSync(chromium.executablePath())) {
    // Branded Chrome ignores --load-extension, so the system-browser fallback the other audits use
    // (launch-chromium.mts) cannot stand in here.
    console.error(
      'extension-probe: needs Playwright Chromium — run `pnpm exec playwright install chromium`.',
    );
    process.exit(1);
  }
  const started = Date.now();
  const scratch = await mkdtemp(join(tmpdir(), 'mavea-extension-probe-'));
  const { origin, child } = await startServer();
  const rows: Row[] = [];
  try {
    for (const extension of EXTENSIONS.filter((e) => !ONLY || e.dir === ONLY))
      rows.push(...(await probe(extension, origin, scratch)));
  } finally {
    child.kill();
    await rm(scratch, { recursive: true, force: true });
  }

  printTable(rows);
  const failed = rows.filter((r) => r.verdict === 'FAIL');
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const counts = (['PASS', 'EXPECTED-EXPOSURE', 'FAIL'] as const)
    .map((v) => `${rows.filter((r) => r.verdict === v).length} ${v}`)
    .join(' · ');
  console.log(`\n${counts} — ${seconds}s`);
  await mkdir(join(ROOT, '.audit-out'), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify({ ranAt: new Date().toISOString(), seconds: Number(seconds), rows }, null, 2),
  );
  console.log(`written to ${OUT_FILE}`);
  if (failed.length) process.exit(1);
}

await main();
