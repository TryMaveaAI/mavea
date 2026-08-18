import { describe, expect, it } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';
import { createTurnFrameId, turnFrameId } from '../src/live/history';
import {
  buildConversationTimeline,
  CONVERSATION_VIDEO_MAX_MS,
  currentTopicStart,
  estimateConversationDurationMs,
  estimateTurnAudio,
  estimateTurnDurationMs,
} from '../src/clip/conversation/timeline';
import { CONVERSATION_DIMENSIONS, conversationBitrate } from '../src/clip/conversation/capture';
import { retainedAudioCoversFrame } from '../src/clip/conversation/audio';
import type { ConversationVideoOptions } from '../src/clip/conversation/types';

const block = (id: string, title: string): Block =>
  ({ type: 'insight', id, col: 6, delay: 0, props: { title } }) as unknown as Block;

const frame = (overrides: Partial<TurnFrame> = {}): TurnFrame => ({
  question: 'Why is the sky blue?',
  narration: 'Shorter blue wavelengths scatter more strongly.',
  mode: 'replace',
  topicShift: true,
  tour: [],
  spec: {
    title: 'Rayleigh scattering',
    blocks: [block('live-1', 'Sunlight'), block('live-2', 'Scattering')],
  } as ConversationSpec,
  at: 100,
  ...overrides,
});

const options: ConversationVideoOptions = {
  size: '1080p',
  quality: 'high',
  captions: true,
  spotlights: true,
  penMarks: true,
  presence: true,
  audio: true,
};

