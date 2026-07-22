// messagedraft-sanitize.test.tsx — messagedraft.body is a RAW_TEXT prop (not tag-neutralized
// upstream) that renders as HTML, so the render-boundary sanitizer is its only guard. This
// proves an adversarial/prompt-injected body can't land a handler or a script, while real
// formatting still renders.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MessageDraft } from '../src/canvas/blocks/compose/MessageDraft';

describe('MessageDraft — a model-supplied body cannot inject script or handlers', () => {
  it('strips an onerror image yet keeps the surrounding text and safe markup', () => {
    const { container } = render(
      <MessageDraft
        title="Draft"
        subject="Re: project"
        body={'Hi <img src=x onerror="window.__xss=1"> <strong>team</strong>, see below.'}
      />,
    );
    const body = container.querySelector('.md-body');
    expect(body).toBeTruthy();
    expect(body!.querySelector('img')).toBeNull();
    expect(body!.innerHTML).not.toMatch(/onerror/i);
    expect(body!.querySelector('strong')?.textContent).toBe('team');
    expect(body!.textContent).toContain('see below.');
    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined();
  });

  it('drops a script tag in the body without executing or rendering it', () => {
    const { container } = render(
      <MessageDraft
        title="Draft"
        subject="Re: project"
        body={'Before <script>window.__xss2=1</script> after'}
      />,
    );
    const body = container.querySelector('.md-body');
    expect(body!.querySelector('script')).toBeNull();
    expect(body!.textContent).toContain('Before');
    expect(body!.textContent).toContain('after');
    expect((window as unknown as { __xss2?: unknown }).__xss2).toBeUndefined();
  });
});
