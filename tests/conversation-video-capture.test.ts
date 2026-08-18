// The conversation export runs on a MEDIA clock, and these pin what that buys. Frame n belongs at
// exactly n/fps, so a rasterizer that cannot keep up costs the user time and never a frame — the
// wall-clock stamping this replaced silently stretched frame durations into a slideshow on a weak
// machine while the audio played on. Scenes land on exact media boundaries, every CSS animation on
// the stage is paused and seeked to that same media time (with baselines that survive a scene
// change, which is what keeps the face's bob continuous), and an abort tears the sink down.
//
// The encoders are stubbed: what is under test is the recorder's own clock and bookkeeping, driven
// through the real exportConversationVideo so the two files are pinned as one contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationScene } from '../src/clip/conversation/types';

/** Frames handed to the muxer: [timestamp, duration], in seconds. */
const webm = vi.hoisted(() => ({
  added: [] as [number, number][],
  finalized: 0,
  closed: 0,
  cancelled: 0,
  bitrate: 0,
}));
/** Every rasterizer context opened this pass, with the options it was opened with. */
const shot = vi.hoisted(() => ({
  contexts: [] as { root: string; options: Record<string, unknown> }[],
  destroyed: 0,
  /** Milliseconds one domToCanvas takes — the weak-machine dial. */
  costMs: 0,
  /** Ordered log of everything the pass did, so cue placement can be read against frames. */
  events: [] as string[],
  /** Runs after each raster — a hook for simulating something that writes to the stage per frame. */
  afterRaster: null as ((node: HTMLElement) => void) | null,
}));

vi.mock('modern-screenshot', () => ({
  createContext: vi.fn(async (node: HTMLElement, options: Record<string, unknown>) => {
    shot.contexts.push({ root: node.className, options });
    return { node };
  }),
  destroyContext: vi.fn(() => {
    shot.destroyed++;
  }),
  domToCanvas: vi.fn(async (context: { node: HTMLElement }) => {
    shot.events.push(`raster:${context.node.className}`);
    shot.afterRaster?.(context.node);
    if (shot.costMs) await new Promise((resolve) => setTimeout(resolve, shot.costMs));
    return { width: 1920, height: 1080 } as unknown as HTMLCanvasElement;
  }),
}));

vi.mock('mediabunny', () => {
  class CanvasSource {
    constructor(_canvas: HTMLCanvasElement, { bitrate }: { bitrate: number }) {
      webm.bitrate = bitrate;
    }
    async add(timestamp: number, duration: number): Promise<void> {
      webm.added.push([timestamp, duration]);
    }
    close(): void {
      webm.closed++;
    }
  }
  class BufferTarget {
    buffer = new ArrayBuffer(2048);
  }
  class Output {
    async start(): Promise<void> {}
    addVideoTrack(): void {}
    addAudioTrack(): void {}
    async finalize(): Promise<void> {
      webm.finalized++;
    }
    cancel(): void {
      webm.cancelled++;
    }
  }
  class AudioBufferSource {
    async add(): Promise<void> {}
    close(): void {}
  }
  return {
    CanvasSource,
    Output,
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
    BufferTarget,
    StreamTarget: class {},
    AudioBufferSource,
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => true,
  };
});

import { exportConversationVideo } from '../src/clip/conversation/capture';

/** A CSS animation as the recorder sees one: pausable, seekable, and able to say whether it is in
 *  its active phase at wherever it currently sits. */
class FakeAnimation {
  /** How many times the recorder took this animation off the browser's clock. */
  pauses = 0;
  resumed = false;
  /** Every media time (ms) this animation was seeked to. */
  readonly seeks: number[] = [];
  private at = 0;
  constructor(
    readonly target: Element,
    /** How long (ms) the animation keeps changing the picture; infinite for an ambient loop. */
    private readonly activeFor = Infinity,
  ) {}
  get currentTime(): number {
    return this.at;
  }
  set currentTime(value: number) {
    this.at = value;
    this.seeks.push(value);
  }
  get effect() {
    return {
      target: this.target,
      getComputedTiming: () => ({ progress: this.at < this.activeFor ? 0.5 : null }),
    };
  }
  pause(): void {
    this.pauses++;
  }
  play(): void {
    this.resumed = true;
  }
}

