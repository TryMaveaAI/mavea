// everyday family block types — 9 life-utility blocks covering weather, scheduling,
// recommendations, travel, finance, and group expenses. Prop shapes reflect real-world
// data a model or user would provide; designed to work well with structured LLM output.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../types/mavea';

// forecast — weather or any multi-day/period prediction table
// Use for: "weather this week", "forecast for Paris", "5-day outlook"
export interface ForecastDay {
  label: string; // e.g. "Mon", "Tomorrow", "Dec 12"
  icon?: IconKey; // weather icon: 'sun', 'cloud', 'alert', etc.
  hi?: string; // high temp or max value
  lo?: string; // low temp or min value
  condition: string; // "Sunny", "Partly cloudy", "Rain"
  precipitation?: string; // e.g. "20%"
  wind?: string; // e.g. "12 mph NW"
}
export interface ForecastProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  location?: string; // "San Francisco, CA"
  unit?: 'F' | 'C';
  asOf?: string; // REQUIRED when real data: "as of Dec 9, 2024 9 AM"
  days: ForecastDay[];
  summary?: string; // brief overall outlook prose
  footer?: HtmlString;
}

// agenda — a schedule/itinerary list (daily, meeting, event program)
// Use for: "my schedule tomorrow", "conference agenda", "meeting plan"
export interface AgendaItem {
  time?: string; // e.g. "9:00 AM", "09:00", "All day"
  duration?: string; // e.g. "1h", "30 min"
  title: string;
  location?: string;
  note?: string;
  done?: boolean; // for past items in a recap
}
export interface AgendaProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  date?: string; // e.g. "Monday, Dec 9"
  items: AgendaItem[];
  footer?: HtmlString;
}

// picks — a curated recommendation list (products, movies, books, places, anything)
// Use for: "recommend a laptop", "best coffee shops nearby", "top 5 books"
export interface PickItem {
  name: string;
  tagline?: string; // one-line description
  why?: string; // why it's recommended
  price?: string; // "$49", "Free", "$$"
  rating?: string; // "4.8/5", "★★★★½"
  badge?: string; // "Best overall", "Budget pick", "Editor's choice"
}
export interface PicksProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  category?: string; // e.g. "Laptops under $1000"
  items: PickItem[];
  footer?: HtmlString;
}

// timezones — world-clock comparison card
export interface TimezoneRow {
  city: string;
  timezone: string; // e.g. "America/New_York"
  offset: string; // e.g. "UTC-5" or "+9:00"
  localTime?: string; // formatted local time string
  isHome?: boolean; // mark the user's home timezone
}
export interface TimezonesProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  baseTime?: string; // the reference time being compared, e.g. "3:00 PM EST"
  rows: TimezoneRow[];
  footer?: HtmlString;
}

// transitroute — public transit or driving directions (step-by-step route)
export interface TransitStep {
  mode: 'walk' | 'bus' | 'subway' | 'train' | 'bike' | 'car' | 'ferry';
  instruction: string;
  duration?: string; // "8 min"
  distance?: string; // "0.4 mi"
  line?: string; // "Line 1", "Bus 47"
  from?: string;
  to?: string;
}
export interface TransitRouteProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  origin: string;
  destination: string;
  totalTime?: string; // "42 min"
  totalDistance?: string;
  steps: TransitStep[];
  footer?: HtmlString;
}

// amortization — loan/mortgage payment breakdown table
export interface AmortRow {
  period: string; // "Month 1", "Year 1", etc.
  payment: string; // formatted payment amount
  principal: string;
  interest: string;
  balance: string;
}
export interface AmortizationProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  principal: string; // e.g. "$300,000"
  rate: string; // e.g. "6.5% APR"
  term: string; // e.g. "30 years"
  monthlyPayment: string; // computed and shown prominently
  rows: AmortRow[]; // yearly or monthly schedule (model provides real numbers)
  footer?: HtmlString;
}

// receipt — itemized purchase receipt
export interface ReceiptLine {
  item: string;
  qty?: string;
  unit?: string; // unit price
  total: string; // line total
}
export interface ReceiptProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  merchant?: string;
  date?: string;
  lines: ReceiptLine[];
  subtotal?: string;
  tax?: string;
  total: string;
  footer?: HtmlString;
}

// settleup — group expense split (who owes who what)
export interface ExpenseItem {
  description: string;
  amount: string;
  paidBy: string;
}
export interface Settlement {
  from: string;
  to: string;
  amount: string;
}
export interface SettleUpProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  people?: string[];
  expenses?: ExpenseItem[];
  settlements: Settlement[];
  footer?: HtmlString;
}

// bracketbar — ranked/scored comparison bars (like a stacked bar race)
export interface BracketEntry {
  label: string;
  value: number;
  bar?: string; // formatted display value
  badge?: string; // rank/placement label
}
export interface BracketBarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  metric?: string; // what's being measured
  items: BracketEntry[];
  footer?: HtmlString;
}

