import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';

const mocks = vi.hoisted(() => ({
  checkReady: vi.fn(),
  previewVoice: vi.fn(),
  stopPreview: vi.fn(),
}));

vi.mock('../src/live/ready', () => ({ checkLiveReady: mocks.checkReady }));
vi.mock('../src/voice/preview', () => ({
  previewVoice: mocks.previewVoice,
  stopPreview: mocks.stopPreview,
}));
vi.mock('../src/live/voiceAvailability', () => ({
  useKokoroAvailable: () => true,
  VOICE_OFF_HINT: 'Voice is unavailable.',
  VOICE_MUTED_HINT: 'Voice is muted.',
}));

import { LiveSettings } from '../src/live/LiveSettings';
import { acceptLegalTerms, hasLegalAcceptance } from '../src/legal/acceptance';
import { clearLibrary, getLibrary, saveCanvas } from '../src/live/library/store';
import { forgetAll } from '../src/live/memory/store';
import { getLiveConfigV2, resetLiveConfig, setLiveConfigV2 } from '../src/live/useLiveConfig';

function savedSpec(): ConversationSpec {
  return {
    id: 'settings-test',
    workspace: 'Settings test',
    title: 'Saved canvas',
    sub: '',
    opener: '',
    context: [],
    blocks: [
      {
        type: 'list',
        id: 'list-1',
        col: 12,
        props: { title: 'Saved', items: ['One'] },
      } as Block,
    ],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

beforeEach(() => {
  localStorage.clear();
  clearLibrary();
  forgetAll();
  resetLiveConfig();
  vi.clearAllMocks();
  mocks.checkReady.mockResolvedValue({ llm: true, model: true });
});

afterEach(() => vi.unstubAllGlobals());

describe('LiveSettings — lifecycle and truthful status', () => {
  it('stops any active voice preview when Settings unmounts', () => {
    const view = render(<LiveSettings initialTab="you" />);
    expect(mocks.stopPreview).not.toHaveBeenCalled();

    view.unmount();
    expect(mocks.stopPreview).toHaveBeenCalledOnce();
  });

  it('recovers from a failed readiness probe and announces the result', async () => {
    let reject!: (reason: Error) => void;
    mocks.checkReady.mockReturnValue(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    render(<LiveSettings />);

    const recheck = screen.getByRole('button', { name: 'Recheck' });
    fireEvent.click(recheck);
    expect(recheck).toBeDisabled();
    expect(screen.getByText('Checking…').closest('[role="status"]')).toHaveAttribute(
      'aria-busy',
      'true',
    );

    reject(new Error('offline'));
    await waitFor(() => expect(recheck).toBeEnabled());
    expect(
      screen.getByText(/Couldn’t check readiness/i).closest('[role="status"]'),
    ).toHaveAttribute('aria-live', 'polite');
  });

  it('describes quiet hours without promising inaudibility', () => {
    render(<LiveSettings initialTab="you" initialAdvancedYouOpen />);
    expect(screen.getByText(/Audibility still depends on your device volume/i)).toBeInTheDocument();
    expect(screen.queryByText(/won't wake anyone/i)).not.toBeInTheDocument();
  });

  it('rejects an oversized settings file before reading it', () => {
    render(<LiveSettings />);
    const input = document.querySelector(
      '.settings-model-connect input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(1_000_001)], 'oversized.json')],
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/too large to be a Mavéa settings file/i);
  });

  it('marks settings import busy and aborts its FileReader on unmount', () => {
    const abort = vi.fn();
    class HangingFileReader {
      static readonly EMPTY = 0;
      static readonly LOADING = 1;
      static readonly DONE = 2;
      readyState = HangingFileReader.EMPTY;
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      readAsText(): void {
        this.readyState = HangingFileReader.LOADING;
      }
      abort(): void {
        abort();
        this.readyState = HangingFileReader.DONE;
        this.onabort?.();
      }
    }
    vi.stubGlobal('FileReader', HangingFileReader as unknown as typeof FileReader);
    const view = render(<LiveSettings />);
    const input = document.querySelector(
      '.settings-model-connect input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'settings.json', { type: 'application/json' })] },
    });
    expect(screen.getByRole('button', { name: 'Importing settings…' })).toBeDisabled();

    view.unmount();
    expect(abort).toHaveBeenCalledOnce();
  });

  it('applies recognized settings while preserving and reporting ignored credentials', async () => {
    setLiveConfigV2({
      keys: { openai: 'sk-existing' },
      searchKeys: { brave: 'search-existing' },
    });
    render(<LiveSettings />);
    const input = document.querySelector(
      '.settings-model-connect input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File(
            [
              JSON.stringify({
                quality: 'fast',
                keys: { openai: 'sk-imported' },
                searchKeys: { brave: 'search-imported' },
              }),
            ],
            'settings.json',
            { type: 'application/json' },
          ),
        ],
      },
    });

    expect(
      await screen.findByText(
        /Imported 1 setting.*Ignored provider API keys, search API keys; credentials are never imported/i,
      ),
    ).toBeInTheDocument();
    expect(getLiveConfigV2().quality).toBe('fast');
    expect(getLiveConfigV2().keys.openai).toBe('sk-existing');
    expect(getLiveConfigV2().searchKeys.brave).toBe('search-existing');
  });

  it('surfaces a settings parse error and leaves import available to retry', async () => {
    render(<LiveSettings />);
    const input = document.querySelector(
      '.settings-model-connect input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['not json'], 'broken.json', { type: 'application/json' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not parse JSON/i);
    expect(screen.getByRole('button', { name: 'Import settings' })).toBeEnabled();
  });
});

describe('LiveSettings — destructive and legal actions', () => {
  it('keeps saved-library deletion available while collection is off and requires confirmation', () => {
    saveCanvas(savedSpec(), 'Keep this?', 1);
    setLiveConfigV2({ libraryEnabled: false });
    render(<LiveSettings initialTab="settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    fireEvent.click(screen.getByRole('button', { name: 'Clear library (1)' }));
    expect(getLibrary()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clear saved canvas' }));
    expect(getLibrary()).toHaveLength(0);
  });

  it('withdraws acknowledgement immediately so the gate can review it now', () => {
    expect(acceptLegalTerms()).toBe(true);
    render(<LiveSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Review legal acknowledgement now' }));
    expect(hasLegalAcceptance()).toBe(false);
  });
});
