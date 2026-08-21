// vocabulary.ts — every word this surface uses for a representation, in ONE place.
//
// There were four hand-maintained lists of the same four views: the chip a reader presses, the
// caption a narration driver speaks, the sentence under the chips explaining what the geometry
// means, and a copy in the headless audit script so its report could name what it swept. Nothing
// linked them, so adding a view meant remembering four files and the audit's copy silently drifted.
//
// Plain TS with no React and no CSS import, deliberately: `scripts/world-audit.mts` runs under
// `node --import tsx` and cannot load a module that pulls in a stylesheet, which is exactly why it
// had a copy of its own.
import type { Representation } from './types';

export interface RepText {
  /** The chip a reader presses. */
  chip: string;
  /** What the view is called when it is spoken or stepped. */
  caption: string;
  /** What this view's GEOMETRY means, in one line. A morphing surface asks the reader to re-read the
   *  same objects several ways, and only the causal web is self-evident: on the timeline, position is
   *  a claim (when) while height is only packing, and a reader with no way to know that reasonably
   *  assumes both mean something. */
  legend: string;
}

export const REP_TEXT: Record<Representation, RepText> = {
  graph: {
    chip: 'Graph',
    caption: 'What caused what',
    legend:
      'Left to right is what led to what. Colour is the direction of the push; thickness is how much of the outcome the link explains.',
  },
  flow: {
    chip: 'Contribution',
    caption: 'How much each one contributed',
    legend:
      'Ribbon thickness is how much of the outcome that link was MEASURED to explain. A cause whose links carry no measured share is held aside rather than drawn thin, which would read as a finding nobody made.',
  },
  timeline: {
    chip: 'Over time',
    caption: 'The same causes, in time',
    legend:
      'Left to right is WHEN, read against the axis below; a bar is how long a cause lasted. Height only keeps entries from overlapping — it means nothing.',
  },
  spheres: {
    chip: 'Spheres',
    caption: 'What kinds of force',
    legend:
      'Each lane is a sphere the causes belong to. A link that CHANGES lane is a handoff between kinds of force and is drawn at full weight; one that stays inside a lane goes faint. A cause the answer put in no single sphere is held aside rather than filed under one it does not belong to.',
  },
  chart: {
    chip: 'As a chart',
    caption: 'How much each one moved',
    legend:
      'Each mark is a cause plotted against its own measured history. Causes with nothing measured are held aside rather than drawn at zero.',
  },
};
