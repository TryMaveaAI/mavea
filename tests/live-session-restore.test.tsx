import { render, screen, cleanup } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saveSession,
  loadSession,
  clearSession,
  hasSavedSession,
  SESSION_STORAGE_KEY,
  SESSION_TTL_MS,
  SESSION_TURNS_CAP,
} from '../src/live/session/store';
import { useLiveTurn, hydrateFromSession } from '../src/live/useLiveTurn';
import { resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';
import { LiveApp } from '../src/live/LiveApp';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { MindShapeSpec } from '../src/live/mindshape/types';
import type { ModelConfig } from '../src/types/mavea';

// Session continuity across reloads:
// (a) storage round-trip — what saveSession writes, loadSession restores
// (b) bounds — turns capped, heavy inline data stripped
// (c) the restore decision — stale (TTL), corrupt, or wrong-schema storage → null (the
//     wizard path, today's behavior) and NEVER a throw
// (d) hydration — useLiveTurn mounts straight into the restored conversation
// (e) the surface — a reload with a recent session lands IN the conversation, not the wizard;
//     with none, the wizard shows as before

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x' };

function spec(title = 'Your money'): ConversationSpec {
  const blocks: Block[] = [
    {
      type: 'insight',
      id: 'i1',
      col: 12,
      num: '1',
      props: { title: 'Money', summary: 's', conf: 'inferred' },
    } as Block,
    { type: 'list', id: 'l1', col: 12, props: { title: 'Notes', items: ['a'] } } as Block,
  ];
  return {
    id: 'money',
    workspace: 'W',
    title,
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

function frame(question: string, at = Date.now(), title?: string): TurnFrame {
  return {
    question,
    narration: `About ${question}.`,
    mode: 'replace',
    tour: [],
    spec: spec(title ?? question),
    at,
  };
}

function history(...asks: string[]): ChatMessage[] {
  return asks.flatMap((q): ChatMessage[] => [
    { role: 'user', content: q },
    { role: 'assistant', content: `Answer to ${q}` },
  ]);
}

beforeEach(() => {
  localStorage.clear();
  // The store keeps an in-memory mirror of the last known session (so a synchronous caller gets
  // an answer despite the on-disk copy being encrypted) — reset it too, or a session saved by an
  // earlier test would leak into one that pokes localStorage directly and expects a clean slate.
  clearSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetLiveConfig();
});

describe('session store — round-trip', () => {
  it('restores exactly what was saved (history + frames + timestamp)', () => {
    const h = history('where does my money go?', 'and my savings?');
    const f = [frame('where does my money go?'), frame('and my savings?')];
    saveSession(h, f, 1000);

    const s = loadSession(1000);
    expect(s).not.toBeNull();
    expect(s!.v).toBe(1);
    expect(s!.savedAt).toBe(1000);
    expect(s!.history).toEqual(h);
    expect(s!.frames).toHaveLength(2);
    expect(s!.frames[1].question).toBe('and my savings?');
    expect(s!.frames[1].spec.title).toBe('and my savings?');
    expect(s!.frames[1].narration).toBe('About and my savings?.');
  });

  it('keeps the subject boundary (topicShift) across the round trip', () => {
    // A streamed follow-up renders as a replace but is NOT a new subject — if the round trip
    // dropped topicShift, every restored follow-up would fall back to the mode boundary and the
    // session rail would re-split into one chapter per turn (the bug topicShift exists to fix).
    const opener = { ...frame('three days in tokyo'), topicShift: true };
    const followUp = { ...frame('tell me more'), topicShift: false };
    saveSession(history('three days in tokyo', 'tell me more'), [opener, followUp], 1000);

    const s = loadSession(1000);
    expect(s!.frames[0].topicShift).toBe(true);
    expect(s!.frames[1].topicShift).toBe(false);
    // A legacy frame saved before the field existed stays absent, not defaulted.
    saveSession([], [frame('legacy')], 1000);
    expect(loadSession(1000)!.frames[0].topicShift).toBeUndefined();
  });

  it('restores display and pronunciation twins without mixing them', () => {
    const f = frame('Omakase');
    f.spoken = 'About oh-mah-kah-seh.';
    f.tour = [
      {
        index: 0,
        say: 'Omakase is normally written this way.',
        saySpoken: 'oh-mah-kah-seh is normally written this way.',
      },
    ];
    saveSession([], [f], 1000);

    const restored = loadSession(1000)!.frames[0];
    expect(restored.narration).toBe('About Omakase.');
    expect(restored.spoken).toBe('About oh-mah-kah-seh.');
    expect(restored.tour[0]).toMatchObject({
      say: 'Omakase is normally written this way.',
      saySpoken: 'oh-mah-kah-seh is normally written this way.',
    });
  });

  it('round-trips a "connect" mark\'s cross-block onIndex through save and reload', () => {
    const f = frame('compare Q4');
    // spec() gives this frame 2 blocks (i1, l1) — onIndex:1 names the second, a real target.
    f.tour = [
      {
        index: 0,
        say: 'That matches the list below.',
        mark: { kind: 'connect', at: 'Money', to: 'a', onIndex: 1 },
      },
    ];
    saveSession([], [f], 1000);
    const s = loadSession(1000);
    expect(s!.frames[0].tour[0].mark).toEqual({
      kind: 'connect',
      at: 'Money',
      to: 'a',
      onIndex: 1,
    });
  });

  it('drops a "connect" mark whose onIndex no longer fits the saved spec (corrupt/stale storage)', () => {
    const f = frame('compare Q4');
    f.tour = [{ index: 0, mark: { kind: 'connect', at: 'Money', to: 'a', onIndex: 9 } }];
    saveSession([], [f], 1000);
    const s = loadSession(1000);
    expect(s!.frames[0].tour[0].mark).toBeUndefined();
  });

  it('round-trips the Watch-Me-Think map attached to a turn (so it re-opens after reload)', () => {
    const mind: MindShapeSpec = {
      center: 'How do cars shape cities?',
      atoms: [
        {
          id: 'a1',
          kind: 'question',
          label: 'Cars reshaped cities around them',
          quote: 'cars reshaped cities',
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    const f: TurnFrame = { ...frame('how did cars change cities?'), mind };
    saveSession(history('how did cars change cities?'), [f], 1000);

    const s = loadSession(1000);
    expect(s!.frames[0].mind).toBeTruthy();
    expect(s!.frames[0].mind!.center).toBe('How do cars shape cities?');
    expect(s!.frames[0].mind!.atoms[0].label).toBe('Cars reshaped cities around them');
  });

  it('launders a legacy synthetic prompt from both frame question and history on load', () => {
    // A session saved before the friendly-label fix still holds the raw instruction prompt as
    // the frame question AND as the user history content. Loading it must surface the label, so
    // the prompt can never reach the hero/sidebar/scrubber or the dashboard extraction preview.
    const raw =
      'You are Mavéa, an AI presence. Generate a concise morning brief (max 3 items). Use real, grounded information only. Do not explain what you are doing; just deliver the brief.';
    const h: ChatMessage[] = [
      { role: 'user', content: raw },
      { role: 'assistant', content: 'Good morning.' },
    ];
    saveSession(h, [frame(raw)], 1000);

    const s = loadSession(1000);
    expect(s).not.toBeNull();
    expect(s!.frames[0].question).toBe('Morning brief');
    expect(s!.history[0].content).toBe('Morning brief');
    // The assistant message is untouched.
    expect(s!.history[1].content).toBe('Good morning.');
  });

  it('clearSession forgets the stored session', () => {
    saveSession(history('q'), [frame('q')]);
    expect(loadSession()).not.toBeNull();
    clearSession();
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('saving an empty timeline clears the session instead of storing junk', () => {
    saveSession(history('q'), [frame('q')]);
    saveSession([], []);
    expect(loadSession()).toBeNull();
  });
});

describe('session store — bounds', () => {
  it('caps stored turns to the last SESSION_TURNS_CAP', () => {
    const frames = Array.from({ length: SESSION_TURNS_CAP + 5 }, (_, i) => frame(`q${i}`));
    const h = history(...frames.map((f) => f.question));
    saveSession(h, frames, 1000);

    const s = loadSession(1000);
    expect(s!.frames).toHaveLength(SESSION_TURNS_CAP);
    expect(s!.frames[0].question).toBe('q5'); // oldest shed, newest kept
    expect(s!.frames[s!.frames.length - 1].question).toBe(`q${SESSION_TURNS_CAP + 4}`);
    // History is capped in step with the kept turns (user+assistant pairs).
    expect(s!.history.length).toBeLessThanOrEqual(SESSION_TURNS_CAP * 2);
  });

  it('strips large inline data: URIs before storage (the canvas still restores)', () => {
    const f = frame('show me a picture');
    const heavy = 'data:image/png;base64,' + 'A'.repeat(10_000);
    (f.spec.blocks[0] as unknown as { props: Record<string, unknown> }).props.src = heavy;
    saveSession(history('show me a picture'), [f], 1000);

    const s = loadSession(1000);
    expect(s).not.toBeNull();
    const props = (s!.frames[0].spec.blocks[0] as unknown as { props: Record<string, unknown> })
      .props;
    expect(props.src).toBe(''); // the heavy URI is dropped, not the canvas
    expect(s!.frames[0].spec.blocks).toHaveLength(2);
  });
});

describe('session store — the restore decision (null = wizard, never a crash)', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull();
  });

  it('returns null for a stale session (older than the TTL)', () => {
    saveSession(history('q'), [frame('q')], 1000);
    expect(loadSession(1000 + SESSION_TTL_MS + 1)).toBeNull();
    // …but restores within the window.
    expect(loadSession(1000 + SESSION_TTL_MS - 1)).not.toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not json!!!');
    expect(loadSession()).toBeNull();
  });

  it('returns null on an unknown schema version', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ v: 2, savedAt: Date.now(), history: [], frames: [frame('q')] }),
    );
    expect(loadSession()).toBeNull();
  });

  it('returns null when no stored frame is usable', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        history: [],
        frames: [{ question: 'q', spec: { blocks: [] } }, { nonsense: true }, 42],
      }),
    );
    expect(loadSession()).toBeNull();
  });

  it('drops malformed frames and history entries but keeps the good ones', () => {
    const good = frame('the real one', 500);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: 1000,
        history: [{ role: 'user', content: 'hi' }, { role: 'wizard', content: 'nope' }, 'junk'],
        frames: [{ broken: true }, good],
      }),
    );
    const s = loadSession(1000);
    expect(s).not.toBeNull();
    expect(s!.frames).toHaveLength(1);
    expect(s!.frames[0].question).toBe('the real one');
    expect(s!.history).toEqual([{ role: 'user', content: 'hi' }]);
  });

  // "Is there a session?" is asked from render and from effects (the morning brief, the "back to"
  // target). Where storage is walled off — private mode, an embedded frame — the ACCESS itself
  // throws, and a throw from an effect body takes the whole surface to the error boundary. The
  // question must always be answerable, so it is asked through the store, never through a bare
  // localStorage touch.
  it('hasSavedSession answers false — never throws — when storage is walled off', () => {
    expect(hasSavedSession()).toBe(false);
    saveSession(history('q'), [frame('q')], Date.now());
    expect(hasSavedSession()).toBe(true);

    clearSession();
    const denied = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('access denied', 'SecurityError');
    });
    try {
      expect(() => hasSavedSession()).not.toThrow();
      expect(hasSavedSession()).toBe(false);
    } finally {
      denied.mockRestore();
    }
  });
});

