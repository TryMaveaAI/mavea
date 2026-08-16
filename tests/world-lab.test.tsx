// world-lab.test.tsx — the dev harness at #/worldlab is a QA instrument, so the things a QA pass
// depends on are pinned here: it opens on the shipped seed, a `?s=<id>` link opens THAT world (and
// a stale one degrades to the seed rather than to a blank screen), every pick is written back to
// the hash so the finding stays linkable, the bracket keys walk the corpus without hijacking the
// filter box, and both window listeners are handed back on unmount.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldLab } from '../src/live/world/WorldLab';
import { ALL_WORLD_SCENARIOS, allWorldScenario } from '../src/live/world/scenarios/index';

const SEED = 'seed-2008';
const seed = allWorldScenario(SEED)!;
/** The scenario after the seed in corpus order — what `]` must land on from a clean start. */
const next = ALL_WORLD_SCENARIOS[ALL_WORLD_SCENARIOS.indexOf(seed) + 1];

const picker = (): HTMLSelectElement => screen.getByLabelText('Scenario') as HTMLSelectElement;
const filter = (): HTMLInputElement =>
  screen.getByLabelText('Filter scenarios') as HTMLInputElement;
const heading = (): string => screen.getByRole('heading', { level: 2 }).textContent ?? '';

/** The hash is global state; every test starts from a known one. */
const goto = (hash: string): void => {
  window.location.hash = hash;
};

beforeEach(() => goto('#/worldlab'));
afterEach(cleanup);

describe('WorldLab scenario switcher', () => {
  it('opens on the shipped seed and names it', () => {
    render(<WorldLab />);
    expect(picker().value).toBe(SEED);
    expect(heading()).toBe(seed.spec.title);
    expect(screen.getByText(SEED)).toBeTruthy();
    expect(screen.getByText(seed.note)).toBeTruthy();
  });

  it('opens the world a `?s=` link names', () => {
    goto(`#/worldlab?s=${next.id}`);
    render(<WorldLab />);
    expect(picker().value).toBe(next.id);
    expect(heading()).toBe(next.spec.title);
  });

  it('falls back to the seed when the link names a world that no longer exists', () => {
    goto('#/worldlab?s=a-world-that-was-renamed');
    render(<WorldLab />);
    expect(picker().value).toBe(SEED);
  });

  it('writes every pick into the hash, so a finding stays linkable', () => {
    render(<WorldLab />);
    fireEvent.change(picker(), { target: { value: next.id } });
    expect(window.location.hash).toBe(`#/worldlab?s=${next.id}`);
    expect(heading()).toBe(next.spec.title);
  });

  it('follows the hash when it changes underneath it (Back, or a pasted link)', () => {
    render(<WorldLab />);
    goto(`#/worldlab?s=${next.id}`);
    fireEvent(window, new Event('hashchange'));
    expect(picker().value).toBe(next.id);
    expect(heading()).toBe(next.spec.title);
  });

  it('steps to the next and previous world on ] and [', () => {
    render(<WorldLab />);
    fireEvent.keyDown(window, { key: ']' });
    expect(picker().value).toBe(next.id);
    expect(window.location.hash).toBe(`#/worldlab?s=${next.id}`);
    fireEvent.keyDown(window, { key: '[' });
    expect(picker().value).toBe(SEED);
  });

  it('wraps at both ends rather than dead-ending', () => {
    render(<WorldLab />);
    const last = ALL_WORLD_SCENARIOS[ALL_WORLD_SCENARIOS.length - 1];
    fireEvent.keyDown(window, { key: '[' });
    expect(picker().value).toBe(last.id);
    fireEvent.keyDown(window, { key: ']' });
    expect(picker().value).toBe(SEED);
  });

  it('leaves the brackets alone while they are being typed into the filter', () => {
    render(<WorldLab />);
    fireEvent.keyDown(filter(), { key: ']' });
    expect(picker().value).toBe(SEED);
  });

  it('narrows the list to what was typed, and walks only the matches', () => {
    render(<WorldLab />);
    const chain = ALL_WORLD_SCENARIOS.find((s) => s.id === 'chain-rainforest')!;
    fireEvent.change(filter(), { target: { value: 'chain' } });
    const options = [...picker().options].map((o) => o.value);
    expect(options).toContain(chain.id);
    expect(options.length).toBeLessThan(ALL_WORLD_SCENARIOS.length);
    // The seed is filtered out but still selectable — a picker that silently un-picks what is on
    // screen would leave the <select> showing a world it is not rendering.
    expect(options).toContain(SEED);
    expect(picker().value).toBe(SEED);
    fireEvent.keyDown(window, { key: ']' });
    expect(options).toContain(picker().value);
    expect(picker().value).not.toBe(SEED);
  });

  it('hands back both window listeners on unmount', () => {
    const off = vi.spyOn(window, 'removeEventListener');
    render(<WorldLab />).unmount();
    const removed = off.mock.calls.map(([type]) => type);
    expect(removed).toContain('hashchange');
    expect(removed).toContain('keydown');
    off.mockRestore();
  });
});
