import { entry, type BlockRegistry } from '../registry-types';
import { RocCurve } from './RocCurve';
import { BurnRunway } from './BurnRunway';
import { Slopegraph } from './Slopegraph';
import { Plot } from './Plot';
import { CalendarHeatmap } from './CalendarHeatmap';
import { BumpChart } from './BumpChart';
import { Marimekko } from './Marimekko';
import { Dumbbell } from './Dumbbell';
import { Lollipop } from './Lollipop';
import { BulletChart } from './BulletChart';
import { Candlestick } from './Candlestick';
import { Gantt } from './Gantt';
import { Bubble } from './Bubble';
import { AreaRange } from './AreaRange';
import { Waffle } from './Waffle';
import { GroupedBars } from './GroupedBars';
import { StackedBars } from './StackedBars';
import { DualAxis } from './DualAxis';
import { ScatterRegression } from './ScatterRegression';
import { ControlChart } from './ControlChart';
import { DotPlot } from './DotPlot';
import { Bridge } from './Bridge';
import { AreaPlot } from './AreaPlot';
import { SupplyDemand } from './SupplyDemand';
import { BreakEven } from './BreakEven';
import { BigO } from './BigO';
import { ErrorBars } from './ErrorBars';
import { EraTimeline } from './EraTimeline';
import { IndifferenceCurve } from './IndifferenceCurve';
import { PayoffDiagram } from './PayoffDiagram';
import { PhaseDiagram } from './PhaseDiagram';
import { LoadDiagram } from './LoadDiagram';
import { EcgStrip } from './EcgStrip';
import { VitalStrip } from './VitalStrip';
import { GrowthCurve } from './GrowthCurve';
import { SleepCycle } from './SleepCycle';
import { SeasonBand } from './SeasonBand';
import { QQPlot } from './QQPlot';
import { SurfacePlot } from './SurfacePlot';
import { SamplingDistribution } from './SamplingDistribution';
import { GradientDescent } from './GradientDescent';
import { BiasVariance } from './BiasVariance';
import { TimeSeriesDecomposition } from './TimeSeriesDecomposition';
import { PrecisionRecallCurve } from './PrecisionRecallCurve';
import { Chromatogram } from './Chromatogram';
import { StressStrainCurve } from './StressStrainCurve';
import { GatingPlot } from './GatingPlot';
import { GelLane } from './GelLane';
import { FlightChart } from './FlightChart';
import { PayBandChart } from './PayBandChart';
import { LineBalance } from './LineBalance';
import { EpiCurve } from './EpiCurve';
import { Pareto } from './Pareto';
import { PopulationPyramid } from './PopulationPyramid';
import { ParallelCoordinates } from './ParallelCoordinates';
import { ScatterplotMatrix } from './ScatterplotMatrix';
import { PictogramChart } from './PictogramChart';
import { HrDiagram } from './HrDiagram';
import { TernaryPlot } from './TernaryPlot';
import { ParliamentSeats } from './ParliamentSeats';
import type { ScatterRegressionProps, DotPlotProps } from './types';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** charts2 family registry — entries forward only `delay`; spotlight/dim is applied by the grid wrapper. */
export const charts2Registry: BlockRegistry = {
  slopegraph: entry(Slopegraph),
  plot: entry(Plot),
  calheat: entry(CalendarHeatmap),
  bump: entry(BumpChart),
  marimekko: entry(Marimekko),
  dumbbell: entry(Dumbbell),
  lollipop: entry(Lollipop),
  bulletchart: entry(BulletChart),
  candlestick: entry(Candlestick),
  gantt: entry(Gantt),
  bubble: entry(Bubble),
  arearange: entry(AreaRange),
  waffle: entry(Waffle),
  groupedbars: entry(GroupedBars),
  stackedbars: entry(StackedBars),
  dualaxis: entry(DualAxis),
  scatterregression: (p, c) => (
    <ScatterRegression {...(p as ScatterRegressionProps)} delay={c.delay} />
  ),
  dotplot: (p, c) => <DotPlot {...(p as DotPlotProps)} delay={c.delay} />,
  controlchart: entry(ControlChart),
  bridge: entry(Bridge),
  areaplot: entry(AreaPlot),
  supplydemand: entry(SupplyDemand),
  breakeven: entry(BreakEven),
  bigo: entry(BigO),
  errorbars: entry(ErrorBars),
  eratimeline: entry(EraTimeline),
  indifferencecurve: entry(IndifferenceCurve),
  payoffdiagram: entry(PayoffDiagram),
  phasediagram: entry(PhaseDiagram),
  loaddiagram: entry(LoadDiagram),
  ecgstrip: entry(EcgStrip),
  vitalstrip: entry(VitalStrip),
  growthcurve: entry(GrowthCurve),
  sleepcycle: entry(SleepCycle),
  seasonband: entry(SeasonBand),
  burnrunway: entry(BurnRunway),
  qqplot: entry(QQPlot),
  samplingdistribution: entry(SamplingDistribution),
  surfaceplot: entry(SurfacePlot),
  roccurve: entry(RocCurve),
  gradientdescent: entry(GradientDescent),
  biasvariance: entry(BiasVariance),
  timeseriesdecomposition: entry(TimeSeriesDecomposition),
  precisionrecallcurve: entry(PrecisionRecallCurve),
  chromatogram: entry(Chromatogram),
  stressstraincurve: entry(StressStrainCurve),
  gatingplot: entry(GatingPlot),
  gellane: entry(GelLane),
  flightchart: entry(FlightChart),
  paybandchart: entry(PayBandChart),
  linebalance: entry(LineBalance),
  epicurve: entry(EpiCurve),
  pareto: entry(Pareto),
  populationpyramid: entry(PopulationPyramid),
  parallelcoordinates: entry(ParallelCoordinates),
  scatterplotmatrix: entry(ScatterplotMatrix),
  pictogramchart: entry(PictogramChart),
  hrdiagram: entry(HrDiagram),
  ternaryplot: entry(TernaryPlot),
  parliamentseats: entry(ParliamentSeats),
};
