// The live-data heuristics (src/live/search/index.ts): an undated games+scores ask means NOW in
// either word order, while settled/historical facts must never trip the live gate (a wrong trip
// turns into a "no live access" refusal when search is off).
import { describe, expect, it } from 'vitest';
import { needsFreshInfo, needsLiveData } from '../src/live/search';

describe('needsLiveData — games and scores in either order', () => {
  it('reads an undated "games … scores" ask as live (the reported miss)', () => {
    expect(needsLiveData('tell me the mlb games and the scores')).toBe(true);
    expect(needsLiveData('show me the matches and their scores')).toBe(true);
  });

  it('still reads the score-first direction as live', () => {
    expect(needsLiveData('what are the scores of the games')).toBe(true);
    expect(needsLiveData('what is the score of the game right now')).toBe(true);
  });

  it('keeps settled and historical asks quiet', () => {
    expect(needsLiveData('who won the 2018 final')).toBe(false);
    expect(needsLiveData('how does baseball scoring work')).toBe(false);
    expect(needsLiveData('explain how compound interest works')).toBe(false);
  });

  it('keeps evergreen games+scores phrasings quiet (a wrong trip becomes a wrongful refusal)', () => {
    expect(needsLiveData('top 10 video games by metacritic scores')).toBe(false);
    expect(needsLiveData('what video games have the best music scores')).toBe(false);
    expect(needsLiveData('board games where players track scores')).toBe(false);
    expect(needsLiveData('which composers wrote scores for famous games')).toBe(false);
    expect(needsLiveData('what are the video games with the best scores')).toBe(false);
  });
});

describe('needsFreshInfo — time-sensitive asks open the search gate broadly, not per-league', () => {
  it('opens the search gate for the undated scores ask', () => {
    expect(needsFreshInfo('tell me the mlb games and the scores')).toBe(true);
  });

  it('covers the common time-sensitive shapes (each also gets the date-anchor prompt line)', () => {
    for (const ask of [
      'nba scores',
      'premier league fixtures',
      'weather in seattle',
      'bitcoin price',
      'latest ai news',
      'nvidia stock',
      "who's playing tonight",
    ]) {
      expect(needsFreshInfo(ask), ask).toBe(true);
    }
  });
});
