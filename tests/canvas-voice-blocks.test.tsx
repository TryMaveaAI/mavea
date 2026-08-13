import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HearIt } from '../src/canvas/blocks/reference/HearIt';
import { PhonicsWord } from '../src/canvas/blocks/reference/PhonicsWord';
import { SightWordList } from '../src/canvas/blocks/learn/SightWordList';

// The three tap-to-hear cards all speak through the same local-Kokoro seam: what they send it,
// and what they tell the reader when the service isn't running.
const kokoro = vi.hoisted(() => ({ spoken: [] as string[], played: true, known: true as boolean }));

// HearIt reads window.AudioContext once at module load, so jsdom needs one before the import —
// with WebAudio present, a disabled note row can only mean a value that resolves to no pitch.
vi.hoisted(() => {
  (globalThis as { AudioContext?: unknown }).AudioContext = class {};
});

vi.mock('../src/voice/kokoro', () => ({
  cancelKokoro: () => {},
  kokoroKnownAvailable: () => kokoro.known,
  speakKokoroResult: (text: string) => {
    kokoro.spoken.push(text);
    return Promise.resolve(kokoro.played);
  },
}));

const VOICE_OFF = 'Voice is off — start the local voice service to hear this.';

const chunks = [
  { text: 'sh', sound: '/ʃ/', kind: 'digraph' as const },
  { text: 'i', sound: '/ɪ/' },
  { text: 'p', sound: '/p/' },
];

const settle = () => act(async () => {});

beforeEach(() => {
  kokoro.spoken.length = 0;
  kokoro.played = true;
  kokoro.known = true;
});

afterEach(cleanup);

describe('PhonicsWord', () => {
  it('speaks the chunk letters, never the IPA notation printed on the box', async () => {
    render(<PhonicsWord word="ship" chunks={chunks} />);

    fireEvent.click(screen.getByTitle('Hear "sh"'));
    await settle();

    expect(kokoro.spoken).toEqual(['sh']);
  });

  it('speaks the whole word from the blend button', async () => {
    render(<PhonicsWord word="ship" chunks={chunks} />);

    fireEvent.click(screen.getByTitle('Hear "ship"'));
    await settle();

    expect(kokoro.spoken).toEqual(['ship']);
  });
});

describe('a card whose voice never arrives', () => {
  it('says so once when the local service is confirmed down', async () => {
    kokoro.played = false;
    kokoro.known = false;
    render(<PhonicsWord word="ship" chunks={chunks} />);

    fireEvent.click(screen.getByTitle('Hear "sh"'));
    await settle();
    fireEvent.click(screen.getByTitle('Hear "i"'));
    await settle();

    expect(screen.getAllByText(VOICE_OFF)).toHaveLength(1);
    // the taps keep working — the service may come up later
    expect(screen.getByTitle('Hear "sh"')).not.toBeDisabled();
  });

  it('stays quiet when a tap was merely cut short by the next one', async () => {
    kokoro.played = false;
    kokoro.known = true;
    render(<PhonicsWord word="ship" chunks={chunks} />);

    fireEvent.click(screen.getByTitle('Hear "sh"'));
    await settle();

    expect(screen.queryByText(VOICE_OFF)).toBeNull();
  });

  it('says so on a sight-word list', async () => {
    kokoro.played = false;
    kokoro.known = false;
    render(<SightWordList title="Week 3" words={[{ word: 'said' }, { word: 'come' }]} />);

    fireEvent.click(screen.getByTitle('Hear "said"'));
    await settle();

    expect(screen.getAllByText(VOICE_OFF)).toHaveLength(1);
  });

  it('says so on a Hear it row', async () => {
    kokoro.played = false;
    kokoro.known = false;
    render(
      <HearIt title="Say it" items={[{ kind: 'word', label: 'bonjour', value: 'bonjour' }]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play bonjour' }));
    await settle();

    expect(screen.getAllByText(VOICE_OFF)).toHaveLength(1);
  });
});

describe('HearIt', () => {
  it('blames the data, not the browser, when a note value has no pitch', () => {
    render(
      <HearIt
        title="Tuning"
        items={[
          { kind: 'note', label: 'Broken', value: 'H9' },
          { kind: 'note', label: 'A4', value: 'A4' },
        ]}
      />,
    );

    const [broken, playable] = screen.getAllByRole('button');
    expect(broken).toBeDisabled();
    expect(broken.getAttribute('title')).toBe('This note can’t be played');
    expect(playable.getAttribute('title')).toBe('Play A4');
  });
});
