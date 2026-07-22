import { entry, type BlockRegistry } from '../registry-types';
import { KanbanBoard } from './KanbanBoard';
import { WizardStepper } from './WizardStepper';
import { DecisionTree } from './DecisionTree';
import { GoalTree } from './GoalTree';
import { PlanDag } from './PlanDag';
import { MilestoneTrack } from './MilestoneTrack';
import { ProcessFlow } from './ProcessFlow';
import { JourneyMap } from './JourneyMap';
import { OrgChart } from './OrgChart';
import { Roadmap } from './Roadmap';
import { ChronologicalTimeline } from './ChronologicalTimeline';
import { TrustMap } from './TrustMap';
import { SkillTree } from './SkillTree';
import { HeadcountPlan } from './HeadcountPlan';
import { IssueTree } from './IssueTree';
import { LogicModel } from './LogicModel';
import { ContentCalendar } from './ContentCalendar';
import { BusinessCanvas } from './BusinessCanvas';
import type { ChronologicalTimelineProps, WizardStepperProps } from './types';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** flows family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const flowsRegistry: BlockRegistry = {
  kanban: entry(KanbanBoard),
  // wizard walks itself through its steps while the tour spotlights it → needs `spotlight`.
  wizard: (p, c) => (
    <WizardStepper {...(p as WizardStepperProps)} delay={c.delay} spotlight={c.spotlight} />
  ),
  decisiontree: entry(DecisionTree),
  goaltree: entry(GoalTree),
  plandag: entry(PlanDag),
  milestones: entry(MilestoneTrack),
  processflow: entry(ProcessFlow),
  journeymap: entry(JourneyMap),
  orgchart: entry(OrgChart),
  roadmap: entry(Roadmap),
  chronologicaltimeline: (p, c) => (
    <ChronologicalTimeline {...(p as ChronologicalTimelineProps)} delay={c.delay} />
  ),
  trustmap: entry(TrustMap),
  skilltree: entry(SkillTree),
  headcountplan: entry(HeadcountPlan),
  issuetree: entry(IssueTree),
  logicmodel: entry(LogicModel),
  contentcalendar: entry(ContentCalendar),
  businesscanvas: entry(BusinessCanvas),
};
