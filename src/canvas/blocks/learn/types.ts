// learn family block types — STEM notation + assessment primitives.
//
// These are the cross-cutting education visuals the library lacked entirely: math notation
// (equationblock), a 1-D number line, a worked-example step-through, and a quiz/self-check.
// Each is one general primitive driven only by data, so the model never emits layout or markup
// — it describes the math/steps/questions and the component renders them on the design system.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';
import type { DiagShape, DiagLabel } from '../media/types';

/* ──────────────────────────── equationblock ────────────────────────────
   Math renders to browser-native MathML — accessible, theme-aware, and it scales with the fluid
   type system. Two ways to describe it, both ending as MathML:
     • `tex` — a LaTeX string (preferred). Compiled to MathML by bundled, lazy KaTeX. Models write
       LaTeX fluently and it expresses matrices, vectors, cases
       and aligned systems the small AST can't.
     • `math` — a declarative MathNode tree (zero-dependency). Covers fractions, powers/indices,
       roots, sums/integrals with bounds, grouped rows, operators. A bare string member that
       contains a backslash is treated as LaTeX too, so `math: "\\frac{a}{b}"` just works.
   Give one; `tex` wins when both are present. */

/** A node in the math tree. A bare string is shorthand for a run of plain text/number. */
export type MathNode =
  | string
  | { t: 'num'; v: string }
  | { t: 'ident'; v: string } // a variable, rendered italic per math convention
  | { t: 'op'; v: string } // an operator/relation: + − × = ≤ ∑ ∫ …
  | { t: 'row'; items: MathNode[] } // a horizontal run
  | { t: 'frac'; num: MathNode; den: MathNode }
  | { t: 'sup'; base: MathNode; sup: MathNode } // power / superscript
  | { t: 'sub'; base: MathNode; sub: MathNode } // index / subscript
  | { t: 'subsup'; base: MathNode; sub: MathNode; sup: MathNode }
  | { t: 'sqrt'; arg: MathNode; index?: MathNode } // √ (index = nth root)
  | { t: 'group'; items: MathNode[]; open?: string; close?: string } // ( … ) / [ … ]
  | { t: 'sum'; lower?: MathNode; upper?: MathNode; arg: MathNode }
  | { t: 'int'; lower?: MathNode; upper?: MathNode; arg: MathNode };

export interface EquationBlockProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The math as a LaTeX string (preferred), e.g. "\\int_0^1 x^2\\,dx". Compiled to MathML. */
  tex?: string;
  /** The math as a declarative tree. A bare string with a backslash is treated as LaTeX. */
  math?: MathNode;
  /** Optional display number shown to the right, e.g. "(3)". */
  number?: string;
  /** Optional plain-language reading / caption under the equation. */
  caption?: string;
  /** Render inline-sized rather than as a centered display block. */
  inline?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── numberline ────────────────────────────
   A 1-D signed axis: integers, fractions, inequalities, intervals, plotted points. The 1-D
   companion to `plot` (which is 2-D Cartesian). Serves number sense, inequalities, domain/range,
   error bars, any "value on a line". */

export interface NumberLinePoint {
  value: number;
  label?: string;
  color?: AccentVar;
  /** Hollow dot — an open/excluded endpoint (e.g. a strict inequality). */
  open?: boolean;
}
export interface NumberLineInterval {
  from: number;
  to: number;
  label?: string;
  color?: AccentVar;
  /** Open endpoints (excluded) — drawn as hollow brackets. Default closed. */
  openFrom?: boolean;
  openTo?: boolean;
}
export interface NumberLineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Axis range. */
  min: number;
  max: number;
  /** Major tick interval; auto-chosen (nice step) when omitted. */
  step?: number;
  unit?: string;
  points?: NumberLinePoint[];
  intervals?: NumberLineInterval[];
  footer?: HtmlString;
}

/* ──────────────────────────── workedexample ────────────────────────────
   A derivation / solution walked one step at a time: each step shows the current expression (or
   prose), an optional "why", and reveals progressively so the learner can follow. Math steps can
   carry an inline equation AST; prose steps are HTML. Covers proofs, algebra, physics solves,
   recipes, how-it-works. */

export interface WorkedStep {
  /** Step heading, e.g. "Isolate x". */
  label: string;
  /** The expression at this step, as a math tree (optional — prose-only steps are fine). */
  math?: MathNode;
  /** Why this step is taken / what rule applies (HTML, sanitized upstream). */
  why?: HtmlString;
}
export interface WorkedExampleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The problem statement (HTML). */
  problem?: HtmlString;
  steps: WorkedStep[];
  /** Final answer, highlighted. */
  result?: MathNode;
  /** Reveal steps one click at a time (default) vs. all at once. */
  progressive?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── quiz ────────────────────────────
   A self-check question: multiple-choice (single answer) with per-option feedback and an
   explanation revealed after answering. The first assessment primitive — pairs naturally with
   voice. Real data only: the model supplies the question, options, the correct index, and the
   explanation; nothing is fabricated by the component. */

export interface QuizOption {
  /** Option text (HTML allowed for inline emphasis/code). */
  text: HtmlString;
  /** Marks this option correct. Exactly one should be true. */
  correct?: boolean;
  /** Optional per-option feedback shown when this option is picked. */
  feedback?: HtmlString;
}
export interface QuizProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The question prompt (HTML). */
  question: HtmlString;
  options: QuizOption[];
  /** Explanation revealed after the learner answers. */
  explanation?: HtmlString;
  footer?: HtmlString;
}

/* ──────────────────────────── flashcard ────────────────────────────
   A deck of two-sided cards: front (term/prompt) flips to back (definition/answer). Spaced-
   recall study for languages, biology, law, history, vocab. Click a card to flip; arrows move
   through the deck. */
export interface FlashCard {
  front: HtmlString;
  back: HtmlString;
  /** Optional small tag, e.g. a chapter or category. */
  tag?: string;
}
export interface FlashcardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  cards: FlashCard[];
  footer?: HtmlString;
}

/* ──────────────────────────── molecularstructure ────────────────────────────
   A 2-D skeletal/Lewis structure: atoms placed on a 0..100 unit canvas, bonds (single/double/
   triple) between them. Chemistry, biology, medicine. Data-only — the model supplies positions
   and bonds; the component draws the standard notation. */
export interface MoleculeAtom {
  /** Element symbol, e.g. "C", "O", "N". Carbons are often left implicit but can be labelled. */
  el: string;
  x: number;
  y: number;
  /** Suppress the label (an implicit carbon vertex). */
  implicit?: boolean;
  /** Lone-pair / charge annotation, e.g. "−", "+". */
  charge?: string;
}
export interface MoleculeBond {
  /** Indices into `atoms`. */
  from: number;
  to: number;
  /** Bond order. Default 1. */
  order?: 1 | 2 | 3;
}
export interface MolecularStructureProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The molecule as a SMILES string (e.g. aspirin = "CC(=O)Oc1ccccc1C(=O)O"). PREFERRED for any
   *  real compound: the component computes accurate 2-D coordinates from it via a cheminformatics
   *  engine, so the model never has to (and never reliably can) place atoms by hand. */
  smiles?: string;
  /** Explicit atoms — used when `smiles` is absent (a tiny hand-authored example). On the 0..100
   *  canvas; carbons are usually `implicit`. */
  atoms?: MoleculeAtom[];
  /** Explicit bonds (indices into `atoms`) — used when `smiles` is absent. */
  bonds?: MoleculeBond[];
  /** Optional formula caption, e.g. "C₂H₆O". Auto-derived from `smiles` when not given. */
  formula?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── periodictable ────────────────────────────
   The periodic table laid out on its canonical 18-column × 7-period grid, with a few elements
   highlighted/annotated for the answer at hand (a group, a trend, the elements in a reaction).
   The component owns the layout; the model supplies which elements to show/emphasise and an
   optional category color key — it never positions cells. */
export interface PeriodicElement {
  /** Atomic number — also drives canonical grid placement. */
  z: number;
  symbol: string;
  name?: string;
  /** Grid column 1..18 and period row 1..7. Lanthanides/actinides use rows 8–9. */
  col: number;
  row: number;
  /** Category key (maps to a color in `categories`), e.g. "alkali", "noble". */
  cat?: string;
  /** Emphasise this cell (the answer's focus). */
  on?: boolean;
}
export interface PeriodicCategory {
  key: string;
  label: string;
  color: AccentVar;
}
export interface PeriodicTableProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Elements to render. Omit for the model to pass a curated subset; a full 118 also works. */
  elements: PeriodicElement[];
  categories?: PeriodicCategory[];
  footer?: HtmlString;
}

/* ── bodymap: human-body figure with named regions highlighted ───────── */
export interface BodyRegion {
  /** A body region. Front view: head, neck, leftShoulder, rightShoulder, chest, abdomen, hips,
   *  leftUpperArm, rightUpperArm, leftForearm, rightForearm, leftHand, rightHand, leftThigh,
   *  rightThigh, leftKnee, rightKnee, leftShin, rightShin, leftFoot, rightFoot. Back view
   *  (side:'posterior') adds: upperBack, lowerBack, glutes, leftHamstring, rightHamstring,
   *  leftCalf, rightCalf. Coarse groups also accepted: leftArm, rightArm, leftLeg, rightLeg, torso.
   *  An unrecognised id is skipped. */
  id: string;
  label?: string;
  /** Design-token color var, e.g. 'var(--presence)' */
  color?: AccentVar;
  /** Short note shown near the highlighted region. */
  note?: string;
}
export interface BodymapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Regions to highlight. Omit (or pass none) to render a fully-labelled figure. The component
   *  owns the SVG layout. */
  regions?: BodyRegion[];
  /** Side shown: anterior (front) or posterior (back). Default: 'anterior'. */
  side?: 'anterior' | 'posterior';
  footer?: HtmlString;
}

/* ──────────────────────────── geometrycanvas ────────────────────────────
   A 2-D Cartesian plane for geometry, physics, and math visualization: points, line segments
   (including rays and full lines), polygons, circles, labeled vectors (arrows), angle markers,
   and free-text annotations. Auto-fits axis range from the data; supports the shared scale
   engine for gridlines and ticks. */

export interface GeoPoint {
  x: number;
  y: number;
  label?: string;
  color?: AccentVar;
  /** Hollow dot (open) vs filled. Default: filled. */
  open?: boolean;
  /** Visual radius in SVG units. Default: 4. */
  r?: number;
}
export interface GeoSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  color?: AccentVar;
  dashed?: boolean;
  /** Extend beyond (x2,y2): 'ray' goes one-way, 'line' goes both ways. Default: 'none'. */
  extend?: 'none' | 'ray' | 'line';
}
export interface GeoPolygon {
  vertices: Array<{ x: number; y: number }>;
  label?: string;
  color?: AccentVar;
  /** Fill the polygon. Default: true. */
  fill?: boolean;
}
export interface GeoCircle {
  cx: number;
  cy: number;
  r: number;
  label?: string;
  color?: AccentVar;
  fill?: boolean;
}
export interface GeoVector {
  /** Tail (start) coordinates. */
  x: number;
  y: number;
  /** Displacement in data units — the vector points from (x,y) to (x+dx, y+dy). */
  dx: number;
  dy: number;
  label?: string;
  color?: AccentVar;
}
export interface GeoAngle {
  vertex: { x: number; y: number };
  /** A point on one ray of the angle (direction only — distance is ignored). */
  from: { x: number; y: number };
  /** A point on the other ray. */
  to: { x: number; y: number };
  label?: string;
  color?: AccentVar;
  /** Draw a square corner marker instead of an arc (use when the angle is 90°). */
  rightAngle?: boolean;
}
export interface GeoAnnotation {
  x: number;
  y: number;
  text: string;
  color?: AccentVar;
  anchor?: 'start' | 'middle' | 'end';
}
export interface GeometryCanvasProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** X axis range. Auto-fits from data when omitted. */
  xRange?: [number, number];
  /** Y axis range. Auto-fits from data when omitted. */
  yRange?: [number, number];
  xLabel?: string;
  yLabel?: string;
  showGrid?: boolean;
  points?: GeoPoint[];
  segments?: GeoSegment[];
  polygons?: GeoPolygon[];
  circles?: GeoCircle[];
  vectors?: GeoVector[];
  angles?: GeoAngle[];
  annotations?: GeoAnnotation[];
  footer?: HtmlString;
}

/* ──────────────────────────── freebodydiagram ────────────────────────────
   A physics free-body diagram: a labeled object with force vectors (labeled arrows) radiating
   from it. Each force has a direction angle (degrees CCW from the right) and an optional
   magnitude. The component owns the layout — models supply only the physics. */

