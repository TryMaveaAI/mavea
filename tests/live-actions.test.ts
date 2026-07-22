import { describe, it, expect } from 'vitest';
import { ACTIONS, enabledActions, actionsMenu, runAction } from '../src/live/actions';
import { validateLiveResponse } from '../src/engine/liveSchema';

// The write-actions feature was removed: no action is proposable, so the model is never told
// about one, and a proposed action never survives validation. Ripple's read-only GitHub is a
// separate, browser-direct path (githubBrowser.ts) and is unaffected.
describe('actions catalog — removed, so nothing is proposable', () => {
  it('ships no actions', () => {
    expect(ACTIONS).toHaveLength(0);
  });

  it('never adds an action menu to the prompt, whatever is "connected"', () => {
    expect(actionsMenu(new Set())).toBe('');
    expect(actionsMenu(new Set(['google-calendar', 'github']))).toBe('');
    expect(enabledActions(new Set(['google-calendar']))).toEqual([]);
  });
});

describe('runAction — never fires, since nothing is cataloged', () => {
  it('rejects any id as unknown, without throwing', async () => {
    for (const id of ['calendar.addEvent', 'github.openDraftPr', 'nope.nope']) {
      const r = await runAction(id, {});
      expect(r.ok).toBe(false);
      expect(r.detail).toContain('Unknown');
    }
  });
});

describe('action block validation (liveSchema) — proposals are always dropped now', () => {
  it('drops a proposed action even when the "action" type is allowed (no cataloged ids)', () => {
    const resp = validateLiveResponse(
      {
        title: 'Trip',
        blocks: [
          { type: 'insight', props: { title: 'Plan set' } },
          {
            type: 'action',
            props: {
              id: 'calendar.addEvent',
              label: 'Add it',
              args: { title: 'Trip kickoff', start: '2026-07-01T09:00' },
            },
          },
        ],
      },
      new Set(['insight', 'action']),
    );
    expect(resp!.blocks.map((b) => b.type as string)).not.toContain('action');
  });

  it('also drops an action when the "action" type is not in the allowed set', () => {
    const resp = validateLiveResponse(
      {
        title: 'x',
        blocks: [
          { type: 'insight', props: { title: 'a' } },
          { type: 'breakdown', props: { title: 'b', rows: [{ name: 'a', val: '$1', pct: 100 }] } },
          { type: 'action', props: { id: 'calendar.addEvent', args: { title: 't', start: 's' } } },
        ],
      },
      new Set(['insight', 'breakdown']),
    );
    expect(resp!.blocks.map((b) => b.type as string)).not.toContain('action');
  });
});