// recipecard — cooking recipe with ingredients + numbered steps
// Use for: "how do I make carbonara", "recipe for banana bread", "3-ingredient pasta"
export interface RecipeIngredient {
  qty?: string; // "2", "¼ cup", "a pinch"
  unit?: string; // "cups", "tbsp" (omit if already in qty)
  name: string;
}
export interface RecipeCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  servings?: string; // "4 servings"
  prepTime?: string; // "15 min"
  cookTime?: string; // "30 min"
  difficulty?: 'easy' | 'medium' | 'hard';
  ingredients: RecipeIngredient[];
  steps: string[];
  tips?: string[]; // pro tips shown as a collapsed footer section
  footer?: HtmlString;
}

// workoutplan — structured exercise session with sets, reps, and rest periods
// Use for: "design a chest workout", "5-day PPL plan", "beginner gym routine"
export interface Exercise {
  name: string;
  sets?: number;
  reps?: string; // "10–12", "to failure", "30 sec"
  duration?: string; // for timed exercises: "3 min", "45 sec"
  rest?: string; // "60 sec", "90 sec"
  note?: string; // "keep back flat", "go slow on eccentric"
}
export interface WorkoutSession {
  day: string; // "Day 1", "Monday", "Push"
  focus?: string; // "Chest & Triceps"
  exercises: Exercise[];
}
export interface WorkoutPlanProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  goal?: string; // "Hypertrophy", "Fat loss", "Strength"
  weeks?: number; // plan duration; omit for single sessions
  sessions: WorkoutSession[];
  footer?: HtmlString;
}

// medicationschedule — medication tracker with dosing times and instructions
// Use for: "my blood pressure meds", "daily vitamin schedule", "post-surgery medications"
export interface Medication {
  name: string;
  dose: string; // "10 mg", "500 mg", "1 tablet"
  frequency?: string; // "once daily", "twice a day", "as needed"
  times: string[]; // ["8:00 AM", "8:00 PM"] — when to take
  withFood?: boolean;
  notes?: string; // "avoid grapefruit", "take with full glass of water"
}
export interface MedicationScheduleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  medications: Medication[];
  startDate?: string; // "June 13, 2026"
  footer?: HtmlString;
}

// macrobreakdown — nutrition macros (protein / carbs / fat / calories)
// Use for: "macros in a chicken caesar salad", "keto diet macro split", "protein intake for my goals"
export interface MacroItem {
  label: string; // "Chicken breast", "Olive oil"
  calories?: number;
  protein?: number; // grams
  carbs?: number;
  fat?: number;
}
export interface MacroBreakdownProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  calories: number; // total
  protein: number; // grams
  carbs: number;
  fat: number;
  fiber?: number;
  items?: MacroItem[]; // per-ingredient or per-meal breakdown
  footer?: HtmlString;
}

// plangrid — a forward days×slots planning grid (meal plan, study schedule, habit tracker, routine)
// Use for: "plan my week", "meal plan for the week", "study schedule", "weekly workout split" —
// a forward-looking matrix, distinct from agenda (one day) and calheat (backward streaks).
export interface PlanCell {
  col: string; // which column this belongs to — must match a `columns` entry (matched case-insensitively)
  label?: string; // the entry, e.g. "Oatmeal", "Algebra", "Long run"; omit the cell for a free slot
  sub?: string; // secondary line, e.g. "320 kcal", "45 min"
  accent?: AccentVar; // optional tint, e.g. 'var(--presence)'
  done?: boolean; // mark a completed cell (trackers / recaps)
}
export interface PlanRow {
  slot: string; // row label: "Breakfast", "Morning", "9 AM"
  cells: PlanCell[]; // entries for this slot; each names its column. Omit a column for a free slot.
}
export interface PlanGridProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  columns: string[]; // grid columns, e.g. ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  rows: PlanRow[]; // one per slot; cells align to columns by name
  summary?: string[]; // optional footer row aligned to columns (e.g. daily totals)
  caption?: string; // optional one-line caption above the grid
  footer?: HtmlString;
}

// budgetallocator — a FORWARD, zero-based / envelope budget: assign a pot across categories with a
// live "left to allocate" meter. Distinct from breakdown/donut/stack, which split a PAST total.
// Use for: "build me a budget", "allocate my paycheck", "zero-based budget", "split my income".
export interface BudgetEnvelope {
  label: string; // "Rent", "Groceries", "Savings"
  amount: number; // amount assigned (same unit as income)
  group?: 'fixed' | 'flexible' | 'savings'; // category bucket (tints the row)
  accent?: AccentVar; // optional explicit tint (overrides group)
  note?: string; // e.g. "incl. utilities", "auto-transfer"
}
export interface BudgetAllocatorProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  income: number; // the pot to allocate (money in)
  unit?: string; // currency prefix, default '$'
  incomeLabel?: string; // default "Money in"
  envelopes: BudgetEnvelope[];
  caption?: string;
  footer?: HtmlString;
}

