import { describe, expect, it } from 'vitest';
import { svgBlockMenu } from '../src/live/select/synthesis';

describe('generated visual accuracy prompt', () => {
  it('requires evidence-bound, internally consistent, honestly qualified diagrams', () => {
    const prompt = svgBlockMenu();
    expect(prompt).toContain('CORRECTNESS BEFORE DETAIL');
    expect(prompt).toContain('Never fill a visual gap');
    expect(prompt).toContain('cross-check that every label matches its shape');
    expect(prompt).toContain('not to scale');
    expect(prompt).toContain('ABSTRACT IDEAS ARE NOT LITERAL OBJECTS');
    expect(prompt).toContain('at most ONE svgblock');
    expect(prompt).toContain('6,000 characters');
    expect(prompt).toContain('80 total elements');
    expect(prompt).toContain('20 text labels');
    expect(prompt).toContain('do not increase the output budget');
  });
});
