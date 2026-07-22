import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  wikipediaSearchUrl,
  stripHtml,
  parseWikipedia,
  wikipediaProvider,
} from '../src/live/search/wikipedia';
import {
  needsFreshInfo,
  needsLiveData,
  searchQuery,
  getSearchProvider,
  requestedResultCount,
} from '../src/live/search';
import { resultLimit, DEFAULT_RESULTS, MAX_RESULTS_CEIL } from '../src/live/search/limit';
import { braveSearchUrl, parseBrave, braveProvider } from '../src/live/search/brave';
import { parseTavily, tavilyProvider } from '../src/live/search/tavily';
import { buildSearchContext, toSources } from '../src/live/search/inject';
import {
  validateLiveResponse,
  FRONTIER_BLOCK_TYPES,
  PHOTO_BLOCK_TYPE,
} from '../src/engine/liveSchema';
import type { SearchResult } from '../src/live/search';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wikipedia search provider (keyless, browser-direct)', () => {
  it('builds a CORS-enabled Action-API URL (origin=* is what unlocks the browser call)', () => {
    const url = wikipediaSearchUrl('mount fuji height', 3);
    expect(url).toContain('https://en.wikipedia.org/w/api.php?');
    expect(url).toContain('action=query');
    expect(url).toContain('list=search');
    expect(url).toContain('srsearch=mount+fuji+height');
    expect(url).toContain('srlimit=3');
    expect(url).toContain('origin=*'); // the literal asterisk is what enables anonymous CORS
  });

  it('strips the HTML the API wraps snippets in', () => {
    const raw = 'Mount <span class="searchmatch">Fuji</span> is 3,776' + '&nbsp;' + 'm';
    expect(stripHtml(raw)).toBe('Mount Fuji is 3,776 m');
  });

  it('parses hits into normalized results with wiki URLs', () => {
    const body = {
      query: {
        search: [
          { title: 'Mount Fuji', snippet: 'Highest <span>mountain</span> in Japan' },
          { title: 'No snippet entry' },
        ],
      },
    };
    const results = parseWikipedia(body);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Mount Fuji',
      url: 'https://en.wikipedia.org/wiki/Mount_Fuji',
      snippet: 'Highest mountain in Japan',
    });
    expect(results[1].url).toContain('No_snippet_entry');
  });

  it('search() resolves [] on a network error instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(wikipediaProvider.search('anything')).resolves.toEqual([]);
  });

  it('getSearchProvider resolves all registered ids (default wikipedia)', () => {
    expect(getSearchProvider().id).toBe('wikipedia');
    expect(getSearchProvider('wikipedia').id).toBe('wikipedia');
    expect(getSearchProvider('brave').id).toBe('brave');
    expect(getSearchProvider('tavily').id).toBe('tavily');
  });
});

describe('keyed search providers (Brave / Tavily, via /search proxy)', () => {
  it('Brave URL targets the same-origin proxy with query + count', () => {
    const url = braveSearchUrl('best espresso machine', 5);
    expect(url).toContain('/search/brave/res/v1/web/search?');
    expect(url).toContain('q=best+espresso+machine');
    expect(url).toContain('count=5');
  });

  it('parses Brave web.results[] into normalized results', () => {
    const body = {
      web: {
        results: [
          {
            title: 'Best <strong>Espresso</strong>',
            url: 'https://a.test',
            description: 'Top picks',
          },
          { description: 'no url/title — dropped' },
        ],
      },
    };
    expect(parseBrave(body)).toEqual([
      { title: 'Best Espresso', url: 'https://a.test', snippet: 'Top picks' },
    ]);
  });

  it('parses Tavily results[] into normalized results', () => {
    const body = {
      results: [
        { title: 'Tavily hit', url: 'https://b.test', content: 'A clean snippet.' },
        { url: 'https://no-title.test', content: 'dropped' },
      ],
    };
    expect(parseTavily(body)).toEqual([
      { title: 'Tavily hit', url: 'https://b.test', snippet: 'A clean snippet.' },
    ]);
  });

  it('keyed providers resolve [] without a key (graceful, no fetch)', async () => {
    await expect(braveProvider.search('q', {})).resolves.toEqual([]);
    await expect(tavilyProvider.search('q', {})).resolves.toEqual([]);
  });
});

