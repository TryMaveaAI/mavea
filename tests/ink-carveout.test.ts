// Guards the Mark highlighter's carve-out: any canvas block that grabs a pointer-drag on a plain
// element must opt out of ink capture with `data-interactive`, or the highlighter would hijack the
// drag (a slider, the before/after divider, a carousel swipe). Native controls (<button>, <input>…)
// are already in the CARVE_OUT selector, so they're exempt. Mirrors the source-scan style of
// canvas-svg-label-patterns.test.ts — a cheap net that fails when a new draggable block forgets to
// opt out.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BLOCKS_DIR = join(__dirname, '../src/canvas/blocks');
// Tags already covered by the CARVE_OUT selector in UserInkLayer.
const NATIVE = /^(button|input|select|textarea|a|summary)$/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(p));
    else if (entry.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The opening JSX tag a given `onPointerDown` lives on: its tag name and whether it declares
 *  data-interactive. We walk back to the nearest `<tag` and forward to the tag's closing `>`. */
function tagFor(src: string, handlerIdx: number): { name: string; optedOut: boolean } | null {
  const open = src.lastIndexOf('<', handlerIdx);
  if (open < 0) return null;
  const m = /^<([A-Za-z][\w.-]*)/.exec(src.slice(open, open + 40));
  if (!m) return null;
  // Read to the end of the opening tag, ignoring `>` inside {…} braces (style/handler expressions).
  let depth = 0;
  let end = open;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) {
      end = i;
      break;
    }
  }
  const tag = src.slice(open, end);
  return { name: m[1], optedOut: /\bdata-interactive\b/.test(tag) };
}

describe('Mark highlighter carve-out', () => {
  const files = tsxFiles(BLOCKS_DIR).filter((f) =>
    readFileSync(f, 'utf8').includes('onPointerDown'),
  );

  it('finds the known draggable blocks (the scan is actually looking at something)', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it.each(files.map((f) => [f.slice(f.indexOf('blocks/')), f] as const))(
    'every pointer-drag element in %s is a native control or opts out with data-interactive',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      let idx = src.indexOf('onPointerDown');
      while (idx !== -1) {
        const tag = tagFor(src, idx);
        expect(tag, `could not locate the JSX tag for an onPointerDown in ${file}`).not.toBeNull();
        if (tag && !NATIVE.test(tag.name)) {
          expect(
            tag.optedOut,
            `<${tag.name}> with onPointerDown in ${file} must carry data-interactive so the Mark highlighter doesn't hijack its drag`,
          ).toBe(true);
        }
        idx = src.indexOf('onPointerDown', idx + 1);
      }
    },
  );
});

// The other half of "the highlighter gets the drag": on touch, a stroke is only possible if the
// stage opted out of native panning BEFORE the finger moves. Waiting for .ink-capturing (added
// after the 4px threshold) is too late — the browser has already committed the gesture to a
// scroll and fires pointercancel. jsdom parses no stylesheet, so this is a source scan.
describe('Mark highlighter touch drawing', () => {
  const css = readFileSync(join(__dirname, '../src/live/annotate/annotate.css'), 'utf8');

  it('suppresses touch-scroll from the moment the highlighter is armed', () => {
    const armed = /\.ink-armed\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(armed).toMatch(/cursor:\s*crosshair/);
    expect(armed).toMatch(/touch-action:\s*none/);
  });
});
