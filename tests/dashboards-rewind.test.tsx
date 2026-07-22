// dashboards-rewind.test.tsx — the Weekly Rewind's pure data-shaping logic: summing the week's
// call tally across every dashboard, picking the week's most substantive "called it" quote, and
// deciding which of the 4 slides survive. These are the honesty-critical seams (a slide only ever
// renders real data, never a placeholder), so they're exercised directly against hand-built
// fixtures rather than through the rendered overlay.
import { describe, expect, it } from 'vitest';
import {
  buildRewindSlides,
  collectWeekGrades,
  pickBestCallQuote,
  resolveViewSlides,
  sumWeeklyTally,
} from '../src/live/dashboards/rewind/rewindModel';
import type { WeeklyRewind } from '../src/live/dashboards/ledger';
import type { Dashboard, PredictionGrade } from '../src/live/dashboards/types';

const NOW = new Date(2026, 6, 10).getTime();
const DAY = 24 * 60 * 60 * 1000;

function grade(over: Partial<PredictionGrade> = {}): PredictionGrade {
  return { at: NOW, expected: 'x', result: 'hit', ...over };
}

function dash(over: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 'd',
    title: 'Dashboard',
    predictionHistory: [],
    ...over,
  } as unknown as Dashboard;
}

function rewind(over: Partial<WeeklyRewind> = {}): WeeklyRewind {
  return {
    totalSearches: 0,
    byDay: [],
    topMoment: null,
    estSavedPerMonth: 0,
    ...over,
  };
}

describe('sumWeeklyTally', () => {
  it('sums hits/total across dashboards', () => {
    const dashboards = [
      dash({ predictionHistory: [grade({ result: 'hit' }), grade({ result: 'miss' })] }),
      dash({ predictionHistory: [grade({ result: 'hit' }), grade({ result: 'unclear' })] }),
    ];
    expect(sumWeeklyTally(dashboards, NOW)).toEqual({ hits: 2, total: 4 });
  });

  it('ignores dashboards with no prediction history', () => {
    const dashboards = [dash({ predictionHistory: undefined }), dash({ predictionHistory: [] })];
    expect(sumWeeklyTally(dashboards, NOW)).toEqual({ hits: 0, total: 0 });
  });

  it('excludes grades older than 7 days', () => {
    const dashboards = [
      dash({ predictionHistory: [grade({ at: NOW - 8 * DAY }), grade({ at: NOW - DAY })] }),
    ];
    expect(sumWeeklyTally(dashboards, NOW)).toEqual({ hits: 1, total: 1 });
  });
});

describe('collectWeekGrades', () => {
  it('collects across dashboards within the week, oldest first', () => {
    const dashboards = [
      dash({ title: 'A', predictionHistory: [grade({ at: NOW - 2 * DAY })] }),
      dash({ title: 'B', predictionHistory: [grade({ at: NOW - 5 * DAY })] }),
    ];
    const grades = collectWeekGrades(dashboards, NOW);
    expect(grades.map((g) => g.dashboardTitle)).toEqual(['B', 'A']);
  });

  it('drops anything outside the 7-day window', () => {
    const dashboards = [dash({ predictionHistory: [grade({ at: NOW - 30 * DAY })] })];
    expect(collectWeekGrades(dashboards, NOW)).toEqual([]);
  });

  it('caps at the given limit, keeping the most recent entries', () => {
    const history = Array.from({ length: 25 }, (_, i) => grade({ at: NOW - i * 1000 }));
    const dashboards = [dash({ predictionHistory: history })];
    const grades = collectWeekGrades(dashboards, NOW, 20);
    expect(grades).toHaveLength(20);
    // oldest-first among the survivors, and the survivors are the 20 most recent
    expect(grades[grades.length - 1].grade.at).toBe(NOW);
    expect(grades[0].grade.at).toBe(NOW - 19 * 1000);
  });
});

describe('pickBestCallQuote', () => {
  it('picks the hit with the longest expected+note text', () => {
    const dashboards = [
      dash({ title: 'Short', predictionHistory: [grade({ result: 'hit', expected: 'short' })] }),
      dash({
        title: 'Long',
        predictionHistory: [
          grade({ result: 'hit', expected: 'a much longer call', note: 'and it held' }),
        ],
      }),
    ];
    expect(pickBestCallQuote(dashboards, NOW)).toEqual({
      expected: 'a much longer call',
      note: 'and it held',
      dashboardTitle: 'Long',
    });
  });

  it('never picks a miss or unclear grade', () => {
    const dashboards = [
      dash({
        predictionHistory: [
          grade({ result: 'miss', expected: 'a very very long missed call indeed' }),
          grade({ result: 'unclear', expected: 'an even longer unclear call than that one' }),
        ],
      }),
    ];
    expect(pickBestCallQuote(dashboards, NOW)).toBeNull();
  });

  it('ignores hits outside the 7-day window', () => {
    const dashboards = [
      dash({ predictionHistory: [grade({ result: 'hit', at: NOW - 10 * DAY })] }),
    ];
    expect(pickBestCallQuote(dashboards, NOW)).toBeNull();
  });

  it('returns null when there are no dashboards at all', () => {
    expect(pickBestCallQuote([], NOW)).toBeNull();
  });
});

describe('buildRewindSlides', () => {
  it('includes all four slides in order when everything has real data', () => {
    const slides = buildRewindSlides(
      rewind({
        totalSearches: 12,
        topMoment: { id: 'e', at: NOW, kind: 'goal', text: 'x', dashboardIds: [], searches: 0 },
        estSavedPerMonth: 4,
      }),
      { hits: 3, total: 5 },
    );
    expect(slides).toEqual(['searches', 'moment', 'calls', 'saved']);
  });

  it('skips a slide with nothing real to show, keeping the rest in order', () => {
    const slides = buildRewindSlides(rewind({ totalSearches: 12 }), { hits: 0, total: 0 });
    expect(slides).toEqual(['searches']);
  });

  it('returns an empty list for a brand-new, all-zero week', () => {
    expect(buildRewindSlides(rewind(), { hits: 0, total: 0 })).toEqual([]);
  });
});

describe('resolveViewSlides', () => {
  it('substitutes the fallback slide when nothing survived', () => {
    expect(resolveViewSlides([])).toEqual(['fallback']);
  });

  it('passes real slides through unchanged', () => {
    expect(resolveViewSlides(['searches', 'saved'])).toEqual(['searches', 'saved']);
  });
});