export interface FBDForce {
  label: string;
  /** Angle in degrees CCW from the right (0=right, 90=up, 180=left, 270=down). */
  angle: number;
  magnitude?: number;
  color?: AccentVar;
}
export interface FreebodyDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Label for the central object (box). Default: "Object". */
  object?: string;
  forces: FBDForce[];
  footer?: HtmlString;
}

/* ──────────────────────────── musicstaff ────────────────────────────
   A 5-line music staff with notes. The model supplies pitches (e.g. "C4", "G#4", "Bb3"),
   durations (whole / half / quarter / eighth), and an optional clef. The component renders
   noteheads, stems, flags, accidentals, and ledger lines — all in design-system tokens.
   No external music-font dependency; standard SVG shapes are used throughout. */

export interface MusicNote {
  /** Scientific pitch: letter + optional accidental + octave, e.g. "C4", "F#4", "Bb3". */
  pitch: string;
  /** Note duration. Default: "quarter". */
  duration?: 'whole' | 'half' | 'quarter' | 'eighth';
  dotted?: boolean;
}
export interface MusicStaffProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** "treble" (default) or "bass". */
  clef?: 'treble' | 'bass';
  notes: MusicNote[];
  /** Time signature numerator/denominator string, e.g. "4/4". */
  timeSignature?: string;
  /** Optional tempo in BPM, shown as a label. */
  tempo?: number;
  footer?: HtmlString;
}

/* ──────────────────────────── vectorspace ────────────────────────────
   A 2-D linear-algebra canvas: shows vectors from the origin as colored arrows, an optional
   second set of (dashed) transformed vectors, and optionally shades the span of the vector set.
   Purpose-built for linear-algebra topics where geometrycanvas would be over-specified. */

export interface Vec2 {
  x: number;
  y: number;
  label?: string;
  color?: AccentVar;
}
export interface VectorSpaceProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Vectors shown as arrows from the origin. */
  vectors: Vec2[];
  /** Optional post-transformation vectors, shown as dashed arrows from origin. */
  transformed?: Vec2[];
  /** Shade the 2-D span (parallelogram / triangle) of the first two vectors. */
  showSpan?: boolean;
  xRange?: [number, number];
  yRange?: [number, number];
  footer?: HtmlString;
}

/* ──────────────────────────── reactionmechanism ────────────────────────────
   A chemistry reaction mechanism: compounds/intermediates arranged left-to-right with
   labeled reaction arrows between them. Each step is a formula or compound name (HTML).
   Color-codes intermediates with the warning token. Conditions appear above each arrow.
   Laid out in HTML/CSS — no SVG — so long formulae wrap cleanly. */

export interface MechStep {
  /** Compound name or formula (HTML for subscripts/superscripts). */
  label: HtmlString;
  /** Accent color. Use 'var(--warning)' for reaction intermediates. */
  color?: AccentVar;
  /** Small role tag shown below the label, e.g. "reactant", "intermediate", "product". */
  tag?: string;
}
export interface ReactionMechanismProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Reaction class label, e.g. "SN2", "Aldol Addition", "Markovnikov Addition". */
  reactionType?: string;
  steps: MechStep[];
  /** Arrow conditions, indexed by gap: conditions[0] = conditions between step 0 and step 1. */
  conditions?: string[];
  footer?: HtmlString;
}

/* ──────────────────────────── clockface ────────────────────────────
   An analog teaching clock. The component owns the dial — the numerals, the hour ticks, the minute
   marks — and COMPUTES every hand angle from the supplied `time`: the hour hand from
   (h%12 + m/60)·30°, the minute hand from m·6°, the optional second hand from s·6°. An optional
   digital read-out sits beneath, and an optional shaded arc sweeps the elapsed span from `time` to
   `elapsedTo`. Real data only — the model supplies the time(s); nothing on the face is eyeballed.
   For telling time, elapsed-time problems, and clock-reading practice. */
export interface ClockFaceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The time as 'HH:MM' (24h) or 'H:MM'. The hands are computed from it. */
  time: string;
  /** Draw a sweeping second hand. Default false. */
  showSecond?: boolean;
  /** Seconds past the minute (0–59) for the second hand. Default 0. */
  second?: number;
  /** Show a digital read-out beneath the dial. Default false. */
  digital?: boolean;
  /** A later time as 'HH:MM' — shades the elapsed arc from `time` to here and reads the span. */
  elapsedTo?: string;
  /** Short plain-language caption under the clock. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── moneytray ────────────────────────────
   A coins-and-bills tray for counting money and making change. The model supplies the
   denominations on the tray (each with a count); the component groups them, draws coins as circles
   and bills as rectangles, and COMPUTES the running total = Σ denom·count. In 'change' mode it
   reads the gap to `target` and proposes the fewest-coins/bills to close it. Real data only — the
   tokens and the target come from the model; the totals and the change suggestion are computed. For
   counting money, making change, and money-sense lessons. */
export interface MoneyToken {
  /** Face value of one token in the base currency unit (e.g. 0.25 = a quarter, 5 = a $5 bill). */
  denom: number;
  /** Name shown under the stack, e.g. "Quarter", "$5". Defaults to the formatted denom. */
  label?: string;
  /** How many of this denomination sit on the tray. */
  count: number;
}
export interface MoneyTrayProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Currency symbol prefixed to totals. Default "$". */
  currency?: string;
  /** The denominations on the tray. */
  tokens: MoneyToken[];
  /** Target amount — the goal in 'change' mode (the gap to here is read out). */
  target?: number;
  /** 'count' (default) tallies the tray; 'change' reads the gap to `target` + a fewest-tokens hint. */
  mode?: 'count' | 'change';
  /** Short plain-language caption under the tray. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── placevaluechart ────────────────────────────
   A base-ten place-value chart. The model supplies the `value`; the component splits it into digits,
   draws a labelled column per place (thousands / hundreds / tens / ones), and under each shows the
   digit, its base-ten block glyphs (hundred-flats / ten-rods / unit-cubes for that digit), and the
   expanded form (e.g. 300 + 40 + 7). Every digit and glyph count is computed from `value`; nothing
   is fabricated. For place value, base ten, and expanded-form lessons. */
export type PlaceColumn = 'thousands' | 'hundreds' | 'tens' | 'ones';
export interface PlaceValueChartProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The whole number to chart. Digits and block glyphs are computed from it. */
  value: number;
  /** Which place columns to show, left→right. Auto-fits the value's magnitude when omitted. */
  columns?: PlaceColumn[];
  /** Draw the base-ten block glyphs (flats/rods/cubes) under each digit. Default true. */
  showBlocks?: boolean;
  /** Show the expanded form (e.g. 300 + 40 + 7) below the chart. Default true. */
  expanded?: boolean;
  /** Short plain-language caption under the chart. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── shapecard ────────────────────────────
   An illustrated 2-D/3-D shape gallery. The model lists shapes by `kind`; the component draws each
   as a clean filled figure (the regular polygon's vertices computed from its side count, the solids
   in oblique projection — no axes), with attribute call-outs (sides / vertices / faces / edges) and
   a real-world example. The drawing is computed from the kind; the attributes and example come from
   the model. For shape recognition, polygon/solid attributes, and geometry vocabulary. */
export type ShapeKind =
  | 'triangle'
  | 'square'
  | 'rectangle'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'circle'
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'pyramid';
export interface ShapeEntry {
  /** Display name shown under the figure, e.g. "Hexagon", "Cube". */
  name: string;
  /** Which figure to draw. Regular polygons are built from their side count; solids drawn in 3-D. */
  kind: ShapeKind;
  /** Number of sides (2-D). Shown as an attribute chip. */
  sides?: number;
  /** Number of vertices (corners). Shown as an attribute chip. */
  vertices?: number;
  /** Number of faces (3-D). Shown as an attribute chip. */
  faces?: number;
  /** Number of edges (3-D). Shown as an attribute chip. */
  edges?: number;
  /** A real-world example, e.g. "Honeycomb cell", "Dice". */
  example?: string;
}
export interface ShapeCardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The shapes to draw, each with its attributes and example. */
  shapes: ShapeEntry[];
  /** Short plain-language caption under the gallery. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── letterform ────────────────────────────
   A handwriting letter-formation card. The component draws the large `letter` seated on the
   baseline / midline / cap guidelines, a faint trace ghost behind it, and the numbered stroke-order
   indices; the model supplies the stroke hints (one ordered line each). The guideline geometry and
   the stroke-number placement are computed; the letter and its strokes come from the model. For
   handwriting, letter formation, and stroke-order practice. */
export interface LetterStroke {
  /** Stroke sequence number (1, 2, 3…). Drawn as a numbered index. */
  order: number;
  /** What the stroke does, e.g. "Curve left and down", "Straight line down". */
  hint: string;
}
export interface LetterFormProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The letter to form, e.g. "a", "B". A single character. */
  letter: string;
  /** Whether to show the uppercase or lowercase form. Default 'lower'. */
  case?: 'upper' | 'lower';
  /** The ordered stroke hints. */
  strokes: LetterStroke[];
  /** Draw the baseline / midline / cap-height guidelines. Default true. */
  showGuides?: boolean;
  /** Short plain-language caption under the card. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── toolscale ────────────────────────────
   Reading a measuring instrument. The component draws the chosen `instrument` — a ruler with
   fraction ticks, a protractor arc, a caliper jaw, or a thermometer column — and places a movable
   indicator at `value`, reading the measurement out. Every tick and the indicator position are
   computed from value / max; the model supplies only the reading. For measurement, reading scales,
   fractions of an inch, angles, and temperature. */
export type ScaleInstrument = 'ruler' | 'protractor' | 'caliper' | 'thermometer';
export interface ToolScaleProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Which instrument to draw. */
  instrument: ScaleInstrument;
  /** The measured value the indicator points to. */
  value: number;
  /** Full-scale value (the instrument's max reading). Drives tick spacing + the indicator. */
  max: number;
  /** Unit shown on the read-out, e.g. "in", "°", "mm", "°C". */
  unit?: string;
  /** Tick the scale in fractions (½, ¼, ⅛) rather than decimals — for an inch ruler. Default false. */
  fractional?: boolean;
  /** Override the read-out string, e.g. "2 3/8 in". Computed from `value`/`unit` when omitted. */
  reading?: string;
  /** Short plain-language caption under the instrument. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── sightwordlist ────────────────────────────
   A K-2 sight-word practice list (Dolch/Fry style): each word is a tap-to-hear chip whose
   color/border encode how well it's known. `new` reads neutral, `practicing` takes the warning
   tint, and `mastered` takes the presence tint with a check mark. The component computes the
   mastered/practicing/new tallies from the words; the model only supplies the words and their
   states — real data only, nothing is fabricated. For sight-word drills, word walls, and
   early-reading fluency checks. */
export type SightWordMastery = 'new' | 'practicing' | 'mastered';
export interface SightWordEntry {
  word: string;
  /** How well the word is known. Default 'new' when omitted. */
  mastery?: SightWordMastery;
}
export interface SightWordListProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The word list's name/source, e.g. "Dolch Pre-Primer", "Fry's First 100". Framed in the
   *  caption; omit for a generic "sight words" framing. */
  listName?: string;
  words: SightWordEntry[];
  footer?: HtmlString;
}

/* ──────────────────────────── alphabetchart ────────────────────────────
   An A-Z reference grid: one cell per letter showing its upper+lowercase glyph, a keyword
   ("Aa is for Apple"), and an optional themed icon. The component supplies a complete, sensible
   default alphabet (classic keyword mnemonics) when `letters` is omitted, so the chart always
   renders something real — never an empty grid. For alphabet recognition, letter-sound
   association, and classroom A-Z reference walls. */
export interface AlphabetLetter {
  /** The letter, e.g. "A". Only the first character is used. */
  letter: string;
  /** The mnemonic keyword, e.g. "Apple" for "Aa is for Apple". */
  keyword?: string;
  /** Optional small icon shown beside the keyword (e.g. for a themed chart). */
  icon?: IconKey;
}
export interface AlphabetChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The letters to chart. Omit for a full default A-Z set with generic keywords. */
  letters?: AlphabetLetter[];
  footer?: HtmlString;
}

/* ──────────────────────────── columnarithmetic ────────────────────────────
   The classic column-arithmetic worksheet: digits stacked by place value with the carry
   (addition) or borrow (subtraction) marks worked out above/below each column, or — for
   `op: 'longdiv'` — the traditional bracket-and-bring-down layout. Every digit, carry, borrow,
   quotient figure and remainder is computed for real from `operands`; nothing is an authored
   coordinate. For "show your work" arithmetic: multi-digit addition/subtraction with regrouping,
   and long division. */
