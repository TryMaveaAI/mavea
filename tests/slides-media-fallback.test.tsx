import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBleed, TeamGrid } from '../src/slides/skins/layouts/media';
import { SLIDE_SKINS } from '../src/slides/skins/registry';

// jsdom never actually loads images, so a real 404 can't be reproduced — we fire the error event
// ourselves to exercise the onError path, same convention as tests/media-image-fallback.test.tsx.
afterEach(cleanup);

const CTX = { index: 0, total: 1 };
// It must clear the render-time host allowlist so this test exercises the separate network/load
// failure path. jsdom never requests it; fireEvent.error below is the deterministic 404.
const DEAD_URL = 'https://images.unsplash.com/dead-test-fixture-does-not-exist.jpg';

describe('teamGrid falls back to the initials monogram when a photo fails to load', () => {
  it('a dead photo swaps to the monogram without disturbing a member who never had one', () => {
    const { container, getByText } = render(
      <TeamGrid
        slide={{
          kind: 'teamGrid',
          id: 'team',
          source: 0,
          data: {
            title: 'The study team',
            members: [
              { name: 'Ada Vance', role: 'Lead', img: DEAD_URL },
              { name: 'Ravi Menon', role: 'Data' },
            ],
          },
        }}
        skin={SLIDE_SKINS.folio}
        ctx={CTX}
      />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1); // only the member with a photo mounts an <img>
    fireEvent.error(imgs[0]);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(getByText('AV')).toBeInTheDocument(); // Ada's monogram, now shown after the failure
    expect(getByText('RM')).toBeInTheDocument(); // Ravi's monogram, shown all along
  });
});

describe('fullBleed falls back to a tinted panel when the background photo fails to load', () => {
  it('a dead photo is replaced by a skin-tinted panel, and the title/kicker still render', () => {
    const { container, getByText } = render(
      <FullBleed
        slide={{
          kind: 'fullBleed',
          id: 'full',
          source: 0,
          kicker: 'In the field',
          data: { img: DEAD_URL, title: 'Twelve cities, one question' },
        }}
        skin={SLIDE_SKINS.noir}
        ctx={CTX}
      />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull(); // the broken <img> is gone, not just hidden
    expect(getByText('In the field')).toBeInTheDocument();
    expect(getByText('Twelve cities, one question')).toBeInTheDocument();
  });

  it('never mounts a broken-image box: before load-failure there is exactly one <img>', () => {
    const { container } = render(
      <FullBleed
        slide={{
          kind: 'fullBleed',
          id: 'full-ok',
          source: 0,
          data: { img: DEAD_URL, title: 'Still loading' },
        }}
        skin={SLIDE_SKINS.folio}
        ctx={CTX}
      />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });
});