describe('conversation video model', () => {
  it('waits for every authored line before reusing a live PCM snapshot', () => {
    const narrated = frame({
      narration: 'Opening line',
      tour: [{ index: 1, say: 'Tour line' }],
    });
    const partial = {
      pcm: new Int16Array(24),
      sampleRate: 24_000,
      duration: 1,
      spans: [{ text: 'Opening line', t0: 0, t1: 1 }],
      marks: [],
    };
    const complete = {
      ...partial,
      duration: 2,
      spans: [
        { text: 'Opening line', t0: 0, t1: 1 },
        { text: 'Tour line', t0: 1, t1: 2 },
      ],
    };

    expect(retainedAudioCoversFrame(narrated, partial)).toBe(false);
    expect(retainedAudioCoversFrame(narrated, complete)).toBe(true);
  });

  it('gives new turns immutable ids and legacy turns a deterministic index-free identity', () => {
    const id = createTurnFrameId(100);
    expect(turnFrameId(frame({ id }))).toBe(id);
    expect(turnFrameId(frame())).toBe(turnFrameId(frame()));
    expect(turnFrameId(frame({ question: 'A different turn' }))).not.toBe(turnFrameId(frame()));
  });

  it('uses the explicit topic boundary instead of a render-mode replace fallback when present', () => {
    const frames = [
      frame({ at: 1, topicShift: true }),
      frame({ at: 2, mode: 'replace', topicShift: false }),
      frame({ at: 3, mode: 'augment', topicShift: false }),
    ];
    expect(currentTopicStart(frames)).toBe(0);
    expect(currentTopicStart([frame({ at: 1 }), frame({ at: 2, topicShift: undefined })])).toBe(1);
  });

  it('keeps authored spotlights and Pen marks on one semantic timeline', () => {
    const marked = frame({
      tour: [
        {
          index: 1,
          say: 'This is the important result.',
          mark: { kind: 'circle', at: 'Scattering' },
        },
      ],
    });
    const scenes = buildConversationTimeline(
      [marked],
      [
        {
          durationMs: 4_000,
          spans: [
            { text: marked.narration, startMs: 650, endMs: 2_000 },
            { text: marked.tour[0].say!, startMs: 2_000, endMs: 3_650 },
          ],
        },
      ],
      options,
    );
    expect(scenes[0]).toEqual(expect.objectContaining({ questionOnly: true, caption: null }));
    expect(scenes[1].caption).toBe(marked.narration);
    const cue = scenes.find((scene) => scene.spot === 'live-2');
    expect(cue?.caption).toBe('This is the important result.');
    expect(cue?.ink).toEqual([
      expect.objectContaining({ spot: 'live-2', mark: { kind: 'circle', at: 'Scattering' } }),
    ]);
  });

  it('never ends the cut inside a spotlight, and buys the wide finish with no extra runtime', () => {
    const marked = frame({ tour: [{ index: 1, say: 'This is the important result.' }] });
    const scenes = buildConversationTimeline(
      [marked],
      [
        {
          durationMs: 4_000,
          spans: [
            { text: marked.narration, startMs: 650, endMs: 2_000 },
            { text: marked.tour[0].say!, startMs: 2_000, endMs: 3_650 },
          ],
        },
      ],
      options,
    );
    const finale = scenes[scenes.length - 1];
    expect(finale.spot).toBeNull();
    // The closing line still reads over the wide shot — only the camera lets go.
    expect(finale.caption).toBe('This is the important result.');
    // The spotlight is held right up to the finish rather than dropped early.
    expect(scenes[scenes.length - 2].spot).toBe('live-2');
    // Carved, not appended: the cut still ends exactly where the narration does.
    expect(finale.startMs + finale.durationMs).toBe(4_000);
    expect(scenes[scenes.length - 2].startMs + scenes[scenes.length - 2].durationMs).toBe(
      finale.startMs,
    );
  });

  it('plays a short closing beat wide throughout rather than flashing two scenes', () => {
    const marked = frame({ tour: [{ index: 1, say: 'Short close.' }] });
    const scenes = buildConversationTimeline(
      [marked],
      [
        {
          durationMs: 3_000,
          spans: [
            { text: marked.narration, startMs: 650, endMs: 2_000 },
            { text: marked.tour[0].say!, startMs: 2_000, endMs: 2_650 },
          ],
        },
      ],
      options,
    );
    expect(scenes.some((scene) => scene.spot !== null)).toBe(false);
    expect(scenes[scenes.length - 1].durationMs).toBe(1_000);
    expect(scenes[scenes.length - 1].startMs + scenes[scenes.length - 1].durationMs).toBe(3_000);
  });

  it('removes optional visuals while the audio choice never warps the visual timeline', () => {
    const marked = frame({ tour: [{ index: 0, mark: { kind: 'underline', at: 'Sunlight' } }] });
    const layout = [{ durationMs: 2_500, spans: [] }];
    const stripped = {
      ...options,
      captions: false,
      spotlights: false,
      penMarks: false,
      presence: false,
    };
    const scenes = buildConversationTimeline([marked], layout, stripped);
    expect(scenes.every((scene) => scene.caption === null && scene.spot === null)).toBe(true);
    expect(scenes.every((scene) => scene.ink.length === 0)).toBe(true);
    // Audio is an Include option like the rest, but the clock is whatever layout the caller timed
    // the cut against — toggling audio changes the soundtrack, never the scene geometry.
    expect(buildConversationTimeline([marked], layout, { ...stripped, audio: false })).toEqual(
      scenes,
    );
  });

  it('paces an audio-off cut from the character estimate, captioning every line', () => {
    const walked = frame({
      narration: 'Opening line about scattering.',
      tour: [{ index: 1, say: 'Blue light bends the most.' }],
    });
    const estimated = estimateTurnAudio(walked);
    // The silent clock is the same estimate the duration meter already shows.
    expect(estimated.durationMs).toBe(estimateTurnDurationMs(walked));
    expect(estimated.spans.map((span) => span.text)).toEqual([
      'Opening line about scattering.',
      'Blue light bends the most.',
    ]);
    // Spans tile the voiced body edge to edge: lead-in, lines proportioned by length, tail.
    expect(estimated.spans[0].startMs).toBe(650);
    expect(estimated.spans[1].startMs).toBe(estimated.spans[0].endMs);
    expect(estimated.spans[1].endMs).toBe(estimated.durationMs - 350);

    const scenes = buildConversationTimeline([walked], [estimated], { ...options, audio: false });
    const captions = scenes.map((scene) => scene.caption);
    expect(captions).toContain('Opening line about scattering.');
    expect(captions).toContain('Blue light bends the most.');
  });

  it('estimates long selections against the hard three-minute ceiling', () => {
    const long = frame({ narration: 'word '.repeat(2_600) });
    expect(estimateConversationDurationMs([long])).toBeGreaterThan(CONVERSATION_VIDEO_MAX_MS);
  });
});

describe('conversation output quality', () => {
  it('offers plain 16:9 screen sizes, never social-reel aspects', () => {
    expect(CONVERSATION_DIMENSIONS).toEqual({
      '1080p': { width: 1920, height: 1080 },
      '720p': { width: 1280, height: 720 },
    });
  });

  it('derives bitrate from the chosen quality tier, scaled to the raster and capped by Lite mode', () => {
    expect(conversationBitrate('balanced', '1080p', 'full')).toBe(6_000_000);
    expect(conversationBitrate('high', '1080p', 'full')).toBe(7_000_000);
    expect(conversationBitrate('ultra', '1080p', 'full')).toBe(8_000_000);
    expect(conversationBitrate('high', '720p', 'full')).toBe(3_850_000);
    expect(conversationBitrate('ultra', '1080p', 'lite')).toBe(6_000_000);
  });
});
