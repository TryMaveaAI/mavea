import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Lightbox } from '../src/canvas/blocks/media/Lightbox';
import { Avatargroup } from '../src/canvas/blocks/display/Avatargroup';

// A model can hand us a photo URL that 404s. The media blocks render a gradient (or initials)
// behind the <img>, so on a failed load we hide the broken <img> and let that designed fallback
// show — never the browser's broken-image glyph. jsdom never loads images, so we fire the error
// event ourselves to exercise the onError path.
//
// The fixture URL must be on safeImageUrl's host allowlist (src/lib/safeImageUrl.ts) — this
// suite is testing the onError fallback for an ALLOWED host whose specific path 404s, not the
// separate (and equally real) case of a rejected host, where no <img> mounts at all.
afterEach(cleanup);

const DEAD_ALLOWLISTED_URL = 'https://upload.wikimedia.org/dead-test-fixture-does-not-exist.jpg';

describe('media blocks degrade gracefully when an image URL fails', () => {
  it('lightbox: a dead thumbnail hides itself so the gradient + label remain', () => {
    const { container, getByText } = render(
      <Lightbox
        title="Where it's used"
        items={[
          {
            label: 'Computer Graphics',
            from: 'var(--presence)',
            to: 'var(--insight)',
            src: DEAD_ALLOWLISTED_URL,
          },
        ]}
      />,
    );
    const img = container.querySelector('.me-img-fill') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.style.display).not.toBe('none');
    fireEvent.error(img);
    expect(img.style.display).toBe('none'); // hidden → the gradient tile + label show through
    expect(getByText('Computer Graphics')).toBeInTheDocument();
  });

  it('avatargroup: a dead photo falls back to the initials', () => {
    const { container, getByText } = render(
      <Avatargroup title="Team" members={[{ name: 'Ada Lovelace', src: DEAD_ALLOWLISTED_URL }]} />,
    );
    const img = container.querySelector('.avg-img') as HTMLImageElement;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector('.avg-img')).toBeNull(); // img removed
    expect(getByText('AL')).toBeInTheDocument(); // initials shown instead
  });
});