// howtosteps — a hands-on procedure / practical how-to (repairs, setup, DIY, device walkthroughs).
// Distinct from recipecard (cooking) and processflow (abstract process diagrams).
// Use for: "how do I unclog a drain", "set up my new router", "change a tire", "fix a running toilet".
export interface HowToStep {
  action: string; // the step instruction (imperative), e.g. "Turn off the water at the shutoff valve"
  detail?: string; // optional extra detail
  caution?: string; // a warning for this step
  tip?: string; // a pro tip for this step
  check?: string; // how to know the step worked, e.g. "the tank stops refilling"
}
export interface HowToStepsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  time?: string; // "20 min"
  difficulty?: 'easy' | 'medium' | 'hard';
  warning?: string; // a prominent top safety banner, e.g. "Switch off the power at the breaker first"
  tools?: string[]; // tools / materials needed (pinned above the steps)
  steps: HowToStep[];
  footer?: HtmlString;
}

// livecompute — a stateful what-if: drag the levers, watch one honest projected number update live.
// Use for: "what would my mortgage payment be", "how long does our runway last", "calories for my
// goal", "price → revenue". The output is a transparent arithmetic formula over the inputs.
export interface ComputeInput {
  key: string; // variable name referenced by `formula` (letters/digits/underscore, no spaces)
  label: string;
  min: number;
  max: number;
  value: number; // initial slider position
  step?: number;
  prefix?: string; // e.g. "$"
  unit?: string; // suffix, e.g. "%", "yrs"
}
export interface ComputeOutput {
  label: string;
  prefix?: string;
  unit?: string;
  decimals?: number;
}
export interface LiveComputeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  inputs: ComputeInput[]; // 1–4 levers
  formula: string; // arithmetic over the input keys: + - * / ^ ( ) — evaluated safely, no functions
  output: ComputeOutput;
  caveat?: string; // honest "estimate — excludes X"
  footer?: HtmlString;
}

// countdown — a live ticking countdown to a REAL deadline, with what's due and the consequence.
export interface CountdownProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  target: string; // a real date/time (ISO preferred, or any Date-parseable string)
  label?: string; // what the deadline is, e.g. "Applications close"
  dueWhat?: string; // what must be done
  consequence?: string; // what happens if it is missed
  footer?: HtmlString;
}

// livescore — an interactive scorekeeper: tap to adjust each side's points and the ranking recomputes.
export interface ScoreEntry {
  name: string;
  score: number; // starting score
  color?: AccentVar;
}
export interface LiveScoreProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  entries: ScoreEntry[];
  unit?: string; // e.g. "pts"
  step?: number; // points added/removed per tap (default 1)
  footer?: HtmlString;
}

// allocatepeople — divide tasks/load FAIRLY among NAMED people (not workflow stages). One column
// per person with their assigned tasks and a load bar scaled to the busiest person, so an uneven
// split is obvious at a glance. Use for: "split the chores fairly between Sam and Alex", roommate
// rotas, group-project work division, on-call duty splits. Distinct from settleup (money owed) and
// plangrid (a days×slots schedule).
export interface AllocateAssignment {
  task: string; // the task / chore / duty, e.g. "Take out the trash"
  who: string; // a person — should match one of `people` (a typo still gets its own column)
  weight?: number; // effort/load this task carries, 1 (light) to 5 (heavy); defaults to 1
}
export interface AllocatePeopleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  people: string[]; // the named people sharing the load, in display order
  assignments: AllocateAssignment[]; // each task and who owns it
  footer?: HtmlString;
}

// nutritionlabel — a faithful FDA-style Nutrition Facts panel. The figures come straight from the
// props (serving size, calorie count, each nutrient amount + %DV); the bold rules, box, and column
// alignment are just the recognizable scaffolding. Distinct from macrobreakdown (a macro split bar).
// Use for: "nutrition facts for X", "read this food label", "how much sodium is in Y".
export interface NutritionNutrient {
  name: string; // "Total Fat", "Dietary Fiber", "Sodium", "Protein"
  amount: string; // the printed amount, e.g. "8g", "230mg", "0%"
  dv?: number; // percent Daily Value (0–100+), right-aligned; omit where the label prints none
  indent?: boolean; // a sub-nutrient under its parent (Saturated Fat under Total Fat)
  bold?: boolean; // a major nutrient line printed in bold on a real label
}
export interface NutritionLabelProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  servingSize: string; // "1 cup (55g)"
  servings?: string; // servings per container, e.g. "about 8"
  calories: number; // calories per serving (the big number)
  nutrients: NutritionNutrient[]; // the rows, parents then their indented children, in label order
  allergens?: string[]; // "Contains: wheat, milk"
  caption?: string; // optional one-line caption above the panel
  footer?: HtmlString;
}

// unitconvert — a measurement-conversion panel: one from-amount and the equivalents it equals across
// units. The equivalents are given (real conversions), shown aligned so "1 cup = 240 ml = 16 tbsp"
// reads at a glance, tagged by category (volume / weight / length / temp).
// Use for: "how many ml in a cup", "convert 2 lb to kg", "tablespoons in a cup".
export interface UnitEquivalent {
  unit: string; // "ml", "tbsp", "fl oz"
  value: string; // the equivalent amount, e.g. "240", "16"
}
export interface UnitConvertProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  quantity: number; // the from-amount (shown prominently)
  from: string; // the from-unit, e.g. "cup"
  equivalents: UnitEquivalent[]; // what that amount equals in other units
  category?: string; // "volume" | "weight" | "length" | "temperature"
  caption?: string;
  footer?: HtmlString;
}

