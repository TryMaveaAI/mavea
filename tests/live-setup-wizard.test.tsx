import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupWizard } from '../src/live/setup/SetupWizard';
import { resetSetup } from '../src/live/setup/setup';
import { resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';

// Integration tests for the SetupWizard orchestrator:
// (a) first-run starts on the Connect step
// (b) returning user starts on Go and gets a warm spoken greeting once
// (c) speak fires exactly once on first arrival at Go
// (d) Start over resets wizard to Connect
//
// Stub fetch so the readiness check never hits the network.

const SETUP_KEY = 'mavea-live-setup-v1';

function mkSpeak() {
  return vi.fn<(text: string) => void>();
}

const defaultProps = {
  goDemo: vi.fn(),
  onStart: vi.fn(),
  onStartTalking: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in test'))),
  );
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem('mavea-live-v2');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem('mavea-live-v2');
  resetSetup();
  resetLiveConfig();
});

describe('SetupWizard — first-run', () => {
  it('(a) starts on the Connect step when setup is not done', () => {
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
    // Provider tiles are rendered.
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('explains the first model choice and provider cost and privacy boundary', () => {
    render(<SetupWizard {...defaultProps} speak={mkSpeak()} />);

    expect(screen.getByText(/start there for faster, lower-cost use/i)).toBeVisible();
    expect(
      screen.getByText(/Requests pass through this deployment to the provider/i),
    ).toBeVisible();
    expect(screen.getByText(/usage charges, privacy, and retention terms apply/i)).toBeVisible();
  });

  it('does not call speak on mount — audio is reserved for first Go arrival', () => {
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);
    expect(speak).not.toHaveBeenCalled();
  });

  it('(c) calls speak with the wake phrase exactly once on first arrival at Go', async () => {
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    // Click Done three times to walk Connect -> Think -> Remember -> Go.
    const doneButtons = () => screen.getAllByRole('button', { name: /Done/i });

    await act(async () => {
      fireEvent.click(doneButtons()[0]);
    }); // Connect -> Think
    await act(async () => {
      fireEvent.click(doneButtons()[0]);
    }); // Think -> Remember
    await act(async () => {
      fireEvent.click(doneButtons()[0]);
    }); // Remember -> Go

    // The wake phrase fires exactly once.
    expect(speak).toHaveBeenCalledTimes(1);
    // The phrase contains "awake" (matches the curly-apostrophe original).
    expect(speak.mock.calls[0][0]).toMatch(/awake/i);
    // Setup flag is now written.
    expect(localStorage.getItem(SETUP_KEY)).toBe('1');
  });

  it('does not speak again when Go is re-entered after first arrival', async () => {
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    const doneButtons = () => screen.getAllByRole('button', { name: /Done/i });

    await act(async () => {
      fireEvent.click(doneButtons()[0]);
    });
    await act(async () => {
      fireEvent.click(doneButtons()[0]);
    });
    await act(async () => {
      fireEvent.click(doneButtons()[0]);
    });

    expect(speak).toHaveBeenCalledTimes(1);

    // Navigate away and back to Go via constellation.
    const connectBtn = screen.getByRole('tab', { name: /Connect/i });
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    const goBtn = screen.getByRole('tab', { name: /Go/i });
    await act(async () => {
      fireEvent.click(goBtn);
    });

    // Guard holds: still only one call.
    expect(speak).toHaveBeenCalledTimes(1);
  });
});

describe('SetupWizard — the nav row holds together', () => {
  it('keeps the right flank as ONE grid item, whatever it carries', () => {
    // The nav is a 1fr-auto-1fr grid so the constellation sits on the true page centre-line. Add a
    // second element out on the right and it becomes a FOURTH grid item, which wraps onto its own
    // row — that is what dropped the appearance toggle below the constellation on a phone.
    const { container } = render(
      <SetupWizard
        {...defaultProps}
        speak={mkSpeak()}
        paletteSlot={<button type="button">Search</button>}
      />,
    );
    const nav = container.querySelector('.setup-nav');
    expect(nav).toBeTruthy();
    expect(nav?.children.length).toBe(3);
    const end = nav?.querySelector('.setup-nav-end');
    expect(end).toBeTruthy();
    expect(end?.parentElement).toBe(nav);
    // Both the palette handle and the appearance toggle live inside that one flank.
    expect(end?.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
  });

  it('still holds together with no palette handle at all', () => {
    const { container } = render(<SetupWizard {...defaultProps} speak={mkSpeak()} />);
    expect(container.querySelector('.setup-nav')?.children.length).toBe(3);
  });
});

describe('SetupWizard — Connect step model input', () => {
  it('lets the model field go empty instead of snapping back to the provider default', () => {
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    const input = screen.getByLabelText('Model') as HTMLInputElement;
    // Nothing has been explicitly chosen yet, so the field is empty and shows the provider's
    // default only as a placeholder — it must NOT be pre-filled as if it were the real value.
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('gemini-3.1-flash-lite');

    // Typing then backspacing back to empty used to immediately re-fill with the default because
    // the input's `value` was bound to a `stored || defaultModel` fallback — an empty stored
    // value fell straight back to the default on the very next render.
    fireEvent.change(input, { target: { value: 'gemini-3.5-flash' } });
    expect(input.value).toBe('gemini-3.5-flash');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');

    // Typing a custom id afterward is unaffected by the fallback.
    fireEvent.change(input, { target: { value: 'my-custom-model' } });
    expect(input.value).toBe('my-custom-model');
  });

  it('offers a "Get a key" link for a keyless first-time visitor, honest about which providers are free', () => {
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    // Default provider (Gemini) has a genuinely free tier.
    const geminiLink = screen.getByRole('link', { name: /Get a key/i });
    expect(geminiLink).toHaveAttribute('href', 'https://aistudio.google.com/apikey');

    // Switching to a paid-only provider swaps the link's wording — never overstates a free offer.
    fireEvent.click(screen.getByRole('radio', { name: /Claude/i }));
    const claudeLink = screen.getByRole('link', { name: /Get a key/i });
    expect(claudeLink).not.toHaveTextContent(/free/i);
    expect(claudeLink).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys');
  });
});

describe('SetupWizard — returning user', () => {
  it('(b) starts directly on Go when setup is already done', () => {
    localStorage.setItem(SETUP_KEY, '1');
    // A model actually connected (a stored key) — otherwise "Start talking" is honestly
    // gated instead, which is covered separately below.
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start talking/i })).toBeInTheDocument();
  });

  it('(b) with no model connected, "Start talking" is gated to the Connect step instead', () => {
    localStorage.setItem(SETUP_KEY, '1');
    // Default provider (Gemini) needs a key that was never entered.
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    expect(screen.queryByRole('button', { name: /^Start talking$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Connect a model to start/i }));
    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
  });

  it('(b) greets a returning user once on arrival — a warm hello, not the wake phrase', () => {
    localStorage.setItem(SETUP_KEY, '1');
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    expect(speak).toHaveBeenCalledTimes(1);
    const line = speak.mock.calls[0][0];
    expect(line).not.toMatch(/awake/i); // the wake phrase is reserved for the first run
    expect(line).toMatch(/good (morning|afternoon|evening)/i);
    expect(line).toMatch(/explore/i);
  });
});

