import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Palette } from '../src/canvas/blocks/media/Palette';
import { ArtAnalysis } from '../src/canvas/blocks/media/ArtAnalysis';

describe('media blocks on untrusted props', () => {
  it('never paints a palette swatch from a value that is not a colour', () => {
    const { container } = render(
      <Palette
        title="Colorway"
        swatches={[
          { name: 'Moss', hex: '#2f9e7a' },
          { name: 'Beacon', hex: 'url(https://example.test/pixel.png)' },
        ]}
      />,
    );
    const [moss, beacon] = container.querySelectorAll<HTMLElement>('.me-pal-swatch');
    expect(moss.style.background).not.toBe('');
    expect(beacon.style.background).not.toContain('url(');
  });

  it('gives each analysis on a board its own gradient', () => {
    const { container } = render(
      <>
        <ArtAnalysis title="One" />
        <ArtAnalysis title="Two" />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^[\w-]+$/);
      expect(container.querySelector(`[fill="url(#${id})"]`)).not.toBeNull();
    }
  });
});