export interface ColumnArithmeticProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Which operation to work through. */
  op: 'add' | 'sub' | 'longdiv';
  /** The numbers to combine, in order. `add` sums any number of rows; `sub` subtracts every row
   *  after the first from the first (minuend, then one or more subtrahends); `longdiv` reads
   *  only the first two as [dividend, divisor]. Non-integers are floored; negatives use their
   *  magnitude — this is a whole-number column-arithmetic drill. */
  operands: number[];
  /** Show the worked carry/borrow marks. Default true. */
  showCarries?: boolean;
  /** Short plain-language caption under the worked figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── titrationcurve ────────────────────────────
   A pH-vs-titrant-volume curve for acid/base titrations: the sampled points the caller supplies
   are plotted on a Cartesian pH axis (0-14 by convention, widened only if the data itself runs
   outside that band), with an optional equivalence-point marker and a shaded buffer-region band.
   The curve is drawn strictly from `points` — no inflection, endpoint, or midpoint is ever
   interpolated here. For acid-base titration, buffer capacity, and equivalence-point questions. */
export interface TitrationPoint {
  volumeMl: number;
  pH: number;
}
export interface TitrationCurveProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The sampled titration curve, in the order given. Plotted after sorting by volume — the
   *  component never fabricates a point between two you didn't supply. */
  points: TitrationPoint[];
  /** Volume at the equivalence point, drawn as a dashed vertical marker. */
  equivalenceVolumeMl?: number;
  /** Acid dissociation constant (as pKa), labelled at the half-equivalence volume — the textbook
   *  fact that pH ≈ pKa there. Requires `equivalenceVolumeMl` to place the label. */
  pKa?: number;
  /** [startMl, endMl] of the buffering plateau, shaded as a band. */
  bufferBand?: [number, number];
  footer?: HtmlString;
}

/* ──────────────────────────── interferencepattern ────────────────────────────
   Single- or double-slit diffraction: an illustrative source-wave/slit schematic up top (drawn
   from the real wavelength when given, the same sine-generation technique `wave` uses), and the
   fringe intensity below plotted strictly from the caller's sampled `intensity` points — the
   interference pattern itself is never computed here, only the schematic context is. For wave-
   optics lessons: "show me the double-slit interference pattern", "single vs double slit". */
export interface InterferenceSample {
  position: number;
  value: number;
}
export interface InterferencePatternProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 1 for a single slit, 2 for a double slit — drives the schematic and the legend text. */
  slits: 1 | 2;
  /** The sampled fringe intensity vs. screen position, in the order given. Plotted after sorting
   *  by position; never interpolated or computed from wavelength/separation. */
  intensity: InterferenceSample[];
  /** Illustrative only — sizes the schematic source wave. */
  wavelengthNm?: number;
  /** Illustrative only — sizes the schematic slit gap. */
  slitSeparationUm?: number;
  footer?: HtmlString;
}

/* ──────────────────────────── orbitaldiagram ────────────────────────────
   Aufbau electron-configuration boxes: one ragged row per subshell, in the filling order given,
   each holding its canonical box count (s=1, p=3, d=5, f=7) with an up/down spin-arrow glyph per
   electron. Box counts and arrows are read straight from the data (falling back to the subshell's
   own canonical count only when `boxes` is missing/invalid) — never re-derived from an assumed
   atomic number. For electron-configuration and Hund's-rule/Pauli-exclusion teaching. */
export interface OrbitalRow {
  /** Subshell label, e.g. "1s", "2p", "3d". The trailing letter (s/p/d/f) sets the canonical box
   *  count when `boxes` is omitted or invalid. */
  subshell: string;
  /** Number of boxes (orbitals) in this subshell. Falls back to the canonical count for the
   *  subshell letter when omitted. */
  boxes?: number;
  /** Per-box occupancy, one entry per box, left to right: 0 (empty), 1 (single, spin-up), or
   *  2 (paired, spin-up + spin-down). A missing entry renders as an empty box. */
  electrons: (0 | 1 | 2)[];
}
export interface OrbitalDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The element this configuration belongs to, shown in the eyebrow, e.g. "Fe". */
  element?: string;
  /** Subshells in filling order — rendered exactly in this order, never resorted. */
  orbitals: OrbitalRow[];
  /** The condensed configuration string, e.g. "1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶". Shown as a caption. */
  configString?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── pictograph ────────────────────────────
   A repeated-icon tally chart: each row's count is tiled as whole icons plus a proportionally
   clipped partial icon for the remainder, at `unitValue` per icon. For "each icon represents N"
   style counts: population, votes, units sold, anything better read as a picture tally than a
   bar. */
export interface PictographRow {
  label: string;
  count: number;
}
export interface PictographProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Alternate glyph, used on every other row (odd index) so two interleaved categories stay
   *  visually distinct. Falls back to `icon` when omitted. */
  icon2?: IconKey;
  /** How much one full icon represents, e.g. 1000 for "each icon = 1,000 people". */
  unitValue: number;
  rows: PictographRow[];
  footer?: HtmlString;
}

/* ──────────────────────────── particlemodel ────────────────────────────
   Side-by-side solid/liquid/gas particle diagrams: a solid draws a tight lattice with small
   vibration arcs, a liquid a loose cluster with short drift lines, a gas scattered particles with
   longer motion trails. Every position is computed from the panel's particle count on a
   deterministic layout (same seed every render) — a static SVG, no timers or animation loops.
   For states-of-matter and kinetic-theory lessons. */
export interface ParticleModelPanel {
  phase: 'solid' | 'liquid' | 'gas';
  label?: string;
  /** How many particles to draw. Default 12, clamped to a legible range. */
  particleCount?: number;
}
export interface ParticleModelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  panels: ParticleModelPanel[];
  footer?: HtmlString;
}

/* ──────────────────────────── morphemebreakdown ────────────────────────────
   Synchronic, single-language word decomposition: prefix/root/suffix segments of ONE word,
   underlined and colour-coded by role, with a gloss legend below. Distinct from `etymtree`
   (cross-language historical ancestry) — this is "what does 'unbreakable' break into right now",
   not "where did it come from". For morphology teaching and vocabulary-building word-part drills. */
export type MorphemeRole = 'prefix' | 'root' | 'suffix';
export interface Morpheme {
  text: string;
  role: MorphemeRole;
  /** Short gloss, e.g. "not, opposite of" for "un-". */
  meaning?: string;
}
export interface MorphemeBreakdownProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The whole word being decomposed, shown as the heading. */
  word: string;
  /** The word's morphemes, left to right. */
  morphemes: Morpheme[];
  footer?: HtmlString;
}

/* ──────────────────────────── practicelog ────────────────────────────
   An instrument practice tracker: a calendar-heat strip (real minutes practiced per day, tinted
   by intensity) sits above a session list with per-piece progress tags. The component derives
   every total, day-bucket, and streak read-out from the raw `sessions` — it never invents a
   day's practice or a piece's cumulative minutes. For "log my piano practice", "how much have I
   practiced this month", "show my violin streak". */
export interface PracticeSession {
  /** The session's calendar date, e.g. "2026-06-24" (any string `Date` can parse). */
  date: string;
  /** Minutes practiced in this session. */
  minutes: number;
  /** The piece worked on, e.g. "Clair de Lune". Omit for technique-only sessions (scales, etc.). */
  piece?: string;
  /** What the session focused on, e.g. "scales", "sight-reading", "tempo". */
  focus?: string;
  note?: string;
}
export interface PracticeLogProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The instrument being practiced, e.g. "Piano", "Violin". */
  instrument: string;
  sessions: PracticeSession[];
  /** Current consecutive-day streak, in days. When omitted, computed from `sessions` itself
   *  (consecutive calendar days with a logged session, counting back from the most recent one) —
   *  supply it only to override that count (e.g. a streak that survived a rest-day grace rule). */
  streak?: number;
  footer?: HtmlString;
}

/* ──────────────────────────── taxonrank ────────────────────────────
   A single organism's taxonomic classification ladder — Kingdom down to Species (or whatever
   subset the caller supplies) — as a vertical stack of rank pills joined by a connector, widening
   as it descends. Distinct from `phylotree`: that's a multi-species evolutionary tree with
   computed branch layout; this is one organism's own classification, given straight from the
   data with no tree topology to lay out. For "classify a red fox", "what's the taxonomy of
   T. rex", "kingdom through species for a housecat". */
export type TaxonLevel = 'Kingdom' | 'Phylum' | 'Class' | 'Order' | 'Family' | 'Genus' | 'Species';
export interface TaxonRankEntry {
  /** The rank name. The canonical seven; supply a subset (e.g. Family through Species) when
   *  the higher ranks aren't the point of the answer. */
  level: TaxonLevel;
  /** The taxon at this level, e.g. "Animalia", "Chordata", "Tyrannosaurus". */
  name: string;
  /** Emphasise this rung — the level the answer is actually about. */
  highlight?: boolean;
}
export interface TaxonRankProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The full binomial (or trinomial) name, e.g. "Tyrannosaurus rex". Shown italicized. */
  scientificName?: string;
  /** The ladder, broad to narrow (Kingdom first). Rendered in the order given — never resorted,
   *  so a caller supplying only a few ranks (e.g. Family through Species) still reads correctly. */
  ranks: TaxonRankEntry[];
  footer?: HtmlString;
}

/* ──────────────────────────── numbersequence ────────────────────────────
   A Fibonacci / prime / triangular / square number visualizer for general curiosity — distinct
   from a classroom sequences-and-series lesson (that's `taylorseries`/`workedexample` territory).
   A row of size-scaled dots, one per term, with the real gap between adjacent terms annotated on
   the connector between them. The component never computes the sequence itself — it draws
   exactly the terms it's given, and the annotated gap is the literal difference between two
   supplied numbers, never a formula it assumes for the kind. */
export type NumberSequenceKind = 'fibonacci' | 'prime' | 'triangular' | 'square';
export interface NumberSequenceProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  kind: NumberSequenceKind;
  /** The terms, in order. */
  terms: number[];
  /** Plain-language description of the generating rule, e.g. "each term is the sum of the two
   *  before it". Shown as a caption — the component never infers or states this itself. */
  rule?: string;
  /** Annotate the gap between adjacent terms on the connector. Default true. */
  highlightPattern?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── constantcard ────────────────────────────
   A mathematical constant fact card (pi, e, phi, a googol, …): headline symbol + value, a short
   significance paragraph, and an optional illustrative diagram. `value` is a STRING, not a
   number — an irrational constant's digits carry more precision than a JS number can hold, and a
   googol has 101 digits — so the component never rounds or re-derives them, only ever truncates
   to `digitsShown` (never pads with invented digits past what `value` actually supplies). The
   diagram (golden spiral / circle-and-diameter) is a fixed illustrative construction from the
   constant's own real math (φ, or the circumference/diameter relationship) — not a plot of any
   supplied data. */
export type ConstantVisual = 'spiral' | 'circle' | 'none';
export interface ConstantCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The constant's symbol or short name, e.g. "π", "e", "φ", "Googol". */
  symbol: string;
  /** The decimal expansion as text, e.g. "3.14159265358979323846". */
  value: string;
  /** How many digits after the decimal point to display. Clamped to what `value` actually has —
   *  never padded. Omit to show `value` exactly as given. */
  digitsShown?: number;
  /** A short paragraph on why the constant matters. */
  significance: string;
  /** An illustrative diagram: 'spiral' (golden-ratio construction, for φ) or 'circle' (a
   *  diameter/circumference diagram, for π). Default 'none'. */
  visual?: ConstantVisual;
  footer?: HtmlString;
}

/* ──────────────────────────── elementcard ────────────────────────────
   A single periodic-table element deep-dive — distinct from `periodictable`'s full 118-cell
   grid. A classic textbook element tile (large symbol, Z top-left, mass bottom-left) plus the
   surrounding facts, and a small concentric electron-shell ring diagram when `shells` is given
   (a compact at-a-glance version, distinct from `bohrmodel`'s full per-electron dot diagram). */
export interface ElementCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Element symbol, e.g. "Fe". */
  symbol: string;
  /** Full name, e.g. "Iron". */
  name: string;
  /** Atomic number. */
  z: number;
  /** Standard atomic mass (u/amu). */
  mass?: number;
  /** Category, e.g. "Transition metal", "Noble gas", "Alkali metal" — colors the tile. */
  category?: string;
  /** Condensed electron configuration, e.g. "[Ar] 3d⁶ 4s²". */
  electronConfig?: string;
  /** Electrons per shell, innermost first, e.g. [2, 8, 14, 2] for iron. Draws the ring diagram. */
  shells?: number[];
  /** When/how it was identified, e.g. "1669" or "Known since antiquity". */
  discovered?: string;
  /** Melting point in °C. */
  meltingPoint?: number;
  /** Boiling point in °C. */
  boilingPoint?: number;
  /** Real-world uses, e.g. ["Steelmaking", "Magnets"]. */
  uses?: string[];
  footer?: HtmlString;
}