describe('hydrateFromSession + useLiveTurn — mounting into the conversation', () => {
  it('starts with the restored transcript, latest canvas, and prior snapshot', () => {
    saveSession(history('q1', 'q2'), [frame('q1'), frame('q2')], 1000);
    const session = loadSession(1000)!;

    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, initial: hydrateFromSession(session) }),
    );

    // The latest canvas is on screen, calm (idle, no re-spoken narration, no spotlight).
    expect(result.current.spec?.title).toBe('q2');
    expect(result.current.status).toBe('idle');
    expect(result.current.narration).toBe('');
    expect(result.current.spot).toBeNull();
    expect(result.current.busy).toBe(false);
    // Model context is back, so a follow-up continues the thread.
    expect(result.current.history).toHaveLength(4);
    expect(result.current.history[2]).toEqual({ role: 'user', content: 'q2' });
    // The prior snapshot is seeded from the last turn, so merge decisions work.
    expect(result.current.prior?.question).toBe('q2');
    expect(result.current.prior?.blockTypes).toEqual(['insight', 'list']);
    // The full timeline is back for the scrubber/replay.
    expect(result.current.frames).toHaveLength(2);
    // Marked restored, so the session rail says "Resumed" honestly.
    expect(result.current.restored).toBe(true);
  });

  it('reset() returns to a truly empty session', () => {
    saveSession(history('q1'), [frame('q1')], 1000);
    const session = loadSession(1000)!;
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, initial: hydrateFromSession(session) }),
    );

    act(() => result.current.reset());
    expect(result.current.spec).toBeNull();
    expect(result.current.history).toHaveLength(0);
    expect(result.current.frames).toHaveLength(0);
  });
});

