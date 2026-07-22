import { entry, type BlockRegistry } from '../registry-types';
import { Sparkstat } from './Sparkstat';
import { Counter } from './Counter';
import { Herostat } from './Herostat';
import { Trendtile } from './Trendtile';
import { Scorebadge } from './Scorebadge';
import { Percentilebar } from './Percentilebar';
import { Statpair } from './Statpair';
import { Scorecard } from './Scorecard';
import { Deltacascade } from './Deltacascade';
import { Bulletkpi } from './Bulletkpi';
import { ConfusionMatrix } from './ConfusionMatrix';
import { KpiDashboard } from './KpiDashboard';
import { AbTestResult } from './AbTestResult';
import { Powersample } from './Powersample';
import { InventoryReorder } from './InventoryReorder';
import { BoardGameScore } from './BoardGameScore';
import { CvssScorecard } from './CvssScorecard';
import { RidgePlot } from './RidgePlot';
import { Ecdf } from './Ecdf';
import { ForestPlot } from './ForestPlot';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** stats family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const statsRegistry: BlockRegistry = {
  sparkstat: entry(Sparkstat),
  counter: entry(Counter),
  herostat: entry(Herostat),
  trendtile: entry(Trendtile),
  scorebadge: entry(Scorebadge),
  percentilebar: entry(Percentilebar),
  statpair: entry(Statpair),
  scorecard: entry(Scorecard),
  deltacascade: entry(Deltacascade),
  bulletkpi: entry(Bulletkpi),
  confusionmatrix: entry(ConfusionMatrix),
  kpidashboard: entry(KpiDashboard),
  abtestresult: entry(AbTestResult),
  powersample: entry(Powersample),
  inventoryreorder: entry(InventoryReorder),
  boardgamescore: entry(BoardGameScore),
  cvssscorecard: entry(CvssScorecard),
  ridgeplot: entry(RidgePlot),
  ecdf: entry(Ecdf),
  forestplot: entry(ForestPlot),
};
