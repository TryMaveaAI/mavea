import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { AccentVar } from '../src/data/conversation';
import { MediaCard } from '../src/canvas/blocks/media/MediaCard';
import { SpeciesCard } from '../src/canvas/blocks/reference/SpeciesCard';
import { VideoEmbed } from '../src/canvas/blocks/media/VideoEmbed';
import { ImageCallouts } from '../src/canvas/blocks/media/ImageCallouts';
import { Lightbox } from '../src/canvas/blocks/media/Lightbox';
import { Carousel } from '../src/canvas/blocks/media/Carousel';
import { BeforeAfter } from '../src/canvas/blocks/media/BeforeAfter';
import { Moodboard } from '../src/canvas/blocks/media/Moodboard';

// `from`/`to`/`swatch` are typed AccentVar (a closed `var(--token)` union) at the TypeScript
// level, but the live schema's generic coercer only tag-neutralizes strings at runtime — it
// never validates a field against its declared token set. A model-supplied value like
// `red), url(https://image.pollinations.ai/prompt/…)` would otherwise land straight in a
// `background: linear-gradient(...)` template, and Moodboard's `swatch` becomes the WHOLE
// `background` value, where a raw `url(...)` is valid CSS outright. Every gradient/swatch
// render site runs the prop through safeCssColor first, so anything that isn't unmistakably a
// safe color literal falls back to a design token instead of reaching the DOM.

// Cast through AccentVar: the type says every block only ever gets one of the 9 closed tokens,
// but that's a compile-time promise a hand-authored fixture can honor and a model's untyped JSON
// cannot — this simulates the real runtime shape the gate has to defend against.
const HOSTILE = 'red), url(https://image.pollinations.ai/prompt/exfil)' as AccentVar;
const FALLBACK_FIRST = 'var(--presence-deep)';
const FALLBACK_SECOND = 'var(--presence-soft)';

function bg(el: Element | null): string {
  return (el as HTMLElement)?.style.background ?? '';
}

describe('canvas media blocks — hostile from/to/swatch never reach an inline style', () => {
  it('MediaCard cover gradient falls back on a hostile from/to', () => {
    const { container } = render(
      <MediaCard title="T" cover={{ from: HOSTILE, to: HOSTILE }} genres={[]} providers={[]} />,
    );
    const style = bg(container.querySelector('.mc-cover'));
    expect(style).not.toContain('url(');
    expect(style).toContain(FALLBACK_FIRST);
    expect(style).toContain(FALLBACK_SECOND);
  });

  it('SpeciesCard banner gradient falls back on a hostile from/to', () => {
    const { container } = render(
      <SpeciesCard
        title="T"
        commonName="Robin"
        scientificName="Turdus migratorius"
        image={{ from: HOSTILE, to: HOSTILE }}
        marks={[]}
      />,
    );
    const style = bg(container.querySelector('.sp-banner'));
    expect(style).not.toContain('url(');
    expect(style).toContain(FALLBACK_FIRST);
  });

  it('VideoEmbed thumb gradient falls back on a hostile from/to, poster is gated', () => {
    const { container } = render(
      <VideoEmbed
        title="T"
        thumb={{ from: HOSTILE, to: HOSTILE }}
        poster="javascript:alert(1)"
        chapters={[]}
      />,
    );
    const style = bg(container.querySelector('.me-vid-thumb'));
    expect(style).not.toContain('url(');
    expect(container.querySelector('video')?.getAttribute('poster')).toBeFalsy();
  });

  it('ImageCallouts image gradient falls back on a hostile from/to', () => {
    const { container } = render(
      <ImageCallouts title="T" image={{ from: HOSTILE, to: HOSTILE }} callouts={[]} />,
    );
    const style = bg(container.querySelector('.me-ico-img'));
    expect(style).not.toContain('url(');
  });

  it('Lightbox thumb and modal-hero gradients fall back on a hostile from/to', () => {
    const { container, getByRole } = render(
      <Lightbox title="T" items={[{ label: 'A', from: HOSTILE, to: HOSTILE }]} />,
    );
    expect(bg(container.querySelector('.me-lb-thumb'))).not.toContain('url(');
    getByRole('button', { name: 'A' }).click();
    expect(bg(container.querySelector('.me-lb-hero'))).not.toContain('url(');
  });

  it('Carousel slide gradient falls back on a hostile from/to', () => {
    const { container } = render(
      <Carousel title="T" slides={[{ label: 'Slide', from: HOSTILE, to: HOSTILE }]} />,
    );
    expect(bg(container.querySelector('.me-car-img'))).not.toContain('url(');
  });

  it('BeforeAfter both plate gradients fall back on a hostile from/to', () => {
    const { container } = render(
      <BeforeAfter
        title="T"
        before={{ label: 'Before', from: HOSTILE, to: HOSTILE }}
        after={{ label: 'After', from: HOSTILE, to: HOSTILE }}
      />,
    );
    const plates = container.querySelectorAll('.me-ba-plate');
    plates.forEach((p) => expect(bg(p)).not.toContain('url('));
  });

  it('Moodboard image-tile gradient AND color-tile swatch fall back on hostile values', () => {
    const { container } = render(
      <Moodboard
        title="T"
        tiles={[
          { kind: 'image', from: HOSTILE, to: HOSTILE },
          {
            kind: 'color',
            swatch: 'url(https://image.pollinations.ai/prompt/exfil)' as AccentVar,
          },
        ]}
      />,
    );
    const tiles = container.querySelectorAll('.me-mood-tile');
    expect(bg(tiles[0])).not.toContain('url(');
    // The color tile's swatch becomes the WHOLE background value — the highest-confidence
    // exploit shape (no gradient-function grammar constraining it) — so this is the sharpest lock.
    expect(bg(tiles[1])).not.toContain('url(');
    expect(bg(tiles[1])).toBe('var(--presence)');
  });

  it('legitimate token colors still render verbatim (the gate is not a blanket flattener)', () => {
    const { container } = render(
      <Moodboard title="T" tiles={[{ kind: 'color', swatch: 'var(--warning)' }]} />,
    );
    expect(bg(container.querySelector('.me-mood-tile'))).toBe('var(--warning)');
  });
});
