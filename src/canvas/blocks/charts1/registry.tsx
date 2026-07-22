import { entry, type BlockRegistry } from '../registry-types';
import { Treemap } from './Treemap';
import { Sunburst } from './Sunburst';
import { Sankey } from './Sankey';
import { Network } from './Network';
import { Radar } from './Radar';
import { Waterfall } from './Waterfall';
import { Funnel } from './Funnel';
import { Histogram } from './Histogram';
import { Boxplot } from './Boxplot';
import { Streamgraph } from './Streamgraph';
import { Venn } from './Venn';
import { PieDonut } from './PieDonut';
import { DistributionCurve } from './DistributionCurve';
import { Quadrant } from './Quadrant';
import { LatencyDist } from './LatencyDist';
import { CapTable } from './CapTable';
import { LifeWheel } from './LifeWheel';
import { ViolinPlot } from './ViolinPlot';
import { StemLeaf } from './StemLeaf';
import { TamSam } from './TamSam';
import { CorrelationHeatmap } from './CorrelationHeatmap';
import { BcgMatrix } from './BcgMatrix';
import { FlowChord } from './FlowChord';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** charts1 family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const charts1Registry: BlockRegistry = {
  treemap: entry(Treemap),
  sunburst: entry(Sunburst),
  sankey: entry(Sankey),
  network: entry(Network),
  radar: entry(Radar),
  waterfall: entry(Waterfall),
  funnel: entry(Funnel),
  histogram: entry(Histogram),
  boxplot: entry(Boxplot),
  streamgraph: entry(Streamgraph),
  venn: entry(Venn),
  piedonut: entry(PieDonut),
  distributioncurve: entry(DistributionCurve),
  quadrant: entry(Quadrant),
  latencydist: entry(LatencyDist),
  captable: entry(CapTable),
  lifewheel: entry(LifeWheel),
  violinplot: entry(ViolinPlot),
  stemleafplot: entry(StemLeaf),
  tamsam: entry(TamSam),
  correlationheatmap: entry(CorrelationHeatmap),
  bcgmatrix: entry(BcgMatrix),
  flowchord: entry(FlowChord),
};