// packlist — a category-grouped packing checklist with counted items and a packed-vs-total meter per
// group and overall. The meters are computed from the items' packed flags; the trip context (duration,
// weather) heads the card. Use for: "what to pack for a 3-day trip", "packing list for the beach".
export interface PackItem {
  label: string; // "T-shirt", "Toothbrush", "Phone charger"
  count?: number; // how many to bring, e.g. 3 → "3×"
  packed?: boolean; // ticked off
}
export interface PackGroup {
  name: string; // "Clothes", "Toiletries", "Tech"
  items: PackItem[];
}
export interface PackListProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  context?: string; // trip context header, e.g. "3 days · mild, light rain"
  groups: PackGroup[];
  caption?: string;
  footer?: HtmlString;
}

// pregnancyweek — a week-by-week pregnancy card: the week heads a trimester progress bar (week/40), a
// to-scale fruit-size comparison, the baby's length/weight, and milestone bullets. The progress and
// the comparison scale are computed from `week`; everything plotted comes from the props.
// Use for: "what's happening at 20 weeks", "pregnancy week 12", "how big is the baby now".
export interface PregnancyWeekProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  week: number; // gestational week, 1–40
  trimester?: number; // 1 | 2 | 3 (derived from week when omitted)
  fruitSize?: string; // the size comparison, e.g. "banana", "pomegranate"
  lengthCm?: number; // crown-to-heel (or crown-rump early) length in cm
  weightG?: number; // estimated weight in grams
  milestones?: string[]; // what's developing this week
  caption?: string;
  footer?: HtmlString;
}

// cycletrack — a menstrual / fertility calendar band: one cell per cycle day, shading the period days,
// the fertile window, the ovulation day, and a "today" marker. Every position is computed from the day
// numbers against `cycleLength`. Use for: "track my cycle", "when am I most fertile", "period calendar".
export interface CycleTrackProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cycleLength: number; // total days in the cycle, e.g. 28
  periodDays: number; // number of period days from day 1
  currentDay?: number; // today's day-of-cycle (1-based) → the "today" marker
  fertileWindow?: [number, number]; // [start, end] day numbers of the fertile window
  ovulationDay?: number; // the estimated ovulation day number
  caption?: string;
  footer?: HtmlString;
}

// contractiontimer — a labor-contraction interval strip (a display of LOGGED contractions, not a live
// timer): each contraction is a bar sized by its duration and spaced by the interval to the next, with
// duration / frequency read-outs and a "time to go in" rule hint (e.g. 5-1-1). All read from the log.
// Use for: "track my contractions", "are these contractions 5-1-1 yet", "labor timing".
export interface Contraction {
  start: string; // wall-clock start, e.g. "2:14 PM" (shown as the label)
  durationSec: number; // how long the contraction lasted, in seconds
  intervalMin?: number; // minutes from the START of this one to the START of the next
}
export interface ContractionTimerProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  contractions: Contraction[]; // recent contractions, oldest → newest
  rule?: string; // the go-in rule of thumb, e.g. "5-1-1"
  caption?: string;
  footer?: HtmlString;
}

// prayertimes — a daily devotional-times card: the named time slots (five salah / sunrise–sunset /
// liturgical hours / candle-lighting) plotted along a dawn→dusk sun-arc day strip, with the next
// one highlighted and a countdown-style read on it. Every slot's position on the arc is computed
// from its clock time against the span of the day; the arc is scaffolding, the times come from props.
// Use for: "today's prayer times", "salah schedule", "sunrise and sunset", "today's liturgy of the hours".
export interface PrayerSlot {
  name: string; // the slot's name, e.g. "Fajr", "Sunrise", "Vespers", "Candle lighting"
  time: string; // a clock time: "5:42 AM", "17:03", "noon" — parsed to a position on the day arc
}
export interface PrayerTimesProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  date?: string; // e.g. "Friday, June 20"
  location?: string; // "Istanbul, Turkey"
  slots: PrayerSlot[]; // the named times of the day, in order
  next?: string; // the name of the upcoming slot to highlight (matched case-insensitively)
  sunArc?: boolean; // draw the sun-arc day strip (default true); false → a plain time list
  caption?: string; // optional one-line caption above the strip
  footer?: HtmlString;
}

// weathernow — present-moment conditions: one big reading, an hourly strip, and a row of
// small stat tiles (UV, air quality, wind…). Distinct from forecast (a multi-day/period
// prediction grid) — this is what it's doing RIGHT NOW. asOf is required: a "live" reading
// is only honest with a timestamp attached, never invented to feel fresher than it is.
// Use for: "what's the weather right now", "current conditions in Austin", "is it raining".
export interface WeatherHour {
  time: string; // e.g. "3 PM", "Now", "6:00"
  tempF: number;
  icon?: IconKey; // weather icon; falls back to a condition-word guess when omitted
  precipPct?: number; // chance of precipitation, 0-100
}
export interface WeatherTile {
  label: string; // "UV Index", "Air quality", "Wind", "Humidity"
  value: string; // "6 of 10", "42 AQI", "12 mph NW", "58%"
  icon?: IconKey;
}
export interface WeatherNowProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  location?: string; // "Austin, TX"
  tempF: number;
  feelsLikeF?: number;
  condition: string; // "Partly cloudy", "Light rain"
  hi?: number; // today's high
  lo?: number; // today's low
  asOf: string; // REQUIRED — freshness timestamp, e.g. "2:14 PM"
  hourly?: WeatherHour[];
  tiles?: WeatherTile[];
  footer?: HtmlString;
}

