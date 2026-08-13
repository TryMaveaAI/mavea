import { describe, it, expect } from 'vitest';
import { safeImageUrl } from '../src/live/image/safeUrl';
import { validateLiveResponse } from '../src/engine/liveSchema';

const CLEARED_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Shibuya_crossing_at_night.jpg/960px-Shibuya_crossing_at_night.jpg';

// A model-supplied photo `src` is untrusted LLM output rendered straight into an <img>,
// so it must clear a strict, per-file clearance gate before we fetch it. A reputable host does
// not establish a file's copyright status. These tests lock that boundary: one reviewed URL
// passes; every other file, host, and active/non-HTTPS scheme is rejected.
describe('safeImageUrl — model-supplied image URL gate', () => {
  it('accepts an individually reviewed URL', () => {
    expect(safeImageUrl(CLEARED_IMAGE)).toBe(CLEARED_IMAGE);
  });

  it('rejects an unreviewed file even on the same host', () => {
    expect(safeImageUrl('https://upload.wikimedia.org/a/b/Mars.jpg')).toBeUndefined();
    expect(safeImageUrl('https://images.unsplash.com/photo-123')).toBeUndefined();
    expect(safeImageUrl('https://images.pexels.com/photos/1/x.jpg')).toBeUndefined();
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

describe('photo block gating — menu and clearance are both required', () => {
  // A set without `photo` — e.g. a small-model tier, where the block is off the menu.
  const genOff = new Set(['insight']);

  it('drops a cleared photo when photo is not offered for this turn', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'photo', props: { title: 'Shibuya', src: CLEARED_IMAGE } }],
      },
      genOff,
      12,
    );
    expect((r?.blocks ?? []).some((b) => b.type === 'photo')).toBe(false);
  });

  it('keeps an individually cleared photo only when photo is on the menu', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [{ type: 'photo', props: { title: 'Shibuya', src: CLEARED_IMAGE } }],
      },
      new Set(['insight', 'photo']),
      12,
    );
    const photo = r?.blocks.find((b) => b.type === 'photo');
    expect(photo?.type === 'photo' ? photo.props.src : undefined).toBe(CLEARED_IMAGE);
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
