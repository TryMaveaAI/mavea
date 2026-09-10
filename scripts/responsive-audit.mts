// responsive-audit.mts — the geometry suite in one command: the block library (audit:ui) and every
// surface (surface-audit) across the width ladder, at 1× and zoomed, in both themes.
//
//   pnpm audit:responsive                 # full: starts vite itself, every width, both DPRs, both themes
//   pnpm audit:responsive -- --ci         # the per-push subset responsive.yml runs
//   pnpm audit:responsive:fast            # surfaces only, three sizes, dark — and ONLY the surfaces
//                                         # whose own CSS/TSX changed against origin/main
//   pnpm audit:responsive -- --url http://localhost:5173 --only prism,dashboards
//
// Three cadences, one script, so the widths and checks each one runs are stated here and nowhere
// else. `--fast` is what the pre-push hook runs: it answers "did the files I just touched break the
// surfaces they belong to" in about a minute, and says so when nothing it measures has changed.
// Screenshots land in .audit-out/ (gitignored; never uploaded — the repo keeps CI free of billable
// artifact storage) for a human to look
// at — no pixel is ever compared, so a font bump on the CI image cannot flip a verdict.
import { execFileSync, spawnSync } from 'node:child_process';
import { startDevServer } from './dev-server.mts';
import {
  parseChecks,
  reportFindings,
  sweepSurfaces,
  type Check,
  type Finding,
} from './surface-audit.mts';
import { DEFAULT_SIZES, ZOOM_DPRS, surfacesTouchedBy } from './surface-sweep.mjs';

function readFlag(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--') ? argv[idx + 1] : fallback;
}
const hasFlag = (name: string) => process.argv.slice(2).includes(`--${name}`);
const list = (raw: string) =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** The per-push subset: the widths responsive.yml measured before, plus the narrowest phone, the
 *  tablet and the short laptop zoomed — the shapes a regression most often reaches readers at. */
const CI_SIZES = ['320x568', '834x1194', '1366x620', '1920x1080'];
const CI_UI_WIDTHS = '320,390,834,1280,1920';
const CI_DPRS = [1.25];

/** The fast subset: one phone, the short laptop, the desktop; only the checks that finish quickly. */
const FAST_SIZES = ['390x844', '1366x620', '1920x1080'];
const FAST_CHECKS: Check[] = ['scroll', 'clip', 'overlap', 'outside'];

/** Files changed against origin/main, or null when git cannot say (no remote, a shallow clone). */
function changedSources(): string[] | null {
  try {
    const out = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
      encoding: 'utf8',
    });
    const staged = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
    return [...new Set([...out.split('\n'), ...staged.split('\n')])].filter((f) =>
      /^src\/.*\.(css|tsx)$/.test(f),
    );
  } catch {
    return null;
  }
}

/** One row per surface × size × zoom: the matrix a reader can scan for the red cell. */
function printMatrix(findings: Finding[]): void {
  const sizes = [...new Set(findings.map((f) => `${f.size}${f.dpr === 1 ? '' : `@${f.dpr}`}`))];
  const surfaces = [...new Set(findings.map((f) => f.surface))];
  const cell = (surface: string, col: string) => {
    const rows = findings.filter(
      (f) => f.surface === surface && `${f.size}${f.dpr === 1 ? '' : `@${f.dpr}`}` === col,
    );
    if (!rows.length) return '  ·  ';
    return rows.some((r) => r.issues.length) ? ' ✗ ' : ' ✓ ';
  };
  const head = 'surface'.padEnd(20) + sizes.map((s) => s.padStart(12)).join('');
  console.log('\n' + head);
  for (const s of surfaces) {
    console.log(s.padEnd(20) + sizes.map((c) => cell(s, c).padStart(12)).join(''));
  }
}

async function main(): Promise<void> {
  const fast = hasFlag('fast');
  const ci = hasFlag('ci');
  const explicitUrl = readFlag('url', '');

  let only: Set<string> | undefined;
  const onlyFlag = readFlag('only', '');
  if (onlyFlag) only = new Set(list(onlyFlag));
  else if (fast) {
    const changed = changedSources();
    if (changed && changed.length === 0) {
      console.log(
        'audit:responsive:fast — no src/**/*.{css,tsx} changed against origin/main; nothing to measure.',
      );
      return;
    }
    const touched = changed ? surfacesTouchedBy(changed) : null;
    if (touched) {
      only = touched;
      console.log(
        `audit:responsive:fast — ${changed!.length} changed file(s) touch: ${[...touched].join(', ')}`,
      );
    } else {
      console.log('audit:responsive:fast — a shared file changed; measuring every surface.');
    }
  }

  const sizes = list(
    readFlag('sizes', (fast ? FAST_SIZES : ci ? CI_SIZES : DEFAULT_SIZES).join(',')),
  );
  const themes = list(readFlag('themes', fast || ci ? 'dark' : 'light,dark'));
  const dprs = fast
    ? []
    : list(readFlag('dpr', (ci ? CI_DPRS : ZOOM_DPRS).join(',')))
        .map(Number)
        .filter((d) => d > 1);
  const checks = fast ? new Set<Check>(FAST_CHECKS) : parseChecks(readFlag('checks', 'all'));

  const server = explicitUrl ? null : await startDevServer(Number(readFlag('port', '5178')));
  const baseUrl = (explicitUrl || server!.url).replace(/\/$/, '');
  const failed: string[] = [];
  try {
    if (!fast && !hasFlag('no-ui')) {
      console.log('\n── blocks (audit:ui) ──');
      const widths = readFlag(
        'ui-widths',
        ci ? CI_UI_WIDTHS : '320,414,768,1024,1280,1366,1920,2560',
      );
      const ui = spawnSync(
        'node',
        [
          '--import',
          'tsx',
          'scripts/ui-audit.mts',
          '--url',
          baseUrl,
          '--widths',
          widths,
          '--themes',
          themes.join(','),
        ],
        { stdio: 'inherit' },
      );
      if (ui.status !== 0) failed.push('audit:ui');
    }
    if (!hasFlag('no-surfaces')) {
      console.log('\n── surfaces ──');
      const findings = await sweepSurfaces({
        baseUrl,
        sizes,
        themes,
        dprs,
        only,
        checks,
        labs: !fast && !ci,
        shots: hasFlag('no-shots') ? null : readFlag('shots', '.audit-out/surfaces'),
      });
      printMatrix(findings);
      if (!reportFindings(findings)) failed.push('surfaces');
    }
  } finally {
    server?.stop();
  }
  if (failed.length) {
    console.log(`\n✗ ${failed.join(', ')} flagged findings.`);
    process.exitCode = 1;
  }
}

await main();