// tierlist — an S/A/B/C ranking rail: a colored tier label per row, ranked items wrapped
// as chips beside it. Use for: "tier list of X", "rank these S to C", "best to worst".
export interface TierRow {
  tier: string; // "S", "A", "B", "C", or any label ("God tier", "Meh")
  color?: AccentVar; // tints the rail; cycles through a default palette when omitted
  items: string[]; // the ranked entries in this tier; an empty array is valid (shows "—")
}
export interface TierListProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rows: TierRow[];
  caption?: string;
  footer?: HtmlString;
}

// paystub — a payslip: Receipt's itemized-ledger shell, split into earnings and deductions
// and closed by a net-pay total. Use for: "explain my paycheck", "what got deducted",
// "breakdown of this payslip".
export interface PayLine {
  label: string; // "Regular hours", "Federal tax", "401(k)"
  amount: string; // formatted dollar amount, e.g. "$1,840.00"
}
export interface PayStubProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  employer?: string;
  payPeriod: string; // "Jun 1 – Jun 15, 2026"
  payDate?: string; // "Jun 20, 2026"
  grossPay: string;
  earnings: PayLine[];
  deductions: PayLine[];
  netPay: string;
  ytdNet?: string; // year-to-date net pay
  footer?: HtmlString;
}

// taxbracket — a progressive income-tax bracket visualization: a stacked band bar sized to
// each bracket's real dollar span, a needle marking where the given income lands, and an
// effective-vs-marginal rate readout. Bands are the source of truth for both rates — real
// arithmetic over the given numbers, never a separately-invented figure. Use for: "what tax
// bracket am I in", "explain my marginal rate", "how do progressive tax brackets work".
export interface TaxBand {
  min: number; // bracket floor, in dollars
  max?: number; // bracket ceiling; omit for the open-ended top bracket
  rate: number; // this band's rate as a percent, e.g. 22 for 22% (not a 0-1 fraction)
}
export interface TaxBracketProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  bands: TaxBand[];
  income: number;
  filingStatus?: string; // "Single", "Married filing jointly"
  effectiveRate?: number; // percent; computed from bands when omitted
  marginalRate?: number; // percent; computed from bands when omitted
  currency?: string; // prefix, default '$'
  footer?: HtmlString;
}

// menucard — a restaurant or event menu grouped into named sections, each item priced with a
// dotted leader and tagged with dietary chips. Use for: "make a menu for X", "dinner party
// menu", "coffee shop menu board".
export interface MenuItem {
  name: string;
  price?: string; // "$14", "12"; omit for a no-charge item (draws no dotted leader)
  desc?: string; // one-line description
  tags?: string[]; // dietary/allergen tags, e.g. ["vegan","gluten-free","spicy"]
}
export interface MenuSection {
  name: string; // "Starters", "Mains", "Desserts"
  items: MenuItem[];
}
export interface MenuCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  venue?: string; // restaurant/event name
  subtitle?: string; // a tagline or occasion, e.g. "Est. 2014", "Sarah's baby shower"
  sections: MenuSection[];
  footer?: HtmlString;
}

// familytree — a genealogy chart: name/date cards laid out by generation, connected by
// mating lines and sibship bars (the layout algorithm is ported from learn/Pedigree.tsx — see
// FamilyTree.tsx for the port notes). No photos, no sex symbols. Use for: "draw my family
// tree", "who are my grandparents", "family tree for X".
export interface FamilyPerson {
  id: string;
  name: string;
  birth?: string; // a year or date, e.g. "1952", "Mar 1952"
  death?: string; // a year or date; presence marks the person as deceased
  parents?: [string, string] | [string]; // one or two parent ids, if known
  partner?: string; // spouse/partner id, for a partnership with no shared child of record
}
export interface FamilyTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  people: FamilyPerson[];
  rootId?: string; // the person the tree is centered on; highlights their card
  footer?: HtmlString;
}

// seatingchart — an event floor plan: round or rectangular tables, auto-arranged on a grid
// when position is omitted, each seat plotted around its table and filled with the assigned
// guest's initials. Use for: "seat my wedding guests", "table plan for the gala", "who's
// sitting where".
export interface SeatingTable {
  id: string;
  label: string; // "Table 1", "Head table"
  seats: number;
  x?: number; // abstract layout position; omit on ANY table to auto-arrange the whole floor
  y?: number;
  shape?: 'round' | 'rect';
}
export interface SeatingAssignment {
  tableId: string;
  seatIndex: number; // 0-based, matched against a seat's position around its table
  guest: string;
}
export interface SeatingChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  venue?: string;
  tables: SeatingTable[];
  assignments: SeatingAssignment[];
  footer?: HtmlString;
}