describe('LiveApp — restore decision on mount (wizard vs conversation)', () => {
  it('with a recent session: lands IN the conversation, not the wizard', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    saveSession(history('where does my money go?'), [frame('where does my money go?')]);

    render(<LiveApp />);

    // The session rail shows the restored moment, and the canvas title is back in the
    // topbar (the question doubles as the restored spec's title — hence multiple matches).
    expect(screen.getAllByText('where does my money go?').length).toBeGreaterThanOrEqual(2);
    // The answer hero carries the restored frame's spoken line, and the rail says "Resumed".
    expect(screen.getByText('About where does my money go?.')).toBeInTheDocument();
    expect(screen.getByText(/Resumed — picking back up/i)).toBeInTheDocument();
    // No wizard: neither the first-run Connect step nor the Go hub CTA.
    expect(screen.queryByText(/Which mind should I think with/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start talking/i })).not.toBeInTheDocument();
    // The "Create" menu (which holds New + Dashboard) only appears once a conversation exists,
    // so its presence confirms we mounted into the conversation, not the wizard.
    expect(screen.getByRole('button', { name: /Create/i })).toBeInTheDocument();
  });

  it('with a stale session: falls back to the wizard (Go hub)', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    // A model actually connected — otherwise "Start talking" is honestly gated, covered elsewhere.
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    saveSession(
      history('old question'),
      [frame('old question')],
      Date.now() - SESSION_TTL_MS - 60_000,
    );

    render(<LiveApp />);
    expect(screen.getByRole('button', { name: /Start talking/i })).toBeInTheDocument();
  });

  it('with corrupt session storage: falls back silently to the wizard', () => {
    localStorage.setItem('mavea-live-setup-v1', '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    localStorage.setItem(SESSION_STORAGE_KEY, '%%%definitely-not-json');

    expect(() => render(<LiveApp />)).not.toThrow();
    expect(screen.getByRole('button', { name: /Start talking/i })).toBeInTheDocument();
  });
});
