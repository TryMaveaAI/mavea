import { render, screen, cleanup, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PrismApp } from '../src/live/prism/PrismApp';

// Prism's drop zone stages files before it maps them, and it used to key that list on the FILE NAME
// alone. Two same-named files (a Finder search spanning folders, a newer copy of the same report)
// broke it three ways: both staged under one React key, removing either dropped both while their
// rows stayed on screen, and a second drop of a genuinely different file was discarded in silence.

afterEach(cleanup);

function drop(...files: File[]): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const pdf = (name: string, body: string): File =>
  new File([body], name, { type: 'application/pdf' });

const stagedNames = (): string[] =>
  [...document.querySelectorAll('.prism-staged-name')].map((n) => n.textContent ?? '');

describe('Prism staging — two files can share a name', () => {
  it('stages both same-named files in one pick, and removes only the one asked for', () => {
    render(<PrismApp />);
    drop(
      pdf('report.pdf', 'a'),
      pdf('report.pdf', 'a much longer second copy'),
      pdf('notes.pdf', 'n'),
    );

    expect(screen.getByText('3 documents ready')).toBeTruthy();
    expect(stagedNames()).toHaveLength(3);

    act(() => {
      (document.querySelectorAll('.prism-staged-remove')[0] as HTMLButtonElement).click();
    });

    // The count and the list have to agree: removing by name emptied the state of both PDFs while
    // the DOM kept rendering a row that nothing could then delete.
    expect(screen.getByText('2 documents ready')).toBeTruthy();
    expect(stagedNames()).toHaveLength(2);
  });

  it('stages a different file that happens to share a name with one already staged', () => {
    render(<PrismApp />);
    drop(pdf('report.pdf', 'v1'));
    drop(pdf('report.pdf', 'the revised version, materially longer'));

    expect(screen.getByText('2 documents ready')).toBeTruthy();
    expect(document.querySelector('.prism-app-error')).toBeNull();
  });

  it('says so when a file really is already staged, rather than dropping it in silence', () => {
    render(<PrismApp />);
    drop(pdf('report.pdf', 'v1'));
    drop(pdf('report.pdf', 'v1'));

    expect(screen.getByText('1 document ready')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/already added/i);
  });

  it('names the file it refused, and the real reason for a legacy Office format', () => {
    render(<PrismApp />);
    drop(new File(['x'], 'Q4 memo.doc', { type: 'application/msword' }), pdf('ok.pdf', 'y'));

    // The old message answered a refused .doc with "try a Word doc", and a mixed drop reported
    // whichever rejection happened to come last rather than naming a file at all.
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert).toContain('Q4 memo.doc');
    expect(alert).toMatch(/\.docx/);
    expect(screen.getByText('1 document ready')).toBeTruthy();
  });

  it('keeps the programmatic file input out of the tab order', () => {
    render(<PrismApp />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // It was aria-hidden but still focusable, so Tab landed on a control assistive tech had been
    // told did not exist. The drop zone's own role="button" is the keyboard path.
    expect(input.hidden).toBe(true);
    expect(input.getAttribute('aria-hidden')).toBeNull();
  });
});