describe('needsFreshInfo gate', () => {
  it('fires on lookup/recency prompts', () => {
    expect(needsFreshInfo('what is the latest iphone price')).toBe(true);
    expect(needsFreshInfo('who is the ceo of OpenAI')).toBe(true);
    expect(needsFreshInfo('population of Tokyo today')).toBe(true);
  });
  it('stays quiet for creative / non-lookup prompts', () => {
    expect(needsFreshInfo('write me a poem about the sea')).toBe(false);
    expect(needsFreshInfo('help me feel calmer')).toBe(false);
  });
  it('fires on a trip/travel ask anchored to an explicit near-future date', () => {
    // Regression: naming real travel dates ("July 3") matched none of the generic lookup
    // words, so a trip-planning turn never even offered the model the search tool — even
    // though weather/events/hours for those specific dates genuinely benefit from grounding.
    expect(needsFreshInfo('Plan a 3 day trip to Chicago from July 3 to July 6')).toBe(true);
    expect(needsFreshInfo('I am visiting Tokyo in December 15th, what should I pack')).toBe(true);
    expect(needsFreshInfo('heading to Austin March 2, any tips')).toBe(true);
  });
  it('does not fire on a settled date mention with no travel context', () => {
    expect(needsFreshInfo('My birthday is June 3rd, what should I get my mom')).toBe(false);
  });
  it('fires on a near-future schedule/fixture ask', () => {
    // Regression: "this weekend" slipped through `this (week|month|year)` (the \b after "week"
    // fails inside "weekend"), and "games/fixtures/World Cup" are not lookup words — so a
    // "what's on this weekend" ask never even offered the model the search tool.
    expect(needsFreshInfo('show me the World Cup games this weekend')).toBe(true);
    expect(needsFreshInfo('World Cup fixtures this weekend')).toBe(true);
    expect(needsFreshInfo('who plays tomorrow')).toBe(true);
    expect(needsFreshInfo('upcoming matches')).toBe(true);
    expect(needsFreshInfo("what's the kickoff time tonight")).toBe(true);
  });
  it('does not fire on the word "games" with no time/schedule context', () => {
    expect(needsFreshInfo('what board games should I buy for my family')).toBe(false);
  });
  it('fires on a public event anchored to an EXACT date or weekday (not just "this weekend")', () => {
    // A specific date/weekday for a public event ("World Cup games on July 19", "matches on
    // Saturday", "the concert on the 14th") shifts and isn't in training — it must search.
    expect(needsFreshInfo('show me the World Cup games on July 19')).toBe(true);
    expect(needsFreshInfo('what World Cup matches are on Saturday')).toBe(true);
    expect(needsFreshInfo('is there a World Cup game on December 15')).toBe(true);
    expect(needsFreshInfo('the concert on the 14th')).toBe(true);
  });
  it('keeps a PERSONAL calendar action with a date quiet (no public event to look up)', () => {
    // "schedule"/"meeting"/"birthday" are deliberately not event words, so a private calendar
    // ask never trips the live-search NUDGE (needsLiveData) even if it mentions a day.
    expect(needsLiveData('schedule a meeting for Friday')).toBe(false);
    expect(needsLiveData('my birthday is June 3rd, what should I get my mom')).toBe(false);
    // …and a year-anchored past result stays settled.
    expect(needsLiveData('who won the World Cup final on July 15 2018')).toBe(false);
  });
});

