import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { safeBlockImageSrc, safeSameOriginMediaSrc } from '../src/lib/safeImageUrl';
import { Avatar } from '../src/canvas/blocks/display/Avatar';
import { Gallery } from '../src/canvas/Gallery';
import { MediaCard } from '../src/canvas/blocks/media/MediaCard';
import { Moodboard } from '../src/canvas/blocks/media/Moodboard';
import { VideoEmbed } from '../src/canvas/blocks/media/VideoEmbed';

// A block's `src` prop is untrusted model output rendered straight into an <img>, and the
// CSP img-src allowlist must not be the ONLY thing standing between a hostile URL and a
// browser fetch. Every image-bearing canvas block runs the prop through safeBlockImageSrc
// first: allowlisted https hosts and bundled same-origin assets render, everything else
// falls back to the block's no-image state (gradient plate, initials) — never a broken
// or attacker-chosen <img>. These tests lock that boundary for representative blocks.

const HOSTILE_SRCS = [
  'http://evil.example/x.png', // plaintext scheme, off-list host
  'javascript:alert(1)', // active scheme injection
  'data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=', // data: smuggling
  '//evil.example/x.png', // protocol-relative sneaks past naive "starts with /" checks
  'https://evil.example/x.png', // https but off the allowlist
];

const SAFE_REMOTE = 'https://upload.wikimedia.org/a/b/Mars.jpg';
const SAFE_LOCAL = '/demo-assets/images/sete-cidades.jpg';

describe('safeBlockImageSrc — what a canvas block may put in an <img src>', () => {
  it('passes allowlisted https URLs and bundled same-origin asset paths', () => {
    expect(safeBlockImageSrc(SAFE_REMOTE)).toBe(SAFE_REMOTE);
    expect(safeBlockImageSrc(SAFE_LOCAL)).toBe(SAFE_LOCAL);
  });

  it('rejects hostile schemes, off-list hosts, and protocol-relative URLs', () => {
    for (const src of HOSTILE_SRCS) {
      expect(safeBlockImageSrc(src), src).toBeUndefined();
    }
  });

  it('handles empty and malformed input without throwing', () => {
    expect(safeBlockImageSrc(undefined)).toBeUndefined();
    expect(safeBlockImageSrc('')).toBeUndefined();
    expect(safeBlockImageSrc('not a url')).toBeUndefined();
  });
});

describe('safeSameOriginMediaSrc — video fetch boundary', () => {
  it('allows bundled and exact same-origin media, but rejects remote and active schemes', () => {
    expect(safeSameOriginMediaSrc('/demo-assets/video/azores-film.mp4')).toBe(
      '/demo-assets/video/azores-film.mp4',
    );
    expect(safeSameOriginMediaSrc(`${location.origin}/media/clip.mp4`)).toBe('/media/clip.mp4');
    for (const src of HOSTILE_SRCS) expect(safeSameOriginMediaSrc(src), src).toBeUndefined();
  });

  it('renders the designed preview, not a video fetch, for an unsafe URL', () => {
    const { container } = render(
      <VideoEmbed
        title="Tutorial"
        thumb={{ from: 'var(--presence)', to: 'var(--insight)' }}
        chapters={[]}
        video="https://evil.example/track.mp4"
      />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.me-vid-thumb')).not.toBeNull();
  });

  it('keeps the bundled scripted-demo video functional', () => {
    const { container } = render(
      <VideoEmbed
        title="Tutorial"
        thumb={{ from: 'var(--presence)', to: 'var(--insight)' }}
        chapters={[]}
        video="/demo-assets/video/azores-film.mp4"
      />,
    );
    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      '/demo-assets/video/azores-film.mp4',
    );
  });
});

describe('Gallery — the renderer rechecks image URLs even outside Live coercion', () => {
  it('does not probe or render an attacker-selected image URL', () => {
    const { container } = render(
      <Gallery
        items={[
          {
            label: 'Untrusted',
            source: 'Attacker-controlled',
            src: 'https://evil.example/track.png',
          },
        ]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('Avatar — hostile src falls back to initials, never a broken <img>', () => {
  for (const src of HOSTILE_SRCS) {
    it(`renders initials for ${src}`, () => {
      const { container } = render(<Avatar title="Team" name="Ada Lovelace" src={src} />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('.av-initials')?.textContent).toBe('AL');
    });
  }

  it('renders the <img> for an allowlisted https URL', () => {
    const { container } = render(<Avatar title="Team" name="Ada Lovelace" src={SAFE_REMOTE} />);
    expect(container.querySelector('img.av-img')?.getAttribute('src')).toBe(SAFE_REMOTE);
  });
});

describe('MediaCard — hostile cover falls back to the gradient plate', () => {
  it('renders no <img> for a hostile cover URL (gradient placeholder stays)', () => {
    const { container } = render(
      <MediaCard title="Tonight" cover={{ src: 'javascript:alert(1)' }} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.mc-cover')).not.toBeNull();
  });

  it('renders the <img> for an allowlisted https URL', () => {
    const { container } = render(<MediaCard title="Tonight" cover={{ src: SAFE_REMOTE }} />);
    expect(container.querySelector('img.me-img-fill')?.getAttribute('src')).toBe(SAFE_REMOTE);
  });
});

describe('Moodboard — hostile tile src falls back to the gradient tile', () => {
  it('renders no <img> for hostile tile URLs (label + gradient stay)', () => {
    const tiles = HOSTILE_SRCS.map((src, i) => ({
      kind: 'image' as const,
      src,
      label: `Tile ${i}`,
    }));
    const { container } = render(<Moodboard title="Palette" tiles={tiles} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('.me-mood-tile')).toHaveLength(HOSTILE_SRCS.length);
    expect(container.querySelector('.me-mood-imglabel')?.textContent).toBe('Tile 0');
  });

  it('renders the <img> for a bundled demo asset path (the scripted demo keeps working)', () => {
    const { container } = render(
      <Moodboard title="Palette" tiles={[{ kind: 'image', src: SAFE_LOCAL, label: 'Crater' }]} />,
    );
    expect(container.querySelector('img.me-img-fill')?.getAttribute('src')).toBe(SAFE_LOCAL);
  });
});
