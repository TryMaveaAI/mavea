// mindshape-settled.test.tsx — the settled "Watch Me Think" surface.
// Pins the mockup features that turn the map from a picture into a thing you can act on: the tension
// callout (auto-surfaced, "help me tell them apart"), the traced-step plan (every step cites a
// quote — nothing invented), the "kept this shape" panel (Replay/Share/Present + memory reassurance),
// the four post-settle actions, the intent-aware labels, synthesis line, and interactive unsaid card.
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MindShape } from '../src/canvas/blocks/diagrams/MindShape';
import type { MindAtom, MindLink, MindUnsaid } from '../src/live/mindshape/types';

afterEach(cleanup);

const atoms: MindAtom[] = [
  {
    id: 'a',
    kind: 'want',
    label: 'the career',
    quote: 'I keep calling it the career',
    status: 'stable',
    confidence: 'said',
    weight: 3,
  },
  {
    id: 'b',
    kind: 'fear',
    label: 'scared of staying still',
    quote: "I'm scared of staying still",
    status: 'stable',
    confidence: 'said',
    weight: 3,
  },
  {
    id: 'c',
    kind: 'open_loop',
    label: 'decide by spring',
    quote: 'I have to decide by spring',
    status: 'stable',
    confidence: 'said',
  },
];

const links: MindLink[] = [{ from: 'a', to: 'b', kind: 'tensions', label: 'pulls against' }];

function renderSettled(onAction = vi.fn()) {
  render(
    <MindShape
      asBlock={false}
      phase="settled"
      center="Is it the right time — or am I running?"
      atoms={atoms}
      links={links}
      onAction={onAction}
    />,
  );
  return onAction;
}

describe('MindShape — settled surface', () => {
  it('auto-surfaces the tension callout and offers to tell the two apart', () => {
    const onAction = renderSettled();
    const callout = screen.getByRole('dialog', { name: 'The tension' });
    // Both sides of the conflict are named in the person's own words.
    expect(within(callout).getByText(/the career/)).toBeTruthy();
    expect(within(callout).getByText(/scared of staying still/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /tell them apart/i }));
    expect(onAction).toHaveBeenCalledWith('tell-apart', {
      tension: { a: 'the career', b: 'scared of staying still' },
    });
  });

  it('shows the five post-settle actions in the mockup’s words', () => {
    renderSettled();
    expect(screen.getByRole('button', { name: 'Answer this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn into a plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'That’s it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add more' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not quite' })).toBeTruthy();
  });

  it('"Add more" fires the add-more action so the map can pick up where it left off', () => {
    const onAction = renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Add more' }));
    expect(onAction).toHaveBeenCalledWith('add-more');
  });

  it('offers no "Add more" while still live — the map is already growing as you talk', () => {
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={atoms}
        links={links}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add more' })).toBeNull();
  });

  it('turns the open loops into traced steps — each citing a quote, nothing invented', () => {
    renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    const plan = screen.getByRole('dialog', { name: 'Turn into a plan' });
    // The open-loop atom becomes a step, traced back to its verbatim quote.
    expect(within(plan).getByText('decide by spring')).toBeTruthy();
    expect(within(plan).getByText(/from .I have to decide by spring/)).toBeTruthy();
    expect(within(plan).getByText(/nothing invented/i)).toBeTruthy();
  });

  it('"Make it real" runs the plan as a real turn', () => {
    const onAction = renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    fireEvent.click(screen.getByRole('button', { name: /make it real/i }));
    expect(onAction).toHaveBeenCalledWith('commit-plan');
  });

  it('lets you check off plan steps — they are real checkboxes you control', () => {
    renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    const plan = screen.getByRole('dialog', { name: 'Turn into a plan' });
    const box = within(plan).getByRole('checkbox', { name: /decide by spring/i });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box); // toggles back off
    expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('"That’s it" keeps the shape — Replay/Share/Present + the memory reassurance', () => {
    const onAction = renderSettled();
    fireEvent.click(screen.getByRole('button', { name: 'That’s it' }));
    const kept = screen.getByRole('dialog', { name: 'Kept this shape' });
    expect(within(kept).getByText(/Nothing was saved to memory/i)).toBeTruthy();
    fireEvent.click(within(kept).getByRole('button', { name: /share/i }));
    expect(onAction).toHaveBeenCalledWith('share');
    fireEvent.click(within(kept).getByRole('button', { name: /present mode/i }));
    expect(onAction).toHaveBeenCalledWith('present');
  });

  it('does not surface a tension callout when there is no real (non-provisional) tension', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What next?"
        atoms={atoms.slice(0, 2)}
        links={[{ from: 'a', to: 'b', kind: 'tensions', label: 'maybe?', provisional: true }]}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog', { name: 'The tension' })).toBeNull();
  });
});

