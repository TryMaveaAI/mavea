import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

// A surface that says `aria-modal` tells assistive tech the page behind it is gone. If focus can
// still Tab out into that page, the keyboard reader is somewhere the screen reader says does not
// exist. `useFocusTrap` is the one implementation (focus in, Tab held, focus restored on close), so
// every modal surface uses it. This was enforced by review alone, and the Lens shipped without it.
// A CSS attribute selector (`[aria-modal="true"]`) finds a modal someone else opened; it declares
// nothing, so it is not read as one.
const ROOT = join(__dirname, '..');
const MODAL = /(?<!\[)aria-modal=(?:"true"|\{true\}|\{[^}]*\?[^}]*true)/;

// Modals that predate the contract and do not trap yet. The list may only shrink: a file that
// gains the hook must leave it, and nothing new may join.
const NOT_YET_TRAPPED = new Set(['src/canvas/TopicCanvas.tsx']);

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx$/.test(e.name))
    .map((e) => relative(ROOT, join(e.parentPath, e.name)));
}

const modals = sources(join(ROOT, 'src')).filter((file) =>
  MODAL.test(readFileSync(join(ROOT, file), 'utf8')),
);
const trapped = (file: string) => /\buseFocusTrap\(/.test(readFileSync(join(ROOT, file), 'utf8'));

describe('every modal surface traps focus', () => {
  it('finds the modals it is judging', () => {
    expect(modals.length).toBeGreaterThan(20);
  });

  it('uses useFocusTrap wherever it declares aria-modal', () => {
    const untrapped = modals.filter((file) => !trapped(file) && !NOT_YET_TRAPPED.has(file));
    expect(untrapped).toEqual([]);
  });

  it('drops a file from the backlog once it traps', () => {
    const stale = [...NOT_YET_TRAPPED].filter((file) => !modals.includes(file) || trapped(file));
    expect(stale).toEqual([]);
  });
});
