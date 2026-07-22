// The Ask rail's two "opens me, prefilled" entry points: a node's "Ask about {label}" (RippleOverlay
// wires onAsk → openAsk) and a lesson's "Ask about this lesson" chip (LessonBody → onAskAboutLesson).
// Both must work with ZERO voice configured — narration is additive on top, never required to open
// the rail or ask a real question about the repo.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SEED_SHIP } from '../src/live/ripple/seed';
import { RippleOverlay } from '../src/live/ripple/RippleOverlay';
import { LessonBody } from '../src/live/ripple/sections/LessonBody';
import type { CourseLesson, ShipCourse } from '../src/live/ripple/model';

afterEach(cleanup);

const cfg = { provider: 'anthropic' as const, model: 'test', apiKey: 'x' };

describe('Ripple — a node’s Ask opens the rail, voiceless', () => {
  it('prefills a real question with no speak prop configured', async () => {
    // No `speak` prop at all — the RippleApp/LiveApp integration point when narration hasn't been
    // wired, or the reader simply hasn't opted in. openAsk must not depend on it.
    const { getByText, getByLabelText, queryByPlaceholderText } = render(
      <RippleOverlay model={SEED_SHIP} cfg={cfg} onClose={() => undefined} />,
    );

    expect(queryByPlaceholderText(/Ask about this repo or PR/i)).toBeNull();

    fireEvent.click(getByText('src/auth').closest('button')!);
    fireEvent.click(getByText(/Ask about src\/auth/i));

    const expected =
      'Explain src/auth — Issues and verifies tokens; this PR reshapes validateToken and adds rotation.';
    await waitFor(() =>
      expect((getByLabelText('Ask about this repo or PR') as HTMLTextAreaElement).value).toBe(
        expected,
      ),
    );
  });

  it('still opens the rail (honest, connect-a-model state) with no cfg at all', async () => {
    const { getByText, getByRole, queryByLabelText } = render(
      <RippleOverlay model={SEED_SHIP} onClose={() => undefined} />,
    );

    fireEvent.click(getByText('src/auth').closest('button')!);
    fireEvent.click(getByText(/Ask about src\/auth/i));

    expect(queryByLabelText('Ask about this repo or PR')).toBeNull(); // no model → no input form
    await waitFor(() => expect(getByRole('region', { name: 'Ask' })).toBeTruthy());
    expect(getByRole('button', { name: 'Close the ask rail' })).toBeTruthy(); // header reflects it
    expect(getByText(/Connect a model in Settings/i)).toBeTruthy(); // …but says so honestly
  });
});

describe('LessonBody — "Ask about this lesson"', () => {
  const course: ShipCourse = { title: 'Foundations', lessons: [] };
  const lesson: CourseLesson = {
    title: 'Reading the auth guard',
    goal: 'Understand how a request gets checked.',
    read: ['src/auth/guard.ts'],
    concepts: [],
  };

  it('asks a question naming the course and lesson', () => {
    const onAskAboutLesson = vi.fn();
    const { getByText } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        onAskAboutLesson={onAskAboutLesson}
      />,
    );

    fireEvent.click(getByText('Ask about this lesson'));
    expect(onAskAboutLesson).toHaveBeenCalledWith(
      'In "Foundations" — Reading the auth guard: Understand how a request gets checked.',
    );
  });

  it('hides the chip when no handler is wired', () => {
    const { queryByText } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
      />,
    );
    expect(queryByText('Ask about this lesson')).toBeNull();
  });
});