// relationshipmap — a typed people graph: who's connected to whom, and how. Ports charts1/
// Network's circle/grid node-positioning algorithm; edges carry a relationship KIND styled by
// a legend below the graph instead of an unlabeled weight. Use for: "map the relationships in
// this story", "who's connected to who", "family/rivalry/alliance web".
export type TieKind = 'family' | 'ally' | 'rival' | 'romance' | 'colleague' | 'other';
export interface RelationshipPerson {
  id: string;
  name: string;
  role?: string; // "Protagonist", "CEO", "Cousin" — shown on hover
}
export interface RelationshipTie {
  source: string; // a people[].id
  target: string; // a people[].id
  kind: TieKind;
  label?: string; // optional short tie description, shown on hover
}
export interface RelationshipMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  people: RelationshipPerson[];
  ties: RelationshipTie[];
  layout?: 'circle' | 'grid';
  footer?: HtmlString;
}

// meetingnotes — a post-meeting summary: attendees, what was discussed, what got decided, and
// a checklist of action items with owners and due dates. Distinct from agenda, which is
// PRE-meeting scheduling only — this is the recap after. Use for: "summarize this meeting",
// "meeting notes for X", "what did we decide and who owns what".
export interface MeetingActionItem {
  task: string;
  owner?: string;
  dueDate?: string; // "Fri", "Jun 20"
  done?: boolean;
}
export interface MeetingNotesProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  meetingDate?: string; // "Tuesday, Jun 16"
  attendees?: string[];
  discussionPoints?: string[];
  decisions?: string[];
  actionItems: MeetingActionItem[];
  footer?: HtmlString;
}

// stickerchart — a behavior/reward chart: one row per person (or a single shared row), one
// star per earned day, and an optional progress meter toward a reward threshold. Skins
// status/HabitTracker's completion-grid pattern with a star glyph instead of a checkmark.
// Use for: "sticker chart for brushing teeth", "reward chart for the kids", "chore streak
// tracker with a reward".
export interface StickerMark {
  person?: string; // must match a `people` entry when `people` is given
  day: string; // must match a `days` entry
  earned: boolean;
}
export interface StickerChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  behavior?: string; // "Reading 20 minutes", "Making the bed"
  people?: string[]; // one row per person; omit for a single shared row
  days: string[]; // column labels, e.g. ["Mon",…,"Sun"] or day-of-month numbers
  marks: StickerMark[];
  rewardAt?: number; // total stickers needed across the whole chart to earn the reward
  footer?: HtmlString;
}

// labprotocol — a lab bench procedure / SOP: hazard-tagged reagents and equipment beside
// numbered steps, general enough for a chemistry synthesis prep AND a molecular-biology
// protocol (PCR, Western blot). An optional `cycles` block renders as a visually distinct
// repeated-step group — what makes a thermal-cycling protocol read differently from an
// ordinary linear procedure. Distinct from recipecard (cooking) and howtosteps (general DIY).
// Use for: "PCR protocol", "synthesis procedure for X", "Western blot steps", "titration SOP".
export type ReagentHazard = 'flammable' | 'corrosive' | 'toxic' | 'oxidizer' | 'irritant';
export interface ProtocolReagent {
  name: string;
  amount?: string; // "50 mL", "2.5 µL", "10 g"
  conc?: string; // "1 M", "10x buffer", "0.1% w/v"
  hazard?: ReagentHazard;
}
export interface ProtocolStep {
  text: string;
  duration?: string; // "5 min", "30 sec"
  temp?: string; // "95°C", "4°C", "room temp"
  caution?: string; // an inline safety note specific to this step
}
export interface ProtocolCycleStep {
  text: string;
  duration?: string;
  temp?: string;
}
export interface ProtocolCycles {
  repeat: number; // number of cycles, e.g. 30 for a PCR run
  steps: ProtocolCycleStep[]; // the sub-steps repeated each cycle
}
export interface LabProtocolProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  reagents?: ProtocolReagent[];
  equipment?: string[];
  steps: ProtocolStep[];
  cycles?: ProtocolCycles;
  footer?: HtmlString;
}

// caregivercoord — an eldercare / multi-person care-team coordination card: a named person's
// medications, appointments, and care-team contacts, each its own compact mini-section below
// the person header. Distinct from medicationschedule (a patient's OWN dosing view) — this is
// the coordinator's view, so a medication can name who actually administers or checks each dose.
// Use for: "coordinate mom's care", "who's handling dad's appointments", "caregiver schedule".
export interface CareMedication {
  name: string;
  times: string[]; // dosing times, e.g. ["8:00 AM", "6:00 PM"]
  takenBy?: string; // who administers/checks it, e.g. "Home aide", "Priya"
}
export interface CareAppointment {
  date: string; // "Jun 20, 2026", "Thu 2pm"
  provider: string; // "Dr. Alvarez", "Maple Physical Therapy"
  purpose: string; // "Cardiology follow-up"
}
export interface CareContact {
  name: string;
  role: string; // "Home aide", "Primary care physician", "Son (backup)"
  phone: string;
}
export interface CaregiverCoordProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  personName: string;
  relation: string; // the caregiver's relation to the person, e.g. "Mom", "Dad"
  medications?: CareMedication[];
  appointments?: CareAppointment[];
  contacts?: CareContact[];
  footer?: HtmlString;
}

