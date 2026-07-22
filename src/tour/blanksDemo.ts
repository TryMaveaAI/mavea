// A key-free "Blank Space" walkthrough. The real feature is model-emitted — an answer arrives with
// the numbers only YOU could give left as glowing holes (savings, monthly spend), which you fill to
// complete it. Baking that needs an API key, so instead this hand-authors the two frames the demo
// needs: the answer WITH holes, and its completed twin. The walkthrough shows the first, then reveals
// the second — a first-timer sees exactly what "the blank space" is, no key required. Deterministic,
// no model call. The blocks/blanks are illustrative (clearly "your numbers" theatre), never passed
// off as a real computed answer.
import type { Block, Blank, ConversationSpec } from '../data/conversation';
import type { TurnFrame } from '../live/history';

/** The two holes the demo answer leaves — the parts of "can I afford a break" only the user knows. */
const SLOTS: Blank[] = [
  {
    key: 'savings',
    label: 'Your savings',
    prompt: 'How much have you set aside for the break?',
    kind: 'number',
    unit: '$',
    placeholder: 'e.g. 18,000',
  },
  {
    key: 'spend',
    label: 'Monthly spend',
    prompt: 'Roughly what will you spend a month while travelling?',
    kind: 'number',
    unit: '$/mo',
    placeholder: 'e.g. 2,400',
  },
];

const HOLES_BLOCKS: Block[] = [
  {
    type: 'insight',
    id: 'blanks-lede',
    col: 12,
    props: {
      title: 'The money side of a 6-month break',
      summary:
        "I've mapped the typical costs and what to sort out before you leave. Two numbers, though, are yours to give — so I've left them as holes rather than guess.",
    },
  } as Block,
  {
    type: 'blanks',
    id: 'blanks-holes',
    col: 12,
    props: {
      title: 'The parts only you can answer',
      icon: 'spark',
      iconColor: 'var(--presence)',
      intro:
        "I've weighed everything I can. Fill these in and I'll finish the runway math around them.",
      slots: SLOTS,
    },
  } as unknown as Block,
];

const FILLED_BLOCKS: Block[] = [
  {
    type: 'insight',
    id: 'blanks-verdict',
    col: 12,
    props: {
      title: 'You can afford it — with a cushion',
      summary:
        '$18,000 saved against $2,400 a month is about 7.5 months of runway — enough for a 6-month break with room to spare.',
      stat: '7.5 months',
      delta: '+1.5 vs. the plan',
      deltaDir: 'up',
    },
  } as Block,
  {
    type: 'breakdown',
    id: 'blanks-runway',
    col: 12,
    props: {
      title: 'Your runway',
      rows: [
        { name: 'Saved', val: '$18,000', pct: 100 },
        { name: 'Spend / month', val: '$2,400', pct: 32 },
        { name: '6-month cost', val: '$14,400', pct: 80 },
        { name: 'Left over', val: '$3,600', pct: 20, tag: 'cushion', tagColor: 'var(--presence)' },
      ],
    },
  } as unknown as Block,
];

function frame(spec: ConversationSpec, narration: string): TurnFrame {
  return {
    question: 'Can I afford a 6-month career break?',
    narration,
    mode: 'replace',
    tour: [],
    spec,
    at: 0,
  };
}

/** Build the demo's two frames from a real corpus spec (reused only for its valid routing scaffold —
 *  id, workspace, group, suggests…); the blocks + blanks are swapped for the hand-authored ones. */
export function buildBlanksDemo(scaffold: ConversationSpec): {
  holes: TurnFrame;
  filled: TurnFrame;
} {
  const shared = {
    ...scaffold,
    title: 'Can I afford a 6-month career break?',
    sub: 'The money side',
    // Drop any scaffold-specific interactive extras that don't belong on this answer.
    bend: undefined,
    sources: undefined,
    track: undefined,
  };
  const holesSpec: ConversationSpec = {
    ...shared,
    blocks: HOLES_BLOCKS,
    blanks: SLOTS,
    awaiting: true,
  };
  const filledSpec: ConversationSpec = {
    ...shared,
    blocks: FILLED_BLOCKS,
    blanks: undefined,
    awaiting: false,
  };
  return {
    holes: frame(holesSpec, ''),
    filled: frame(
      filledSpec,
      'With eighteen thousand saved and twenty-four hundred a month, that’s about seven and a half months of runway — enough for six, with a cushion.',
    ),
  };
}
