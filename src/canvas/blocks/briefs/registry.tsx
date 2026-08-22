import { entry, type BlockRegistry } from '../registry-types';
import { ApprovalFlow } from './ApprovalFlow';
import { AssumptionLedger } from './AssumptionLedger';
import { CareInstructions } from './CareInstructions';
import { ClauseCompare } from './ClauseCompare';
import { ContactDirectory } from './ContactDirectory';
import { CoverageCheck } from './CoverageCheck';
import { DecisionRecord } from './DecisionRecord';
import { ExperimentPlan } from './ExperimentPlan';
import { IncidentBrief } from './IncidentBrief';
import { MaintenancePlan } from './MaintenancePlan';
import { NegotiationPlan } from './NegotiationPlan';
import { OfferBreakdown } from './OfferBreakdown';
import { RequirementBoard } from './RequirementBoard';
import { ResourcePlan } from './ResourcePlan';
import { ServiceBlueprint } from './ServiceBlueprint';
import { StakeholderMap } from './StakeholderMap';
import { TripBudget } from './TripBudget';
import './styles.css';

export const briefsRegistry: BlockRegistry = {
  decisionrecord: entry(DecisionRecord),
  assumptionledger: entry(AssumptionLedger),
  requirementboard: entry(RequirementBoard),
  experimentplan: entry(ExperimentPlan),
  negotiationplan: entry(NegotiationPlan),
  stakeholdermap: entry(StakeholderMap),
  serviceblueprint: entry(ServiceBlueprint),
  approvalflow: entry(ApprovalFlow),
  resourceplan: entry(ResourcePlan),
  maintenanceplan: entry(MaintenancePlan),
  contactdirectory: entry(ContactDirectory),
  tripbudget: entry(TripBudget),
  careinstructions: entry(CareInstructions),
  clausecompare: entry(ClauseCompare),
  incidentbrief: entry(IncidentBrief),
  coveragecheck: entry(CoverageCheck),
  offerbreakdown: entry(OfferBreakdown),
};
