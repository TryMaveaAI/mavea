// The copy button is shared by several lazily loaded families, so its look cannot live in any one
// family's sheet: a message script (layout) or a translation (reference) on a board with no compose
// card drew it as a bare, iconless browser box.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { CopyButton } from '../src/canvas/lib/CopyButton';

const BLOCKS = join(__dirname, '../src/canvas/blocks');

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ships its own styles, and no family sheet claims them', () => {
    const src = readFileSync(join(__dirname, '../src/canvas/lib/CopyButton.tsx'), 'utf8');
    expect(src).toContain("import './copy.css'");
    expect(readFileSync(join(__dirname, '../src/canvas/lib/copy.css'), 'utf8')).toMatch(
      /\.copy-btn\s*\{/,
    );
    for (const family of readdirSync(BLOCKS, { withFileTypes: true })) {
      if (!family.isDirectory()) continue;
      const sheet = join(BLOCKS, family.name, 'styles.css');
      if (!existsSync(sheet)) continue;
      const css = readFileSync(sheet, 'utf8');
      expect(css, family.name).not.toMatch(/^\.copy-btn\b/m);
    }
  });

  it('confirms a copy, then settles back', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { getByRole } = render(<CopyButton text="hello" label="Copy message" />);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Copy message' }));
    });
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(getByRole('button', { name: 'Copied' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(getByRole('button', { name: 'Copy message' })).toBeTruthy();
  });

  it('stays quiet when the clipboard refuses the write', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { getByRole } = render(<CopyButton text="hello" />);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Copy' }));
    });
    expect(getByRole('button', { name: 'Copy' })).toBeTruthy();
  });
});
