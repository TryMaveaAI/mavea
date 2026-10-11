// An insight's stat is the one figure the card sets in its display size, cut for numerals. The
// model sometimes writes a phrase there instead ("Equal split", "Lifestyle › Personality"), which
// then reads as a heading in the wrong face while the title already carries the words — so the
// validator keeps a stat only when it carries a digit, and the card keeps everything else.
import { beforeAll, describe, expect, it } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { ensureDetails } from '../src/canvas/blocks/catalog';
import { renderToStaticMarkup } from 'react-dom/server';
import { InsightCard } from '../src/canvas/InsightCard';
import { insightFigure } from '../src/canvas/lib/insightFigure';

const insight = (stat: string) =>
  validateLiveResponse(
    {
      title: 'T',
      narration: 'n',
      blocks: [{ type: 'insight', props: { title: 'Split it evenly', stat } }],
    },
    new Set(['insight']),
    1,
  )?.blocks[0];

describe('insight — a stat is a figure', () => {
  beforeAll(async () => {
    await ensureDetails(['insight']);
  });

  it('keeps a stat that carries a number, in any format', () => {
    for (const stat of ['$5,000/mo', '72%', '3 of 4', '1.5×']) {
      expect(insight(stat)?.props).toMatchObject({ stat });
    }
  });

  it('drops a phrase written in the stat slot and keeps the card', () => {
    const block = insight('Lifestyle › Personality');
    expect(block?.type).toBe('insight');
    expect(block?.props).not.toHaveProperty('stat');
  });
});

describe('insight — a figure in the delta is never lost with the stat', () => {
  it('promotes a figure delta when the stat is a phrase', () => {
    expect(insightFigure('Doubled', '+100%')).toEqual({ stat: '+100%' });
  });

  it('keeps both when the stat is a figure, and neither when nothing is', () => {
    expect(insightFigure('72%', '+4 pts')).toEqual({ stat: '72%', delta: '+4 pts' });
    expect(insightFigure('Equal split', 'steady')).toEqual({});
  });

  it('the card applies it to a frame that never passed the validator', () => {
    const html = renderToStaticMarkup(
      <InsightCard num="1" title="Base grows every period" stat="Inferred" delta="+12%" />,
    );
    expect(html).toContain('+12%');
    expect(html).not.toContain('Inferred</span>');
  });
});
