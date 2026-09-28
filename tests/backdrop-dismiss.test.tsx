import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { useBackdropDismiss } from '../src/lib/useBackdropDismiss';

// A scrim closes only on a press that began AND ended on it. A bare onClick also fired for a drag
// that started in the panel and was released past its edge (the click lands on the common
// ancestor: the scrim), so selecting text in a dialog could throw the dialog away.

afterEach(cleanup);

function Harness({ onDismiss }: { onDismiss?: () => void }) {
  const backdrop = useBackdropDismiss(onDismiss);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div data-testid="scrim" onPointerDown={backdrop.onPointerDown} onClick={backdrop.onClick}>
      <div data-testid="panel">panel</div>
    </div>
  );
}

describe('useBackdropDismiss', () => {
  it('closes on a press that began and ended on the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId('scrim'));
    fireEvent.click(screen.getByTestId('scrim'), { detail: 1 });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('stays open for a drag that began in the panel and was released on the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId('panel'));
    fireEvent.click(screen.getByTestId('scrim'), { detail: 1 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('stays open for a click inside the panel', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId('panel'));
    fireEvent.click(screen.getByTestId('panel'), { detail: 1 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not carry one press on the backdrop over to a later drag', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId('scrim'));
    fireEvent.click(screen.getByTestId('scrim'), { detail: 1 });
    fireEvent.click(screen.getByTestId('scrim'), { detail: 1 });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('closes on a keyboard activation, which cannot be a drag', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('scrim'), { detail: 0 });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('is inert while there is nothing to dismiss with', () => {
    render(<Harness />);
    fireEvent.pointerDown(screen.getByTestId('scrim'));
    expect(() => fireEvent.click(screen.getByTestId('scrim'), { detail: 1 })).not.toThrow();
  });
});

// Every scrim in the app goes through the hook. A tag is judged a scrim on any one of three signs,
// because each alone misses one the others catch: a class that names it (scrim, backdrop, modal,
// overlay, lightbox, shade, veil); a click handler that tests `e.target === e.currentTarget` (the
// hand-rolled rule); or a plain element acting as a button whose name says it closes (a
// lightbox's modal). A click handler that only stops propagation is a panel guarding itself.
const ROOT = join(__dirname, '..');
const TAG = /<(\w+)\b((?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*)>/g;
const SCRIM_WORDS = 'scrim|backdrop|modal|overlay|lightbox|shade|veil';
const SCRIM_CLASS = new RegExp(
  `className=(?:"[^"]*|\\{[^}]*)\\b(?:[\\w-]*-)?(?:${SCRIM_WORDS})\\b`,
);
const ACTS_AS_BUTTON = /role="button"/;
const NAMED_TO_CLOSE = /aria-label="(?:Close|Back out)/;
const GUARD_ONLY = /onClick=\{\(e\) => e\.stopPropagation\(\)\}/;

function isScrim(tag: string, attrs: string): boolean {
  if (GUARD_ONLY.test(attrs)) return false;
  if (SCRIM_CLASS.test(attrs) || /e\.target === e\.currentTarget/.test(attrs)) return true;
  return tag !== 'button' && ACTS_AS_BUTTON.test(attrs) && NAMED_TO_CLOSE.test(attrs);
}

function scrims(): { where: string; attrs: string }[] {
  const found: { where: string; attrs: string }[] = [];
  const files = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true }).filter(
    (e) => e.isFile() && e.name.endsWith('.tsx'),
  );
  for (const entry of files) {
    const file = relative(ROOT, join(entry.parentPath, entry.name));
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const m of text.matchAll(TAG)) {
      const attrs = m[2];
      if (!/\bonClick=/.test(attrs)) continue;
      if (!isScrim(m[1], attrs)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      found.push({ where: `${file}:${line}`, attrs });
    }
  }
  return found;
}

describe('every scrim uses useBackdropDismiss', () => {
  const all = scrims();

  it('finds the scrims it is judging', () => {
    expect(all.length).toBeGreaterThan(25);
  });

  it('wires both the press and the click through the hook', () => {
    const naive = all
      .filter(({ attrs }) => {
        const hook = /\bonClick=\{(\w+)\.onClick\}/.exec(attrs)?.[1];
        return !hook || !attrs.includes(`onPointerDown={${hook}.onPointerDown}`);
      })
      .map(({ where }) => where);
    expect(naive).toEqual([]);
  });
});