function stage({
  face: withFace = false,
  seekable = true,
}: { face?: boolean; seekable?: boolean } = {}): {
  el: HTMLElement;
  animations: FakeAnimation[];
} {
  const el = document.createElement('div');
  el.className = 'cvs-stage';
  // The stage follows the app theme — its own background must ride along, or a light-mode export
  // letterboxes the cream surface with the Reel's dark void.
  el.style.backgroundColor = 'rgb(244, 241, 232)';
  if (withFace) {
    const face = document.createElement('div');
    face.className = 'cvs-presence';
    el.append(face);
  }
  document.body.append(el);
  const animations: FakeAnimation[] = [];
  // jsdom has no Web Animations API, which is also the shape of a browser that cannot be seeked.
  if (seekable)
    el.getAnimations = (() => [...animations]) as unknown as HTMLElement['getAnimations'];
  return { el, animations };
}

const scene = (startMs: number, durationMs: number): ConversationScene =>
  ({ startMs, durationMs, questionOnly: startMs === 0 }) as ConversationScene;

/** The frame index a cue at `atMs` belongs on: the first boundary at or after it. */
const boundary = (atMs: number, fps: number): number => Math.ceil((atMs / 1000) * fps);

beforeEach(() => {
  document.documentElement.dataset.perf = 'full';
  webm.added = [];
  webm.finalized = 0;
  webm.closed = 0;
  webm.cancelled = 0;
  webm.bitrate = 0;
  shot.contexts = [];
  shot.destroyed = 0;
  shot.costMs = 0;
  shot.events = [];
  shot.afterRaster = null;
  vi.stubGlobal('VideoEncoder', class {});
  vi.stubGlobal('AudioEncoder', class {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) =>
    cb(new Blob(['png'], { type: 'image/png' }))) as HTMLCanvasElement['toBlob'];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.perf;
});