export type LearnBlock =
  | (BlockBase & { type: 'equationblock'; props: EquationBlockProps })
  | (BlockBase & { type: 'numberline'; props: NumberLineProps })
  | (BlockBase & { type: 'workedexample'; props: WorkedExampleProps })
  | (BlockBase & { type: 'quiz'; props: QuizProps })
  | (BlockBase & { type: 'flashcard'; props: FlashcardProps })
  | (BlockBase & { type: 'molecularstructure'; props: MolecularStructureProps })
  | (BlockBase & { type: 'periodictable'; props: PeriodicTableProps })
  | (BlockBase & { type: 'bodymap'; props: BodymapProps })
  | (BlockBase & { type: 'geometrycanvas'; props: GeometryCanvasProps })
  | (BlockBase & { type: 'freebodydiagram'; props: FreebodyDiagramProps })
  | (BlockBase & { type: 'musicstaff'; props: MusicStaffProps })
  | (BlockBase & { type: 'vectorspace'; props: VectorSpaceProps })
  | (BlockBase & { type: 'reactionmechanism'; props: ReactionMechanismProps })
  | (BlockBase & { type: 'chorddiagram'; props: ChordDiagramProps })
  | (BlockBase & { type: 'developmentmilestone'; props: DevelopmentMilestoneProps })
  | (BlockBase & { type: 'teachdiagram'; props: TeachDiagramProps })
  | (BlockBase & { type: 'fractionbar'; props: FractionBarProps })
  | (BlockBase & { type: 'gridmatrix'; props: GridMatrixProps })
  | (BlockBase & { type: 'wave'; props: WaveDiagramProps })
  | (BlockBase & { type: 'energydiagram'; props: EnergyDiagramProps })
  | (BlockBase & { type: 'phylotree'; props: PhyloTreeProps })
  | (BlockBase & { type: 'parsetree'; props: ParseTreeProps })
  | (BlockBase & { type: 'celldiagram'; props: CellDiagramProps })
  | (BlockBase & { type: 'vectorfield'; props: VectorFieldProps })
  | (BlockBase & { type: 'pedigree'; props: PedigreeProps })
  | (BlockBase & { type: 'bohrmodel'; props: BohrModelProps })
  | (BlockBase & { type: 'raydiagram'; props: RayDiagramProps })
  | (BlockBase & { type: 'equationbalancer'; props: EquationBalancerProps })
  | (BlockBase & { type: 'yieldcalc'; props: YieldCalcProps })
  | (BlockBase & { type: 'vseprmolecule'; props: VseprMoleculeProps })
  | (BlockBase & { type: 'unitcircle'; props: UnitCircleProps })
  | (BlockBase & { type: 'solidfigure'; props: SolidFigureProps })
  | (BlockBase & { type: 'crosssection'; props: CrossSectionProps })
  | (BlockBase & { type: 'pianokeys'; props: PianoKeysProps })
  | (BlockBase & { type: 'fretboardmap'; props: FretboardMapProps })
  | (BlockBase & { type: 'circleoffifths'; props: CircleOfFifthsProps })
  | (BlockBase & { type: 'odontogram'; props: OdontogramProps })
  | (BlockBase & { type: 'clockface'; props: ClockFaceProps })
  | (BlockBase & { type: 'moneytray'; props: MoneyTrayProps })
  | (BlockBase & { type: 'placevaluechart'; props: PlaceValueChartProps })
  | (BlockBase & { type: 'shapecard'; props: ShapeCardProps })
  | (BlockBase & { type: 'letterform'; props: LetterFormProps })
  | (BlockBase & { type: 'toolscale'; props: ToolScaleProps })
  | (BlockBase & { type: 'craftchart'; props: CraftChartProps })
  | (BlockBase & { type: 'dnahelix'; props: DnaHelixProps })
  | (BlockBase & { type: 'linespectrum'; props: LineSpectrumProps })
  | (BlockBase & { type: 'pyramidtiers'; props: PyramidTiersProps })
  | (BlockBase & { type: 'twocolumnproof'; props: TwoColumnProofProps })
  | (BlockBase & { type: 'gridtransform'; props: GridTransformProps })
  | (BlockBase & { type: 'areamodel'; props: AreaModelProps })
  | (BlockBase & { type: 'polarplot'; props: PolarPlotProps })
  | (BlockBase & { type: 'taylorseries'; props: TaylorSeriesProps })
  | (BlockBase & { type: 'phaseportrait'; props: PhasePortraitProps })
  | (BlockBase & { type: 'sightwordlist'; props: SightWordListProps })
  | (BlockBase & { type: 'alphabetchart'; props: AlphabetChartProps })
  | (BlockBase & { type: 'columnarithmetic'; props: ColumnArithmeticProps })
  | (BlockBase & { type: 'titrationcurve'; props: TitrationCurveProps })
  | (BlockBase & { type: 'interferencepattern'; props: InterferencePatternProps })
  | (BlockBase & { type: 'orbitaldiagram'; props: OrbitalDiagramProps })
  | (BlockBase & { type: 'pictograph'; props: PictographProps })
  | (BlockBase & { type: 'particlemodel'; props: ParticleModelProps })
  | (BlockBase & { type: 'morphemebreakdown'; props: MorphemeBreakdownProps })
  | (BlockBase & { type: 'practicelog'; props: PracticeLogProps })
  | (BlockBase & { type: 'taxonrank'; props: TaxonRankProps })
  | (BlockBase & { type: 'numbersequence'; props: NumberSequenceProps })
  | (BlockBase & { type: 'constantcard'; props: ConstantCardProps })
  | (BlockBase & { type: 'elementcard'; props: ElementCardProps })
  | (BlockBase & { type: 'energybarchart'; props: EnergyBarChartProps })
  | (BlockBase & { type: 'guitartab'; props: GuitarTabProps })
  | (BlockBase & { type: 'karyotype'; props: KaryotypeProps })
  | (BlockBase & { type: 'frayermodel'; props: FrayerModelProps })
  | (BlockBase & { type: 'numberbond'; props: NumberBondProps })
  | (BlockBase & { type: 'quizsession'; props: QuizSessionProps });

/* ──────────────────────────── chorddiagram ────────────────────────────
   Guitar/ukulele chord diagram: a fretboard grid with finger positions.
   Use for: "how do I play Em", "show me a G chord", "chord chart for Cmaj7". */

export interface ChordDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Chord name, e.g. "Em", "G", "Cmaj7". */
  chordName: string;
  /** One entry per string (6 for guitar, 4 for ukulele), low to high.
   *  0 = open, positive number = fret, 'x' = muted. */
  frets: (number | 'x' | 'o')[];
  /** Finger number (1–4) for each string (optional, matches frets array). */
  fingers?: (number | null)[];
  /** Starting fret for the diagram when chords are higher up the neck. */
  capoFret?: number;
  /** Chord tones (optional), e.g. ["E", "B", "E", "G", "B", "E"]. */
  notes?: string[];
  /** Optional instrument label, default "Guitar". */
  instrument?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── developmentmilestone ────────────────────────────
   Child developmental milestone tracker by age and domain.
   Use for: "what milestones for 18-month-old", "toddler development", "baby milestones". */

export type MilestoneDomain = 'motor' | 'language' | 'social' | 'cognitive';

export interface Milestone {
  label: string;
  achieved?: boolean;
  note?: string;
}

export interface DevelopmentMilestoneProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Age label, e.g. "18 months", "2 years", "6–9 months". */
  ageLabel: string;
  /** Grouped by domain. The component renders each domain as a section. */
  domains: {
    domain: MilestoneDomain;
    milestones: Milestone[];
  }[];
  footer?: HtmlString;
}

/* ──────────────────────────── teachdiagram ────────────────────────────
   A figure a teacher BUILDS step by step on one canvas: each step ADDS vector shapes + callout
   labels (the same DiagShape/DiagLabel vocabulary the media `diagram` block uses, in a 0–100
   space) with a short caption. It auto-plays paced to speaking time, then can be replayed or
   stepped. Use for anything understood by watching it assembled — a geometry proof, a free-body
   diagram building force by force, an anatomy figure, a process drawn out. The shapes are REAL
   elements of the topic; the block never fabricates data. */
export interface TeachStep {
  /** The shown caption for this step (one short narrated line). */
  caption: string;
  /** Spoken twin, split from [[shown|said]] markup when the caption reads differently aloud. */
  captionSpoken?: string;
  /** Shapes ADDED at this step, drawn on top of everything from earlier steps. */
  add: DiagShape[];
  /** Callout labels added at this step (optional). */
  labels?: DiagLabel[];
  /** Indices into THIS step's `add` to briefly pulse as the step lands (optional). */
  emphasize?: number[];
}
export interface TeachDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Ordered build steps; step n renders the union of `add` from steps 0..n. */
  steps: TeachStep[];
  /** The figure at rest before step 1 — axes, a frame (optional). */
  baseShapes?: DiagShape[];
  baseLabels?: DiagLabel[];
  /** Canvas width:height ratio (default 1.6 — same as the diagram block). */
  ratio?: number;
  footer?: HtmlString;
}

/* ──────────────────────────── gridmatrix ────────────────────────────
   A general 2-D grid with optional row/column headers and per-cell highlighting. Handles
   five concrete table archetypes driven purely by data — the model never emits layout:
     • 'punnett'       — genetic cross: allele headers, genotype cells, dominant cells accented
     • 'truth'         — logic truth table: monospace font, T/F colored per value
     • 'multiplication' — times-table: both axes are the factors, product in each cell
     • 'tenframe'      — early-math ten-frame: forced 2×5 grid of circle counters
     • 'grid'          — general labeled matrix (default)
   Overflows: horizontal scroll when > 6 columns; vertical cap at 400px. */
export interface GridMatrixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Selects rendering mode and cell styling. Default: 'grid'. */
  variant?: 'punnett' | 'truth' | 'multiplication' | 'tenframe' | 'grid';
  /** Labels for the leftmost header column (one per data row). */
  rowHeaders?: string[];
  /** Labels for the top header row (one per data column). */
  colHeaders?: string[];
  /** The 2-D cell contents; each inner array is a row. */
  cells: (string | number)[][];
  /** Cells to accent with the presence color (e.g. dominant genotypes in a Punnett square).
   *  Each tuple is [rowIndex, colIndex] into `cells`. */
  highlight?: [number, number][];
  /** A short explanatory note shown below the grid. */
  note?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── fractionbar ────────────────────────────
   Segmented bar (and optional pie) for one or more fractions side-by-side: each row fills
   `numerator` of `denominator` equal segments in the accent color, with the remainder in the
   surface track color. Pairs naturally with teaching fractions, probability, ratios, and part-whole
   relationships. Colors cycle through the three accent tokens when not specified.

   Bar: pure CSS flexbox — no SVG. Pie: compact SVG arc sectors beside the bar.
   Real data only — the model supplies actual numerator/denominator pairs; the component
   never fabricates data. Up to 8 rows sit without scrolling; beyond that the list scrolls. */

export interface FractionEntry {
  numerator: number;
  denominator: number;
  /** Row label, e.g. "Class A" or "⅜ chance". Defaults to "numerator/denominator". */
  label?: string;
  /** CSS color or design-token, e.g. 'var(--presence)'. Cycles automatically when omitted. */
  color?: string;
}

export interface FractionBarProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  fractions: FractionEntry[];
  /** Show a small pie/circle alongside each bar. Default: false. */
  showPie?: boolean;
  /** Optional note shown below the list. */
  note?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── wave ────────────────────────────
   A labelled sine wave for physics, sound, and signals: one or two sine waves drawn over an
   equilibrium axis, with measurement annotations — wavelength (λ, crest-to-crest horizontal),
   amplitude (A, centre-to-crest vertical), and an optional period (T) marker along the axis.
   Each wave is y(x) = amplitude · sin(2π·x/wavelength + phase); the component computes the path
   and all annotation geometry from the data — it never hand-places points. This is a physics
   wave with measurements, NOT an audio player. Real data only: the model supplies the actual
   amplitude / wavelength / phase and the component draws them to scale. */