describe('SetupWizard — landing seed', () => {
  it('a first-run user has the seed forwarded as their first turn once Go is reached', async () => {
    const onStart = vi.fn();
    const speak = mkSpeak();
    render(
      <SetupWizard {...defaultProps} onStart={onStart} speak={speak} seed="Why did Q3 dip?" />,
    );

    // Walk Connect -> Think -> Remember -> Go. The seed must survive each step's `setTyped('')`
    // and fire exactly once on arrival at Go.
    const doneButtons = () => screen.getAllByRole('button', { name: /Done/i });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(doneButtons()[0]);
      });
    }

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('Why did Q3 dip?');
    // The spoken wake-greeting is skipped — a real turn with its own narration is starting.
    expect(speak).not.toHaveBeenCalled();
    // Setup is still marked done so the next visit skips the ritual.
    expect(localStorage.getItem(SETUP_KEY)).toBe('1');
  });

  it('forwards the seed only once, even if Go is re-entered', async () => {
    const onStart = vi.fn();
    const speak = mkSpeak();
    render(
      <SetupWizard
        {...defaultProps}
        onStart={onStart}
        speak={speak}
        seed="Tell me about Portugal"
      />,
    );

    const doneButtons = () => screen.getAllByRole('button', { name: /Done/i });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(doneButtons()[0]);
      });
    }
    expect(onStart).toHaveBeenCalledTimes(1);

    // Navigate away and back to Go — the seed is already consumed, so it must not fire again.
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Connect/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Go/i }));
    });
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('SetupWizard — start over', () => {
  it('(d) resets wizard to Connect after user confirms', async () => {
    localStorage.setItem(SETUP_KEY, '1');
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    // Starting on Go (returning user). Click "Start over".
    const startOver = screen.getByRole('button', { name: /Start over/i });
    await act(async () => {
      fireEvent.click(startOver);
    });

    // Now on Connect.
    expect(screen.getByText(/Which mind should I think with/i)).toBeInTheDocument();
    // Setup flag is cleared.
    expect(localStorage.getItem(SETUP_KEY)).toBeNull();
  });

  it('does nothing if the user cancels the confirm dialog', async () => {
    localStorage.setItem(SETUP_KEY, '1');
    setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const speak = mkSpeak();
    render(<SetupWizard {...defaultProps} speak={speak} />);

    const startOver = screen.getByRole('button', { name: /Start over/i });
    await act(async () => {
      fireEvent.click(startOver);
    });

    // Still on Go.
    expect(screen.getByRole('button', { name: /Start talking/i })).toBeInTheDocument();
    // Flag unchanged.
    expect(localStorage.getItem(SETUP_KEY)).toBe('1');
  });
});