describe('MindShape — live surface (not yet settled)', () => {
  // A subject exploration: a short prompt the model expanded into several question atoms, while the
  // map is still LIVE (listening). The actions must work here too — the user shouldn't have to wait
  // for settle to act on a map that's already full of thoughts.
  const questions: MindAtom[] = [
    {
      id: 'q1',
      kind: 'question',
      label: 'where it goes',
      quote: 'where does this trajectory go',
      status: 'stable',
      confidence: 'said',
    },
    {
      id: 'q2',
      kind: 'question',
      label: 'how startups compare',
      quote: 'how do startups compare to other countries',
      status: 'stable',
      confidence: 'said',
    },
    {
      id: 'q3',
      kind: 'question',
      label: 'the role of spices',
      quote: 'spices influenced economic and cultural history',
      status: 'stable',
      confidence: 'said',
    },
  ];

  it('counts the thoughts ON THE MAP, not just spoken utterances', () => {
    // 3 atoms are on the map but only 1 spoken utterance was counted — the badge must read "3 thoughts",
    // never "1 thought" with three cards visible.
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={questions}
        links={[]}
        thoughtCount={1}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/3 thoughts/)).toBeTruthy();
    expect(screen.queryByText('1 thought')).toBeNull();
  });

  it('opens "Turn into a plan" on a LIVE map (not only when settled), with questions as steps', () => {
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={questions}
        links={[]}
        onAction={vi.fn()}
      />,
    );
    // the action is offered while still live (there are atoms to act on)
    fireEvent.click(screen.getByRole('button', { name: 'Turn into a plan' }));
    const plan = screen.getByRole('dialog', { name: 'Turn into a plan' });
    // a questions-only subject map still yields steps (each a question to pursue), traced to its quote
    expect(within(plan).getByText('where it goes')).toBeTruthy();
    expect(within(plan).getByText(/from .where does this trajectory go/)).toBeTruthy();
    expect(within(plan).queryByText(/No open loops/i)).toBeNull();
  });

  it('"Answer this" is available live and fuses the map into a turn', () => {
    const onAction = vi.fn();
    render(
      <MindShape
        asBlock={false}
        phase="listening"
        center=""
        atoms={questions}
        links={[]}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Answer this' }));
    expect(onAction).toHaveBeenCalledWith('answer');
  });
});

