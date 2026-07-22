import { describe, it, expect } from 'vitest';
import { safeImageUrl } from '../src/live/image/safeUrl';
import { validateLiveResponse } from '../src/engine/liveSchema';

// A model-supplied photo `src` is untrusted LLM output rendered straight into an <img>,
// so it must clear a strict gate (https + an allowlisted image host) before we fetch it.
// These tests lock that boundary: a real allowlisted asset passes; everything else — other
// hosts, http/data/blob schemes, and subdomain-spoof tricks — is rejected.
describe('safeImageUrl — model-supplied image URL gate', () => {
  it('accepts https URLs on allowlisted image hosts', () => {
    expect(safeImageUrl('https://upload.wikimedia.org/a/b/Mars.jpg')).toBe(
      'https://upload.wikimedia.org/a/b/Mars.jpg',
    );
    expect(safeImageUrl('https://images.unsplash.com/photo-123')).toBeTruthy();
    expect(safeImageUrl('https://images.pexels.com/photos/1/x.jpg')).toBeTruthy();
  });

  it('rejects non-https schemes', () => {
    expect(safeImageUrl('http://upload.wikimedia.org/x.jpg')).toBeUndefined();
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBeUndefined();
    expect(safeImageUrl('blob:https://app/x')).toBeUndefined();
    expect(safeImageUrl('file:///etc/passwd')).toBeUndefined();
  });

  it('rejects non-allowlisted hosts and spoofed subdomains', () => {
    expect(safeImageUrl('https://evil.example.com/x.jpg')).toBeUndefined();
    // a host that merely CONTAINS an allowlisted name is not a subdomain of it
    expect(safeImageUrl('https://upload.wikimedia.org.attacker.com/x.jpg')).toBeUndefined();
    expect(safeImageUrl('https://notwikimedia.org/x.jpg')).toBeUndefined();
  });

  it('handles empty / malformed input without throwing', () => {
    expect(safeImageUrl(undefined)).toBeUndefined();
    expect(safeImageUrl('')).toBeUndefined();
    expect(safeImageUrl('   ')).toBeUndefined();
    expect(safeImageUrl('not a url')).toBeUndefined();
  });
});

describe('photo block gating — found URLs only (no generation path)', () => {
  // A set without `photo` — e.g. a small-model tier, where the block is off the menu.
  const genOff = new Set(['insight']);

  it('renders a safe-URL photo even when image generation is off (found image, not generation)', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          { type: 'photo', props: { title: 'Mars', src: 'https://upload.wikimedia.org/mars.jpg' } },
        ],
      },
      genOff,
      12,
    );
    const photo = r?.blocks.find((b) => b.type === 'photo') as
      | { props: { src: string } }
      | undefined;
    expect(photo).toBeTruthy();
    expect(photo!.props.src).toBe('https://upload.wikimedia.org/mars.jpg');
  });

  it('drops an unsafe-URL photo', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'photo', props: { title: 'X', src: 'https://evil.example.com/x.jpg' } }],
      },
      genOff,
      12,
    );
    expect((r?.blocks ?? []).some((b) => b.type === 'photo')).toBe(false);
  });

  // There is no generation path at all, so a photo block that carries only a description has no
  // image to render. It used to survive as a broken frame stamped "✨ AI image" — mislabelling a
  // photograph Mavéa never made, on a card with nothing in it. It's dropped, on or off the menu.
  it('drops a photo that has no real image, whether or not photo is on the menu', () => {
    for (const allowed of [genOff, new Set(['insight', 'photo'])]) {
      const r = validateLiveResponse(
        { title: 'T', blocks: [{ type: 'photo', props: { title: 'X', prompt: 'a sunset' } }] },
        allowed,
        12,
      );
      expect((r?.blocks ?? []).some((b) => b.type === 'photo')).toBe(false);
    }
  });
});