describe('needsLiveData — the volatile subset Wikipedia cannot serve', () => {
  it('fires on genuinely live, sub-daily asks', () => {
    expect(needsLiveData('what was the yankees score today')).toBe(true);
    expect(needsLiveData("what's the latest news headline right now")).toBe(true);
    expect(needsLiveData('what is the AAPL stock price')).toBe(true);
    expect(needsLiveData('what is the weather in Boston')).toBe(true);
    expect(needsLiveData('who won the game last night')).toBe(true);
  });
  it('stays quiet for encyclopedic-fresh asks Wikipedia CAN serve', () => {
    // These benefit from grounding but are stable enough for an encyclopedia — so they are
    // fresh but NOT volatile, and the Wikipedia fallback remains appropriate for them.
    expect(needsLiveData('what is the population of Tokyo')).toBe(false);
    expect(needsLiveData('who is the ceo of OpenAI')).toBe(false);
    expect(needsLiveData('what is the capital of Australia')).toBe(false);
    expect(needsLiveData('when was the Eiffel Tower built')).toBe(false);
  });

  it('treats SETTLED historical results as not-live (no false "no live access" refusal)', () => {
    // A year-anchored result is history, not live — the model/encyclopedia can answer it, so it
    // must NOT trip the live-data refusal path (the regression the review caught).
    expect(needsLiveData('who won the super bowl in 1985')).toBe(false);
    expect(needsLiveData('who won the world series in 2016')).toBe(false);
    // A bare "win"/"score"/topic word without a live context is a concept/fact, not live data.
    expect(needsLiveData('what did Einstein win the Nobel Prize for')).toBe(false);
    expect(needsLiveData('what is bitcoin and how does it work')).toBe(false);
    expect(needsLiveData('how is a credit score calculated')).toBe(false);
  });
  it('fires on a near-future sports schedule (tournament calendar, not encyclopedic)', () => {
    // The live World Cup fixture list shifts with the tournament — an encyclopedia can't be
    // trusted for it, so it must route to real-time grounding (or the "turn on search" nudge),
    // never the Wikipedia fallback.
    expect(needsLiveData('show me the World Cup games this weekend')).toBe(true);
    expect(needsLiveData('what matches are on tonight')).toBe(true);
    // …but a settled schedule word with no near-future window stays quiet.
    expect(needsLiveData('what is the format of the World Cup group stage')).toBe(false);
  });
  it('is a strict subset of needsFreshInfo (every volatile ask is also fresh)', () => {
    for (const q of [
      'nba scores tonight',
      'bitcoin price now',
      "today's news",
      'games this weekend',
    ]) {
      expect(needsLiveData(q)).toBe(true);
      expect(needsFreshInfo(q)).toBe(true);
    }
  });
});

describe('searchQuery — tighten a conversational ask to a keyword query', () => {
  it('strips a leading question opener', () => {
    expect(searchQuery('What is the capital of Australia?')).toBe('the capital of Australia');
    expect(searchQuery('Tell me about the Roman Empire')).toBe('the Roman Empire');
  });
  it('strips a trailing time/elaboration clause (the noise that surfaced bad matches)', () => {
    expect(
      searchQuery('What is the current population of Tokyo, and how has it changed recently?'),
    ).toBe('the current population of Tokyo');
  });
  it('caps length and never returns empty', () => {
    expect(searchQuery('?')).toBe('?'); // too short to strip → original
    const long = 'a '.repeat(100) + 'tail';
    expect(searchQuery(long).length).toBeLessThanOrEqual(96);
  });
});

describe('requestedResultCount — honor an explicit "give me N" ask', () => {
  it('reads a number followed by a result noun', () => {
    expect(requestedResultCount('give me 10 sources on this')).toBe(10);
    expect(requestedResultCount('find 8 articles about it')).toBe(8);
    expect(requestedResultCount('list 12 examples')).toBe(12);
  });
  it('reads a leading "top N"', () => {
    expect(requestedResultCount('top 20 results for rust crates')).toBe(20);
  });
  it('returns undefined when no count is named', () => {
    expect(requestedResultCount('what is the capital of Peru')).toBeUndefined();
    expect(requestedResultCount('tell me about the 1990s')).toBeUndefined();
  });
});

describe('resultLimit — bound the fetched count', () => {
  it('falls back to the default when nothing is requested', () => {
    expect(resultLimit(undefined)).toBe(DEFAULT_RESULTS);
  });
  it('honors a requested count within bounds', () => {
    expect(resultLimit(10)).toBe(10);
  });
  it('clamps above the ceiling and below one', () => {
    expect(resultLimit(99)).toBe(MAX_RESULTS_CEIL);
    expect(resultLimit(0)).toBe(DEFAULT_RESULTS);
  });
});