// readinglist — a book-club / personal reading tracker: a cover-color swatch and status pill
// per book, an optional rating, and an expandable discussion-question section for book-club
// picks. Use for: "what's my reading list", "book club picks", "track what I'm reading".
export interface ReadingBook {
  title: string;
  author: string;
  status: 'reading' | 'queued' | 'done';
  rating?: number; // 0–5, halves allowed (e.g. 4.5)
  discussionQuestions?: string[];
}
export interface ReadingListProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  books: ReadingBook[];
  footer?: HtmlString;
}

// cocktailcard — a drink recipe / tasting card: recipecard's ingredients+steps shell reskinned
// for a pour list (the pour ORDER doubles as the build steps — you make a cocktail by pouring
// each in turn), closed by a flavor-notes / rating footer instead of nutrition.
// Use for: "recipe for a negroni", "how do I make an old fashioned", "tasting notes for X".
export interface CocktailPour {
  item: string; // "Gin", "Campari", "Sweet vermouth", "Orange peel"
  qty: string; // "1.5 oz", "a dash", "1"
}
export interface CocktailNotes {
  aroma?: string;
  taste?: string;
  finish?: string;
}
export interface CocktailCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  pours: CocktailPour[];
  notes?: CocktailNotes;
  rating?: number; // 0–5, halves allowed
  footer?: HtmlString;
}

// runninglog — a running/cycling training log: a plain entry list (date, distance, pace,
// route, elevation gain) plus a distance/pace trend chart built from the same entries.
// Distinct from workoutplan (gym sessions of sets/reps) — this is cardio mileage over time.
// Use for: "log of my runs", "how's my training going", "my cycling mileage this month".
export interface RunEntry {
  date: string; // "Jun 3", "2026-06-03" — shown in the order given, oldest or newest first
  distance: number; // in `unit`
  pace?: string; // "8:32" (min:sec per unit) — display form; charted only when it parses as mm:ss
  route?: string;
  elevationGainM?: number;
}
export interface RunningLogProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  unit?: 'mi' | 'km'; // default 'mi'
  entries: RunEntry[];
  footer?: HtmlString;
}

// userpersona — a UX research persona card: a portrait-left header, goals and frustrations as
// two tinted bullet columns, an italic pull-quote, and optional observed behaviors.
// Use for: "build a persona for X", "who are we designing for", "UX research summary".
export interface UserPersonaProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  name: string;
  role?: string; // "Integrating partner engineer", "Busy parent, 34"
  goals: string[];
  frustrations: string[];
  quote?: string;
  behaviors?: string[];
  footer?: HtmlString;
}

// runofshow — an event-production timeline: a vertical cue list with the live cue pinned and
// glowing, each cue tagged with an avatar-initial chip for its owner.
// Use for: "run of show for the shoot", "cue sheet for the show", "production timeline".
export interface ShowCue {
  time: string; // "7:00 PM", "T-10", "Scene 4"
  cue: string;
  owner?: string; // who's running this cue — rendered as an initials chip
  duration?: string;
  state?: 'done' | 'live' | 'next' | 'pending';
}
export interface RunOfShowProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  eventDate?: string;
  cues: ShowCue[];
  footer?: HtmlString;
}

// podcastplanner — an episode-planning card: a guest header atop an agenda-style topic list,
// each topic tagged with its chapter timecode (matched by position) when chapters are given.
// Use for: "plan next week's episode", "outline for the podcast", "episode with X".
export interface PodcastChapter {
  timecode: string; // "00:00", "12:45"
  label: string;
}
export interface PodcastPlannerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  guest?: string;
  topics?: string[];
  chapters?: PodcastChapter[]; // paired to `topics` by position when both are given
  footer?: HtmlString;
}

// vaxschedule — a vaccination schedule, generalized for a pet OR a person: dose chips plotted
// along a horizontal age/date axis by due date, colored by status. `dueAt` accepts either a
// real date or a relative age ("8 weeks", "6 months") — whichever the schedule is kept in.
// Use for: "vaccine schedule for X", "when's the next booster due", "puppy shot schedule".
export interface VaxDose {
  vaccine: string;
  dueAt: string; // a real date ("2026-08-01") or a relative age ("8 weeks", "6 months")
  status: 'done' | 'due' | 'overdue';
  note?: string;
}
export interface VaxScheduleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  doses: VaxDose[];
  footer?: HtmlString;
}

// claimagecompare — the Social Security claim-age tradeoff: three KPI chips (one per claiming
// age) and a cumulative-payout line chart computed from the given monthly benefit at each age,
// with an optional marked breakeven point. Use for: "when should I claim Social Security",
// "62 vs 67 vs 70", "claim-age tradeoff".
export interface ClaimAge {
  age: 62 | 67 | 70;
  monthlyBenefit: number;
}
export interface ClaimBreakeven {
  age: number;
  note?: string;
}
export interface ClaimAgeCompareProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  ages: ClaimAge[];
  breakeven?: ClaimBreakeven;
  footer?: HtmlString;
}

