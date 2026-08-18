import { livePresence } from '../src/live/presenceMap';
import { automaticPresenceStyle } from '../src/live/presenceStyles';
import type { Block } from '../src/data/conversation';

describe('livePresence — turn status → face', () => {
  it('shows the radiating loading ring (not the think-ring) while thinking', () => {
    // The whole point of the loading look: a working turn reads as an alert, eyes-forward
    // face, never the old spinner/think-ring. Lock that mapping.
    expect(livePresence('thinking', false)).toEqual({
      state: 'loading',
      emotion: 'neutral',
      gaze: 'center',
    });
  });

  it('an open mic wins over any turn status', () => {
    expect(livePresence('thinking', true).state).toBe('listening');
    expect(livePresence('idle', true).state).toBe('listening');
  });

  it('maps the speaking/showing/idle states', () => {
    expect(livePresence('speaking', false).state).toBe('speaking');
    expect(livePresence('showing', false)).toEqual({
      state: 'showing',
      emotion: 'neutral',
      gaze: 'right',
    });
    expect(livePresence('idle', false).state).toBe('idle');
  });

  it('shows the speaking look while interjecting (idle turn), but the mic still wins', () => {
    // An aside speaks even though the turn machine is idle — so the face must read as speaking,
    // not resting (wide-eyed: stepping in uninvited is a small plot twist). An open mic still
    // takes precedence.
    expect(livePresence('idle', false, true)).toEqual({
      state: 'speaking',
      emotion: 'surprised',
      gaze: 'center',
    });
    expect(livePresence('idle', true, true).state).toBe('listening');
  });

  it('when muted, drops the talking look for the calm reading face (no lip-sync to silence)', () => {
    // Muted output = no voice, so a "speaking" turn must NOT mouth words — it reads along in the
    // attentive `showing` state. Same for an interjection. Unmuted keeps the talking face (above).
    expect(livePresence('speaking', false, false, 'neutral', true).state).toBe('showing');
    expect(livePresence('idle', false, true, 'neutral', true).state).toBe('showing');
    // An open mic still wins even while muted (that's the user talking, not Mavéa).
    expect(livePresence('speaking', true, false, 'neutral', true).state).toBe('listening');
    // Non-talking states are unchanged by mute.
    expect(livePresence('thinking', false, false, 'neutral', true).state).toBe('loading');
  });
});

const block = (type: string, props: Record<string, unknown> = {}): Block =>
  ({ type, props }) as unknown as Block;

describe('automaticPresenceStyle — state/content → personality', () => {
  it('falls through to Hybrid while listening with no other content signal, and to Bead while thinking', () => {
    // The bond mark now carries "listening" as an always-on accent rather than a style
    // takeover, so an open mic with no spec/mood signal resolves to the plain Hybrid face.
    expect(automaticPresenceStyle({ status: 'showing', listening: true })).toBe('hybrid');
    expect(automaticPresenceStyle({ status: 'thinking', listening: false })).toBe('bead');
  });

  it('uses Pip for warm answers and Aura for visual answers', () => {
    expect(
      automaticPresenceStyle({
        status: 'showing',
        listening: false,
        spec: { blocks: [block('verdictcard', { stance: 'yes' })] },
      }),
    ).toBe('pip');
    expect(
      automaticPresenceStyle({
        status: 'showing',
        listening: false,
        spec: { blocks: [block('photo')] },
      }),
    ).toBe('aura');
  });

  it('uses Bead for structured work and keeps cautions in the expressive Hybrid face', () => {
    expect(
      automaticPresenceStyle({
        status: 'showing',
        listening: false,
        spec: { blocks: [block('datatable')] },
      }),
    ).toBe('bead');
    expect(
      automaticPresenceStyle({
        status: 'showing',
        listening: false,
        spec: { blocks: [block('quoteblock', { tone: 'warn' })] },
      }),
    ).toBe('hybrid');
  });
});

describe('livePresence — the transcription gap', () => {
  it('holds a working face while the utterance is being transcribed', () => {
    // The mic has closed and nothing has been submitted, so the turn machine is idle: without
    // this branch the face drops to resting mid-thought, which read as "it stopped listening".
    expect(livePresence('idle', false, false, 'neutral', false, true)).toEqual({
      state: 'loading',
      emotion: 'neutral',
      gaze: 'center',
    });
  });

  it('yields to an open mic and to an interjection', () => {
    expect(livePresence('idle', true, false, 'neutral', false, true).state).toBe('listening');
    expect(livePresence('idle', false, true, 'neutral', false, true).state).toBe('speaking');
  });

  it('leaves every existing caller unchanged (it defaults off)', () => {
    expect(livePresence('idle', false).state).toBe('idle');
    expect(livePresence('showing', false, false, 'warm', false, false).state).toBe('showing');
  });
});