export interface WaveSpec {
  /** Peak displacement from the centre line, in the same vertical units as the y-axis. */
  amplitude: number;
  /** Distance over which the wave repeats (crest to crest), in x-axis units. Must be > 0. */
  wavelength: number;
  /** Phase shift in radians (shifts the wave horizontally). Default 0. */
  phase?: number;
  /** Design-token color, e.g. 'var(--presence)'. Cycles automatically when omitted. */
  color?: AccentVar;
  /** Short legend label, e.g. "440 Hz" or "fundamental". */
  label?: string;
}
export interface WaveDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** One or two sine waves to draw over a shared axis. */
  waves: WaveSpec[];
  /** Label for the horizontal axis, e.g. "x (m)", "time (ms)", "distance". Default "x". */
  xUnit?: string;
  /** Draw the wavelength (λ) crest-to-crest bracket. Default true. */
  showWavelength?: boolean;
  /** Draw the amplitude (A) centre-to-crest marker. Default true. */
  showAmplitude?: boolean;
  /** Draw a period (T) marker along the axis — use when the x-axis is time. Default false. */
  showPeriod?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── energydiagram ────────────────────────────
   A reaction-coordinate / energy-profile diagram (chemistry + physics): energy (y) versus
   reaction progress (x). The curve runs reactants → transition-state peak(s) → products, with
   optional intermediate wells for multi-step mechanisms. The component computes the smooth profile,
   the activation energy (Ea, reactant level → first peak), and the overall ΔH (reactant → product)
   from the data and marks both with labelled arrows. Real data only — supply actual energies and
   the component places everything to scale; nothing is fabricated.

   Two ways to describe it:
     • `steps` — the full ordered profile: [{ label, energy, kind }]. Use for multi-step mechanisms
       (extra `kind:'ts'` peaks and `kind:'intermediate'` wells between reactant and product).
     • endpoint form — `reactants` / `ts` / `products` energies for the common single-barrier case. */

export type EnergyNodeKind = 'reactant' | 'ts' | 'intermediate' | 'product';

export interface EnergyNode {
  /** Short label, e.g. "Reactants", "Transition state", "Intermediate", "Products". */
  label: string;
  /** Energy of this point on the y-axis (kJ/mol, eV, … — same unit throughout). */
  energy: number;
  /** Role of the point. 'ts' = a peak (transition state); 'intermediate' = a well between peaks;
   *  'reactant'/'product' = the start/end plateaus. Default 'reactant' for the first node. */
  kind?: EnergyNodeKind;
  /** Override the per-kind accent color. */
  color?: AccentVar;
}

export interface EnergyDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The full energy profile, in reaction order (≥2 nodes). Preferred for multi-step mechanisms. */
  steps?: EnergyNode[];
  /** Endpoint form (used when `steps` is absent): reactant energy. */
  reactants?: number;
  /** Endpoint form: transition-state (peak) energy. Omit for a barrierless profile. */
  ts?: number;
  /** Endpoint form: product energy. */
  products?: number;
  reactantLabel?: string;
  tsLabel?: string;
  productLabel?: string;
  /** Y-axis title. Default "Energy". */
  yLabel?: string;
  /** Energy unit shown on the axis label and the Ea/ΔH readouts, e.g. "kJ/mol", "eV". */
  yUnit?: string;
  /** X-axis title. Default "Reaction progress". */
  xLabel?: string;
  /** Draw the activation-energy (Ea) arrow from the reactant level to the first peak. Default true. */
  showEa?: boolean;
  /** Draw the ΔH arrow from the reactant level to the product level. Default true. */
  showDelta?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── phylotree ────────────────────────────
   A phylogenetic / evolutionary tree (cladogram or phylogram): taxa at the tips, branches
   joining at common ancestors, read left→right. The model supplies a nested {name, children}
   tree; the component computes a tidy layout (tips evenly spaced, each internal node at the
   midpoint of its descendants) — no coordinates are authored. Optional clade brackets group
   sister taxa, and trait marks pin a derived shared character to the branch where it arose.
   When any node carries a branch `length`, x maps cumulative length through a linear scale so
   horizontal distance reads as evolutionary change (a phylogram); otherwise tips are flush
   right and only the topology is asserted. Use for evolution, taxonomy, "how are these
   species related". */

/** A node in the tree. A node with no `children` is a tip (a taxon/species). */
export interface PhyloNode {
  /** Taxon name at a tip, or an optional ancestor/clade name at an internal node. */
  name?: string;
  /** Descendant nodes. Omit (or empty) to make this a tip. */
  children?: PhyloNode[];
  /** Branch length leading into this node (substitutions, or time). Default 1.
   *  Supplying lengths anywhere switches the whole tree to a scaled phylogram. */
  length?: number;
  /** Branch support value (e.g. a bootstrap %), drawn at the internal node. */
  support?: number;
}

/** A bracket on the right margin grouping a monophyletic set of tips. */
export interface PhyloClade {
  label: string;
  /** Tip names (must match `name`s in the tree) that the bracket spans. */
  tips: string[];
  color?: string;
}

/** A shared derived character marked on the branch leading into the named node. */
export interface PhyloTrait {
  /** The node (tip or ancestor `name`) whose incoming branch carries the trait. */
  on: string;
  label: string;
  color?: string;
}

export interface PhyloTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The root of the tree. */
  root: PhyloNode;
  /** Right-margin brackets grouping sister taxa into named clades. */
  clades?: PhyloClade[];
  /** Trait marks on branches (where a shared character first appears). */
  traits?: PhyloTrait[];
  /** Axis label for a phylogram (e.g. "Millions of years ago", "substitutions/site").
   *  Only drawn when the tree has branch lengths. */
  distanceLabel?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── parsetree ────────────────────────────
   A sentence syntax / constituency parse tree for grammar: the literal words sit at the leaves,
   phrase nodes (S, NP, VP, PP, …) join down to them, drawn top-down. The model describes the
   nesting only — `{ label, children:[…] }` for a phrase, `{ label, word }` for a word leaf — and
   the component solves a tidy layout (leaves spaced evenly, every parent centred over its
   children). Use for grammar lessons, sentence diagramming, and any constituency/expression tree. */

export interface ParseTreeNode {
  /** The node's label. For a phrase: a constituent tag (S, NP, VP, PP, Det, N, V, Adj, …).
   *  For a word leaf with no `word`, the label IS the word shown at the bottom. */
  label: string;
  /** The literal word at a leaf. When set, `label` is rendered above it as the POS tag
   *  (e.g. `{ label: 'N', word: 'fox' }` draws N over "fox"). */
  word?: string;
  /** Child constituents. Present for phrase nodes; omit/empty for a leaf. */
  children?: ParseTreeNode[];
  /** Optional accent for this node's label (overrides POS auto-colouring). */
  color?: AccentVar;
}
export interface ParseTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The root constituent (typically the sentence node `S`). */
  root: ParseTreeNode;
  /** Cycle accent colours across the part-of-speech leaves instead of muting them. */
  colorPos?: boolean;
  /** Optional plain-text sentence shown above the tree for context. */
  sentence?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── celldiagram ────────────────────────────
   A labelled schematic biological cell. The model lists which organelles to show (and which to
   highlight) from a fixed preset library — it never positions anything. The component owns the
   cell-membrane outline, each organelle's glyph + location, and the leader line to its label.
   `cellType` switches between an animal cell (rounded membrane) and a plant cell (adds the rigid
   cell wall, the chloroplast, and the large central vacuole). Organelles that don't belong to the
   chosen cell type are silently dropped, so the diagram is always biologically correct. */

export interface CellPart {
  /** Which organelle to show. One of the preset keys (see propHints): 'nucleus' | 'nucleolus' |
   *  'mitochondria' | 'er' | 'golgi' | 'ribosomes' | 'vacuole' | 'lysosome' | 'centrosome' |
   *  'cytoplasm' | 'membrane' (animal-only: 'lysosome','centrosome'; plant-only: 'chloroplast',
   *  'cell wall'). Common synonyms (e.g. 'ribosome', 'rough ER', 'central vacuole') are accepted. */
  key: string;
  /** Override the default organelle name shown on its label. */
  label?: string;
  /** A short fact about this organelle — appears in the side legend (HTML not used; plain text). */
  note?: string;
  /** Emphasise this organelle (its glyph + label take the accent colour). */
  highlight?: boolean;
  /** Highlight colour. Default: var(--presence). */
  color?: AccentVar;
}
export interface CellDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** 'animal' (default, rounded membrane) or 'plant' (adds cell wall + chloroplast + vacuole). */
  cellType?: 'animal' | 'plant';
  /** The organelles to draw + label. Omit for a sensible default set of the cell type. */
  parts?: CellPart[];
  footer?: HtmlString;
}

/* ──────────────────────────── raydiagram ────────────────────────────
   An optics ray diagram on a principal axis: a thin lens (convex/concave) OR a mirror
   (concave/convex) at the centre, an upright object arrow at `objectDistance`, the standard
   construction rays, and the formed image arrow — with focal points F marked. The component
   solves the thin-lens / mirror equation (1/do + 1/di = 1/f) from the data, so the image
   position, size and nature (real/virtual, upright/inverted) are computed, never eyeballed.
   Converging elements (convex lens, concave mirror) take f > 0; diverging take f < 0 internally.
   For physics/optics topics: image formation, magnifiers, magnification, focal length. */
export type RayOpticalElement = 'convex-lens' | 'concave-lens' | 'concave-mirror' | 'convex-mirror';
export interface RayDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The optical element at the centre. Default 'convex-lens'. */
  element?: RayOpticalElement;
  /** Object distance from the element, in axis units (always drawn to the LEFT). */
  objectDistance: number;
  /** Focal length magnitude, in axis units. The element type sets its sign internally
   *  (converging = +, diverging = −). */
  focalLength: number;
  /** Object arrow height in axis units. Default 1. Only the ratio to the image matters. */
  objectHeight?: number;
  footer?: HtmlString;
}

/* ──────────────────────────── vectorfield ────────────────────────────
   A 2-D vector / slope field on a lattice: a short glyph at each sampled grid point showing the
   field's direction (and, by colour/length, its magnitude). Two glyph styles, chosen from the data:
     • vector field — an ARROW per sample, drawn from (u, v) = the field components at (x, y).
     • slope field  — a HEADLESS tangent dash per sample, drawn from `slope` (= dy/dx). Used for
       first-order ODEs y' = f(x, y), where direction is meaningful but there is no "length".
   Optional solution curves / streamlines (point polylines) overlay the field. Arrow lengths are
   normalised to a uniform size derived from the lattice spacing so the field reads cleanly; colour
   ramps low→high magnitude. Cartesian axes auto-fit from the data via the shared scale engine. For
   differential-equation slope fields, gradient ∇f fields, and physics E / B / gravitational /
   fluid-flow fields. The component computes every coordinate from the samples — nothing is
   hand-placed, and only the supplied field is drawn (real data only). */

/** One sampled field point. Carry `u`,`v` for a vector field OR `slope` (dy/dx) for a slope field. */
export interface FieldSample {
  /** Sample location — x in data units. */
  x: number;
  /** Sample location — y in data units. */
  y: number;
  /** Horizontal field component at (x, y). Used for a vector field; positive = right. */
  u?: number;
  /** Vertical field component at (x, y). Used for a vector field; positive = up. */
  v?: number;
  /** Tangent slope dy/dx at (x, y). Used for a slope field — drawn as a headless dash. */
  slope?: number;
}

/** A point on an overlaid solution curve / streamline. */
export interface FieldCurvePoint {
  x: number;
  y: number;
}

/** A solution curve / streamline drawn over the field as a polyline. */
export interface FieldCurve {
  /** Ordered points along the curve, in data coordinates. */
  points: FieldCurvePoint[];
  /** Legend label, e.g. "y = e^x − 1". */
  label?: string;
  /** Design-token colour; cycles through the accents when omitted. */
  color?: AccentVar;
}

