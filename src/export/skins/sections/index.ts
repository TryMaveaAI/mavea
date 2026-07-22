// The default archetype renderers every skin inherits. A skin overrides an entry only where
// its reference diverges structurally; otherwise these token-driven components serve all 10.
import { FindingCallout, Prose, SpotlightCard } from './text';
import { Checklist, NumberedMilestones, RankedList, VerticalTimeline } from './lists';
import { DistributionBars, FigureGrid, MetricTiles, RatingMatrix, SpecTable } from './data';
import { Figure } from './figure';
import { Contents } from './contents';
import { SourcesAppendix } from './sources';
import type { SectionComponentMap } from '../types';

export const SHARED_SECTIONS: SectionComponentMap = {
  findingCallout: FindingCallout,
  spotlightCard: SpotlightCard,
  prose: Prose,
  rankedList: RankedList,
  checklist: Checklist,
  numberedMilestones: NumberedMilestones,
  verticalTimeline: VerticalTimeline,
  figureGrid: FigureGrid,
  figure: Figure,
  distributionBars: DistributionBars,
  metricTiles: MetricTiles,
  ratingMatrix: RatingMatrix,
  specTable: SpecTable,
  contents: Contents,
  sourcesAppendix: SourcesAppendix,
};
