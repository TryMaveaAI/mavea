// A fresh conversation must have a door to the capabilities.
//
// Every mode is mounted from the first paint, but the setup wizard hides the whole topbar and dock
// in CSS — so the feature menus, the ⌘K handle, the paperclip and the attach strip's Explode button
// were all invisible until you had typed something. Reaching Prism or Just listen meant asking a
// throwaway question first, which is not a door. The launcher is the door.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StartWith } from '../src/live/welcome/StartWith';
import type { StartWithItem } from '../src/live/welcome/StartWith';
import { FEATURES } from '../src/live/features/registry';
import { START_WITH_IDS, prismRow } from '../src/live/welcome/startWithIds';

function itemFor(id: string, over: Partial<StartWithItem> = {}): StartWithItem {
  const feature = FEATURES.find((f) => f.id === id);
  if (!feature) throw new Error(`no such feature: ${id}`);
  return { feature, available: true, run: vi.fn(), ...over };
}

describe('the launcher offers what the registry declares', () => {
  it('names every row from the registry, never from a copy of it', () => {
    render(<StartWith items={START_WITH_IDS.map((id) => itemFor(id))} />);
    for (const id of START_WITH_IDS) {
      const feature = FEATURES.find((f) => f.id === id);
      expect(screen.getByText(feature?.label as string)).toBeInTheDocument();
    }
  });

  it('runs a row when it is chosen', () => {
    const run = vi.fn();
    render(<StartWith items={[itemFor('just-listen', { run })]} />);
    fireEvent.click(screen.getByText('Just listen'));
    expect(run).toHaveBeenCalledOnce();
  });

  it('renders nothing at all rather than an empty shell', () => {
    const { container } = render(<StartWith items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('an unavailable capability still says it exists', () => {
  it('shows the reason in place of the blurb, and keeps the row visible', () => {
    // The same choice the command palette makes: a capability that vanishes reads as one that
    // does not exist, which is the whole problem this launcher is fixing.
    render(
      <StartWith
        items={[
          itemFor('pdf-world', { available: false, reason: 'Attach a PDF to split it into a map' }),
        ]}
      />,
    );
    expect(screen.getByText('Prism')).toBeInTheDocument();
    expect(screen.getByText('Attach a PDF to split it into a map')).toBeInTheDocument();
  });

  it('falls back to the blurb when no reason was given', () => {
    const prism = FEATURES.find((f) => f.id === 'pdf-world');
    render(<StartWith items={[itemFor('pdf-world', { available: false })]} />);
    expect(screen.getByText(prism?.blurb as string)).toBeInTheDocument();
  });
});

describe('the walkthrough is reachable from a row that has one', () => {
  it('offers "See how" only where a chapter exists', () => {
    const onSeeHow = vi.fn();
    // 'dashboards' is the registry's one launcher-adjacent feature with no tourChapter.
    const withChapter = itemFor('just-listen');
    const withoutChapter = itemFor('dashboards');
    expect(withoutChapter.feature.tourChapter).toBeUndefined();
    render(<StartWith items={[withChapter, withoutChapter]} onSeeHow={onSeeHow} />);
    expect(screen.getAllByText('See how')).toHaveLength(1);
    fireEvent.click(screen.getByText('See how'));
    expect(onSeeHow).toHaveBeenCalledWith(withChapter.feature);
  });

  it('offers none at all when the host cannot play one', () => {
    render(<StartWith items={[itemFor('just-listen')]} />);
    expect(screen.queryByText('See how')).not.toBeInTheDocument();
  });
});

describe('opening a row is cheap before it is chosen', () => {
  it('preloads a feature the pointer is only hovering', () => {
    const preload = vi.fn(() => Promise.resolve());
    render(<StartWith items={[itemFor('courses', { preload })]} />);
    fireEvent.pointerEnter(screen.getByText('Courses'));
    expect(preload).toHaveBeenCalled();
  });
});

describe('the Prism row says which document it will open', () => {
  // The trap: on a new conversation the attach strip is hidden with the rest of the dock, so a
  // document picked here left no trace. A generic row then re-opened that first file on every
  // later visit, with nothing on screen explaining why or how to choose a different one — you had
  // to leave for Live and start a whole new conversation to get back to the picker.
  it('is the picker when nothing is staged', () => {
    const row = prismRow([]);
    expect(row.opensPicker).toBe(true);
    expect(row.blurb).toMatch(/choose a pdf/i);
  });

  it('names the staged document, so a second visit is never a surprise', () => {
    const row = prismRow([{ name: 'macro_market_playbook.pdf' }]);
    expect(row.opensPicker).toBe(false);
    expect(row.blurb).toBe('Open the map for macro_market_playbook.pdf');
  });

  it('counts them when several are staged', () => {
    const row = prismRow([{ name: 'a.pdf' }, { name: 'b.pdf' }, { name: 'c.pdf' }]);
    expect(row.opensPicker).toBe(false);
    expect(row.blurb).toBe('Open the map across 3 documents');
  });

  it('goes back to being the picker the moment the staged file is removed', () => {
    expect(prismRow([{ name: 'a.pdf' }]).opensPicker).toBe(false);
    expect(prismRow([]).opensPicker).toBe(true);
  });
});