export interface VectorFieldProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The sampled field: `{x,y,u,v}` per point for a vector field, or `{x,y,slope}` for a slope
   *  field. Best on a regular lattice (the glyph size is derived from the tightest spacing). */
  samples: FieldSample[];
  /** Optional solution curves / streamlines overlaid on the field, each a polyline of points. */
  curves?: FieldCurve[];
  /** X-axis range. Auto-fits from the data (origin included) when omitted. */
  xRange?: [number, number];
  /** Y-axis range. Auto-fits from the data (origin included) when omitted. */
  yRange?: [number, number];
  /** X-axis title. Default "x". */
  xLabel?: string;
  /** Y-axis title. Default "y". */
  yLabel?: string;
  /** Force the glyph style. Auto-detected from the samples otherwise: 'slope' when every sample
   *  carries `slope`, else 'vector'. */
  mode?: 'vector' | 'slope';
  /** Draw every arrow at the same length (direction-only) rather than scaling by magnitude.
   *  Default true — magnitude is still shown by colour. Ignored for slope fields. */
  normalize?: boolean;
  /** Ramp each glyph's colour from low (insight) to high (danger) magnitude. Default true. */
  colorByMagnitude?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── pedigree ────────────────────────────
   A genetics pedigree chart for tracing inheritance across generations: squares = male,
   circles = female, diamonds = unknown sex; a filled symbol is affected, a centre dot marks an
   unaffected carrier. People are linked by horizontal mating lines and descend to their children
   through a sibship bar. The component resolves each person's generation row from the parent graph
   and centres children under their parents — no coordinates are authored. Use for autosomal /
   X-linked inheritance, genetic counseling, "trace the trait through the family". */

export interface PedigreePerson {
  /** Stable id referenced by other people's `parents` / `partner`. */
  id: string;
  /** Symbol shape: square (male), circle (female), diamond (unknown / not specified). */
  sex: 'male' | 'female' | 'unknown';
  /** Filled symbol — expresses the phenotype/trait. */
  affected?: boolean;
  /** Unaffected carrier — drawn with a centre dot (ignored when `affected`). */
  carrier?: boolean;
  /** Drawn with a diagonal slash through the symbol. */
  deceased?: boolean;
  /** The proband (index case) — drawn with a small arrow into the symbol. */
  proband?: boolean;
  /** The two parents' ids, [motherId, fatherId] (order is normalised internally). */
  parents?: [string, string];
  /** A partner with no child of record — draws a bare mating line (e.g. a married-in spouse). */
  partner?: string;
  /** Force a generation row (0-based). Usually inferred from `parents`; set only for founders. */
  gen?: number;
  /** Short name/identifier shown under the symbol, e.g. "II-3" or "Maria". */
  label?: string;
  /** Optional genotype shown under the name, e.g. "Aa", "XᴬY". */
  genotype?: string;
}
export interface PedigreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Everyone in the pedigree; generation rows and child centring are computed from the links. */
  people: PedigreePerson[];
  /** Legend wording for a filled symbol. Default "Affected". */
  affectedLabel?: string;
  /** Legend wording for the centre-dot symbol. Default "Carrier". */
  carrierLabel?: string;
  /** Show the symbol-key legend below the chart. Default true. */
  showLegend?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── craftchart ────────────────────────────
   A gridded craft pattern chart — the literal chart a maker follows stitch by stitch: a rows×cols
   grid where each filled cell carries a colour and/or a stitch symbol (cross-stitch keys, knit
   abbreviations, bead colours, weave drafts). The component owns the grid and the edge rulers — it
   computes a dense rows×cols matrix from the sparse `cells` (every {r,c} the model gives is placed;
   unlisted cells stay blank fabric) and numbers the stitches/rows on the margins. A legend maps each
   symbol/colour to its meaning. `craft` only re-skins the cell (a stitch glyph vs a square block vs
   a round bead). Real data only — the model supplies the chart; the matrix and the rulers are
   computed from it. Use for cross-stitch / knitting / pixel-art / beading / weaving charts. */

export type CraftKind = 'knit' | 'crossstitch' | 'pixel' | 'bead' | 'weave';

export interface CraftCell {
  /** Row index (0-based, top→bottom). */
  r: number;
  /** Column index (0-based, left→right). */
  c: number;
  /** Cell fill — a CSS color or design-token, e.g. 'var(--insight)', '#c0392b' (a thread shade). */
  color?: string;
  /** Stitch symbol drawn in the cell, e.g. "×", "♥", "▲", "k", "p" — the chart's shorthand. */
  symbol?: string;
}
export interface CraftLegendEntry {
  /** The symbol this row keys, matching a cell's `symbol`. */
  symbol?: string;
  /** The colour this row keys, matching a cell's `color`. Drawn as a swatch. */
  color?: string;
  /** What the symbol/colour means, e.g. "DMC 321 — red", "knit", "purl". */
  meaning: string;
}
export interface CraftChartProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Number of rows in the chart. */
  rows: number;
  /** Number of columns (stitches per row). */
  cols: number;
  /** The filled cells — each {r,c} is placed on the grid; unlisted cells are blank fabric. */
  cells: CraftCell[];
  /** The key mapping symbols/colours to their meaning. */
  legend?: CraftLegendEntry[];
  /** Re-skins each cell: 'crossstitch'/'knit' show the stitch glyph, 'pixel' a flat block, 'bead'
   *  a round bead, 'weave' a solid square. Default 'crossstitch'. */
  craft?: CraftKind;
  /** Short plain-language caption under the chart. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── bohrmodel ────────────────────────────
   A Bohr model of an atom: a central nucleus (proton + optional neutron count) surrounded by
   concentric electron shells, each carrying exactly the given number of electrons drawn as dots
   evenly spaced on the ring. Ring radii and dot placement are computed from the data, never
   eyeballed. For atomic-structure / electron-configuration intros (chemistry + physics):
   "draw the Bohr model of sodium", "show oxygen's electron shells", "what does carbon look like". */

export interface BohrModelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Number of protons in the nucleus (the atomic number). */
  protons: number;
  /** Number of neutrons in the nucleus. Omit if unknown — the mass number then equals protons. */
  neutrons?: number;
  /** Electrons per shell, innermost first. e.g. [2,8,1] = sodium, [2,8,8] = argon, [2,4] = carbon.
   *  Each ring draws exactly this many dots; the sum is the electron total. */
  shells: number[];
  /** Element symbol shown above the atom, e.g. "Na", "O", "C". */
  symbol?: string;
  /** Element name shown beneath the atom, e.g. "Sodium". */
  name?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── equationbalancer ────────────────────────────
   A chemical-equation balancer: reactants → products with each species drawn as coefficient·formula
   (subscript digits are detected and lowered automatically), plus a per-element conservation tally
   that reads insight when the atoms on each side match and danger when they don't. The component
   never invents chemistry — it renders the species and tally it is given, and only computes the
   visual atom-count comparison (matched vs. mismatched) from the supplied left/right counts. Use for
   "balance this equation", combustion, stoichiometry, and conservation-of-mass lessons. */

export interface EquationSpecies {
  /** Chemical formula, e.g. "CH4", "O2", "H2O". Digits are rendered as subscripts. */
  formula: string;
  /** Stoichiometric coefficient (a leading "1" is suppressed). Default 1. */
  coeff: number;
}
export interface ElementTally {
  /** Element symbol, e.g. "C", "H", "O". */
  element: string;
  /** Total atoms of this element on the reactant (left) side. */
  left: number;
  /** Total atoms of this element on the product (right) side. */
  right: number;
}
export interface EquationBalancerProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  reactants: EquationSpecies[];
  products: EquationSpecies[];
  /** Per-element atom conservation check. Each row reads insight when left === right, else danger. */
  elementTally?: ElementTally[];
  /** Whether the equation is balanced — drives the badge. When omitted it is derived from the tally
   *  (balanced only if every element's left equals its right). */
  balanced?: boolean;
  /** Short plain-language reading under the equation. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── yieldcalc ────────────────────────────
   A stoichiometry / percent-yield calculator: the headline is percent yield =
   actualYield / theoreticalYield × 100, computed here from the caller's own two figures —
   never fabricated. An optional reagent-moles reference table sits below, with the limiting
   reagent badged when it matches a row. Degrades gracefully: with only `reaction` and/or
   `limitingReagent` given and no yield figures, it shows just that reaction/reagent context —
   no invented percent. For percent-yield problems, limiting-reagent identification, and
   stoichiometry lessons. */
export interface YieldMolesEntry {
  /** Reagent formula or name, e.g. "H2", "O2", "NaOH". */
  reagent: string;
  /** Moles on hand of this reagent. */
  moles: number;
}
export interface YieldCalcProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The balanced equation as written, e.g. "2 H2 + O2 -> 2 H2O". Shown verbatim (with "->"/"=>"
   *  rendered as "→") as reference context — never re-parsed or re-balanced here. */
  reaction?: string;
  /** Name of the limiting reagent, e.g. "O2". Matched case-insensitively against
   *  `molesAvailable[].reagent` to badge that row. */
  limitingReagent?: string;
  /** Moles on hand of each reagent — a small reference table. */
  molesAvailable?: YieldMolesEntry[];
  /** Theoretical (maximum possible) yield from stoichiometry. */
  theoreticalYield?: number;
  /** Actual yield obtained. Percent yield only renders when both this and `theoreticalYield`
   *  are given and valid. */
  actualYield?: number;
  /** Unit for the yield figures, e.g. "g", "mol", "mL". Default "g". */
  unit?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── vseprmolecule ────────────────────────────
   A 3-D molecular-geometry (VSEPR) figure: a central atom with bonds drawn out to its substituents
   at the angles implied by the electron-domain geometry, lone pairs shown as dot-pairs, with the
   shape name and ideal bond angle labelled. The component owns the geometry — it places every bonded
   atom and lone pair from the named `shape` (linear / trigonal / tetrahedral / bent / pyramidal /
   octahedral), drawing wedge/dash bonds for depth — so the model supplies only the chemistry, never
   coordinates. Use for VSEPR, molecular shape, and bond-angle questions. */

export interface VseprBond {
  /** The bonded atom's element symbol, e.g. "H", "Cl", "O". */
  atom: string;
  /** Bond order. Default 1. */
  order?: 1 | 2 | 3;
}
export interface VseprMoleculeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Central atom symbol, e.g. "O", "C", "N". */
  central: string;
  /** The bonded atoms around the central atom (drawn at the shape's geometry). */
  bonds: VseprBond[];
  /** Number of lone pairs on the central atom, drawn as dot-pairs. Default 0. */
  lonePairs?: number;
  /** VSEPR electron-domain geometry name — sets where the bonds point. One of
   *  'linear' | 'trigonal' | 'tetrahedral' | 'bent' | 'pyramidal' | 'octahedral'. Inferred from the
   *  bond + lone-pair count when omitted. */
  shape?: string;
  /** Ideal bond angle label, e.g. "104.5°", "109.5°", "120°". */
  bondAngle?: string;
  /** Short plain-language caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── unitcircle ────────────────────────────
   A trigonometry unit circle: the swept angle arc from the +x axis, the terminal radius to the point
   (cos θ, sin θ), the dropped reference triangle (the sin and cos legs), and labels for the angle in
   both degrees and radians plus the exact coordinate. Everything — the point, the arc, the triangle,
   the radian conversion, the special-angle ticks — is computed from `angleDeg`; the component never
   hand-places anything. Use for trig fundamentals, reference angles, and the sine/cosine of standard
   angles. */

export interface UnitCircleProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The angle in degrees, measured CCW from the +x axis. Any real value (wrapped to 0–360). */
  angleDeg: number;
  /** Tick the standard special angles (0/30/45/60/90…) around the circle. Default true. */
  showSpecial?: boolean;
  /** Short plain-language caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── solidfigure ────────────────────────────
   A 3-D solid drawn in oblique projection (front face + a depth offset), with dashed hidden edges,
   optional labelled vertex/edge/face counts, and surface-area / volume call-outs. The component
   computes the projected polygon points from the chosen `solid` and `dims` — so the model supplies
   only the figure, its dimensions, and the measured SA/V; nothing is eyeballed. Use for solid
   geometry, surface area & volume, and Euler's V−E+F lessons. */

export type SolidKind = 'cube' | 'rectprism' | 'cylinder' | 'cone' | 'sphere' | 'pyramid' | 'prism';

export interface SolidFigureProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Which solid to draw. */
  solid: SolidKind;
  /** Relative dimensions used only to shape the drawing (width, height, depth, radius). */
  dims?: { w?: number; h?: number; d?: number; r?: number };
  /** Vertex / edge / face counts shown as labelled chips (for Euler's-formula work). */
  labels?: { v?: number; e?: number; f?: number };
  /** Surface-area read-out, e.g. "94 cm²" (the model supplies the computed value + unit). */
  surfaceArea?: string;
  /** Volume read-out, e.g. "60 cm³". */
  volume?: string;
  /** Short plain-language caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── crosssection ────────────────────────────
   A labelled stratified cross-section: stacked bands sized by thickness (Earth strata, tissue
   layers, ocean zones) with leader labels and an optional cumulative depth axis — OR concentric
   rings (a planet's interior) when `orientation` is 'concentric'. Each band is tinted from its
   `color` or by cycling the accent tokens. The component computes every band's size and position
   from the supplied thicknesses; the model supplies the real layers and depths only. Use for
   geology, anatomy, oceanography, and "what's inside …" cutaways. */

