import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Pullquote } from '../src/canvas/blocks/layout/Pullquote';
import { SubtextDecode } from '../src/canvas/blocks/layout/SubtextDecode';
import { Rehearsal } from '../src/canvas/blocks/layout/Rehearsal';

afterEach(cleanup);

// Both cards already frame the quoted text (a tone bar, a message bubble); a small quote glyph
// set above it read as a stray mark floating over the first line rather than as punctuation.
describe('quoted text carries no detached quote glyph', () => {
  it('pullquote', () => {
    const { container } = render(
      <Pullquote title="Said" quote={'Ship the smallest thing.'} author="A. Lee" />,
    );
    expect(container.querySelector('.lay-pq-mark')).toBeNull();
    expect(container.textContent).toContain('Ship the smallest thing.');
  });

  it('subtextdecode', () => {
    const { container } = render(
      <SubtextDecode
        title="Decode"
        message="k. fine."
        readings={[{ interpretation: 'Annoyed but letting it go', likelihood: 'most likely' }]}
      />,
    );
    expect(container.querySelector('.sbd-msg-mark')).toBeNull();
    expect(container.textContent).toContain('k. fine.');
  });
});

describe('rehearsal exit line', () => {
  it('sets the wrap-up cue apart from the words to say', () => {
    const { container } = render(
      <Rehearsal
        title="Talk"
        opener={'Can we talk?'}
        branches={[{ reaction: 'go quiet', say: 'Take your time.' }]}
        exit={'Let us pick this up Sunday.'}
      />,
    );
    const body = container.querySelector('.rh-exit-body');
    expect(body?.querySelector('.rh-exit-tag')?.textContent).toBe('If you need to wrap it up');
    // The line is its own element, not a run-on continuation of the tag's sentence.
    expect(body?.querySelector('.rh-exit-line')?.textContent).toBe('Let us pick this up Sunday.');
  });
});
