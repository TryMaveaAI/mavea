import { render } from '@testing-library/react';
import { Presence } from '../src/presence/Presence';

// These tests lock the face DOM/attributes so the aurora-jelly design (mood-gradient: mood-gradient
// bell, four curtain tentacles with data beads, glyph-drawing strands, sparkly eyes + ripple
// smile) cannot silently regress. The styling contract lives in presence-canvas.css and keys
// entirely off these classes + data-*. State variants (.curtains.short, .curtain.found, the
// glyphs, the open mouth) are always in the DOM but hidden by CSS until their state/emotion
// shows them — they are locked here too.
describe('Presence — aurora jelly face fidelity (DOM lock)', () => {
  it('renders the exact jelly DOM structure', () => {
    const { container } = render(<Presence state="idle" emotion="neutral" gaze="center" />);
    const root = container.querySelector('.presence');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('role', 'img');
    expect(root).toHaveAttribute('aria-label', 'Mavéa presence — idle');

    // the halo + the jelly svg are the only body children (plus the muted badge when shown)
    expect(root!.querySelector(':scope > .aura')).toBeTruthy();
    const mascot = root!.querySelector(':scope > svg.mascot');
    expect(mascot).toBeTruthy();
    expect(mascot).toHaveAttribute('viewBox', '0 0 200 220');
    expect(mascot).toHaveAttribute('aria-hidden', 'true');

    // the mood gradient — three CSS-tinted stops (matched structurally: JSDOM's selector
    // engine lowercases tag selectors, so camelCase SVG tags like linearGradient can't be
    // named directly)
    expect(mascot!.querySelectorAll('defs > [id] > stop.bell-stop').length).toBe(3);

    // curtains: the long resting/working set and the short curled set, four strands each
    const long = mascot!.querySelectorAll('.curtains.long > .curtain');
    expect(long.length).toBe(4);
    for (const curtain of long) {
      expect(curtain.querySelector(':scope > .tube')).toBeTruthy();
      expect(curtain.querySelector(':scope > .strand')).toBeTruthy();
      expect(curtain.querySelector(':scope > .beads')).toBeTruthy();
      expect(curtain.querySelector(':scope > .shimmer')).toBeTruthy();
    }
    expect(mascot!.querySelectorAll('.curtains.short > .curtain').length).toBe(4);

    // the "found it" pointing tentacle with its mint tip
    const found = mascot!.querySelector('.curtain.found');
    expect(found).toBeTruthy();
    expect(found!.querySelector('.found-dot')).toBeTruthy();

    // strand glyphs — question (thinking), heart (celebrate), idea (interjection, three
    // strokes + its lit halo) and check (memory saved)
    expect(mascot!.querySelector('.glyph.question > .stroke')).toBeTruthy();
    expect(mascot!.querySelector('.glyph.question > .dot')).toBeTruthy();
    expect(mascot!.querySelector('.glyph.heart > .stroke')).toBeTruthy();
    expect(mascot!.querySelectorAll('.glyph.idea > .stroke').length).toBe(3);
    expect(mascot!.querySelector('.glyph.idea > .halo')).toBeTruthy();
    expect(mascot!.querySelector('.glyph.check > .stroke')).toBeTruthy();

    // the bell: body, sheen, two aurora bands
    const bell = mascot!.querySelector('.bell');
    expect(bell).toBeTruthy();
    expect(bell!.querySelector(':scope > .bell-body')).toBeTruthy();
    expect(bell!.querySelector(':scope > .bell-sheen')).toBeTruthy();
    expect(bell!.querySelectorAll(':scope > .band').length).toBe(2);

    // the face: cheeks, brows, two eyes (ball/pupil/glints inside .blink, plus the swap-in
    // crescent and closed lids), and the full mouth kit
    const face = bell!.querySelector(':scope > .face');
    expect(face).toBeTruthy();
    expect(face!.querySelectorAll(':scope > .cheek').length).toBe(2);
    expect(face!.querySelector('.brow.l')).toBeTruthy();
    expect(face!.querySelector('.brow.r')).toBeTruthy();
    for (const side of ['l', 'r']) {
      const eye = face!.querySelector(`.eyes > .eye.${side}`);
      expect(eye).toBeTruthy();
      expect(eye!.querySelector('.blink > .ball')).toBeTruthy();
      expect(eye!.querySelector('.blink > .pupil')).toBeTruthy();
      expect(eye!.querySelectorAll('.blink > .glint').length).toBe(2);
      expect(eye!.querySelector(':scope > .crescent')).toBeTruthy();
      expect(eye!.querySelector(':scope > .closed')).toBeTruthy();
    }
    const mouth = face!.querySelector(':scope > .mouth');
    expect(mouth).toBeTruthy();
    expect(mouth!.querySelector(':scope > .smile')).toBeTruthy();
    expect(mouth!.querySelector(':scope > .frown')).toBeTruthy();
    expect(mouth!.querySelector(':scope > .oo')).toBeTruthy();
    expect(mouth!.querySelector('.mouth-open > .mouth-fill')).toBeTruthy();
    expect(mouth!.querySelector('.mouth-open > .tongue')).toBeTruthy();

    // celebrate sparks + the sleepy drift
    expect(mascot!.querySelectorAll('.sparks > path').length).toBe(3);
    expect(mascot!.querySelectorAll('.zzz > text').length).toBe(2);
  });

  it('gives concurrent instances their own bell gradients', () => {
    // Two faces mount at once in the app (the Live layer + the thinking-map centre); if the
    // gradient ids collided, one bell would silently paint with the other's defs. Also locks
    // the id sanitisation — React's raw useId contains characters that break url(#…).
    const { container } = render(
      <div>
        <Presence />
        <Presence />
      </div>,
    );
    const ids = [...container.querySelectorAll('.mascot defs > [id]')].map((g) => g.id);
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) expect(id).toMatch(/^mascot-bell-\w+$/);
    const fills = [...container.querySelectorAll('.mascot .bell-body')].map((p) =>
      p.getAttribute('fill'),
    );
    expect(fills[0]).toBe(`url(#${ids[0]})`);
    expect(fills[1]).toBe(`url(#${ids[1]})`);
  });

  it('reflects state / emotion / gaze on the root data-* attributes', () => {
    const { container } = render(<Presence state="thinking" emotion="concerned" gaze="down" />);
    const root = container.querySelector('.presence')!;
    expect(root).toHaveAttribute('data-state', 'thinking');
    expect(root).toHaveAttribute('data-emotion', 'concerned');
    expect(root).toHaveAttribute('data-gaze', 'down');
  });

  it('accepts every expression in the library', () => {
    for (const emotion of [
      'neutral',
      'focused',
      'concerned',
      'warm',
      'celebrate',
      'laugh',
      'wink',
      'surprised',
      'curious',
      'sleepy',
    ] as const) {
      const { container, unmount } = render(<Presence emotion={emotion} />);
      expect(container.querySelector('.presence')).toHaveAttribute('data-emotion', emotion);
      unmount();
    }
  });

  it('applies is-hidden and renders the muted badge', () => {
    const { container } = render(<Presence hidden muted />);
    const root = container.querySelector('.presence')!;
    expect(root.className).toContain('is-hidden');
    expect(root.querySelector('.muted-badge')).toBeTruthy();
  });
});