export interface CrossLayer {
  /** Layer name, e.g. "Crust", "Mantle", "Epidermis". */
  name: string;
  /** Layer thickness in `depthUnit`s — drives the band's relative size. Must be > 0. */
  thickness: number;
  /** Design-token tint for the band; cycles the accents when omitted. */
  color?: AccentVar;
  /** Short note shown beside the layer label, e.g. a depth range or composition. */
  note?: string;
}
export interface CrossSectionProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The layers, listed top→bottom (or outer→inner for a concentric section). */
  layers: CrossLayer[];
  /** 'horizontal' (default) stacks bands; 'concentric' draws nested rings (a planet interior). */
  orientation?: 'horizontal' | 'concentric';
  /** Unit shown on the cumulative depth axis, e.g. "km", "mm", "m". */
  depthUnit?: string;
  /** Short plain-language caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── pianokeys ────────────────────────────
   A piano keyboard with chord / scale / individual notes lit up. The component owns the
   keyboard — it lays out the white and black keys across the requested octave range and
   computes each highlighted note's key position from its scientific-pitch name (e.g. "E4").
   Highlight colour follows the note's `role` (root/third/fifth…) or `finger` number, and an
   optional label sits on each lit key. The model supplies only which notes to light and what
   they mean — never coordinates. Use for chords, scales, intervals, and "what notes are in …". */

export interface PianoHighlight {
  /** Scientific pitch to light up, e.g. "C4", "E4", "G#4", "Bb3". Must fall in the rendered range. */
  note: string;
  /** Harmonic role — sets the key colour and an optional badge, e.g. "root", "3rd", "5th", "7th". */
  role?: string;
  /** Fingering number (1–5) shown on the key; also tints the key when no `role` is given. */
  finger?: number;
}
export interface PianoKeysProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** How many octaves to draw, starting at `startNote`. Default 2. Clamped to 1–4. */
  octaves?: number;
  /** Leftmost key in scientific pitch — must be a natural (white) note, e.g. "C3". Default "C3". */
  startNote?: string;
  /** The notes to light up across the keyboard. */
  highlight: PianoHighlight[];
  /** Chord / scale name shown beside the keyboard, e.g. "Cmaj7", "A minor pentatonic". */
  chordName?: string;
  /** Print each highlighted note's letter name on its key. Default true. */
  showLabels?: boolean;
  /** Short plain-language caption under the keyboard. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── fretboardmap ────────────────────────────
   A full-neck guitar/bass fretboard map: the nut, fret wires, strings, and the standard inlay
   markers (3/5/7/9, double at 12), with coloured dots placed at the given string/fret positions.
   The component owns the neck geometry — it computes every fret and string coordinate and places
   each dot from its `{string, fret}` — so the model supplies only which positions belong to the
   shape and what interval each is. Roots are emphasised. Use for scales, arpeggios, chord shapes,
   and "show me X across the neck". */

export interface FretDot {
  /** String index, 1 = thickest/lowest string (low E on a guitar) up to `strings`. */
  string: number;
  /** Fret number, 0 = open (drawn on the nut) up to `frets`. */
  fret: number;
  /** Interval / note label shown on the dot, e.g. "R", "b3", "5", "A". */
  label?: string;
  /** Harmonic role — drives the dot colour. Roots are emphasised. */
  role?: 'root' | 'third' | 'fifth' | 'other';
}
export interface FretboardMapProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Number of strings. Default 6 (guitar); 4 = bass/ukulele, 5 = 5-string bass. Clamped 4–7. */
  strings?: number;
  /** Number of frets drawn from the nut. Default 12. Clamped 4–24. */
  frets?: number;
  /** Open-string tuning, thickest→thinnest, e.g. ["E","A","D","G","B","E"]. Drawn at the nut. */
  tuning?: string[];
  /** The notes to mark on the neck. */
  dots: FretDot[];
  /** Scale / arpeggio name shown beside the neck, e.g. "A minor pentatonic". */
  scaleName?: string;
  /** Short plain-language caption under the neck. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── circleoffifths ────────────────────────────
   The circle of fifths: the twelve major keys spaced a fifth apart around an outer ring, their
   relative minors on an inner ring, and each key's signature (number of sharps/flats) on the rim.
   The layout is built in — the component places all twelve keys and computes each segment's angle
   — so the model supplies only which key to highlight and which neighbours to spoke to. Use for
   key signatures, relative keys, the IV–I–V relationship, and "what key is related to …". */

export interface CircleOfFifthsProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The major key to centre on, e.g. "C", "G", "Bb", "F#". Highlighted on the outer ring. */
  highlightKey?: string;
  /** Draw the relative-minor inner ring. Default true. */
  showMinors?: boolean;
  /** Other keys to spoke to from the highlighted key — its IV, V, and relative minor make sense.
   *  Each is a major key name ("D", "C") or a minor name with an "m" suffix ("Em"). */
  related?: string[];
  /** Short plain-language caption under the wheel. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── odontogram ────────────────────────────
   A dental chart: the upper and lower arches drawn tooth-by-tooth, each tooth numbered per the
   chosen system (Universal 1–32 or FDI two-digit) and tinted by its clinical status (caries,
   filling, crown, missing, implant, root canal). A legend maps each status to its colour. The
   component owns both arches and the canonical numbering — the model supplies only each tooth's
   number, status, and an optional surface/note. Use for charting, treatment plans, "show me which
   teeth …". */

export type ToothStatus =
  'healthy' | 'caries' | 'filling' | 'crown' | 'missing' | 'implant' | 'rootcanal';

export interface ToothEntry {
  /** Tooth number in the chart's `system` — Universal 1–32 or FDI two-digit (e.g. 11, 26, 36). */
  n: string | number;
  /** Clinical status — sets the tooth's tint and its legend bucket. */
  status: ToothStatus;
  /** Affected surface(s), e.g. "MOD", "occlusal", "buccal". Shown in the per-tooth note. */
  surface?: string;
  /** Short clinical note shown beneath the chart when this tooth is the focus. */
  note?: string;
}
export interface OdontogramProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Numbering system: 'universal' (1–32, default) or 'fdi' (two-digit quadrant notation). */
  system?: 'universal' | 'fdi';
  /** Every charted tooth and its status. Teeth not listed are drawn healthy by their number. */
  teeth: ToothEntry[];
  /** Short plain-language caption under the chart. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── dnahelix ────────────────────────────
   A DNA double helix or ladder diagram: two backbones connected by colour-coded base-pair rungs
   (A-T in warning, G-C in presence/insight blend). The component owns the helix geometry and the
   ladder layout; the model supplies the ordered base pairs and whether to highlight any. Two render
   modes — 'helix' draws the classic twisted ribbon; 'ladder' draws the unrolled flat ladder for
   Watson-Crick pairing lessons. Real data only: base pairs are A/T/G/C; the component never
   fabricates sequence data. */
export interface DnaBase {
  /** The Watson-Crick pair: 'AT', 'TA', 'GC', or 'CG'. */
  pair: 'AT' | 'TA' | 'GC' | 'CG';
  /** Emphasise this rung (warning color + thicker stroke). */
  highlight?: boolean;
}
export interface DnaHelixProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Ordered base pairs. When omitted, a default sequence of `count` pairs is used. */
  bases?: DnaBase[];
  /** Number of base pairs to draw when `bases` is omitted. Default 10, clamped to 16. */
  count?: number;
  /** 'helix' (default) draws the twisted ribbon; 'ladder' draws the flat unrolled form. */
  mode?: 'helix' | 'ladder';
  /** Print A/T/G/C letter labels on each rung. Default true. */
  showLabels?: boolean;
  /** Short plain-language caption under the diagram. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── linespectrum ────────────────────────────
   An atomic emission or absorption spectrum: a horizontal strip showing the visible wavelength
   range (380–780 nm) filled with the spectral rainbow gradient, with sharp vertical lines at the
   supplied wavelengths — bright lines for emission, dark cutout lines for absorption. Axis ticks
   every 50 nm label the scale. Serves atomic-spectra, quantum-energy-level, and spectroscopy
   lessons. Real data only: the wavelengths and intensities come from the model (e.g. hydrogen's
   Balmer series lines at 410/434/486/656 nm); the colours are computed from the wavelength. */
export interface SpectrumLine {
  /** Wavelength in nanometres (380–780 for the visible range). */
  wavelength: number;
  /** Relative intensity (0–1). Controls the vertical height of the emission line. Default 1. */
  intensity?: number;
  /** Short label drawn above the strip, e.g. "Hα" or "656 nm". */
  label?: string;
}
export interface LineSpectrumProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The spectral lines to draw. */
  lines: SpectrumLine[];
  /** 'emission' (default) shows bright lines on a dark strip; 'absorption' shows dark lines on the
   *  rainbow. */
  mode?: 'emission' | 'absorption';
  /** Visible wavelength window [min, max] in nm. Default [380, 780]. */
  range?: [number, number];
  /** Element or series label shown below the strip, e.g. "Hydrogen (Balmer series)". */
  elementLabel?: string;
  /** Short plain-language caption under the spectrum. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── pyramidtiers ────────────────────────────
   A triangular hierarchy diagram (Maslow pyramid, food pyramid, priority stack): stacked
   trapezoid bands narrowing from bottom (widest) to top (narrowest), each labelled with its tier
   name. Optional per-tier value and note sit to the right of the band. The geometry (trapezoid
   widths, SVG layout) is computed from tier count; the model supplies only the tier labels,
   optional values, and colours. Use for hierarchies, rankings, and layered frameworks. */
export interface PyramidTier {
  /** Tier label centred in the band, e.g. "Self-actualisation", "Safety". */
  label: string;
  /** Short value string shown to the right of the tier, e.g. "20%". */
  value?: string;
  /** Explanatory note shown to the right (below value if value is also set). */
  note?: string;
  /** Accent color for this tier's fill, e.g. 'var(--presence)'. Cycles automatically when omitted. */
  color?: AccentVar;
}
export interface PyramidTiersProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The tiers, ordered bottom → top (index 0 = widest base tier). Max 8. */
  tiers: PyramidTier[];
  /** Show tier notes to the right of the pyramid. Default true. */
  showNotes?: boolean;
  /** Short plain-language caption under the diagram. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── twocolumnproof ────────────────────────────
   A classic two-column geometric or algebraic proof: a "Given / Prove" header block, an optional
   diagram reference, then a numbered table with Statement (left) and Reason (right) columns. The
   final row carries a QED mark (∎). The component owns the table layout; the model supplies the
   real steps of the proof. Covers geometry proofs, algebraic derivations, and logical arguments. */
export interface ProofStep {
  /** The statement for this step, e.g. "∠ABC ≅ ∠DEF". */
  statement: string;
  /** The justification, e.g. "Alternate interior angles". */
  reason: string;
}
export interface TwoColumnProofProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The "Given" information, e.g. "AB ∥ CD, EF is a transversal". */
  given: string;
  /** What is to be proved, e.g. "∠1 ≅ ∠2". */
  prove: string;
  /** The ordered proof steps. */
  steps: ProofStep[];
  /** Optional reference to a diagram, e.g. "See figure: two parallel lines cut by a transversal." */
  diagram?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── gridtransform ────────────────────────────
   A 2-D linear transformation visualizer: the standard integer grid before and after applying a
   2×2 matrix, with the transformed basis vectors (î in presence, ĵ in warning) drawn as arrows
   from the origin, and real eigenvector rays (dashed, danger) when the matrix has real eigenvalues.
   The determinant and area scale are printed in the corner. Animates on mount (original grid →
   transformed). For linear-algebra lessons on matrix transformations, eigenvectors, and determinant
   geometry. The model supplies only the 2×2 matrix entries; all geometry is computed. */
export interface GridTransformProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The 2×2 transformation matrix as [[a, b], [c, d]], i.e. [[row0], [row1]]. */
  matrix: [[number, number], [number, number]];
  /** Draw the real eigenvector rays when the matrix has real eigenvalues. Default true. */
  showEigens?: boolean;
  /** Animate the grid from original to transformed on mount. Default true. */
  animated?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── areamodel ────────────────────────────
   A rectangular area model for polynomial multiplication: a grid where the column headers are the
   terms of one factor (`factorA`) and the row headers are the terms of the other (`factorB`), and
   each interior cell shows the product of its row × column terms. An optional sum line below
   collects all partial products into the expanded form. The model supplies the numeric factor
   arrays and optional algebraic label overrides; all products and the sum are computed. Covers
   two-digit multiplication, distributive law, and polynomial expansion (FOIL). */
