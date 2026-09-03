// demo-corpus.test.ts — the baked demo examples must be complete, renderable, and in lockstep with
// their scripts. Every cast member ships a shard; every shard has exactly one frame per turn
// step; multi-turn threading is genuine (an augment/refine frame preserves the prior frame's
// content — proof the bake ran through the real merge, not one-shot asks stapled together);
// and every expectation a script declares (bend for a bend beat, chips for a viaChip arrival)
// holds in the frozen content the player will actually perform.
import { describe, it, expect } from 'vitest';
import { DEMO_SCRIPTS, turnSteps } from '../src/demo/scripts';
import { DEMO_CAST } from '../src/demo/cast';
import { loadDemoConversation } from '../src/demo/corpus';
import { blockSignature } from '../src/live/lifecycle';
import type { DemoConversation } from '../src/demo/corpus/types';

describe('demo corpus — every cast member has a complete baked session', () => {
  for (const member of DEMO_CAST) {
    describe(member.id, () => {
      const script = DEMO_SCRIPTS.find((s) => s.persona === member.id)!;
      let convo: DemoConversation | null = null;

      it('has a baked shard', async () => {
        convo = await loadDemoConversation(member.id);
        expect(
          convo,
          `no shard for ${member.id} — run: ONLY=${member.id} node --import tsx scripts/build-demo-corpus.mts`,
        ).not.toBeNull();
      });

      it('has exactly one frame per turn step, in order', () => {
        if (!convo) return;
        const steps = turnSteps(script);
        expect(convo.frames.length).toBe(steps.length);
        convo.frames.forEach((f, i) => expect(f.question).toBe(steps[i].ask));
      });

      it('frames are renderable: blocks with ids, tour stops in range, narration present', () => {
        if (!convo) return;
        for (const f of convo.frames) {
          expect(f.spec.blocks.length).toBeGreaterThan(0);
          for (const b of f.spec.blocks) expect(b.id).toBeTruthy();
          for (const stop of f.tour) {
            expect(stop.index).toBeGreaterThanOrEqual(0);
            expect(stop.index).toBeLessThan(f.spec.blocks.length);
          }
          expect(f.narration.trim().length).toBeGreaterThan(0);
        }
      });

      it('opens with a replace and threads follow-ups through the real merge', () => {
        if (!convo) return;
        expect(convo.frames[0].mode).toBe('replace');
        convo.frames.forEach((f, i) => {
          if (i === 0 || f.mode === 'replace') return;
          // An augment/refine canvas keeps the prior turn's content — every prior block's
          // signature survives into this frame (mergeForMode's contract).
          const priorSigs = convo!.frames[i - 1].spec.blocks.map(blockSignature);
          const nowSigs = new Set(f.spec.blocks.map(blockSignature));
          for (const sig of priorSigs) {
            expect(nowSigs.has(sig), `frame ${i} lost prior content "${sig}"`).toBe(true);
          }
        });
      });

      it('honors the script expectations frozen into it', () => {
        if (!convo) return;
        const steps = turnSteps(script);
        steps.forEach((step, i) => {
          const f = convo!.frames[i];
          if (step.expect?.minBlocks) {
            expect(
              f.spec.blocks.length,
              `turn ${i} expected ≥${step.expect.minBlocks} blocks`,
            ).toBeGreaterThanOrEqual(step.expect.minBlocks);
          }
          if (step.expect?.bend) expect(f.spec.bend, `turn ${i} expected a bend`).toBeDefined();
          if (step.expect?.suggests) {
            expect(f.spec.suggests?.length, `turn ${i} expected chips`).toBeTruthy();
          }
        });
      });

      it('records the model context it was baked with (history and provenance)', () => {
        if (!convo) return;
        expect(convo.model.length).toBeGreaterThan(0);
        // Two messages per turn: what the model was sent, what it answered.
        expect(convo.history.length).toBe(convo.frames.length * 2);
      });
    });
  }

  it("does not invent a churn cause from the CFO scenario's aggregate figures", async () => {
    const convo = await loadDemoConversation('cfo');
    expect(convo).not.toBeNull();
    const replay = JSON.stringify(convo?.frames ?? []);
    expect(replay).not.toMatch(
      /CRM integration|onboarding completion|real root cause|churn lever/i,
    );
  });
});
