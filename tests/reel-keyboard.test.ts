// Keyboard navigation for the reel preview: ← → step beats (reusing the same content-beat seek the
// progress-bar tap targets already use), ↑ ↓ jump between topic sections, and space pauses — freezing
// the active progress segment's fill animation, not just halting the JS advance. All of it is gated by
// `interactive`, the same flag that already disables the progress bar's tap-to-jump while a clip is
// being recorded — so nothing here can fire mid-export.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { ReelPlayer } from '../src/clip/reel/ReelPlayer';
import type { ReelScript, ReelSlide } from '../src/clip/reel/reelScript';

// jsdom ships no ResizeObserver (the board-metrics + FitScale effects both use one); an inert stub
// is enough here since none of these tests depend on real layout measurement.
class InertResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
let RealResizeObserver: typeof ResizeObserver | undefined;
beforeEach(() => {
  RealResizeObserver = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', InertResizeObserver as unknown as typeof ResizeObserver);
});
afterEach(() => {
  vi.stubGlobal('ResizeObserver', RealResizeObserver);
});

function slide(
  id: string,
  template: ReelSlide['template'],
  content: ReelSlide['content'],
): ReelSlide {
  const slots =
    content === 'title'
      ? { question: `Question for ${id}` }
      : content === 'outro'
        ? {}
        : { quote: id };
  return {
    id,
    content,
    template,
    slots,
    caption: id,
    voiceover: id,
    durationMs: 4000,
  } as ReelSlide;
}

// Two sections: [title1, a1, a2] and [title2, b1], closed by one outro.
function sectionedScript(): ReelScript {
  const slides: ReelSlide[] = [
    slide('t1', 'title', 'title'),
    slide('a1', 'spotlightQuote', 'quote'),
    slide('a2', 'spotlightQuote', 'quote'),
    slide('t2', 'title', 'title'),
    slide('b1', 'spotlightQuote', 'quote'),
    slide('outro', 'outro', 'outro'),
  ];
  return {
    topic: 'Topic',
    question: 'Q?',
    palette: 'aurora',
    vibe: 'clean',
    seed: 0,
    slides,
    durationMs: slides.reduce((a, s) => a + s.durationMs, 0),
  };
}

describe('ReelPlayer — keyboard navigation', () => {
  it('is focusable and carries a shortcut label only when interactive', () => {
    const script = sectionedScript();
    const { container, rerender } = render(
      createElement(ReelPlayer, { script, loop: true, interactive: true, playing: false }),
    );
    const reel = container.querySelector('.reel')!;
    expect(reel.getAttribute('tabindex')).toBe('0');
    expect(reel.getAttribute('aria-label')).toMatch(/arrows/i);

    rerender(createElement(ReelPlayer, { script, loop: true, interactive: false, playing: false }));
    expect(reel.getAttribute('tabindex')).toBeNull();
    expect(reel.getAttribute('aria-label')).toBeNull();
  });

  it('→ steps forward to the next content beat, skipping straight past a section title', () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 1, // a1
      }),
    );
    const reel = container.querySelector('.reel')!;
    expect(container.textContent).toContain('a1');
    fireEvent.keyDown(reel, { key: 'ArrowRight' });
    expect(container.textContent).toContain('a2');
    // a2 is the last beat of section 1 — → goes straight to section 2's first beat, not its title.
    fireEvent.keyDown(reel, { key: 'ArrowRight' });
    expect(container.textContent).toContain('b1');
  });

  it('← steps back to the previous beat', () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 2, // a2
      }),
    );
    const reel = container.querySelector('.reel')!;
    fireEvent.keyDown(reel, { key: 'ArrowLeft' });
    expect(container.textContent).toContain('a1');
  });

  it("↓ jumps to the next section's title; ↑ jumps back", () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 1, // a1, inside section 1
      }),
    );
    const reel = container.querySelector('.reel')!;
    fireEvent.keyDown(reel, { key: 'ArrowDown' });
    expect(container.textContent).toContain('Question for t2');
    fireEvent.keyDown(reel, { key: 'ArrowUp' });
    expect(container.textContent).toContain('Question for t1');
  });

  it("space pauses and freezes the active progress segment's fill animation", () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 1, // a1 — an active content beat
      }),
    );
    const reel = container.querySelector('.reel')!;
    const bars = Array.from(container.querySelectorAll<HTMLElement>('.reel-seg > i'));
    const active = bars.find((el) => el.style.animation.includes('reel-seg-fill'));
    expect(active).toBeTruthy();
    expect(active!.style.animationPlayState).toBe('running');

    fireEvent.keyDown(reel, { key: ' ' });
    expect(active!.style.animationPlayState).toBe('paused');

    fireEvent.keyDown(reel, { key: ' ' });
    expect(active!.style.animationPlayState).toBe('running');
  });

  it('never engages while non-interactive (e.g. mid-recording) — no focus, no key handling', () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: false,
        playing: false,
        initialIndex: 1, // a1
      }),
    );
    const reel = container.querySelector('.reel')!;
    expect(reel.getAttribute('tabindex')).toBeNull();
    fireEvent.keyDown(reel, { key: 'ArrowRight' });
    // No onKeyDown is wired up when non-interactive, so the beat never advances.
    expect(container.textContent).toContain('a1');
    expect(container.textContent).not.toContain('a2');
  });
});
