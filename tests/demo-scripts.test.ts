// demo-scripts.test.ts — the contracts that keep the demo cast, their scripts, and the player
// in lockstep. A script whose persona has no cast entry can't be launched; a first step with
// no ask has no canvas to perform on; a chip-arrival step needs a previous turn whose baked
// chips can carry it. These are cheap structural checks — the baked content itself is covered
// by demo-corpus.test.ts.
import { describe, it, expect } from 'vitest';
import { DEMO_SCRIPTS, turnSteps } from '../src/demo/scripts';
import { DEMO_CAST, DEMO_CATEGORIES, castMember, heroCast } from '../src/demo/cast';

describe('cast ↔ scripts — a bijection', () => {
  it('every script belongs to a cast member', () => {
    for (const s of DEMO_SCRIPTS) {
      expect(castMember(s.persona), `script "${s.persona}" has no cast entry`).toBeDefined();
    }
  });

  it('every cast member has a script', () => {
    const scripted = new Set(DEMO_SCRIPTS.map((s) => s.persona));
    for (const p of DEMO_CAST) {
      expect(scripted.has(p.id), `cast member "${p.id}" has no script`).toBe(true);
    }
  });

  it('all four landing categories resolve to a hero', () => {
    expect(heroCast().map((p) => p.id)).toEqual(DEMO_CATEGORIES.map((c) => c.persona));
  });
});

describe('script structure — what the player relies on', () => {
  for (const s of DEMO_SCRIPTS) {
    describe(s.persona, () => {
      it('opens with a real turn (the first step must put a canvas up)', () => {
        expect(s.steps[0]?.ask, 'first step has no ask').toBeTruthy();
      });

      it('has at least two real turns (a session, not a one-shot)', () => {
        expect(turnSteps(s).length).toBeGreaterThanOrEqual(2);
      });

      it('viaChip steps follow a turn that promises chips', () => {
        s.steps.forEach((step, i) => {
          if (!step.viaChip) return;
          expect(step.ask, `viaChip step ${i} must be a turn step`).toBeTruthy();
          // The nearest prior turn step must exist and declare expect.suggests, so the baker
          // flags a bake whose canvas can't actually offer the chip.
          const prevTurn = [...s.steps.slice(0, i)].reverse().find((p) => !!p.ask);
          expect(prevTurn, `viaChip step ${i} has no prior turn`).toBeDefined();
          expect(
            prevTurn?.expect?.suggests,
            `viaChip step ${i}: prior turn must declare expect.suggests`,
          ).toBe(true);
        });
      });

      it('feature steps hold long enough for their beats to land', () => {
        for (const step of s.steps) {
          if (step.ask) continue;
          expect(step.beats?.length, 'a feature step with no beats does nothing').toBeTruthy();
          expect(step.holdMs, 'feature steps set holdMs explicitly').toBeGreaterThan(0);
        }
      });

      it('beat offsets are sane (non-negative, from walk-quiet)', () => {
        for (const step of s.steps) {
          for (const b of step.beats ?? []) expect(b.atMs).toBeGreaterThanOrEqual(0);
        }
      });
    });
  }
});