describe('MindShape — intent-aware labels and synthesis line', () => {
  const decisonAtoms: MindAtom[] = [
    {
      id: 'o1',
      kind: 'option',
      label: 'Take the Seattle offer',
      quote: 'the Seattle offer',
      status: 'stable',
      confidence: 'said',
      weight: 2,
    },
    {
      id: 'o2',
      kind: 'option',
      label: 'Stay in Austin',
      quote: 'stay in Austin',
      status: 'stable',
      confidence: 'said',
      weight: 2,
    },
    {
      id: 'f1',
      kind: 'fear',
      label: 'Missing family',
      quote: 'miss my family',
      status: 'stable',
      confidence: 'said',
    },
  ];
  const decisionLinks: MindLink[] = [
    { from: 'o1', to: 'o2', kind: 'tensions', label: 'pulls against' },
  ];

  it('shows "Help me decide" as the primary action for a decision intent', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What do I actually want?"
        atoms={decisonAtoms}
        links={decisionLinks}
        intent="decision"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Help me decide' })).toBeTruthy();
  });

  it('shows "THE DECISION" as the center label for decision intent', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What do I actually want?"
        atoms={decisonAtoms}
        links={decisionLinks}
        intent="decision"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText('THE DECISION')).toBeTruthy();
  });

  it('shows "Take me deeper" for exploration intent', () => {
    const explorationAtoms: MindAtom[] = Array.from({ length: 4 }, (_, i) => ({
      id: `q${i}`,
      kind: 'question' as const,
      label: `Question ${i}`,
      quote: `question ${i}`,
      status: 'stable' as const,
      confidence: 'said' as const,
    }));
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="What is this really about?"
        atoms={explorationAtoms}
        links={[]}
        intent="exploration"
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Take me deeper' })).toBeTruthy();
    expect(screen.getByText('THE QUESTION')).toBeTruthy();
  });

  it('renders the synthesis line when settled with atoms', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center="The real question"
        atoms={decisonAtoms}
        links={decisionLinks}
        onAction={vi.fn()}
      />,
    );
    // Synthesis line: tension variant → "1 tension. Take the Seattle offer vs Stay in Austin."
    // Target the specific atom labels that only appear in the synthesis line text.
    expect(screen.getByText(/Seattle offer vs Stay in Austin/i)).toBeTruthy();
  });

  it('says so honestly instead of showing a bare face when a short turn settles with nothing', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={[]}
        links={[]}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/didn.t catch enough to map/i)).toBeTruthy();
    // No atoms means nothing to act on — the post-settle action bar stays hidden rather than
    // offering "Answer this" over an empty map.
    expect(screen.queryByRole('button', { name: 'Answer this' })).toBeNull();
  });
});

describe('MindShape — interactive unsaid card', () => {
  const unsaid: MindUnsaid = {
    label: "Maybe it's not about money",
    why: 'Keeps framing it as money but circles back to something else.',
    confidence: 'maybe',
  };
  const baseAtoms: MindAtom[] = [
    {
      id: 'a1',
      kind: 'want',
      label: 'Security',
      quote: 'I want security',
      status: 'stable',
      confidence: 'said',
    },
  ];

  it('shows "Yes, that\'s it" and "Not quite" buttons when callbacks are provided', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onConfirmUnsaid={vi.fn()}
        onDismissUnsaid={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /yes, that's it/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /not this/i })).toBeTruthy();
  });

  it('renders the full unsaid sentence without shortening it to an ellipsis', () => {
    const fullLabel = 'How are the special cases actually supposed to interact with the main rule?';
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={{ ...unsaid, label: fullLabel }}
        onConfirmUnsaid={vi.fn()}
        onDismissUnsaid={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText(fullLabel)).toBeTruthy();
    expect(screen.queryByText(/actually supposed…/i)).toBeNull();
  });

  it('"Yes, that\'s it" fires onConfirmUnsaid', () => {
    const onConfirm = vi.fn();
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onConfirmUnsaid={onConfirm}
        onDismissUnsaid={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /yes, that's it/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('"Not this" fires onDismissUnsaid', () => {
    const onDismiss = vi.fn();
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onConfirmUnsaid={vi.fn()}
        onDismissUnsaid={onDismiss}
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /not this/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does NOT show action buttons when no callbacks are provided (block/replay mode)', () => {
    render(
      <MindShape
        asBlock={false}
        phase="settled"
        center=""
        atoms={baseAtoms}
        links={[]}
        unsaid={unsaid}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /yes, that's it/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /not this/i })).toBeNull();
    // But the card content itself is visible
    expect(screen.getByText("Maybe it's not about money")).toBeTruthy();
  });
});
