// mindShapeToSpec.ts — convert a settled MindShapeSpec to a ConversationSpec so the
// settled map survives replay, library, present, and share exactly as it appeared live.
import type { ConversationSpec } from '../../data/conversation';
import type { MindShapeSpec } from './types';

export function mindShapeToSpec(spec: MindShapeSpec): ConversationSpec {
  const title = spec.title ?? 'The shape of your thinking';
  return {
    id: 'mindshape' as ConversationSpec['id'],
    workspace: 'mindshape',
    title,
    sub: spec.center || '',
    opener: spec.center || title,
    context: [],
    blocks: [
      {
        type: 'mindshape',
        col: 12,
        props: {
          title,
          center: spec.center,
          atoms: spec.atoms,
          links: spec.links,
          clusters: spec.clusters,
          unsaid: spec.unsaid,
        },
      },
    ],
    proof: null,
    extras: {},
    group: 'live' as ConversationSpec['group'],
    suggests: [],
    keywords: [],
  };
}
