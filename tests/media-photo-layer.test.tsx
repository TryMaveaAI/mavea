import { readFileSync } from 'node:fs';
import type { ComponentType } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import fixtures from '../src/gallery/fixtures/media.json';
import { BeforeAfter } from '../src/canvas/blocks/media/BeforeAfter';
import { Carousel } from '../src/canvas/blocks/media/Carousel';
import { CreativeTest } from '../src/canvas/blocks/media/CreativeTest';
import { ImageCallouts } from '../src/canvas/blocks/media/ImageCallouts';
import { Lightbox } from '../src/canvas/blocks/media/Lightbox';
import { MediaCard } from '../src/canvas/blocks/media/MediaCard';
import { Moodboard } from '../src/canvas/blocks/media/Moodboard';

afterEach(cleanup);

// The selectors of the rule that turns a plate into its own stacking context.
function isolatedClasses(): Set<string> {
  const css = readFileSync('src/canvas/blocks/media/styles.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const out = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{\s*isolation:\s*isolate;\s*\}/g)) {
    for (const sel of m[1].split(',')) {
      const cls = sel.trim().match(/^\.([\w-]+)$/);
      if (cls) out.add(cls[1]);
    }
  }
  return out;
}

// Each block is rendered from its own gallery fixture, so the table only needs a props bag.
type AnyBlock = ComponentType<Record<string, unknown>>;
const BLOCKS: [string, AnyBlock][] = [
  ['beforeafter', BeforeAfter as unknown as AnyBlock],
  ['carousel', Carousel as unknown as AnyBlock],
  ['creativetest', CreativeTest as unknown as AnyBlock],
  ['imagecallouts', ImageCallouts as unknown as AnyBlock],
  ['lightbox', Lightbox as unknown as AnyBlock],
  ['mediacard', MediaCard as unknown as AnyBlock],
  ['moodboard', Moodboard as unknown as AnyBlock],
];

// A photo fills its plate at z-index -1 so the plate's gradient shows until it loads. Without
// an isolated plate that negative layer drops behind the plate's own background, and the
// picture is never seen at all — how the mediacard poster stayed a bare gradient.
describe('media photos paint above their gradient plate', () => {
  const isolated = isolatedClasses();
  it.each(BLOCKS)('%s', (kind, Block) => {
    const props = (fixtures as Record<string, Record<string, unknown>>)[kind];
    const { container } = render(<Block {...props} />);
    const imgs = [...container.querySelectorAll('img.me-img-fill')];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      const plate = img.parentElement!;
      expect([...plate.classList].some((c) => isolated.has(c))).toBe(true);
    }
  });
});
