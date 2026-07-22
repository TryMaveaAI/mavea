import { describe, it, expect } from 'vitest';
import {
  findPreset,
  VOICE_PRESETS,
  DEFAULT_MAVEA_VOICE_ID,
  DEFAULT_USER_VOICE_ID,
} from '../src/voice/presets';

// The voice the user HEARS by default must be the one the settings UI shows as selected. That
// only holds if the default ids resolve to real presets — the bug was a runtime default
// ('am_michael') that no preset mapped to, so the dropdown said "Echo" while another voice played.
describe('voice preset defaults', () => {
  it('every preset has a non-empty kokoro voice id', () => {
    for (const p of VOICE_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.kokoro).toMatch(/^[a-z]{2}_\w+$/);
    }
  });

  it('both default voice ids resolve to a real preset', () => {
    // If these fall through, the runtime default (resolved via findPreset) drifts from the UI.
    expect(findPreset(DEFAULT_MAVEA_VOICE_ID)).toBeDefined();
    expect(findPreset(DEFAULT_USER_VOICE_ID)).toBeDefined();
  });

  it('the Mavéa and person defaults are distinct voices (two-voice playback stays distinguishable)', () => {
    expect(findPreset(DEFAULT_MAVEA_VOICE_ID)!.kokoro).not.toBe(
      findPreset(DEFAULT_USER_VOICE_ID)!.kokoro,
    );
  });
});