// statblock — a tabletop-RPG creature/character stat block (system-neutral, 5e-shaped): name and
// type line, AC / HP / Speed vitals, the six-ability table (modifiers COMPUTED from the raw
// scores, never taken from props), then bold-lead-in traits, actions, and reactions between
// tapered rules. Use for: "stat block for a goblin", "homebrew monster", "NPC for my campaign".
export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}
export interface StatBlockEntry {
  name: string; // the bold lead-in, e.g. "Bite", "Pack Tactics"
  text: string; // the rules text that follows
}
export interface StatBlockProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  name: string; // the creature/character name
  meta?: string; // the type line, e.g. "Medium humanoid, neutral good"
  ac: number; // armor class
  hp: number; // hit points
  hpFormula?: string; // hit dice, e.g. "8d8+16" — printed beside the hit points
  speed?: string; // "30 ft., fly 60 ft."
  abilities: AbilityScores; // raw scores; modifiers are derived
  saves?: string[]; // saving-throw bonuses, e.g. "Dex +5"
  skills?: string[]; // skill bonuses, e.g. "Stealth +5"
  senses?: string; // "darkvision 60 ft., passive Perception 13"
  languages?: string; // "Common, Draconic"
  challenge?: string; // "3 (700 XP)"
  traits?: StatBlockEntry[]; // passive features, listed before Actions
  actions?: StatBlockEntry[];
  reactions?: StatBlockEntry[];
  footer?: HtmlString;
}

export type EverydayBlock =
  | (BlockBase & { type: 'forecast'; props: ForecastProps })
  | (BlockBase & { type: 'weathernow'; props: WeatherNowProps })
  | (BlockBase & { type: 'tierlist'; props: TierListProps })
  | (BlockBase & { type: 'paystub'; props: PayStubProps })
  | (BlockBase & { type: 'taxbracket'; props: TaxBracketProps })
  | (BlockBase & { type: 'menucard'; props: MenuCardProps })
  | (BlockBase & { type: 'familytree'; props: FamilyTreeProps })
  | (BlockBase & { type: 'seatingchart'; props: SeatingChartProps })
  | (BlockBase & { type: 'relationshipmap'; props: RelationshipMapProps })
  | (BlockBase & { type: 'meetingnotes'; props: MeetingNotesProps })
  | (BlockBase & { type: 'stickerchart'; props: StickerChartProps })
  | (BlockBase & { type: 'agenda'; props: AgendaProps })
  | (BlockBase & { type: 'picks'; props: PicksProps })
  | (BlockBase & { type: 'timezones'; props: TimezonesProps })
  | (BlockBase & { type: 'transitroute'; props: TransitRouteProps })
  | (BlockBase & { type: 'amortization'; props: AmortizationProps })
  | (BlockBase & { type: 'receipt'; props: ReceiptProps })
  | (BlockBase & { type: 'settleup'; props: SettleUpProps })
  | (BlockBase & { type: 'bracketbar'; props: BracketBarProps })
  | (BlockBase & { type: 'recipecard'; props: RecipeCardProps })
  | (BlockBase & { type: 'workoutplan'; props: WorkoutPlanProps })
  | (BlockBase & { type: 'medicationschedule'; props: MedicationScheduleProps })
  | (BlockBase & { type: 'macrobreakdown'; props: MacroBreakdownProps })
  | (BlockBase & { type: 'plangrid'; props: PlanGridProps })
  | (BlockBase & { type: 'budgetallocator'; props: BudgetAllocatorProps })
  | (BlockBase & { type: 'howtosteps'; props: HowToStepsProps })
  | (BlockBase & { type: 'livecompute'; props: LiveComputeProps })
  | (BlockBase & { type: 'countdown'; props: CountdownProps })
  | (BlockBase & { type: 'livescore'; props: LiveScoreProps })
  | (BlockBase & { type: 'allocatepeople'; props: AllocatePeopleProps })
  | (BlockBase & { type: 'nutritionlabel'; props: NutritionLabelProps })
  | (BlockBase & { type: 'unitconvert'; props: UnitConvertProps })
  | (BlockBase & { type: 'packlist'; props: PackListProps })
  | (BlockBase & { type: 'pregnancyweek'; props: PregnancyWeekProps })
  | (BlockBase & { type: 'cycletrack'; props: CycleTrackProps })
  | (BlockBase & { type: 'contractiontimer'; props: ContractionTimerProps })
  | (BlockBase & { type: 'prayertimes'; props: PrayerTimesProps })
  | (BlockBase & { type: 'labprotocol'; props: LabProtocolProps })
  | (BlockBase & { type: 'caregivercoord'; props: CaregiverCoordProps })
  | (BlockBase & { type: 'readinglist'; props: ReadingListProps })
  | (BlockBase & { type: 'cocktailcard'; props: CocktailCardProps })
  | (BlockBase & { type: 'runninglog'; props: RunningLogProps })
  | (BlockBase & { type: 'userpersona'; props: UserPersonaProps })
  | (BlockBase & { type: 'runofshow'; props: RunOfShowProps })
  | (BlockBase & { type: 'podcastplanner'; props: PodcastPlannerProps })
  | (BlockBase & { type: 'vaxschedule'; props: VaxScheduleProps })
  | (BlockBase & { type: 'claimagecompare'; props: ClaimAgeCompareProps })
  | (BlockBase & { type: 'statblock'; props: StatBlockProps });