describe('conversation motion capture — the media clock', () => {
  it('stamps every frame at exactly n/fps even when each raster costs 80ms', async () => {
    // The no-dropped-frames pin. At 24 fps a frame's budget is 41ms; this rasterizer takes twice
    // that, which under the old wall-clock stamping produced ~12 fps of smeared, unevenly-timed
    // frames. The export simply takes longer now — the FILE is unchanged.
    const fps = 24;
    const { el, animations } = stage();
    // Something is always moving, so no frame may be held: this test is about stamping.
    animations.push(new FakeAnimation(el));
    shot.costMs = 80;
    const applied: number[] = [];

    const result = await exportConversationVideo({
      el,
      scenes: [scene(0, 200), scene(200, 200), scene(400, 200)],
      audioBuffer: {} as AudioBuffer,
      durationMs: 600,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async (_next, index) => {
        applied.push(index);
        shot.events.push(`apply:${index}`);
        el.dataset.scene = String(index);
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });

    const frames = Math.ceil(0.6 * fps);
    expect(webm.added.map(([t]) => t)).toEqual(Array.from({ length: frames }, (_, n) => n / fps));
    // …and each one lasts exactly one frame, so the video's own clock stays linear.
    for (const [, duration] of webm.added.slice(0, -1)) {
      expect(duration).toBeCloseTo(1 / fps, 6);
    }
    // The clip's length is the media it covers, not how long the machine took to render it.
    expect(result.durationMs).toBe(600);
    expect(webm.finalized).toBe(1);
    expect(webm.closed).toBe(1);
    expect(applied).toEqual([0, 1, 2]);
  }, 20_000);

  it('applies each scene at its exact media boundary, in order', async () => {
    const fps = 24;
    const { el, animations } = stage();
    animations.push(new FakeAnimation(el));

    await exportConversationVideo({
      el,
      scenes: [scene(0, 250), scene(250, 250), scene(500, 250)],
      audioBuffer: null,
      durationMs: 750,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async (_next, index) => {
        shot.events.push(`apply:${index}`);
        el.dataset.scene = String(index);
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });

    // Scene 0 is on screen before the recorder starts; each later scene lands immediately before
    // the frame it belongs to — never a whole scene early or late because a raster ran long.
    const rastersBefore = (index: number): number =>
      shot.events
        .slice(0, shot.events.indexOf(`apply:${index}`))
        .filter((event) => event.startsWith('raster')).length;
    expect(rastersBefore(1)).toBe(boundary(250, fps));
    expect(rastersBefore(2)).toBe(boundary(500, fps));
    expect(shot.events.indexOf('apply:1')).toBeLessThan(shot.events.indexOf('apply:2'));
  }, 20_000);

  it('pauses every animation and seeks it to media time, keeping baselines across scenes', async () => {
    const fps = 24;
    const { el, animations } = stage();
    // The face: registered at the top of the pass, and outside the keyed turn wrapper, so its
    // phase has to keep advancing across scene changes exactly as it does live.
    const face = new FakeAnimation(el);
    animations.push(face);
    // A card entrance: it does not exist until its scene lands, and then it starts from zero.
    const entrance = new FakeAnimation(el, 200);

    await exportConversationVideo({
      el,
      scenes: [scene(0, 250), scene(250, 250)],
      audioBuffer: null,
      durationMs: 500,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async (_next, index) => {
        if (index === 1) animations.push(entrance);
        el.dataset.scene = String(index);
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });

    // Paused ONCE each: a re-scan adopts what is new and leaves what it already owns alone.
    expect(face.pauses).toBe(1);
    expect(entrance.pauses).toBe(1);
    // …and handed back to the browser's clock when the pass ends.
    expect(face.resumed).toBe(true);
    // Baseline 0: the face's phase IS the media time, every frame of the clip.
    expect(face.seeks).toEqual(
      Array.from({ length: Math.ceil(0.5 * fps) }, (_, n) => (n / fps) * 1000),
    );
    // Baseline = the media time it first appeared, so the entrance opens on its own first frame…
    expect(entrance.seeks[0]).toBe(0);
    // …and advances by one frame from there, in step with everything else.
    expect(entrance.seeks[1]).toBeCloseTo((1 / fps) * 1000, 6);
    expect(entrance.seeks.at(-1)).toBeCloseTo(
      face.seeks.at(-1)! - boundary(250, fps) * (1000 / fps),
      6,
    );
  }, 20_000);

  it('holds one frame across a stretch where nothing is animating', async () => {
    // Nothing moving and nothing mutating: the media clock knows it exactly (no settle heuristic),
    // so the whole static stretch is ONE sample rather than 24 identical rasters a second.
    const { el } = stage();
    await exportConversationVideo({
      el,
      scenes: [scene(0, 1_000)],
      audioBuffer: null,
      durationMs: 1_000,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async () => {},
    });
    expect(webm.added).toHaveLength(1);
    expect(webm.added[0]).toEqual([0, 1]);
    expect(shot.events.filter((event) => event.startsWith('raster')).length).toBe(1);
  }, 20_000);

  it('splits the face onto its own layer, and keeps it out of the cached base', async () => {
    const { el, animations } = stage({ face: true });
    animations.push(new FakeAnimation(el));
    await exportConversationVideo({
      el,
      scenes: [scene(0, 100)],
      audioBuffer: null,
      durationMs: 100,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async () => {},
    });

    const [base, pad] = shot.contexts;
    expect(shot.contexts).toHaveLength(2);
    expect(base.root).toBe('cvs-stage');
    expect(pad.root).toBe('cvs-presence');
    // The face is composited on top from the pad layer, so baking it into the base too would
    // leave a stale pose showing through the new one's transparent pixels.
    const excluded = base.options.filter as (node: Node) => boolean;
    expect(excluded(el.querySelector('.cvs-presence')!)).toBe(false);
    expect(excluded(el)).toBe(true);
    // Transparent, because the layer is composited over the base rather than pasted onto it…
    expect(pad.options.backgroundColor).toBeNull();
    // …and grown on every side by the bleed, so the bell's halo and drop-shadow have somewhere to
    // land instead of being sliced off square at the element's edge. 96px is derived from the
    // worst case (aura inset, the blur's 3σ reach, the drop-shadow) — see PRESENCE_LAYER in
    // conversation/capture.ts; the element measures 0×0 under jsdom, so this is bleed×2 exactly.
    expect(pad.options).toMatchObject({ width: 192, height: 192, style: { padding: '96px' } });
    // Both contexts go with the pass — a leaked one leaves a sandbox iframe behind.
    expect(shot.destroyed).toBe(2);
  }, 20_000);

  it('re-rasterizes only the face when only the face changed', async () => {
    // The whole point of the layer. A per-frame write inside the face — the voice-energy variable
    // is one — used to be indistinguishable from a change to the answer behind it, so it would have
    // forced a full 2-megapixel re-render 24 times a second.
    const { el } = stage({ face: true });
    const face = el.querySelector<HTMLElement>('.cvs-presence')!;
    let energy = 0;
    shot.afterRaster = (node) => {
      if (node === face) face.style.setProperty('--voice-energy', String(++energy % 7));
    };

    await exportConversationVideo({
      el,
      scenes: [scene(0, 400)],
      audioBuffer: null,
      durationMs: 400,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async () => {},
    });

    const rasters = (root: string): number =>
      shot.events.filter((event) => event === `raster:${root}`).length;
    expect(rasters('cvs-stage')).toBe(1); // the base was rasterized once and cached
    expect(rasters('cvs-presence')).toBeGreaterThan(4); // the face kept up with every frame
  }, 20_000);

  it('renders the sized 16:9 contract, carrying the stage background into the file', async () => {
    const { el } = stage();
    const phases: string[] = [];
    const result = await exportConversationVideo({
      el,
      scenes: [scene(0, 100)],
      audioBuffer: {} as AudioBuffer,
      durationMs: 100,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async () => {},
      onProgress: (progress) => phases.push(progress.phase),
    });
    expect(webm.bitrate).toBe(7_000_000);
    expect(shot.contexts[0].options.backgroundColor).toBe('rgb(244, 241, 232)');
    expect(phases).toEqual(['encode', 'ready']);
    expect(result).toEqual(expect.objectContaining({ width: 1920, height: 1080, hasAudio: true }));
  }, 20_000);

  it('scales the 720p bitrate down instead of spending 1080p bits on a smaller raster', async () => {
    const { el } = stage();
    await exportConversationVideo({
      el,
      scenes: [scene(0, 100)],
      audioBuffer: null,
      durationMs: 100,
      size: '720p',
      quality: 'balanced',
      signal: new AbortController().signal,
      applyScene: async () => {},
    });
    expect(webm.bitrate).toBe(3_300_000);
  }, 20_000);

  it('paces to wall clock, whole-stage, where the browser cannot seek animations', async () => {
    // The mandatory fallback: no getAnimations means no honest media clock, so the pass runs
    // exactly as it always did — today's regime plus the persistent context. Never worse.
    const { el } = stage({ face: true, seekable: false });
    const applied: number[] = [];
    const result = await exportConversationVideo({
      el,
      scenes: [scene(0, 150), scene(150, 150)],
      audioBuffer: null,
      durationMs: 300,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async (_next, index) => {
        applied.push(index);
      },
    });
    expect(applied).toEqual([0, 1]);
    // One context, over the whole stage: layering is only sound where the clock is exact.
    expect(shot.contexts).toHaveLength(1);
    expect(shot.contexts[0].options.filter).toBeUndefined();
    // And the clip still opens at zero, in step with the audio track.
    expect(webm.added[0][0]).toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);
  }, 20_000);

  it('holds the whole pass while the window is hidden, then picks it up', async () => {
    // A hidden window cannot paint. The pass deliberately waits rather than filling the file with
    // whatever a throttled tab hands back; the sheet says so while it waits.
    const { el, animations } = stage();
    animations.push(new FakeAnimation(el));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const exporting = exportConversationVideo({
      el,
      scenes: [scene(0, 200)],
      audioBuffer: null,
      durationMs: 200,
      size: '1080p',
      quality: 'high',
      signal: new AbortController().signal,
      applyScene: async () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(shot.events).toEqual([]); // nothing rasterized, nothing encoded
    expect(webm.added).toEqual([]);

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    const result = await exporting;
    expect(result.durationMs).toBe(200);
    expect(webm.added.length).toBeGreaterThan(0);
  }, 20_000);

  it('cancels the sink and surfaces AbortError when the user aborts mid-render', async () => {
    const controller = new AbortController();
    const { el, animations } = stage();
    animations.push(new FakeAnimation(el));
    shot.costMs = 20;
    const exporting = exportConversationVideo({
      el,
      scenes: [scene(0, 100), scene(100, 5_000)],
      audioBuffer: null,
      durationMs: 5_100,
      size: '720p',
      quality: 'balanced',
      signal: controller.signal,
      applyScene: async () => {},
    });
    setTimeout(() => controller.abort(), 80);
    await expect(exporting).rejects.toMatchObject({ name: 'AbortError' });
    // Nothing half-written is left behind: the output is cancelled, never finalized, and the
    // rasterizer contexts are released.
    expect(webm.cancelled).toBe(1);
    expect(webm.finalized).toBe(0);
    expect(shot.destroyed).toBe(1);
  }, 20_000);
});
