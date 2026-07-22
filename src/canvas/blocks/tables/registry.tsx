import { entry, type BlockRegistry } from '../registry-types';
import { DataTable } from './DataTable';
import { Pivot } from './Pivot';
import { Leaderboard } from './Leaderboard';
import { TreeTable } from './TreeTable';
import { Swimlane } from './Swimlane';
import { FootnoteTable } from './FootnoteTable';
import { SparkTable } from './SparkTable';
import { SmallMultiples } from './SmallMultiples';
import { CompareBars } from './CompareBars';
import { CompareMatrix } from './CompareMatrix';
import { MatrixGrid } from './MatrixGrid';
import { Matrix } from './Matrix';
import { SensitivityTable } from './SensitivityTable';
import { LabPanel } from './LabPanel';
import { IngredientMatrix } from './IngredientMatrix';
import { ConjugationTable } from './ConjugationTable';
import { ClearanceMatrix } from './ClearanceMatrix';
import { FinancialStatement } from './FinancialStatement';
import { CohortGrid } from './CohortGrid';
import { RiskMatrix } from './RiskMatrix';
import { CarePlan } from './CarePlan';
import { DoseLadder } from './DoseLadder';
import { SizeChart } from './SizeChart';
import { PricingTable } from './PricingTable';
import { Raci } from './Raci';
import { Rubric } from './Rubric';
import { InterviewScorecard } from './InterviewScorecard';
import { Gradebook } from './Gradebook';
import { DataDictionary } from './DataDictionary';
import { AblationTable } from './AblationTable';
import { SpectrumTable } from './SpectrumTable';
import { FmeaTable } from './FmeaTable';
import { BillOfMaterials } from './BillOfMaterials';
import { ComplexitySummary } from './ComplexitySummary';
import { ExpressionHeatmap } from './ExpressionHeatmap';
import { DiscoveryTracker } from './DiscoveryTracker';
import { DentalTreatmentPlan } from './DentalTreatmentPlan';
import { RollCall } from './RollCall';
import { CollectionTracker } from './CollectionTracker';
import { Cma } from './Cma';
import { TaxReturnSummary } from './TaxReturnSummary';
import { DepreciationSchedule } from './DepreciationSchedule';
import { VendorTracker } from './VendorTracker';
import { SponsorshipTracker } from './SponsorshipTracker';
import { Caseload } from './Caseload';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** tables family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const tablesRegistry: BlockRegistry = {
  matrix: entry(Matrix),
  datatable: entry(DataTable),
  pivot: entry(Pivot),
  leaderboard: entry(Leaderboard),
  treetable: entry(TreeTable),
  swimlane: entry(Swimlane),
  footnotetable: entry(FootnoteTable),
  sparktable: entry(SparkTable),
  smallmultiples: entry(SmallMultiples),
  comparebars: entry(CompareBars),
  comparematrix: entry(CompareMatrix),
  matrixgrid: entry(MatrixGrid),
  sensitivitytable: entry(SensitivityTable),
  labpanel: entry(LabPanel),
  ingredientmatrix: entry(IngredientMatrix),
  conjugation: entry(ConjugationTable),
  clearancematrix: entry(ClearanceMatrix),
  financialstatement: entry(FinancialStatement),
  cohortgrid: entry(CohortGrid),
  riskmatrix: entry(RiskMatrix),
  careplan: entry(CarePlan),
  doseladder: entry(DoseLadder),
  sizechart: entry(SizeChart),
  pricingtable: entry(PricingTable),
  raci: entry(Raci),
  rubric: entry(Rubric),
  interviewscorecard: entry(InterviewScorecard),
  gradebook: entry(Gradebook),
  datadictionary: entry(DataDictionary),
  ablationtable: entry(AblationTable),
  spectrumtable: entry(SpectrumTable),
  fmeatable: entry(FmeaTable),
  billofmaterials: entry(BillOfMaterials),
  complexitysummary: entry(ComplexitySummary),
  expressionheatmap: entry(ExpressionHeatmap),
  discoverytracker: entry(DiscoveryTracker),
  dentaltreatmentplan: entry(DentalTreatmentPlan),
  rollcall: entry(RollCall),
  collectiontracker: entry(CollectionTracker),
  cma: entry(Cma),
  taxreturnsummary: entry(TaxReturnSummary),
  depreciationschedule: entry(DepreciationSchedule),
  vendortracker: entry(VendorTracker),
  sponsorshiptracker: entry(SponsorshipTracker),
  caseload: entry(Caseload),
};
