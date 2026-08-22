import type { AccentVar, BlockBase, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../types/mavea';

export type BriefStatus = 'done' | 'active' | 'pending' | 'blocked' | 'unknown';
export type BriefConfidence = 'high' | 'medium' | 'low' | 'untested';

interface BriefBaseProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  footer?: HtmlString;
}

export interface DecisionRecordProps extends BriefBaseProps {
  decision: string;
  rationale: string[];
  status?: 'proposed' | 'decided' | 'revisiting';
  owner?: string;
  decidedAt?: string;
  revisitWhen?: string;
}

export interface AssumptionLedgerProps extends BriefBaseProps {
  assumptions: {
    assumption: string;
    evidence?: string;
    confidence?: BriefConfidence;
    test?: string;
    status?: BriefStatus;
  }[];
}

export interface RequirementBoardProps extends BriefBaseProps {
  groups: {
    priority: 'must' | 'should' | 'could' | 'wont';
    label?: string;
    items: { requirement: string; acceptance?: string; owner?: string; status?: BriefStatus }[];
  }[];
}

export interface ExperimentPlanProps extends BriefBaseProps {
  hypothesis: string;
  variables: { name: string; role: 'input' | 'outcome' | 'control'; level?: string }[];
  steps: string[];
  measures?: string[];
  guardrail?: string;
}

export interface NegotiationPlanProps extends BriefBaseProps {
  goal: string;
  walkAway: string;
  levers: { label: string; value?: string; priority?: 'high' | 'medium' | 'low' }[];
  concessions?: string[];
  guardrails?: string[];
}

export interface StakeholderMapProps extends BriefBaseProps {
  stakeholders: {
    name: string;
    role?: string;
    influence: 'high' | 'low';
    interest: 'high' | 'low';
    strategy?: string;
  }[];
}

export interface ServiceBlueprintProps extends BriefBaseProps {
  stages: {
    stage: string;
    customer?: string;
    frontstage?: string;
    backstage?: string;
    support?: string;
  }[];
  evidence?: string[];
}

export interface ApprovalFlowProps extends BriefBaseProps {
  request: string;
  status?: BriefStatus;
  due?: string;
  approvers: {
    name: string;
    role?: string;
    status: BriefStatus;
    decidedAt?: string;
    note?: string;
  }[];
}

export interface ResourcePlanProps extends BriefBaseProps {
  period?: string;
  resources: {
    name: string;
    capacity?: string;
    demand?: string;
    gap?: string;
    owner?: string;
    status?: BriefStatus;
  }[];
}

export interface MaintenancePlanProps extends BriefBaseProps {
  assets: {
    asset: string;
    tasks: {
      task: string;
      interval?: string;
      lastDone?: string;
      nextDue?: string;
      owner?: string;
      status?: BriefStatus;
    }[];
  }[];
}

export interface ContactDirectoryProps extends BriefBaseProps {
  entries: {
    name: string;
    role?: string;
    organization?: string;
    methods: { label: string; value: string }[];
    availability?: string;
    note?: string;
  }[];
  privacyNote?: string;
}

export interface TripBudgetProps extends BriefBaseProps {
  trip?: string;
  currency?: string;
  lines: { category: string; planned: string; actual?: string; note?: string }[];
  plannedTotal?: string;
  actualTotal?: string;
}

export interface CareInstructionsProps extends BriefBaseProps {
  subject?: string;
  do: string[];
  avoid?: string[];
  warningSigns?: string[];
  followUp?: string;
  source?: string;
}

export interface ClauseCompareProps extends BriefBaseProps {
  left: { label: string; text: string };
  right: { label: string; text: string };
  differences: { topic: string; change: string; risk?: 'low' | 'medium' | 'high' }[];
  jurisdiction?: string;
}

export interface IncidentBriefProps extends BriefBaseProps {
  impact: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status?: BriefStatus;
  timeline: { time: string; event: string; status?: BriefStatus }[];
  owners?: string[];
  actions?: string[];
  nextUpdate?: string;
}

export interface CoverageCheckProps extends BriefBaseProps {
  policy?: string;
  asOf?: string;
  rows: {
    item: string;
    status: 'covered' | 'conditional' | 'excluded' | 'unknown';
    limit?: string;
    evidence?: string;
  }[];
}

export interface OfferBreakdownProps extends BriefBaseProps {
  employer?: string;
  role?: string;
  parts: {
    label: string;
    value: string;
    kind?: 'base' | 'bonus' | 'equity' | 'benefit' | 'one-time' | 'other';
    note?: string;
  }[];
  estimatedTotal?: string;
  assumptions?: string[];
}

export type BriefsBlock =
  | (BlockBase & { type: 'decisionrecord'; props: DecisionRecordProps })
  | (BlockBase & { type: 'assumptionledger'; props: AssumptionLedgerProps })
  | (BlockBase & { type: 'requirementboard'; props: RequirementBoardProps })
  | (BlockBase & { type: 'experimentplan'; props: ExperimentPlanProps })
  | (BlockBase & { type: 'negotiationplan'; props: NegotiationPlanProps })
  | (BlockBase & { type: 'stakeholdermap'; props: StakeholderMapProps })
  | (BlockBase & { type: 'serviceblueprint'; props: ServiceBlueprintProps })
  | (BlockBase & { type: 'approvalflow'; props: ApprovalFlowProps })
  | (BlockBase & { type: 'resourceplan'; props: ResourcePlanProps })
  | (BlockBase & { type: 'maintenanceplan'; props: MaintenancePlanProps })
  | (BlockBase & { type: 'contactdirectory'; props: ContactDirectoryProps })
  | (BlockBase & { type: 'tripbudget'; props: TripBudgetProps })
  | (BlockBase & { type: 'careinstructions'; props: CareInstructionsProps })
  | (BlockBase & { type: 'clausecompare'; props: ClauseCompareProps })
  | (BlockBase & { type: 'incidentbrief'; props: IncidentBriefProps })
  | (BlockBase & { type: 'coveragecheck'; props: CoverageCheckProps })
  | (BlockBase & { type: 'offerbreakdown'; props: OfferBreakdownProps });
