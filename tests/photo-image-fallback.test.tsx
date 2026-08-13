import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A photo whose every candidate URL fails to load must NEVER show a broken-image placeholder — it
// reads as an error the user can't act on. Instead it degrades to a clean caption card built from
// its own text, and if it has no text either it removes itself so the grid reflows. These tests
// lock that contract (the gap that let the "Couldn't load image" placeholder ship — no test used to
// cover Photo's runtime-load-failure render).

// Drive the async URL probe deterministically: the real hook load-tests via `new Image()`, which
// jsdom never resolves. The mock lets each test pick the outcome.
const validated = vi.hoisted(() => ({
  current: { src: null as string | null, state: 'none' as string },
}));
vi.mock('../src/hooks/useValidatedImage', () => ({
  useValidatedImage: () => validated.current,
}));

import { Photo } from '../src/canvas/blocks/media/Photo';

const SAFE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Shibuya_crossing_at_night.jpg/960px-Shibuya_crossing_at_night.jpg';

beforeEach(() => {
  validated.current = { src: null, state: 'none' };
});

describe('Photo — a dead image never shows a broken placeholder', () => {
  it('degrades to a caption card (no img, no glyph) when the image fails but text exists', () => {
    validated.current = { src: null, state: 'none' };
    const { container } = render(
      <Photo title="Milwaukee + Chicago" caption="Two lakefront skylines at dusk." src={SAFE} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.me-photo')).toBeNull(); // no empty 16:10 image box
    expect(container.querySelector('.me-photo-card')).not.toBeNull();
    expect(container.textContent).toContain('Two lakefront skylines at dusk.');
    expect(container.textContent).not.toMatch(/load image/i);
  });

  it('falls back to the title when there is no caption/footer', () => {
    const { container } = render(<Photo title="A Blue Whale" src={SAFE} />);
    expect(container.querySelector('.me-photo-card')).not.toBeNull();
    expect(container.textContent).toContain('A Blue Whale');
    expect(container.textContent).not.toMatch(/load image/i);
  });

  it('drops itself (renders nothing + reports unrenderable) when it has NO text at all', () => {
    const onUnrenderable = vi.fn();
    const { container } = render(
      <Photo src={SAFE} blockId="live-3" onUnrenderable={onUnrenderable} />,
    );
    expect(container.firstChild).toBeNull();
    expect(onUnrenderable).toHaveBeenCalledWith('live-3');
  });

  it('renders the real <img> when a candidate actually loads', () => {
    validated.current = { src: SAFE, state: 'ready' };
    const { container } = render(<Photo title="Mars" caption="The red planet." src={SAFE} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SAFE);
    expect(container.querySelector('.me-photo-card')).toBeNull();
  });
});

describe('no canvas block ships a broken-image placeholder string', () => {
  const OFFENDERS = [/couldn.?t load image/i];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
    }
    return out;
  };

  it('the "Couldn\'t load image" placeholder is gone for good', () => {
    const hits: string[] = [];
    for (const file of walk('src/canvas/blocks')) {
      const text = readFileSync(file, 'utf8');
      if (OFFENDERS.some((re) => re.test(text))) hits.push(file);
    }
    expect(hits, `broken-image placeholder found in:\n${hits.join('\n')}`).toEqual([]);
  });
});
