// The Watch Me Think map, handed to the answer seams (Present, Share) as what it is: an answer
// whose one block is the map. The `mindshape` block already renders a kept map on any canvas, so
// Present and Share act on the map the reader is looking at, not on the answer behind it, with no
// surface of their own.
import type { ConversationSpec } from '../../data/conversation';
import type { TurnFrame } from '../history';
import type { MindShapeSpec } from './types';

export function mapAsSpec(map: MindShapeSpec): ConversationSpec {
  const { center, atoms, links, clusters, unsaid, title } = map;
  return {
    id: 'mind',
    workspace: 'Live',
    title: title?.trim() || center,
    sub: '',
    opener: center,
    context: [],
    blocks: [
      {
        type: 'mindshape',
        id: 'mind-1',
        col: 12,
        props: { center, atoms, links, clusters, unsaid, title },
      },
    ],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

/** The map as a one-frame conversation, stamped `at` when it was taken. */
export function mapAsFrame(map: MindShapeSpec, at: number): TurnFrame {
  return {
    id: `mind-${at}`,
    question: map.center,
    narration: '',
    mode: 'replace',
    tour: [],
    spec: mapAsSpec(map),
    at,
    mind: map,
  };
}