export interface AreaModelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The column factor — one number or algebraic term per column, e.g. [20, 3] or [x, 5]. */
  factorA: number[];
  /** The row factor — one number or algebraic term per row, e.g. [10, 4] or [x, -2]. */
  factorB: number[];
  /** Algebraic label overrides for factorA entries, e.g. ["x", "5"] over [1, 5]. */
  labelsA?: string[];
  /** Algebraic label overrides for factorB entries. */
  labelsB?: string[];
  /** Show the computed product in each interior cell. Default true. */
  showProducts?: boolean;
  /** Show the expanded-form sum line below the grid. Default true. */
  showSum?: boolean;
  /** Short plain-language caption under the model. */
  caption?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── polarplot ────────────────────────────
   A polar coordinate or parametric curve plotter: one or more curves described by mathematical
   expressions are evaluated over a t domain, scaled to fit the polar grid (concentric rings at
   25/50/75/100% of the radius, 12 radial spokes, axis labels at 0/π/2/π/3π/2), and drawn as
   SVG polylines. In 'polar' mode r = f(t) (e.g. "2 + cos(t)" for a limaçon); in 'parametric'
   mode fn = "x(t), y(t)" (a comma-separated pair). Expressions are evaluated safely — only
   math ops and named functions (sin/cos/tan/sqrt/abs/exp/log) are allowed. For polar curves,
   roses, limaçons, cardioids, and parametric figures. */
export interface PolarCurve {
  /** The mathematical expression(s).
   *  Polar mode: a single expression in t, e.g. "2 + cos(3*t)".
   *  Parametric mode: two expressions separated by a comma, e.g. "cos(t), sin(2*t)". */
  fn: string;
  /** Legend label, e.g. "r = 2 + cos 3θ". */
  label?: string;
  /** Design-token color; cycles through the accents when omitted. */
  color?: AccentVar;
}
export interface PolarPlotProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Plot mode: 'polar' (default, r = f(t)) or 'parametric' (fn = "x(t), y(t)"). */
  type?: 'polar' | 'parametric';
  /** Convenience shorthand for a single-curve polar plot — equivalent to curves[0].fn. */
  fn?: string;
  /** One or more curves to plot. Takes precedence over `fn`. */
  curves?: PolarCurve[];
  /** The parameter domain [tMin, tMax] in radians. Default [0, 2π]. */
  domain?: [number, number];
  footer?: HtmlString;
}

/* ──────────────────────────── taylorseries ────────────────────────────
   Interactive Taylor-series approximation: plots the true function and its n-term Taylor partial
   sum on the same axes, with an optional error-shading band between them. A slider lets the user
   add more terms and watch convergence live; the partial-sum formula is shown below the chart.
   Supported functions: sin, cos, exp (around any center), ln (always around 1), arctan. For
   calculus/analysis lessons: "how does the Taylor series converge?", "show me 5 terms of sin x",
   "why does ln x converge only near x=1?". The component computes every value analytically. */
export interface TaylorSeriesProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The function to approximate. */
  fn: 'sin' | 'cos' | 'exp' | 'ln' | 'arctan';
  /** Center of the expansion (ignored for ln, which always expands around 1). Default 0. */
  center?: number;
  /** Maximum number of terms the slider can reach. Default 7. */
  maxTerms?: number;
  /** Pin the displayed term count (disables the slider). Default: interactive at 3. */
  showTerms?: number;
  /** Override the x-axis domain. Defaults to a sensible range per function. */
  xDomain?: [number, number];
  /** Shade the error band between the true function and the approximation. Default false. */
  showError?: boolean;
  footer?: HtmlString;
}

/* ──────────────────────────── phaseportrait ────────────────────────────
   A 2-D phase portrait for an autonomous ODE system ẋ = f(x,y), ẏ = g(x,y): a vector field of
   short arrows showing the direction and magnitude at each grid point, optional x- and y-nullcline
   segments (where ẋ = 0 or ẏ = 0), detected equilibria classified by their Jacobian (stable node/
   spiral, unstable node/spiral, saddle, center), and optional RK4 trajectories from supplied
   initial conditions. For differential-equations topics: "draw the phase portrait of dx/dt = -y,
   dy/dt = x", "show me the nullclines and equilibria of the predator-prey system". Expressions are
   evaluated safely — only math ops and named functions are allowed. */
export interface PhasePortraitProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The x-component expression in terms of x and y, e.g. "-y + x*(1 - x^2 - y^2)". */
  fx: string;
  /** The y-component expression in terms of x and y, e.g. "x + y*(1 - x^2 - y^2)". */
  gy: string;
  /** x-axis range. Default [-4, 4]. */
  xDomain?: [number, number];
  /** y-axis range. Default [-4, 4]. */
  yDomain?: [number, number];
  /** Initial conditions for trajectory integration; each draws one RK4 orbit. */
  trajectories?: Array<{ x0: number; y0: number }>;
  /** Draw x- and y-nullcline segments. Default true. */
  showNullclines?: boolean;
  /** x-axis label. Default "x". */
  xlabel?: string;
  /** y-axis label. Default "y". */
  ylabel?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── energybarchart ────────────────────────────
   A physics "LOL" (Loss/gain Of energy, or energy-bar) chart: one bar group per snapshot in a
   scenario (Initial → Final, plus any intermediate states), all sharing ONE y-scale so the bars
   are directly comparable and conservation is visually checkable. Each bar is a store of energy
   (kinetic KE, gravitational Ug, elastic Us, thermal Eth, external work W…); a value can be
   negative (drawn below the zero line — work done ON vs BY the system, energy leaving a store).
   The running total under each group makes "energy in = energy out" obvious at a glance. */
export interface EnergyBar {
  /** The energy store, shown as the bar label — an OPEN token, e.g. "KE", "PE", "Ug", "Us",
   *  "Eth" (thermal), "W" (external work). Unknown kinds still render with a cycled accent. */
  kind: string;
  /** The amount of energy in this store, in `unit`. Negative values extend below the zero line. */
  value: number;
}
export interface EnergySnapshot {
  /** State label, e.g. "Initial", "At the bottom", "Final". */
  label: string;
  /** The energy stores at this instant. An empty array renders an all-zero (flat) group. */
  bars: EnergyBar[];
}
export interface EnergyBarChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The scenario as a sequence of instants; each becomes a bar group under a shared scale. */
  snapshots: EnergySnapshot[];
  /** Objects inside the chosen system, drawn as a small circled strip above the chart, e.g.
   *  ["ball", "Earth"]. Purely illustrative — clarifies which stores are being tracked. */
  system?: string[];
  /** Energy unit shown on the axis and totals. Default "J". */
  unit?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── guitartab ────────────────────────────
   Guitar/bass tablature: a 6-line TAB staff (or as many lines as the tuning has), split into
   measures by barlines and wrapped to multiple rows, with fret numbers placed ON the string
   lines at proportional beat positions and technique glyphs (hammer-on, pull-off, bend, slide)
   arcing between the affected notes. The left edge is labelled with the open-string letters from
   the tuning (lowest string at the bottom). The model supplies only the notes; all geometry,
   barlines and wrapping are computed. */
export interface TabNote {
  /** 1-based measure number. */
  measure: number;
  /** Beat position within the measure, 1‥beatsPerMeasure (fractional beats allowed). */
  beat: number;
  /** String number, 1 = highest (thinnest, high e) up to 6 = lowest (thickest, low E). */
  string: number;
  /** Fret number, 0 = open, up to 24. */
  fret: number;
  /** Playing technique linking this note to the next on the same string. */
  technique?: 'h' | 'p' | 'b' | 's' | '/' | 'x';
}
export interface GuitarTabProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The notes to place. Out-of-range strings/frets are clamped rather than dropped. */
  notes: TabNote[];
  /** Open-string tuning, low→high, e.g. "EADGBE" (standard) or "DADGAD". Default "EADGBE". */
  tuning?: string;
  /** Beats per measure (the time-signature numerator). Default 4. */
  beatsPerMeasure?: number;
  /** Measures per row before wrapping. Default 4. */
  measuresPerRow?: number;
  /** Tempo in BPM, shown as "♩ = n" beside the title. */
  tempo?: number;
  footer?: HtmlString;
}

/* ──────────────────────────── karyotype ────────────────────────────
   A human karyogram: the 22 autosome pairs (sized on a real decreasing length scale) plus the sex
   pair, each chromosome drawn as a rounded SVG shape with a centromere pinch whose position runs
   metacentric→acrocentric by group, and 3–5 deterministic G-bands seeded by the pair number. An
   anomaly redraws its slot — trisomy adds a third copy, monosomy leaves one, deletion/duplication
   marks a band — and tints the slot's ring. Educational content only. */
export interface KaryotypeAnomaly {
  /** The affected pair: "1"‥"22" or "X"/"Y" (a number is accepted and coerced). */
  pair: string | number;
  /** The chromosomal change. */
  kind: 'trisomy' | 'monosomy' | 'deletion' | 'duplication';
  /** Short caption shown under the slot, e.g. "Down syndrome". */
  note?: string;
}
export interface KaryotypeProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Sex-chromosome pair to draw. Default "XX". */
  sex?: 'XX' | 'XY';
  /** Numerical/structural anomalies to render. */
  anomalies?: KaryotypeAnomaly[];
  /** Pair ids to ring for emphasis (no anomaly needed), e.g. ["21", "X"]. */
  highlightPairs?: string[];
  footer?: HtmlString;
}

/* ──────────────────────────── frayermodel ────────────────────────────
   A Frayer vocabulary model: the term (with optional pronunciation) over a 2×2 panel grid —
   Definition, Characteristics, Examples, Non-examples — the classic graphic organiser for
   building deep word knowledge. Each list panel is equal-height with bounded scroll for long
   lists. The model supplies the term and the four facets; the component owns the layout. */
export interface FrayerModelProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The vocabulary term / concept being defined. */
  term: string;
  /** Respelling or IPA pronunciation, e.g. "/ˌfoʊtəˈsɪnθəsɪs/". */
  pronunciation?: string;
  /** The definition, in the learner's own words (one panel of prose). */
  definition: string;
  /** Essential characteristics / attributes. */
  characteristics: string[];
  /** Examples that fit the term. */
  examples: string[];
  /** Non-examples — things that do NOT fit, sharpening the boundary. */
  nonexamples: string[];
  footer?: HtmlString;
}

/* ──────────────────────────── numberbond ────────────────────────────
   A K–2 part-part-whole number bond: the whole in a large circle above, its parts in smaller
   circles below joined by connectors. Any value may be left null to render a "?" the learner
   fills in. With `factFamily` on and the whole plus exactly two parts known, the four related
   addition/subtraction equations are shown, teaching how the same three numbers form a family. */
export interface NumberBondProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The whole (top circle). null renders a "?" for the learner to find. */
  whole: number | null;
  /** The parts (2–4 circles below). A null entry renders a "?". */
  parts: (number | null)[];
  /** Show the four related equations when the whole and exactly two parts are known. Default false. */
  factFamily?: boolean;
  /** Short caption under the bond, e.g. "Ways to make 10". */
  label?: string;
  footer?: HtmlString;
}

/* ──────────────────────────── quizsession ────────────────────────────
   A GRADED RUN of questions — "quiz me on chapter 7", "test me on the 50 states", "give me a
   mock exam". `quiz` is one stateless card whose answer sits on screen the moment it renders;
   a run is what a study ask actually wants: one question at a time, a rail tracking answered /
   correct / missed, the explanation held back until the learner has committed, and a wrap-up
   score that can re-queue only the questions they got wrong.

   Real data only. The model supplies every question, its choices, which choice is right, and
   the explanation; the score is counted from the learner's own picks. A question the component
   cannot grade (no prompt, fewer than two choices, nothing marked correct) is dropped from the
   run rather than shown as an unanswerable item that would silently sink the score. */
export interface QuizSessionQuestion {
  /** The question prompt (HTML). */
  question: HtmlString;
  /** The choices — shares `quiz`'s option shape, per-option feedback included. Exactly one
   *  should be marked `correct`. */
  options: QuizOption[];
  /** Explanation revealed only AFTER this question is answered. */
  explanation?: HtmlString;
  /** Short label for the question — a chapter, sub-topic, or difficulty. */
  tag?: string;
}
export interface QuizSessionProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** What the run covers, e.g. "Chapter 7 · Cellular respiration". Shown beside the title. */
  subject?: string;
  questions: QuizSessionQuestion[];
  /** Pass threshold as a percentage (0–100). Omit when the run isn't pass/fail. */
  passMark?: number;
  footer?: HtmlString;
}
