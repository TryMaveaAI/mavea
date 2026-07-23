// End-to-end replay of the reported session (real asks, realistic answers) through the REAL
// pipeline — settleTurn per turn, then deriveChapters over the settled frames, embedder cold
// (no vectors), exactly like a fresh device. The reported failure: "Three days in Tokyo, food
// first" / "Plan it" / "How do I book high-end sushi?" / "How to use the Tokyo subway?" /
// "where to shop" produced FOUR chapters. Worst-case model behavior is simulated on the turns
// that actually split — the continuity hint omitted or a same-subject canvas 'replace' — so
// this pins that the subject boundary no longer depends on the model behaving.
import { describe, it, expect } from 'vitest';
import { settleTurn } from '../src/live/settleTurn';
import { deriveChapters } from '../src/live/scrubber/chapters';
import type { LiveResult } from '../src/live/generateLive';
import type { TurnFrame } from '../src/live/history';
import type { TurnSnapshot } from '../src/live/lifecycle';
import type { Block, ConversationSpec } from '../src/data/conversation';

const blk = (title: string): Block =>
  ({ type: 'insight', col: 12, delay: 0, props: { title } }) as unknown as Block;

function result(
  title: string,
  narration: string,
  continuity?: 'replace' | 'augment' | 'refine',
): LiveResult {
  return {
    spec: { title, sub: '', blocks: [blk(title)] } as unknown as ConversationSpec,
    narration,
    tier: 'frontier',
    ...(continuity ? { continuity } : {}),
  } as unknown as LiveResult;
}

// [ask, answer, the model's continuity behavior that day, streamed?]
const SESSION: [string, LiveResult, boolean][] = [
  [
    'Three days in Tokyo, food first',
    result(
      'Tokyo: A 3-Day Culinary Journey',
      'Here is a three day Tokyo itinerary built around food — Tsukiji market mornings, ramen in Shinjuku, and a sushi splurge to finish.',
    ),
    true,
  ],
  [
    'Plan it',
    // The model asked for a fresh canvas (a reasonable render choice for "plan it") — the old
    // boundary read that hint as a new SUBJECT and split the thread here.
    result(
      'Tokyo: A 3-Day Foodie Itinerary',
      'Day one covers Asakusa street snacks, day two is Shibuya and Harajuku eats, and day three ends with omakase in Ginza — the full Tokyo food plan.',
      'replace',
    ),
    true,
  ],
  [
    'How do I book high-end sushi?',
    result(
      'Booking High-End Sushi in Tokyo',
      'For top Tokyo sushi counters like Sukiyabashi, book weeks ahead — a hotel concierge or Tabelog reservation is the reliable route to an omakase seat.',
      'augment',
    ),
    false,
  ],
  [
    'How to use the Tokyo subway?',
    // Hint omitted entirely (smaller models often skip optional fields).
    result(
      'Riding the Tokyo Subway',
      'Grab a Suica card and the Tokyo metro becomes tap-and-go — the Ginza and Marunouchi lines cover most food neighborhoods on this itinerary.',
    ),
    true,
  ],
  [
    'where to shop',
    result(
      'Tokyo Shopping: Where To Go',
      'Ginza for luxury, Shibuya and Harajuku for streetwear, Akihabara for electronics — Tokyo shopping by neighborhood, near the food stops.',
    ),
    true,
  ],
];

describe('the reported Tokyo session', () => {
  it('settles into ONE chapter with the embedder cold, and a genuine pivot still opens a second', () => {
    const frames: TurnFrame[] = [];
    let prior: TurnSnapshot | null = null;
    let priorBlocks: Block[] = [];
    for (const [ask, res, streamed] of SESSION) {
      const settled = settleTurn(prior, priorBlocks, ask, res, { forceReplace: streamed });
      frames.push(settled.frame);
      prior = settled.snap;
      priorBlocks = settled.frame.spec.blocks;
    }

    const tokyoOnly = deriveChapters(frames, null);
    expect(tokyoOnly).toHaveLength(1);
    expect(tokyoOnly[0].moments).toHaveLength(5);

    // A real change of subject is still a new chapter — grouping must not become "everything".
    const pivot = settleTurn(
      prior,
      priorBlocks,
      'how should I budget my monthly money',
      result(
        'Your Monthly Budget',
        'Half to needs, a third to wants, and the rest building your future — a simple split that actually sticks.',
        'replace',
      ),
      { forceReplace: true },
    );
    const withPivot = deriveChapters([...frames, pivot.frame], null);
    expect(withPivot).toHaveLength(2);
    expect(withPivot[1].moments).toHaveLength(1);
  });
});
