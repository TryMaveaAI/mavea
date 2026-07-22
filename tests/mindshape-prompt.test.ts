import { describe, expect, it } from 'vitest';
import { mindShapeToPrompt } from '../src/live/mindshape/mindShapeToPrompt';
import type { MindShapeSpec } from '../src/live/mindshape/types';

// mindShapeToPrompt fuses the WHOLE settled map into one ask so "Just answer it" and
// "Give me next steps" are grounded in everything the user said — not just the center line.

const SPEC: MindShapeSpec = {
  center: 'Should I take the Seattle offer?',
  atoms: [
    {
      id: 'o1',
      kind: 'option',
      label: 'Take the Seattle offer',
      quote: 'take the Seattle offer',
      status: 'stable',
      confidence: 'said',
    },
    {
      id: 'w1',
      kind: 'want',
      label: 'More money',
      quote: "it's a lot more money",
      status: 'stable',
      confidence: 'said',
    },
    {
      id: 'f1',
      kind: 'fear',
      label: 'Scared of staying still',
      quote: "i'm just scared of staying still",
      status: 'stable',
      confidence: 'inferred',
    },
    {
      id: 'p1',
      kind: 'person',
      label: 'Maya',
      quote: 'Maya just started her new school',
      status: 'stable',
      confidence: 'said',
    },
  ],
  links: [{ from: 'w1', to: 'f1', kind: 'tensions', label: 'pulls against' }],
};

describe('mindShapeToPrompt', () => {
  it('answer mode includes the center, every atom label, and the tension', () => {
    const p = mindShapeToPrompt(SPEC, 'answer');
    expect(p).toContain('Should I take the Seattle offer?');
    expect(p).toContain('Take the Seattle offer');
    expect(p).toContain('More money');
    expect(p).toContain('Scared of staying still');
    expect(p).toContain('Maya');
    expect(p).toContain('pulls against');
    expect(p.toLowerCase()).toContain('clear');
  });

  it('plan mode asks for concrete next steps', () => {
    const p = mindShapeToPrompt(SPEC, 'plan');
    expect(p.toLowerCase()).toContain('next steps');
    // still carries the full context
    expect(p).toContain('Maya');
  });

  it('groups atoms under readable headings', () => {
    const p = mindShapeToPrompt(SPEC, 'answer');
    expect(p).toContain('Options on the table:');
    expect(p).toContain('What I want:');
    expect(p).toContain('What worries me:');
    expect(p).toContain('People involved:');
  });

  it('degrades gracefully with no center', () => {
    const p = mindShapeToPrompt({ ...SPEC, center: '' }, 'answer');
    expect(p).toContain('thinking out loud');
    expect(p).toContain('Take the Seattle offer');
  });

  it('omits the verbatim quote when it just repeats the label', () => {
    const spec: MindShapeSpec = {
      center: 'x',
      atoms: [
        {
          id: 'a',
          kind: 'want',
          label: 'More money',
          quote: 'More money',
          status: 'stable',
          confidence: 'said',
        },
      ],
      links: [],
    };
    const p = mindShapeToPrompt(spec, 'answer');
    // label present once, no duplicated quoted echo
    expect(p).toContain('- More money');
    expect(p).not.toContain('("More money")');
  });
});
