import { describe, expect, it } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';

// The model marks tricky spans inline as [[shown|said]]. validateLiveResponse splits each spoken
// field once: the screen gets the shown side, and a voice-ready twin (spoken / noteSpoken /
// saySpoken) is kept ONLY when it differs — so the synthesizer says "$5,000" as words and "CUDA"
// as "kooda", while the canvas still shows the real text.
const base = {
  title: 'GPU computing',
  blocks: [{ type: 'insight', props: { title: 'CUDA in one line' } }],
};

describe('validateLiveResponse — narration twin', () => {
  it('splits an annotated narration into a clean shown line and a spoken twin', () => {
    const r = validateLiveResponse({
      ...base,
      narration: '[[CUDA|kooda]] runs on a [[$5,000|five thousand dollar]] GPU.',
    });
    expect(r?.narration).toBe('CUDA runs on a $5,000 GPU.'); // screen
    expect(r?.spoken).toBe('kooda runs on a five thousand dollar GPU.'); // voice
  });

  it('omits the spoken twin when the narration has no annotations', () => {
    const r = validateLiveResponse({ ...base, narration: 'A clean line with nothing tricky.' });
    expect(r?.narration).toBe('A clean line with nothing tricky.');
    expect(r?.spoken).toBeUndefined();
  });

  it('keeps normal spelling on screen and a native-oriented pronunciation for audio', () => {
    const r = validateLiveResponse({
      ...base,
      narration: 'An [[Omakase|oh-mah-kah-seh]] menu leaves the choices to the chef.',
    });
    expect(r?.narration).toBe('An Omakase menu leaves the choices to the chef.');
    expect(r?.spoken).toBe('An oh-mah-kah-seh menu leaves the choices to the chef.');
  });
});

describe('validateLiveResponse — note twin', () => {
  it('splits an annotated block note into note (shown) + noteSpoken (voice)', () => {
    const r = validateLiveResponse({
      ...base,
      narration: 'About kernels.',
      blocks: [
        { type: 'insight', props: { title: 'Kernels' }, note: '[[CUDA|kooda]] kernels run hot.' },
      ],
    });
    const block = r?.blocks[0] as { note?: string; noteSpoken?: string } | undefined;
    expect(block?.note).toBe('CUDA kernels run hot.');
    expect(block?.noteSpoken).toBe('kooda kernels run hot.');
  });
});

describe('validateLiveResponse — tour line twin', () => {
  it('splits an annotated tour line into say (shown) + saySpoken (voice)', () => {
    const r = validateLiveResponse({
      ...base,
      narration: 'About it.',
      tour: [{ index: 0, say: 'Here [[CUDA|kooda]] does the work.' }],
    });
    expect(r?.tour?.[0]).toEqual({
      index: 0,
      say: 'Here CUDA does the work.',
      saySpoken: 'Here kooda does the work.',
    });
  });

  it('keeps only say when the tour line has no annotations', () => {
    const r = validateLiveResponse({
      ...base,
      narration: 'About it.',
      tour: [{ index: 0, say: 'A plain tour line.' }],
    });
    expect(r?.tour?.[0]).toEqual({ index: 0, say: 'A plain tour line.' });
  });
});

describe('validateLiveResponse — annotations never leak into a block prop', () => {
  it('strips [[shown|said]] in a stat/label/summary down to the shown side', () => {
    // The bug: the model annotated a measurement card ("V" shown, "volts" spoken) and the
    // raw markers reached the screen because only narration/note/tour were being split.
    const r = validateLiveResponse({
      ...base,
      narration: 'About circuits.',
      blocks: [
        {
          type: 'insight',
          props: {
            title: 'Voltage [[V|volts]]',
            stat: '[[V|volts]]',
            summary: 'Current is measured in [[A|amps]].',
          },
        },
      ],
    });
    const block = r?.blocks[0] as { props: { title: string; stat?: string; summary?: string } };
    expect(block.props.title).toBe('Voltage V');
    expect(block.props.stat).toBe('V');
    expect(block.props.summary).toBe('Current is measured in A.');
  });
});