describe('search context + citations', () => {
  const results: SearchResult[] = [
    { title: 'A', url: 'https://a.test', snippet: 'alpha' },
    { title: 'B', url: 'https://b.test', snippet: 'beta' },
  ];
  it('builds a numbered context block', () => {
    const ctx = buildSearchContext('q', results);
    expect(ctx).toContain('Web search results for "q"');
    expect(ctx).toContain('[1] A: alpha (https://a.test)');
    expect(ctx).toContain('[2] B: beta (https://b.test)');
  });
  it('respects an explicit limit instead of re-truncating to the default', () => {
    const five: SearchResult[] = [1, 2, 3, 4, 5].map((n) => ({
      title: `T${n}`,
      url: `https://t${n}.test`,
      snippet: `s${n}`,
    }));
    // Default cap keeps all five (it equals DEFAULT_RESULTS) — but a tighter explicit cap trims.
    expect(toSources(five, 2)).toHaveLength(2);
    expect(buildSearchContext('q', five, 2).match(/\[\d+\]/g)).toHaveLength(2);
  });
  it('returns "" for no results', () => {
    expect(buildSearchContext('q', [])).toBe('');
  });
  it('toSources keeps title, url, and the real snippet (the evidence excerpt)', () => {
    expect(toSources(results)).toEqual([
      { title: 'A', url: 'https://a.test', snippet: 'alpha' },
      { title: 'B', url: 'https://b.test', snippet: 'beta' },
    ]);
  });
  it('toSources omits an empty snippet rather than carrying a blank quote', () => {
    expect(toSources([{ title: 'C', url: 'https://c.test', snippet: '' }])).toEqual([
      { title: 'C', url: 'https://c.test' },
    ]);
  });
});

describe('liveSchema — photo block, chips, web sources', () => {
  const allowedWithPhoto = new Set([...FRONTIER_BLOCK_TYPES, PHOTO_BLOCK_TYPE]);

  // Mavéa doesn't generate images, so a photo is only ever a REAL one the model found. A block
  // carrying nothing but a description has no image to show — it used to survive as a broken frame
  // wearing an "AI image" badge, which both lied about the source and looked broken. It's dropped.
  it('keeps a photo with a real allowlisted image, and drops one with no image at all', () => {
    const real = validateLiveResponse(
      {
        title: 'T',
        sub: 's',
        narration: 'hi',
        blocks: [
          {
            type: 'photo',
            props: {
              title: 'Fox',
              src: 'https://images.pexels.com/photos/1/red-fox.jpg',
            },
          },
        ],
      },
      allowedWithPhoto,
    );
    const photo = real!.blocks.find((b) => b.type === 'photo');
    expect(photo).toBeTruthy();
    expect((photo as { props: { src: string } }).props.src).toContain('images.pexels.com');

    const promptOnly = validateLiveResponse(
      {
        title: 'T',
        sub: 's',
        narration: 'hi',
        blocks: [
          { type: 'photo', props: { prompt: 'a red fox', title: 'Fox' } },
          { type: 'insight', props: { title: 'Still here' } },
        ],
      },
      allowedWithPhoto,
    );
    expect(promptOnly!.blocks.some((b) => b.type === 'photo')).toBe(false);
    expect(promptOnly!.blocks.some((b) => b.type === 'insight')).toBe(true);
  });

  it('drops a photo block when photo is NOT allowed (image gen off)', () => {
    const res = validateLiveResponse(
      {
        title: 'T',
        sub: 's',
        narration: 'hi',
        blocks: [
          { type: 'photo', props: { prompt: 'a red fox' } },
          { type: 'insight', props: { title: 'Still here' } },
        ],
      },
      FRONTIER_BLOCK_TYPES,
    );
    expect(res!.blocks.some((b) => b.type === 'photo')).toBe(false);
    expect(res!.blocks.some((b) => b.type === 'insight')).toBe(true);
  });

  it('coerces chips and web sources at the response level', () => {
    const res = validateLiveResponse(
      {
        title: 'T',
        sub: 's',
        narration: 'hi',
        blocks: [{ type: 'insight', props: { title: 'x' } }],
        chips: ['Tell me more', '   ', 'Why?'],
        sources: [
          { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/X' },
          { url: 'https://no-title.test' },
          { title: 'bad' },
        ],
      },
      FRONTIER_BLOCK_TYPES,
    );
    expect(res!.chips).toEqual(['Tell me more', 'Why?']);
    expect(res!.sources).toEqual([
      { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/X' },
      { title: 'https://no-title.test', url: 'https://no-title.test' },
    ]);
  });
});
