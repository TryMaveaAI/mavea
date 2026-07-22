import { entry, type BlockRegistry } from '../registry-types';
import { Forecast } from './Forecast';
import { WeatherNow } from './WeatherNow';
import { TierList } from './TierList';
import { PayStub } from './PayStub';
import { TaxBracket } from './TaxBracket';
import { MenuCard } from './MenuCard';
import { FamilyTree } from './FamilyTree';
import { SeatingChart } from './SeatingChart';
import { RelationshipMap } from './RelationshipMap';
import { MeetingNotes } from './MeetingNotes';
import { StickerChart } from './StickerChart';
import { Agenda } from './Agenda';
import { Picks } from './Picks';
import { Amortization } from './Amortization';
import { TimeZones } from './TimeZones';
import { TransitRoute } from './TransitRoute';
import { Receipt } from './Receipt';
import { SettleUp } from './SettleUp';
import { BracketBar } from './BracketBar';
import { RecipeCard } from './RecipeCard';
import { WorkoutPlan } from './WorkoutPlan';
import { MedicationSchedule } from './MedicationSchedule';
import { MacroBreakdown } from './MacroBreakdown';
import { PlanGrid } from './PlanGrid';
import { BudgetAllocator } from './BudgetAllocator';
import { HowToSteps } from './HowToSteps';
import { LiveCompute } from './LiveCompute';
import { Countdown } from './Countdown';
import { LiveScore } from './LiveScore';
import { AllocatePeople } from './AllocatePeople';
import { NutritionLabel } from './NutritionLabel';
import { UnitConvert } from './UnitConvert';
import { PackList } from './PackList';
import { PregnancyWeek } from './PregnancyWeek';
import { CycleTrack } from './CycleTrack';
import { ContractionTimer } from './ContractionTimer';
import { PrayerTimes } from './PrayerTimes';
import { LabProtocol } from './LabProtocol';
import { CaregiverCoord } from './CaregiverCoord';
import { ReadingList } from './ReadingList';
import { CocktailCard } from './CocktailCard';
import { RunningLog } from './RunningLog';
import { UserPersona } from './UserPersona';
import { RunOfShow } from './RunOfShow';
import { PodcastPlanner } from './PodcastPlanner';
import { VaxSchedule } from './VaxSchedule';
import { ClaimAgeCompare } from './ClaimAgeCompare';
import { StatBlock } from './StatBlock';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

export const everydayRegistry: BlockRegistry = {
  forecast: entry(Forecast),
  weathernow: entry(WeatherNow),
  tierlist: entry(TierList),
  paystub: entry(PayStub),
  taxbracket: entry(TaxBracket),
  menucard: entry(MenuCard),
  familytree: entry(FamilyTree),
  seatingchart: entry(SeatingChart),
  relationshipmap: entry(RelationshipMap),
  meetingnotes: entry(MeetingNotes),
  stickerchart: entry(StickerChart),
  agenda: entry(Agenda),
  picks: entry(Picks),
  timezones: entry(TimeZones),
  transitroute: entry(TransitRoute),
  amortization: entry(Amortization),
  receipt: entry(Receipt),
  settleup: entry(SettleUp),
  bracketbar: entry(BracketBar),
  recipecard: entry(RecipeCard),
  workoutplan: entry(WorkoutPlan),
  medicationschedule: entry(MedicationSchedule),
  macrobreakdown: entry(MacroBreakdown),
  plangrid: entry(PlanGrid),
  budgetallocator: entry(BudgetAllocator),
  howtosteps: entry(HowToSteps),
  livecompute: entry(LiveCompute),
  countdown: entry(Countdown),
  livescore: entry(LiveScore),
  allocatepeople: entry(AllocatePeople),
  nutritionlabel: entry(NutritionLabel),
  unitconvert: entry(UnitConvert),
  packlist: entry(PackList),
  pregnancyweek: entry(PregnancyWeek),
  cycletrack: entry(CycleTrack),
  contractiontimer: entry(ContractionTimer),
  prayertimes: entry(PrayerTimes),
  labprotocol: entry(LabProtocol),
  caregivercoord: entry(CaregiverCoord),
  readinglist: entry(ReadingList),
  cocktailcard: entry(CocktailCard),
  runninglog: entry(RunningLog),
  userpersona: entry(UserPersona),
  runofshow: entry(RunOfShow),
  podcastplanner: entry(PodcastPlanner),
  vaxschedule: entry(VaxSchedule),
  claimagecompare: entry(ClaimAgeCompare),
  statblock: entry(StatBlock),
};
