// A briefing must not forget that you muted it.
//
// The audio toggle was seeded from the caller's default on every mount, so muting one briefing and
// opening the next started it talking again — the app forgetting an instruction it had just been
// given, once per document. The caller's default is the answer to a question nobody has been asked
// yet; once the reader answers it, their answer is the one that stands.
//
// With one exception, which is why this is not simply "remember the last value": the first-run tour
// passes `audioDefault={false}` because it narrates over the top itself. That is a constraint, not a
// preference, and a remembered "on" must never reach it — two voices at once is the whole reason
// the flag exists.
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BriefingPlayer } from '../src/live/prism/briefing/BriefingPlayer';
import type { BriefingBeat } from '../src/live/prism/briefing/types';

const beats: BriefingBeat[] = [
  { id: 'b1', kind: 'open', claimIds: ['c1'], caption: 'One.', spoken: 'One.', dwellMs: 3000 },
  { id: 'b2', kind: 'close', claimIds: ['c2'], caption: 'Two.', spoken: 'Two.', dwellMs: 3000 },
];

function mount(audioDefault?: boolean) {
  return render(
    <BriefingPlayer
      beats={beats}
      onBeat={() => {}}
      onExit={() => {}}
      speak={async () => null}
      cancelSpeak={() => {}}
      {...(audioDefault === undefined ? {} : { audioDefault })}
    />,
  );
}

const audioBtn = (): HTMLElement => screen.getByRole('button', { name: /narration|audio/i });

describe('a briefing remembers whether you wanted it to talk', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('speaks by default when the reader has never answered the question', () => {
    mount();
    expect(audioBtn()).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays muted on the NEXT briefing once you have muted one', () => {
    mount();
    fireEvent.click(audioBtn());
    expect(audioBtn()).toHaveAttribute('aria-pressed', 'false');
    cleanup();

    mount(); // a whole new briefing, mounted fresh
    expect(audioBtn(), 'the mute did not survive').toHaveAttribute('aria-pressed', 'false');
  });

  it('comes back on when you turn it back on, and stays on', () => {
    localStorage.setItem('mavea-brief-audio', 'off');
    mount();
    fireEvent.click(audioBtn());
    cleanup();
    mount();
    expect(audioBtn()).toHaveAttribute('aria-pressed', 'true');
  });

  it('never lets a remembered "on" talk over the tour, which narrates itself', () => {
    localStorage.setItem('mavea-brief-audio', 'on');
    mount(false);
    expect(audioBtn(), 'two voices at once').toHaveAttribute('aria-pressed', 'false');
  });

  it('survives storage being unavailable rather than failing to open', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('denied');
    };
    try {
      mount();
      fireEvent.click(audioBtn());
      expect(audioBtn()).toHaveAttribute('aria-pressed', 'false'); // holds for this briefing
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
