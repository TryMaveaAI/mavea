// Watch Me Think's Share and Present act on the map the reader is looking at. Both used to read the
// conversation behind the map: Present showed the previous answer (or an empty deck), and Share
// cut a reel of turns the reader had walked away from.
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';
import type { VoiceResult, VoiceStateEvent } from '../src/voice/types';
import type { MindShapeSpec } from '../src/live/mindshape/types';
import { composeDeck } from '../src/slides/model/compose';
import { mapAsSpec, mapAsFrame } from '../src/live/mindshape/mapAsAnswer';

const voice: {
  result?: (r: VoiceResult) => void;
  state?: (e: VoiceStateEvent) => void;
} = {};

vi.mock('../src/voice/VadVoice', () => {
  class FakeVadVoice {
    readonly mode = 'vad' as const;
    readonly capabilities = { stt: true, tts: true, canUseRealVoice: true };
    onBargeIn?: () => void;
    onResult(fn: (r: VoiceResult) => void): () => void {
      voice.result = fn;
      return () => {};
    }
    onStateChange(fn: (e: VoiceStateEvent) => void): () => void {
      voice.state = fn;
      return () => {};
    }
    start(): void {}
    stop(): void {}
    forceStop(): void {}
    async speak(): Promise<void> {}
    cancel(): void {}
    setMuted(): void {}
    setSoundEnabled(): void {}
    setMaveaSpeaking(): void {}
    dispose(): void {}
  }
  return { VadVoice: FakeVadVoice };
});

// No model: the local pass draws the map and the settle resolves empty.
vi.mock('../src/live/mindshape/modelRefine', () => ({
  settleMindShape: vi.fn(async () => null),
  patchMindShape: vi.fn(async () => null),
}));

// The deck and the share studio are judged by what LiveApp hands them.
const seen: { deckSpec?: ConversationSpec | null; shareFrames?: TurnFrame[] } = {};
vi.mock('../src/live/present/PresentationDeck', () => ({
  PresentationDeck: (p: { spec: ConversationSpec | null }) => {
    seen.deckSpec = p.spec;
    return <div data-testid="deck" />;
  },
}));
vi.mock('../src/clip/ShareModal', () => ({
  ShareModal: (p: { frames?: TurnFrame[] }) => {
    seen.shareFrames = p.frames;
    return <div data-testid="share" />;
  },
}));

import { LiveApp } from '../src/live/LiveApp';
import { setLiveConfigV2, resetLiveConfig } from '../src/live/useLiveConfig';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { clearSession } from '../src/live/session/store';

const MAP: MindShapeSpec = {
  center: 'Is this the right time, or am I just running?',
  title: 'The new role',
  atoms: [
    {
      id: 'a1',
      kind: 'option',
      label: 'Take the new role',
      quote: 'there is an offer',
      status: 'stable',
      confidence: 'said',
    },
  ],
  links: [],
};

describe('the map as an answer', () => {
  it('composes into a deck that shows the map itself', () => {
    const { slides } = composeDeck([mapAsSpec(MAP)], 0);
    const figure = slides.find((s) => s.kind === 'figure');
    expect(figure?.kind === 'figure' && figure.data.block.type).toBe('mindshape');
  });

  it('is a one-frame conversation carrying the map', () => {
    const frame = mapAsFrame(MAP, 42);
    expect(frame.at).toBe(42);
    expect(frame.question).toBe(MAP.center);
    expect(frame.spec.blocks.map((b) => b.type)).toEqual(['mindshape']);
  });
});

describe('Watch Me Think: Share and Present', () => {
  beforeEach(() => {
    seen.deckSpec = undefined;
    seen.shareFrames = undefined;
    localStorage.setItem('mavea-live-setup-v1', '1');
    acceptLegalTerms();
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
    clearSession();
    resetLiveConfig();
  });

  const button = (text: string): HTMLButtonElement => {
    const b = [...document.querySelectorAll('button')].find((el) =>
      (el.textContent ?? '').includes(text),
    );
    if (!b) throw new Error(`no button "${text}"`);
    return b;
  };

  async function settledMap(): Promise<void> {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LiveApp />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await waitFor(() => expect(document.querySelector('button.cmdk-row')).toBeTruthy());
    fireEvent.click(button('Watch me think'));
    await waitFor(() => expect(document.querySelector('.ms-canvas')).toBeTruthy());
    await act(async () => {
      voice.result?.({ transcript: 'i keep going back and forth about taking the new role' });
      voice.state?.({ phase: 'idle' });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    await waitFor(() =>
      expect(document.querySelector('.ms-canvas')?.getAttribute('data-phase')).toBe('settled'),
    );
    fireEvent.click(button('That’s it'));
  }

  it('presents the map', async () => {
    await settledMap();
    fireEvent.click(button('Present mode'));
    await waitFor(() => expect(document.querySelector('[data-testid="deck"]')).toBeTruthy());
    expect(seen.deckSpec?.blocks.map((b) => b.type)).toEqual(['mindshape']);
  });

  it('shares the map', async () => {
    await settledMap();
    fireEvent.click(button('Share'));
    await waitFor(() => expect(document.querySelector('[data-testid="share"]')).toBeTruthy());
    expect(seen.shareFrames?.map((f) => f.spec.blocks.map((b) => b.type))).toEqual([['mindshape']]);
  });
});
