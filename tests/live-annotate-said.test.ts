import { describe, it, expect } from 'vitest';
import { saidTokens, findSaidMatch } from '../src/live/annotate/saidTarget';

describe('saidTokens — what a spoken line points at', () => {
  it('extracts the figures the line leans on', () => {
    const t = saidTokens('Seattle leads at $1,950, about 18% over Austin.');
    expect(t.figures).toContain('$1,950');
    expect(t.figures).toContain('18%');
  });

  it('extracts mid-sentence names but not bare sentence openers', () => {
    const t = saidTokens('The tallest is Burj Khalifa, well ahead of Shanghai Tower.');
    expect(t.labels).toContain('Burj Khalifa');
    expect(t.labels).toContain('Shanghai Tower');
    expect(t.labels).not.toContain('The');
  });

  it('keeps multi-word names that open a sentence', () => {
    const t = saidTokens('Burj Khalifa stands alone at the top.');
    expect(t.labels).toContain('Burj Khalifa');
  });
});

describe('findSaidMatch — locating the said words in the card DOM', () => {
  function card(html: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  it('finds the exact character range of a figure, across formatting differences', () => {
    const host = card('<div><span class="big">1,950</span><span> per month</span></div>');
    const m = findSaidMatch(host, ['$1,950', '1,950'])!;
    expect(m).toBeTruthy();
    expect(m.node.textContent).toBe('1,950');
    expect(m.node.textContent!.slice(m.start, m.end)).toBe('1,950');
  });

  it('matches ignoring commas and spacing', () => {
    const host = card('<div>height of 828m above ground</div>');
    const m = findSaidMatch(host, ['828 m'])!;
    expect(m.node.textContent!.slice(m.start, m.end)).toBe('828m');
  });

  it('finds a name inside longer prose', () => {
    const host = card('<div><p>Compared with Shanghai Tower, the lead is clear.</p></div>');
    const m = findSaidMatch(host, ['Shanghai Tower'])!;
    expect(m.node.textContent!.slice(m.start, m.end)).toBe('Shanghai Tower');
  });

  it('never matches inside the ink layer, ask button, or eyebrow chrome', () => {
    const host = card(
      '<div><div class="card-eyebrow">1,950 LABEL</div><svg class="ink-layer"><text>1,950</text></svg><button class="block-ask">1,950</button></div>',
    );
    expect(findSaidMatch(host, ['1,950'])).toBeNull();
  });

  it('returns null when the words simply are not there', () => {
    const host = card('<div>nothing numeric here</div>');
    expect(findSaidMatch(host, ['$2,400'])).toBeNull();
  });

  it('matches when the model marks "$1,950" but the component renders "1,950"', () => {
    const host = card('<div><span class="big">1,950</span><span> per month</span></div>');
    const m = findSaidMatch(host, ['$1,950'])!;
    expect(m).toBeTruthy();
    expect(m.node.textContent!.slice(m.start, m.end)).toBe('1,950');
  });

  it('matches euro-prefixed values against bare numbers in the DOM', () => {
    const host = card('<div>23.5k cap</div>');
    const m = findSaidMatch(host, ['€23.5k'])!;
    expect(m).toBeTruthy();
    expect(m.node.textContent!.slice(m.start, m.end)).toBe('23.5k');
  });

  it('matches percentage tokens against bare digits', () => {
    const host = card('<div>growth: 18 over last year</div>');
    const m = findSaidMatch(host, ['18%'])!;
    expect(m).toBeTruthy();
    expect(m.node.textContent!.slice(m.start, m.end)).toBe('18');
  });
});
