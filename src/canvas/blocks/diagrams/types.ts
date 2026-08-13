// diagrams family block types — freeform labeled node/edge figures.
//
// Where `flows` draws strictly hierarchical structure (trees, DAGs, org charts,
// kanban), this family draws the relationships those can't express: cycles, state
// machines, free-body diagrams, concept maps, feedback loops — anything that's a
// set of labeled nodes with labeled connections, in any topology. One general
// primitive (`diagramflow`) covers the lot; the model supplies only data, never
// layout math or styling, so every figure inherits the design system. (The key is
// `diagramflow`, not `diagram`, which the media family already uses for a vector
// shapes-and-labels figure.)
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';
import type { BigOClass } from '../charts2/types';
import type { MindAtom, MindCluster, MindLink, MindUnsaid } from '../../../live/mindshape/types';

/** A node's visual role — drives its accent and glyph, nothing structural. */
export type DiagramNodeKind = 'default' | 'start' | 'accent' | 'good' | 'warn' | 'muted';

/** A connection's role — directed by default; `kind` tints it and its arrowhead. */
export type DiagramEdgeKind = 'default' | 'accent' | 'good' | 'warn' | 'muted';

export interface DiagramNode {
  /** Stable id edges reference. */
  id: string;
  /** Short label rendered inside the node (wraps; never clipped). */
  label: string;
  /** Optional second line — a value, unit, or caption. */
  sub?: string;
  kind?: DiagramNodeKind;
  /** Optional manual placement on a 0..1 unit canvas. Omit to auto-place. */
  x?: number;
  y?: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  /** Optional label drawn on the connection (e.g. a transition or rate). */
  label?: string;
  kind?: DiagramEdgeKind;
  /** Draw both arrowheads (a mutual / bidirectional relationship). */
  bidirectional?: boolean;
  /** Render dashed — a weaker, conditional, or planned link. */
  dashed?: boolean;
}

/** How nodes are placed when explicit x/y are absent. `cycle` rings them evenly
 *  (state machines, the carbon/water cycle); `layered` left-to-right ranks by edge
 *  depth (pipelines, mechanisms); `free` falls back to a tidy auto grid. */
export type DiagramLayout = 'cycle' | 'layered' | 'free';

export interface DiagramFlowProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  layout?: DiagramLayout;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  footer?: string;
}

/** The diagrams-family slice of the extended block union. Keyed `diagramflow` so it stays
 *  distinct from the media family's `diagram` (a vector shapes-and-labels figure). */
/* ── sequencediagram: lifelines + ordered messages between them (software/process flows) ── */
export interface SeqActor {
  id: string;
  label: string;
}
export interface SeqMessage {
  from: string;
  to: string;
  label: string;
  /** A return / response message (dashed). */
  reply?: boolean;
  /** A self-call (loops back to the same lifeline). */
  self?: boolean;
}
export interface SequenceDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  actors: SeqActor[];
  messages: SeqMessage[];
  footer?: string;
}

/* ── statemachine: states (nodes) + labelled transitions (directed edges), with start/final
   markers. CS, logic, game design, workflow modelling. Auto-rings the states unless x/y given. ── */
export interface StateNode {
  id: string;
  label: string;
  /** Marks the entry state (drawn with an incoming stub). */
  start?: boolean;
  /** Marks an accepting/final state (drawn with a double ring). */
  final?: boolean;
  /** Optional manual placement on a 0..100 canvas; omit to auto-ring. */
  x?: number;
  y?: number;
}
export interface StateTransition {
  from: string;
  to: string;
  /** The event/condition that triggers it. */
  label: string;
  /** A self-loop (from === to). */
  self?: boolean;
}
export interface StateMachineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  states: StateNode[];
  transitions: StateTransition[];
  footer?: string;
}

/* ── erdiagram: entities (tables of fields) + relationships with crow's-foot-style cardinality.
   Data modelling, DB design, CS. ── */
export interface ErField {
  name: string;
  /** Optional type, e.g. "uuid", "text". */
  type?: string;
  /** Primary / foreign key marker. */
  key?: 'pk' | 'fk';
}
export interface ErEntity {
  id: string;
  label: string;
  fields: ErField[];
  /** Placement on a 0..100 canvas; omit to auto-grid. */
  x?: number;
  y?: number;
}
export interface ErRelationship {
  from: string;
  to: string;
  /** Cardinality at each end: 1 (one) or many. */
  fromCard?: '1' | 'many';
  toCard?: '1' | 'many';
  label?: string;
}
export interface ErDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  entities: ErEntity[];
  relationships: ErRelationship[];
  footer?: string;
}

/* ── circuitdiagram: a simple schematic on a grid — components (battery, resistor, etc.) placed
   on a 0..100 canvas and joined by wires. Physics, EE, electronics education. ── */
export type CircuitKind =
  | 'battery'
  | 'resistor'
  | 'capacitor'
  | 'bulb'
  | 'switch'
  | 'ground'
  | 'node';
export interface CircuitComponent {
  id: string;
  kind: CircuitKind;
  x: number;
  y: number;
  /** Label, e.g. "R₁ = 10Ω" or "9V". */
  label?: string;
}
export interface CircuitWire {
  from: string;
  to: string;
}
export interface CircuitDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  components: CircuitComponent[];
  wires: CircuitWire[];
  footer?: string;
}

/** Persisted props for a settled mindshape block (replay / library / present).
 *  `clusters` is optional so blocks persisted before emergent themes still render. */
export interface MindShapeBlockProps {
  center: string;
  atoms: MindAtom[];
  links: MindLink[];
  clusters?: MindCluster[];
  unsaid?: MindUnsaid;
  title?: string;
}

/* ── tournamentbracket: a single-elimination bracket — columns of round boxes joined by SVG
   elbow connectors (BinaryTree's technique), one column per round. Each matchup's y-position is
   computed from its slot so the bracket self-centers between rounds; the winner's name is bold
   and tinted, the loser muted. `double` is a reserved prop for a future losers-bracket pass — it
   is NOT rendered yet, so a model must not promise one just by setting it true. ── */
export interface TournamentMatchup {
  id: string;
  /** 0-based round index; must match that round's position in `rounds`. */
  round: number;
  /** 0-based position within the round, top to bottom — determines the box's y-position. */
  slot: number;
  /** Competitor in the first slot. Omit for a not-yet-decided ("TBD") slot. */
  a?: string;
  /** Competitor in the second slot. Omit for a bye or not-yet-decided slot. */
  b?: string;
  scoreA?: number;
  scoreB?: number;
  /** Which side won this matchup, if decided. */
  winner?: 'a' | 'b';
}

export interface TournamentBracketProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Round names in order, e.g. ["Round of 16", "Quarterfinal", "Semifinal", "Final"]. */
  rounds: string[];
  matchups: TournamentMatchup[];
  /** Reserved for a future losers-bracket rendering; single-elimination only for now. */
  double?: boolean;
  footer?: HtmlString;
}

export type DiagramsBlock =
  | (BlockBase & { type: 'prooftree'; props: ProofTreeProps })
  | (BlockBase & { type: 'fishbone'; props: FishboneProps })
  | (BlockBase & { type: 'classdiagram'; props: ClassDiagramProps })
  | (BlockBase & { type: 'diagramflow'; props: DiagramFlowProps })
  | (BlockBase & { type: 'sequencediagram'; props: SequenceDiagramProps })
  | (BlockBase & { type: 'statemachine'; props: StateMachineProps })
  | (BlockBase & { type: 'erdiagram'; props: ErDiagramProps })
  | (BlockBase & { type: 'circuitdiagram'; props: CircuitDiagramProps })
  | (BlockBase & { type: 'argumentmap'; props: ArgumentMapProps })
  | (BlockBase & { type: 'probabilitytree'; props: ProbabilityTreeProps })
  | (BlockBase & { type: 'mindshape'; props: MindShapeBlockProps })
  | (BlockBase & { type: 'datastructure'; props: DataStructureProps })
  | (BlockBase & { type: 'causationchain'; props: CausationChainProps })
  | (BlockBase & { type: 'protocolstack'; props: ProtocolStackProps })
  | (BlockBase & { type: 'wiringdiagram'; props: WiringDiagramProps })
  | (BlockBase & { type: 'pipingschematic'; props: PipingSchematicProps })
  | (BlockBase & { type: 'logicgates'; props: LogicGatesProps })
  | (BlockBase & { type: 'algorithmtrace'; props: AlgorithmTraceProps })
  | (BlockBase & { type: 'cyclewheel'; props: CycleWheelProps })
  | (BlockBase & { type: 'graphtrace'; props: GraphTraceProps })
  | (BlockBase & { type: 'dptable'; props: DpTableProps })
  | (BlockBase & { type: 'binarytree'; props: BinaryTreeProps })
  | (BlockBase & { type: 'hashtable'; props: HashTableProps })
  | (BlockBase & { type: 'trie'; props: TrieProps })
  | (BlockBase & { type: 'sortingviz'; props: SortingVizProps })
  | (BlockBase & { type: 'gridtrace'; props: GridTraceProps })
  | (BlockBase & { type: 'toulmin'; props: ToulminProps })
  | (BlockBase & { type: 'castmap'; props: CastMapProps })
  | (BlockBase & { type: 'tournamentbracket'; props: TournamentBracketProps })
  | (BlockBase & { type: 'controlblockdiagram'; props: ControlBlockDiagramProps })
  | (BlockBase & { type: 'sysarchdiagram'; props: SysArchDiagramProps })
  | (BlockBase & { type: 'datapipeline'; props: DataPipelineProps })
  | (BlockBase & { type: 'recursiontree'; props: RecursionTreeProps })
  | (BlockBase & { type: 'nnarchitecture'; props: NnArchitectureProps })
  | (BlockBase & { type: 'synthesisroute'; props: SynthesisRouteProps })
  | (BlockBase & { type: 'plasmidmap'; props: PlasmidMapProps })
  | (BlockBase & { type: 'fiveforces'; props: FiveForcesProps })
  | (BlockBase & { type: 'fivewhychain'; props: FiveWhyChainProps })
  | (BlockBase & { type: 'threatmodel'; props: ThreatModelProps })
  | (BlockBase & { type: 'foodweb'; props: FoodWebProps })
  | (BlockBase & { type: 'primefactortree'; props: PrimeFactorTreeProps })
  | (BlockBase & { type: 'analogymap'; props: AnalogyMapProps });

/* ── cyclewheel: an illustrated closed loop — 3–8 stages spaced evenly AROUND a ring, each an
   icon + label + short caption, joined by curved arrows that flow one into the next and close
   the circle back to the first. The loop is the point (it never ends), so this is the right shape
   for a natural/biological/economic cycle rather than a one-directional pipeline. Positions on the
   ring, the arc of each connector, and the arrowheads are all COMPUTED from the stage count (cos/sin
   around the centre); the model supplies only the stages. Use for the water cycle, a life cycle, the
   carbon/nitrogen/rock cycle, the cell cycle, the product/feedback loop. domains: science, nature. ── */

export interface CycleStage {
  /** The stage's name, drawn beside its node on the ring (wraps; never clipped). */
  label: string;
  /** An optional one-line gloss of what happens at this stage. */
  caption?: string;
  /** A glyph for the stage's node; falls back to a numbered token when omitted. */
  icon?: IconKey;
}

export interface CycleWheelProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The stages in loop order; the last connects back to the first. 3–8 read best. */
  stages: CycleStage[];
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ── argumentmap: a centered claim with supporting, objecting, and qualifying premises.
   Use for: "analyze this argument", "is X a good policy", "Socratic dialogue on Y". ── */

export type PremiseType = 'support' | 'objection' | 'qualifier';

export interface ArgumentPremise {
  text: string;
  type: PremiseType;
  /** Optional sub-premise (rebuttal or clarification). */
  sub?: string;
}

export interface ArgumentMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The central claim being evaluated. */
  claim: string;
  premises: ArgumentPremise[];
  /** Optional one-line verdict after weighing all premises. */
  verdict?: string;
  footer?: string;
}

/* ── probabilitytree: sequential branching events with probabilities.
   Statistics, genetics, decision analysis, probability theory education. ── */

export interface ProbabilityLeaf {
  label: string;
  prob: number;
  /** Computed or supplied outcome label (e.g. "P = 0.12"). */
  outcome?: string;
}

export interface ProbabilityBranch {
  label: string;
  prob: number;
  children?: ProbabilityLeaf[];
}

export interface ProbabilityTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  branches: ProbabilityBranch[];
  note?: string;
}

/* ── datastructure: the canonical CS data-structure visuals — arrays, linked lists,
   stacks, queues, and binary trees/BSTs/heaps. Geometry is COMPUTED from the data:
   linear kinds lay out on one axis; tree kinds run an in-order placement (in-order
   sweep → x, depth → y) so parent→child edges always land correctly. Use for "show
   me a BST", "how does a queue work", "visualize a min-heap", algorithm walkthroughs.
   domains: code, education. ── */

export type DataStructureKind =
  | 'array'
  | 'linkedlist'
  | 'stack'
  | 'queue'
  | 'tree'
  | 'bst'
  | 'heap';

/** One cell/node for the linear kinds — either a bare value or `{ value }`. */
export interface DsCell {
  value: string | number;
}
export type DsNodeInput = DsCell;

/** A node in an explicit binary-tree description. Children reference other node ids;
 *  omit `left`/`right` for a missing child. */
export interface DsTreeNode {
  id: string;
  value: string | number;
  left?: string;
  right?: string;
}

/** A labelled pointer above an array cell (e.g. the `i`/`j` of two-pointer walks). */
export interface DsPointer {
  index: number;
  label: string;
}

export interface DataStructureProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  kind: DataStructureKind;
  /** Values for the linear kinds (array/linkedlist/stack/queue), in order. For
   *  stacks, index 0 is the bottom and the last item is the top; for queues, index
   *  0 is the front. */
  cells?: (DsCell | string | number)[];
  /** Explicit binary-tree nodes (tree/bst/heap). Takes precedence over `level`. */
  nodes?: DsTreeNode[];
  /** Level-order array form of a binary tree (index 2i+1 / 2i+2 are children; `null`
   *  punches a hole). Used when `nodes` is absent. */
  level?: (string | number | null)[];
  /** Pointer markers above array cells. */
  pointers?: DsPointer[];
  /** Highlight one element: a 0-based index for linear kinds, or a node `id` for
   *  tree kinds (e.g. the node currently being searched). */
  highlight?: number | string;
  footer?: HtmlString;
}

/* ── causationchain: multiple CAUSES → a central EVENT → multiple CONSEQUENCES, read
   left→right, with short-term vs long-term grouping and connectors weighted by strength.
   Distinct from diagramflow (a generic node/edge graph): this is specifically the
   cause→event→effect shape used for the causes & effects of a historical event, root-cause
   analysis, or policy-impact mapping. domains: education, business. ── */

/** When a cause/consequence takes effect relative to the event. Drives its tint and
 *  whether it groups in the upper (short) or lower (long) band of its column. */
export type CausationTerm = 'short' | 'long';

export interface CausationLink {
  /** The cause or consequence text (wraps inside its card; never clipped). */
  label: string;
  /** Relative strength 0..1 — maps to the connector's thickness and opacity. Default 0.5. */
  weight?: number;
  /** Short- vs long-term horizon; omit for an unclassified factor. */
  term?: CausationTerm;
}

export interface CausationEvent {
  /** The central event everything points to / flows from. */
  label: string;
}

export interface CausationChainProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The pivotal event in the centre. */
  event: CausationEvent;
  /** Drivers feeding into the event (left column). */
  causes: CausationLink[];
  /** Effects flowing out of the event (right column). */
  consequences: CausationLink[];
  /** Header above the left column (default "Causes"). */
  causesLabel?: string;
  /** Header above the right column (default "Consequences"). */
  consequencesLabel?: string;
  footer?: HtmlString;
}

/* ── protocolstack: a layered network/protocol stack (the OSI / TCP-IP model) paired with a
   packet-encapsulation view. The LEFT column stacks the layers top→bottom (application at the
   top, physical/link at the bottom), each a band carrying its role and the protocol chips that
   live there. The RIGHT column (when `packet` is given) draws the SAME headers as concentric,
   nested boxes wrapping a payload — Ethernet ▸ IP ▸ TCP ▸ HTTP ▸ data — so the reader sees how a
   request gathers a header at each layer on the way down the stack. Pure data in; the nesting
   geometry, band sizing, and chip wrapping are all computed in the component. domains: tech, code. ── */

/** One layer of the stack, top of the array = top of the model (application). */
export interface ProtocolLayer {
  /** The layer's name, e.g. "Application", "Transport". */
  name: string;
  /** A one-line description of what the layer does (wraps; never clipped). */
  role?: string;
  /** Protocols/standards that operate at this layer, rendered as chips. */
  protocols?: string[];
}

/** One header in the encapsulation view, outermost first. The last entry is treated as the
 *  innermost payload when none is tagged otherwise. */
export interface ProtocolPacketField {
  /** The header/segment label, e.g. "Ethernet", "IP", "TCP", "HTTP", "Data". */
  header: string;
  /** Optional name of the layer that adds this header (matches a `layers[].name`). */
  layer?: string;
}

export interface ProtocolStackProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The layers, top (application) → bottom (link/physical). */
  layers: ProtocolLayer[];
  /** Optional encapsulation packet, outermost header → innermost payload. */
  packet?: ProtocolPacketField[];
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ── wiringdiagram: a residential / automotive one-line electrical diagram drawn with real
   trade symbols. Each node is a recognisable glyph for its device (breaker, switch, GFCI,
   outlet, light…); wires join them through fixed ports and are colour-coded by the conductor
   they carry — hot (black/danger), neutral (muted), ground (green/insight), traveler (warning).
   Auto-laid out on a tidy grid when x/y are omitted, so the model supplies only the devices and
   how they're connected, never coordinates. Use for "wire a 3-way switch", "how is a GFCI
   protected outlet wired", a service-panel one-line. domains: tech, science. ── */

/** A device on the wiring diagram. Each `kind` maps to a standard trade glyph. */
export type WiringKind =
  | 'breaker' //   a circuit breaker (panel protection)
  | 'switch' //    a single-pole toggle switch
  | 'switch3way' //a 3-way switch (two travelers + a common)
  | 'outlet' //    a duplex receptacle
  | 'gfci' //      a ground-fault receptacle
  | 'light' //     a luminaire / lamp
  | 'panel' //     the service / load-centre panel
  | 'motor' //     a motor load
  | 'ground' //    an earth-ground point
  | 'junction'; // a junction / splice box

/** The conductor a wire carries — drives its colour, exactly like the trade convention. */
export type WiringConductor = 'hot' | 'neutral' | 'ground' | 'traveler';

export interface WiringNode {
  /** Stable id wires reference. */
  id: string;
  kind: WiringKind;
  /** Short caption under the glyph (e.g. "SW1", "20A"). */
  label?: string;
  /** Manual placement on a 0..100 canvas; omit any of x/y to auto-grid. */
  x?: number;
  y?: number;
}

export interface WiringWire {
  from: string;
  to: string;
  /** The conductor this run carries (default 'hot'). */
  conductor?: WiringConductor;
  /** Wire gauge label, e.g. "12 AWG", drawn at the run's midpoint. */
  gauge?: string;
}

export interface WiringDiagramProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: WiringNode[];
  wires: WiringWire[];
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ── pipingschematic: a P&ID-lite piping / HVAC / hydraulic flow schematic. Components are drawn
   as their standard process glyphs (tank, pump, valve, heater, filter, sensor, in-line fitting)
   and joined by routed connector lines that optionally carry a flow-direction arrowhead and a
   line-size label. Auto-laid out on a grid when coords are absent, so the model describes only
   the equipment and how it's plumbed. Use for "a simple heating loop", "draw the pump-and-filter
   circuit", a closed-loop HVAC diagram. domains: tech, science. ── */

export type PipingKind =
  | 'pipe' //     a plain in-line pipe segment / spool
  | 'valve' //    a gate / control valve (bow-tie symbol)
  | 'pump' //     a centrifugal pump
  | 'tank' //     a vessel / tank / reservoir
  | 'heater' //   a heater / heat exchanger
  | 'filter' //   an in-line filter / strainer
  | 'fitting' //  an elbow / tee / coupling
  | 'sensor'; //  an instrument bubble (gauge / transmitter)

export interface PipingComponent {
  id: string;
  kind: PipingKind;
  /** Short caption under the glyph (e.g. "P-101", "T-1"). */
  label?: string;
  /** Manual placement on a 0..100 canvas; omit any of x/y to auto-grid. */
  x?: number;
  y?: number;
}

export interface PipingLine {
  from: string;
  to: string;
  /** Draw a flow-direction arrowhead toward `to`. */
  flow?: boolean;
  /** Line-size label, e.g. "DN50" or "2\"", drawn at the run's midpoint. */
  size?: string;
}

export interface PipingSchematicProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  components: PipingComponent[];
  lines: PipingLine[];
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ── logicgates: a digital-logic circuit. Inputs feed a network of standard gate symbols
   (AND/OR/NOT/NAND/NOR/XOR/XNOR) wired input→output; each wire carries its computed signal value
   (green = 1, muted = 0), and an optional adjacent truth table highlights the current input row.
   Gate outputs are EVALUATED in the component from the input values — never authored — so the
   drawing is always correct. Use for "show a half-adder", "build a 2-to-1 mux from gates",
   "explain XOR". domains: code, tech. ── */

export type LogicGateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR' | 'XNOR';

export interface LogicInput {
  /** Stable id gates reference. */
  id: string;
  /** Short label drawn at the left rail, e.g. "A". */
  label: string;
  /** Current logic level driving the circuit (default 0). */
  value?: 0 | 1;
}

export interface LogicGate {
  /** Stable id other gates / the output reference. */
  id: string;
  kind: LogicGateKind;
  /** Source ids feeding this gate — each an input id or another gate id. NOT uses the
   *  first only; the rest are ignored. */
  inputs: string[];
}

export interface LogicOutput {
  /** The id (gate or input) wired to the circuit's output pin. */
  from: string;
  /** Output pin label (default "Y"). */
  label?: string;
}

/** One row of the optional truth table: the input values in `inputs[]` order, then the output. */
export interface LogicTruthRow {
  row: (0 | 1)[];
  out: 0 | 1;
}

export interface LogicGatesProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  inputs: LogicInput[];
  gates: LogicGate[];
  output?: LogicOutput;
  /** Optional truth table shown beside the circuit; the row matching the live inputs lights up. */
  truth?: LogicTruthRow[];
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ── algorithmtrace: an interactive step-through of an algorithm over an array. The values are a
   row of cells; a prev/next stepper (local state, no timers) walks a list of authored steps,
   recolouring highlighted / compared / swapped cells and drawing labelled pointer carets (i, j,
   lo, hi) under the cells, with the step's caption. Geometry is computed from the data; the model
   supplies only the values and what each step touches. Use for "trace bubble sort", "show binary
   search step by step", an algorithm walkthrough. domains: code. interactive. ── */

export interface AlgorithmStep {
  /** What this step does, shown above the array (wraps; never clipped). */
  caption: string;
  /** Indices to emphasise (the active window / current element). */
  highlight?: number[];
  /** Indices being compared this step (tinted as a comparison). */
  compare?: number[];
  /** Indices swapped this step (tinted to signal the mutation). */
  swapped?: number[];
  /** Named pointers → the index they sit under, e.g. { i: 2, j: 3, lo: 0, hi: 6 }. */
  pointer?: Record<string, number>;
  /** Running operation counts at this step (comparisons / swaps so far). */
  ops?: { comparisons?: number; swaps?: number };
}

export interface AlgorithmTraceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The array the algorithm runs over (numbers or short strings). */
  values: (number | string)[];
  /** Ordered steps the stepper walks through. */
  steps: AlgorithmStep[];
  /** Complexity class shown as a badge next to the title. */
  complexity?: BigOClass;
  /** Start auto-playing immediately on mount. */
  autoPlay?: boolean;
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}

/* ── dptable: a dynamic-programming memoisation table — 2D grid with row/col headers,
   filled cell values, an optional highlighted active cell, an optimal-path overlay,
   and an optional recurrence formula. Use for LCS, edit distance, knapsack, coin change,
   and any 2-D DP problem walkthrough. domains: code, education, math. ── */

export interface DpTableStep {
  /** What is happening in this step. */
  caption: string;
  /** [row, col] of the cell being computed (presence tint). */
  current?: [number, number];
  /** Cells this step reads from — the recurrence dependencies (insight tint). */
  deps?: [number, number][];
}

export interface DpTableProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Row header labels (top-to-bottom, including the corner sentinel if any). */
  rows: string[];
  /** Column header labels (left-to-right, including the corner sentinel if any). */
  cols: string[];
  /** Cell values, cells[r][c] (null = unfilled / empty). Must have rows.length arrays of cols.length. */
  cells: (number | string | null)[][];
  /** Step-through mode: ordered steps the stepper walks through. */
  steps?: DpTableStep[];
  /** Static single-cell spotlight when no steps are provided. */
  highlight?: [number, number];
  /** List of [row, col] pairs on the optimal solution path (tinted distinctly from highlight). */
  path?: [number, number][];
  /** Recurrence relation formula shown above the grid, e.g. "dp[i][j] = dp[i-1][j-1]+1 if s[i]=t[j]". */
  recurrence?: string;
  footer?: HtmlString;
}

/* ── hashtable: a hash table with separate-chaining collision resolution. Each of the `size`
   buckets is a slot in a vertical array on the left; entries that hash to the same bucket form
   a horizontal linked-list chain extending to the right. The hash function is shown above.
   Use for "how does a hash map work", collision walkthroughs, load-factor discussions.
   domains: code, education. ── */

export interface HashEntry {
  key: string | number;
  value?: string | number;
  /** Explicit bucket index (0-based) overrides the auto-hash when provided. */
  bucket?: number;
}

export interface HashTableProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Number of buckets (slots) in the table, e.g. 7. Capped at 8 visually. */
  size: number;
  /** Entries to insert; bucket is auto-computed from key unless explicitly set. */
  entries: HashEntry[];
  /** Human-readable hash function label shown above the figure, e.g. "h(k) = k mod 7". */
  hashFn?: string;
  /** Key to spotlight (highlights that entry's node in the chain). */
  highlight?: string | number;
  footer?: HtmlString;
}

/* ── trie: a prefix tree built from a list of words. Each edge carries the character it
   represents; end-of-word nodes are marked with a double ring. An optional `highlight`
   word traces its insertion path in the presence accent. Use for "how does autocomplete
   work", "show a prefix tree for these words", trie-based algorithm walkthroughs.
   domains: code, education. ── */

export interface TrieProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Words to insert into the trie (max ~15 short words for readability). */
  words: string[];
  /** Word whose path to trace from root → leaf in the presence accent. */
  highlight?: string;
  footer?: HtmlString;
}

/* ── graphtrace: an interactive BFS/DFS step-through on a graph. Nodes are colour-coded by
   their traversal state — current (presence), frontier/queue (warning), visited (muted),
   unvisited (default). Prev/Next controls walk through authored steps; a queue/stack panel
   below shows the live frontier and visited sets. Use for "walk me through BFS", "show DFS
   on this graph", graph-algorithm interview walkthroughs. domains: code, education. ── */

export interface GraphTraceNode {
  id: string;
  /** Short label rendered inside the node (defaults to id). */
  label?: string;
  /** Optional manual position on a 0..100 unit canvas. Omit to auto-ring. */
  x?: number;
  y?: number;
}

export interface GraphTraceEdge {
  from: string;
  to: string;
  weight?: number;
  /** Draw arrowhead toward `to`; default true. */
  directed?: boolean;
}

export interface GraphTraceStep {
  /** Caption shown above the graph for this step (what's happening). */
  caption: string;
  /** Node currently being processed (lit in presence accent). */
  current?: string;
  /** Nodes already visited (grayed out). */
  visited?: string[];
  /** Nodes in the queue (BFS) or stack (DFS) — lit in warning accent. */
  frontier?: string[];
}

export interface GraphTraceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: GraphTraceNode[];
  edges: GraphTraceEdge[];
  /** Ordered steps the stepper walks through. */
  steps: GraphTraceStep[];
  /** Algorithm label shown in the frontier panel ("Queue" vs "Stack"). */
  algorithm?: 'bfs' | 'dfs';
  footer?: HtmlString;
}

/* ── binarytree: a binary tree with optional step-through traversal. Nodes are laid out via
   inorder x-position + depth y (tidy tree geometry). An optional `steps` array drives a
   prev/next stepper that recolours nodes — visiting (presence), visited (muted), found
   (success) — and shows a BFS queue / DFS stack + accumulating result. Use for "trace BST
   search", "show inorder/preorder/BFS traversal", heap explanations, interview walkthroughs.
   domains: code, education. interactive. ── */

export interface BinaryTreeNode {
  id: string;
  /** Value rendered inside the node circle. */
  value: string | number;
  /** Id of the left child (must be in `nodes`). */
  left?: string;
  /** Id of the right child (must be in `nodes`). */
  right?: string;
}

export interface BinaryTreeStep {
  /** Caption shown above the tree for this step. */
  caption: string;
  /** Map of node id → visual state for this step. Unmentioned nodes stay at default. */
  states: Record<string, 'default' | 'visiting' | 'visited' | 'found' | 'highlight'>;
  /** Contents of the BFS queue or DFS stack at this step (node value labels). */
  frontier?: (string | number)[];
  /** Accumulated traversal result so far (for inorder/preorder/postorder). */
  result?: (string | number)[];
}

export interface BinaryTreeProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** All nodes in the tree (order doesn't matter; tree structure is from left/right refs). */
  nodes: BinaryTreeNode[];
  /** Id of the root node. */
  root: string;
  /** Optional step-through. Omit for a static display of the tree. */
  steps?: BinaryTreeStep[];
  caption?: string;
  footer?: HtmlString;
}

/* ── sortingviz: an animated bar-chart sorting visualizer. Each step carries the full current
   array state so bars smoothly change height and colour at each algorithm step. Colour roles:
   compared (warning), swapped (insight), sorted (presence, permanent), pivot (danger, quicksort).
   A play/pause control + 3 speed levels auto-advance through the steps; an ops-count badge tracks
   comparisons + swaps. A complexity badge is shown next to the title. Use for "show bubble sort",
   "compare sorting algorithms", "walk me through merge sort step by step".
   domains: code, education. interactive. ── */

export interface SortStep {
  /** Caption explaining this step. */
  caption: string;
  /** Current array values at this step (full snapshot; determines bar heights). */
  values: number[];
  /** Indices being compared this step (tinted warning). */
  compared?: number[];
  /** Indices just swapped (tinted insight). */
  swapped?: number[];
  /** Indices confirmed in their final sorted position (tinted presence, permanent). */
  sorted?: number[];
  /** Pivot index for quicksort (tinted danger). */
  pivot?: number;
}

export interface SortingVizProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Human-readable algorithm name, e.g. "Bubble Sort". */
  algorithm: string;
  /** Complexity class for the badge, e.g. "o-n2". */
  complexity?: BigOClass;
  /** Initial values array (used only when steps is empty, for static display). */
  values: number[];
  /** Ordered steps; each carries the full array snapshot. */
  steps: SortStep[];
  footer?: HtmlString;
}

/* ── gridtrace: a 2-D grid visualizer for BFS/DFS/flood-fill and grid-DP problems.
   Each step carries a full grid snapshot where every cell has a state
   (empty/wall/start/end/visited/current/queued/path) and an optional value label
   (distance, cost). Renders as a CSS grid; colours driven by design-system tokens.
   Use for island-counting, shortest-path, word-search, rotting-oranges, flood-fill,
   and any grid-DP walkthrough. domains: code, education. ── */
export type GridCellState =
  | 'empty' // unvisited, passable
  | 'wall' // blocked / obstacle
  | 'start' // starting cell (presence)
  | 'end' // target cell (insight)
  | 'current' // cell being processed right now
  | 'queued' // in the BFS queue / DFS stack (warning)
  | 'visited' // fully processed (muted)
  | 'path'; // final solution path (insight bright)

export interface GridCell {
  state: GridCellState;
  /** Optional label rendered inside the cell (distance, cost, character, 0/1). */
  value?: string | number;
}

export interface GridStep {
  /** Caption describing what happened this step. */
  caption: string;
  /** Full grid snapshot — rows × cols matrix of cells. */
  grid: GridCell[][];
}

export interface GridTraceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Grid dimensions (inferred from steps[0].grid if omitted). */
  rows?: number;
  cols?: number;
  /** Algorithm label shown in the eyebrow, e.g. "BFS", "DFS", "Flood Fill". */
  algorithm?: string;
  /** Ordered steps; each carries the full grid state. */
  steps: GridStep[];
  footer?: HtmlString;
}

/* ── toulmin ── full Toulmin argument model: claim ← grounds + warrant + backing ── */
// Use for: "break down this argument (Toulmin)", "what are the grounds and warrant here?",
// "map this claim to its supporting structure". The six roles map to the Toulmin layout:
// Grounds → Warrant → Backing feeds the Claim, qualified by Qualifier, limited by Rebuttal.
export interface ToulminProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  claim: string;
  grounds: string;
  warrant: string;
  backing?: string;
  qualifier?: string;
  rebuttal?: string;
  footer?: HtmlString;
}

/* ── castmap ── character / relationship constellation with typed, labeled edges ── */
// Use for: "map the characters in Hamlet", "show who's allied or rival", "relationship web",
// "factions and alliances", "stakeholder map". Nodes auto-layout in a circle; edge kinds
// drive color so the topology is readable without coordinates from the model.
export type CastMapEdgeKind = 'ally' | 'rival' | 'family' | 'love' | 'mentor' | 'betrays' | 'other';
export interface CastMapNode {
  id: string;
  name: string;
  role?: string;
  faction?: string;
}
export interface CastMapLink {
  from: string;
  to: string;
  kind: CastMapEdgeKind;
  label?: string;
}
export interface CastMapProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: CastMapNode[];
  links: CastMapLink[];
  caption?: string;
  footer?: HtmlString;
}

/* ── controlblockdiagram: a control-systems block diagram — transfer-function blocks as
   labeled rectangles joined by directional signal wires; a summing junction is a small circle
   with a +/- sign drawn at each incoming wire. A wire marked `feedback` routes as a rectangular
   loop back to an earlier block instead of a straight line — the standard textbook convention
   for a return path (a sensor, H(s), a correction signal). Blocks without explicit x/y are
   auto-ranked left-to-right by the non-feedback wire graph, so a PID loop or a thermostat's
   closed loop described as pure graph data still reads left-to-right like a textbook figure.
   Use for "draw the PID control loop", "block diagram of a thermostat", "closed-loop transfer
   function", feedback-control coursework. domains: engineering, science, code. ── */
export type ControlBlockKind = 'block' | 'sum';
export interface ControlBlockNode {
  id: string;
  label: string;
  kind: ControlBlockKind;
  /** Manual placement on a 0..100 canvas; omit either to auto-place left-to-right by rank. */
  x?: number;
  y?: number;
}
export type ControlWireSign = 'plus' | 'minus';
export interface ControlWire {
  from: string;
  to: string;
  /** Only meaningful when `to` is a `sum` block: the sign drawn at that input. Default plus. */
  sign?: ControlWireSign;
  /** Route as a rectangular loop back to an earlier block instead of a straight line. */
  feedback?: boolean;
}
export interface ControlBlockDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  blocks: ControlBlockNode[];
  wires: ControlWire[];
  footer?: HtmlString;
}

/* ── sysarchdiagram: a system-design whiteboard diagram. Each node kind gets a distinct SHAPE
   (not just a fill tint) plus a small inline icon for the four shapes that would otherwise
   look alike, so the diagram reads at a glance the way a working engineer draws one on a
   whiteboard: database is a cylinder, queue is a stacked rectangle, cache is a rounded diamond,
   loadbalancer is a hexagon; client/service/gateway/cdn share a rounded-rectangle silhouette,
   told apart by a kind-appropriate icon. Auto-laid-out left-to-right by the edge graph (the
   same rank technique as diagramflow's `layered` mode), so the model supplies only the
   topology. Use for "draw the system architecture", "whiteboard this design", a load-balanced
   web service, a CQRS/event pipeline, a CDN-fronted API. domains: code, tech, business. ── */
export type SysArchNodeKind =
  | 'client'
  | 'loadbalancer'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'gateway'
  | 'cdn';
export interface SysArchNode {
  id: string;
  label: string;
  kind: SysArchNodeKind;
  /** Optional second line — an instance count, a tech name, a region. */
  sub?: string;
  /** Manual placement, 0..1 on each axis. Omit to auto-place left-to-right by rank. */
  x?: number;
  y?: number;
}
export interface SysArchEdge {
  from: string;
  to: string;
  /** What the connection does, e.g. "writes", "cache-aside". */
  label?: string;
  /** The wire protocol, e.g. "HTTPS", "gRPC", "TCP:5432". */
  protocol?: string;
}
export interface SysArchDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: SysArchNode[];
  edges: SysArchEdge[];
  footer?: HtmlString;
}

/* ── datapipeline: an ETL/data-pipeline lineage diagram — offline/batch data flow from a
   SOURCE through TRANSFORM steps to a SINK or intermediate STORE. Distinct from sysarchdiagram
   (a live request/response service architecture): this is where data comes from and what
   happens to it on the way to rest, not who calls whom at runtime. Each stage kind gets its own
   SHAPE, not just a tint: source is a rounded rectangle with an inbound-arrow glyph (where data
   enters the pipeline), transform is a hexagon (a processing step — also the fallback shape for
   an unrecognized kind), and sink/store share sysarchdiagram's database-cylinder convention for
   "data at rest" — told apart by a small inline icon (an outbound arrow for a sink, stacked
   lines for a store), the same shared-silhouette-plus-icon pattern sysarchdiagram uses for its
   rounded-rect kinds. Auto-laid-out left-to-right by the edge graph (DiagramFlow's `layered`
   rank technique). Use for "draw the ETL pipeline", "how does data flow from raw logs to the
   feature store", a training-data pipeline, an ELT/batch-ingestion diagram. domains: code,
   tech, science. ── */
export type DataPipelineStageKind = 'source' | 'transform' | 'sink' | 'store';
export interface DataPipelineStage {
  id: string;
  label: string;
  kind: DataPipelineStageKind;
  /** Optional second line — a tech name, a cadence, a row count. */
  sub?: string;
  /** Manual placement, 0..1 on each axis. Omit to auto-place left-to-right by rank. */
  x?: number;
  y?: number;
}
export interface DataPipelineEdge {
  from: string;
  to: string;
  /** What happens on this hop, e.g. "dedup", "join labels", "batch insert". */
  label?: string;
}
export interface DataPipelineProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  stages: DataPipelineStage[];
  edges: DataPipelineEdge[];
  footer?: HtmlString;
}

/* ── recursiontree: a call-stack / recursion visualization. A single root call fans out into
   its own recursive children (n-ary, not just binary) — the tidy top-down layout generalizes
   BinaryTree's tree geometry the way ParseTree already generalized it for grammar: leaves get
   an even horizontal slot in call order, every parent centres over the span of its own
   children, so any branching factor lays out without overlap. Each node shows its call
   signature; once a call has returned, a small badge in its corner shows the value. Classic use:
   naive recursive fibonacci, factorial, the call tree behind a memo table. domains: code,
   education. ── */
export interface RecursionNode {
  /** The call signature shown in the node, e.g. "fib(4)". */
  call: string;
  /** The value this call returned, once resolved. Omit while a call is still open/unresolved. */
  result?: string | number;
  /** This call's own recursive calls, in the order they're made. Omit/empty for a base case. */
  children?: RecursionNode[];
}
export interface RecursionTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The top-level call. A SINGLE recursive node — not an item array. */
  root: RecursionNode;
  footer?: HtmlString;
}

/* ── nnarchitecture: a layered neural-network diagram. One column of nodes per layer; a wide
   layer (hundreds of units) is capped at a readable visual maximum with a "+N more" indicator
   rather than rendering one dot per unit. Edges are drawn only between ADJACENT layers — never
   skip-layer — either dense (every visible node to every visible node in the next layer) or
   sparse (a local band, for a lighter read on a wide network). An optional single-unit
   `highlight` recolors that node and every edge already being drawn that touches it, tracing
   what feeds it and what it feeds forward. Use for "draw a 3-layer MLP", "what does this
   network's architecture look like", explaining forward pass / layer width. domains: code,
   education, science. ── */
export interface NnLayer {
  name: string;
  units: number;
  activation?: string;
}
export type NnConnections = 'dense' | 'sparse';
export interface NnHighlight {
  /** 0-based index into `layers`. */
  layer: number;
  /** 0-based index into that layer's units. */
  unit: number;
}
export interface NnArchitectureProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  layers: NnLayer[];
  /** Default 'dense'. */
  connections?: NnConnections;
  /** The single unit a forward pass is traced through, if any. */
  highlight?: NnHighlight;
  footer?: HtmlString;
}

/* ── synthesisroute: a multi-step chemical synthesis route. Compound nodes are auto-laid-out
   left-to-right by DiagramFlow's `layered` rank-then-column technique — unchanged from that
   engine, which is exactly what a branching route needs: several precursors can converge into
   one product, and one intermediate can fan out into several downstream targets, without a
   single linear reaction-mechanism block being able to express either. Each arrow carries its
   reagents/conditions above and a yield percentage below; a retrosynthetic disconnection
   (direction 'retro') draws as a dashed hollow arrow instead of a solid filled one, and — since
   a disconnection is conventionally drawn FROM the target back TO its precursor, the reverse of
   a forward step's precursor→product order — ranks the OPPOSITE way for layout, so a route stays
   chronologically left-to-right no matter which individual arrows are forward vs. retro. Use for
   a total-synthesis route, a convergent synthesis with two arms meeting at one intermediate,
   retrosynthetic analysis. domains: science, education. ── */
export type SynthesisRole = 'start' | 'intermediate' | 'target';
export interface SynthesisNode {
  id: string;
  /** Compound name or formula. Plain text — an SVG label, not HTML; use unicode
   *  sub/superscript characters ("C₆H₆") for formulae rather than markup. */
  label: string;
  /** Optional SMILES string, shown as a small monospace line under the label. */
  smiles?: string;
  role?: SynthesisRole;
}
export type SynthesisDirection = 'forward' | 'retro';
export interface SynthesisEdge {
  /** For a forward step, the precursor. For a retro disconnection, the (later) target being
   *  disconnected — `from`/`to` follow whichever direction the arrow is conventionally drawn. */
  from: string;
  /** For a forward step, the product. For a retro disconnection, the precursor it resolves to. */
  to: string;
  /** Reagent(s) driving this step, e.g. "PhMgBr". Shown above the arrow. */
  reagents?: string;
  /** Reaction conditions, e.g. "THF, 0°C". Shown above the arrow, alongside reagents. */
  conditions?: string;
  /** Isolated yield for this step, 0..100. Shown below the arrow. */
  yieldPct?: number;
  /** 'retro' draws a dashed hollow arrow FROM the target TO its precursor (a retrosynthetic
   *  disconnection) and ranks the pair in that reversed order for layout. Default 'forward'. */
  direction?: SynthesisDirection;
}
export interface SynthesisRouteProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  nodes: SynthesisNode[];
  edges: SynthesisEdge[];
  footer?: HtmlString;
}

/* ── plasmidmap: a circular plasmid vector map. The backbone is OrbitDiagram's own technique —
   a ring in a fixed viewBox — collapsed from "concentric rings, one per body" to "one ring, base
   position maps to angle": bp 0 sits at 12 o'clock and increasing bp sweeps clockwise. Genes and
   other features draw as a colored arc spanning their bp range (an optional strand arrow shows
   transcription direction); restriction sites are radial tick+enzyme-name marks; the origin of
   replication gets its own distinct marker. Every label (feature, site, origin) shares one
   collision pass — OrbitDiagram's label-spacing problem, here on a single ring instead of
   separate radii, so two angularly-close labels alternate between a near and a far ring instead
   of overlapping. Use for a cloning vector, an expression plasmid, "map this plasmid",
   restriction-digest planning. domains: science, education. ── */
export type PlasmidFeatureKind = 'gene' | 'promoter' | 'terminator' | 'marker';
export type PlasmidStrand = 'plus' | 'minus';
export interface PlasmidFeature {
  name: string;
  /** Base-pair position this feature starts at, 0..sizeBp (wraps if it crosses the origin). */
  startBp: number;
  /** Base-pair position this feature ends at. */
  endBp: number;
  kind: PlasmidFeatureKind;
  /** Draws a small directional arrowhead at the feature's transcribed end, if given. */
  strand?: PlasmidStrand;
}
export interface PlasmidSite {
  /** The enzyme name, e.g. "EcoRI". */
  name: string;
  posBp: number;
  /** True for a unique (single-cut) site — the practically useful ones for cloning. */
  cutsOnce?: boolean;
}
export interface PlasmidOrigin {
  name: string;
  posBp: number;
}
export interface PlasmidMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  sizeBp: number;
  features: PlasmidFeature[];
  sites: PlasmidSite[];
  origin?: PlasmidOrigin;
  footer?: HtmlString;
}

/* ── fiveforces: Porter's Five Forces — a central "Industry Rivalry" hub with four
   satellite forces (new entrants, suppliers, buyers, substitutes) ringed at the compass
   points, angle-based radial placement in the same spirit as FreeBodyDiagram's force
   arrows. Connector thickness and color track each force's rated strength, so the forces
   squeezing the industry hardest read at a glance. A satellite renders only when its id
   matches one of the four known slots; an unrecognized/missing id is silently dropped
   rather than guessed at, and the hub falls back to a generic label when no entry is
   tagged `rivalry`. Use for a competitive-strategy analysis, "should we enter this
   market", an industry-structure teardown. domains: business. ── */
export type FiveForceId = 'rivalry' | 'newEntrants' | 'suppliers' | 'buyers' | 'substitutes';
export type ForceStrength = 'low' | 'medium' | 'high';
export interface FiveForceEntry {
  id: FiveForceId;
  label: string;
  strength: ForceStrength;
  /** A short line of supporting context, shown under the label. */
  note?: string;
}
export interface FiveForcesProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The industry being analysed, shown under the hub label. */
  industry: string;
  /** Up to five entries, one per FiveForceId. Missing/duplicate ids just leave that slot empty. */
  forces: FiveForceEntry[];
  footer?: HtmlString;
}

/* ── fivewhychain: a 5-Whys root-cause chain — a problem card, then a vertical stack of
   why→answer cards linked by downward connectors, drilling one level deeper each step.
   The final card (an explicit `rootCause` if given, else the last why) is
   accent-highlighted as the root cause. The chain renders whatever length `whys` actually
   is — five is the convention, not a hard limit. Use for an incident postmortem, a
   root-cause investigation, "why did this actually happen". domains: business, tech,
   education. ── */
export interface FiveWhyEntry {
  /** The "why" question this step asks. Omit to just show the numbered step + answer. */
  question?: string;
  answer: string;
}
export interface FiveWhyChainProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  problem: string;
  whys: FiveWhyEntry[];
  /** An explicit closing statement, appended as its own highlighted card after the chain.
   *  Omit to instead highlight the last `whys` entry as the root cause in place. */
  rootCause?: string;
  footer?: HtmlString;
}

/* ── threatmodel: a STRIDE cybersecurity diagram — dashed trust-boundary rects host
   labeled asset chips (process / datastore / external-entity, each a distinct DFD-style
   silhouette), a small colored threat marker sits on every asset a threat targets (red for
   an open threat, muted for a mitigated one), and a threat register below lists every
   entry with its asset, category, status, and mitigation. An asset that no boundary's
   `contains` references renders in its own unboundaried lane. Use for a system security
   review, "what could go wrong with this design", an architecture threat-model writeup.
   domains: code, tech, business. ── */
export type ThreatAssetKind = 'process' | 'datastore' | 'external-entity';
export interface ThreatAsset {
  id: string;
  name: string;
  kind: ThreatAssetKind;
}
export interface ThreatBoundary {
  label: string;
  /** Asset ids hosted inside this trust boundary. */
  contains: string[];
}
export type StrideKind =
  | 'spoofing'
  | 'tampering'
  | 'repudiation'
  | 'info-disclosure'
  | 'dos'
  | 'elevation';
export type ThreatStatus = 'mitigated' | 'open';
export interface ThreatEntry {
  assetId: string;
  stride: StrideKind;
  mitigation?: string;
  /** Missing/unrecognized status reads as `open` — an unverified threat is never assumed
   *  fixed. */
  status?: ThreatStatus;
}
export interface ThreatModelProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  assets: ThreatAsset[];
  boundaries?: ThreatBoundary[];
  threats: ThreatEntry[];
  footer?: HtmlString;
}

/* ── foodweb: an ecological food web — organisms sit in horizontal tier bands (tier 0 at
   the bottom, each higher index a step up the food chain), joined by curved directional
   arrows from prey to predator. Distinct from `pyramidtiers` (an energy-pyramid AREA chart
   with no individual organisms or links) — this is the actual who-eats-whom graph. Use for
   a food chain / food web diagram, an ecosystem teardown, "what eats what here". domains:
   science, education. ── */
export interface FoodWebOrganism {
  id: string;
  /** Index into `tiers`; clamped to a valid tier if out of range. */
  tier: number;
  label: string;
}
export interface FoodWebLink {
  /** Prey id — the arrow starts here. */
  from: string;
  /** Predator id — the arrow points here. */
  to: string;
}
export interface FoodWebProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Tier names, lowest trophic level first (e.g. "Producers" → "Apex predators"). */
  tiers: string[];
  organisms: FoodWebOrganism[];
  links: FoodWebLink[];
  footer?: HtmlString;
}

/* ── primefactortree: a prime-factorization tree — a composite splits into its factors,
   recursively, until every leaf is prime; a prime leaf gets a colored ring. Same tidy-tree
   x/leaf-slot + y/depth layout technique as `binarytree`, generalized from a binary tree to
   an n-ary one. The full factorization line is always computed from the leaves themselves
   (never a separately-authored string) so it can never drift from the tree it's under. Use
   for teaching factor trees, "factor this number", a number-theory walkthrough. domains:
   education. ── */
export interface PrimeFactorNode {
  value: number;
  isPrime: boolean;
  /** Omit/empty on a leaf. A composite node's children are its factor pair (or more). */
  children?: PrimeFactorNode[];
}
export interface PrimeFactorTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The number being factored — the root's expected value. */
  number: number;
  /** The recursive tree, as a one-element array holding the root. */
  nodes: PrimeFactorNode[];
  footer?: HtmlString;
}

/* ── prooftree: a Gentzen-style natural-deduction / sequent proof tree. The proof arrives as
   a FLAT step list — each step names the premise ids it is inferred `from` — and the renderer
   assembles the tree itself: root = `conclusionId` (or the step no other step references),
   premises stack above an inference bar with the rule name at the bar's right, the conclusion
   sits below. A leaf with no `from` is an assumption; wrapping its statement in [ ] renders it
   bracketed as a discharged hypothesis, the textbook convention for →I / RAA. Layout is
   recursive width measurement — every conclusion centres over the span of its own premises —
   so any branching factor lays out without overlap from pure step data. A shared premise cited
   by two inferences renders once per citation, exactly as a Gentzen tree is drawn on paper.
   Use for propositional/predicate-logic derivations, "prove Q ∧ R from these premises",
   natural-deduction homework. domains: education, math. ── */
export interface ProofStep {
  /** Stable id other steps cite in `from`. */
  id: string;
  /** The formula this line asserts, e.g. "P → Q". Wrap a discharged assumption in
   *  square brackets ("[P]") to render it with the textbook assumption styling. */
  statement: string;
  /** The inference rule that produced this line, shown at the bar's right — e.g. '∧I',
   *  '→E', 'MP'. Omit on leaf assumptions/premises. */
  rule?: string;
  /** Ids of the premise steps this line is inferred from. Omit/empty for a leaf. */
  from?: string[];
}
export interface ProofTreeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  steps: ProofStep[];
  /** Id of the root conclusion. Defaults to the step no other step's `from` references. */
  conclusionId?: string;
  footer?: HtmlString;
}

/* ── fishbone: an Ishikawa cause-effect diagram. The effect sits in a head box at the right
   of a horizontal spine; category ribs alternate above/below the spine at ~60°, each carrying
   its label at the rib tip and its causes as short horizontal twigs off the rib. Rib spacing,
   rib height, and twig length are all computed from the category/cause counts (up to 8 ribs),
   so the model supplies only the effect and whatever categories the analysis actually used —
   the classic 6M set or any custom one, nothing is hardcoded. Use for "why does X keep
   happening", a quality/defect brainstorm, a project retro. domains: business, education. ── */
export interface FishboneCategory {
  /** The category name, drawn at the rib's tip (e.g. "Process", "Materials"). */
  label: string;
  /** Short cause phrases drawn as twigs off this rib, tip-to-spine order. */
  causes: string[];
}
export interface FishboneProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The problem/outcome under investigation, shown in the head box at the right. */
  effect: string;
  categories: FishboneCategory[];
  footer?: HtmlString;
}

/* ── classdiagram: a UML class diagram. Class boxes carry the three standard compartments
   (name with an italic «stereotype», fields, methods) and are auto-layered by inheritance
   depth — parents above their subclasses, grid-flow within a layer — so the model supplies
   only the classes and typed relations, never coordinates. Relations draw with proper UML
   terminal glyphs: hollow triangle at the parent for inheritance (dashed line when
   implements), filled diamond at the whole for composition, hollow diamond for aggregation,
   dashed open arrow at the target for dependency, plain line for association. Edges trim at
   box borders with the same capped rim-trim SysArchDiagram uses, so tight layouts never
   reverse an arrow. Use for "diagram these classes", OOP design teaching, design-pattern
   structure. domains: code, education. ── */
export type ClassStereotype = 'interface' | 'abstract' | 'enum';
export type ClassRelationKind =
  | 'inheritance' //  child --▷ parent (hollow triangle at the parent)
  | 'implements' //   class ┄┄▷ interface (dashed, hollow triangle)
  | 'composition' //  whole ◆── part (filled diamond at the whole)
  | 'aggregation' //  whole ◇── part (hollow diamond at the whole)
  | 'association' //  plain line
  | 'dependency'; //  client ┄┄> supplier (dashed, open arrow)
export interface UmlClass {
  /** The class name — also the key `relations[].from/to` reference. */
  name: string;
  /** Renders as an italic «stereotype» line above the name; 'abstract' also italicizes the name. */
  stereotype?: ClassStereotype;
  /** Field lines, verbatim, e.g. "+ radius: number" or "- count: int". */
  fields?: string[];
  /** Method lines, verbatim, e.g. "+ area(): number". */
  methods?: string[];
}
export interface UmlRelation {
  /** For inheritance/implements/dependency: the child/client. For composition/aggregation:
   *  the WHOLE (the diamond draws at this end). References a `classes[].name`. */
  from: string;
  /** For inheritance/implements: the parent (triangle end). For composition/aggregation:
   *  the part. For dependency: the supplier (arrow end). */
  to: string;
  kind: ClassRelationKind;
  /** Optional short caption at the line's midpoint, e.g. a role or multiplicity. */
  label?: string;
}
export interface ClassDiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  classes: UmlClass[];
  relations: UmlRelation[];
  footer?: HtmlString;
}

/* ── analogymap: explains an unfamiliar concept by mapping it PART BY PART onto a familiar one
   ("a private key is like a house key; the public key is like the address on the envelope").
   Two labelled columns — what the learner already knows on the left, the concept being explained
   on the right — with one correspondence row per mapped part and an explicit connector drawn
   between the two halves of that row. Where `teachdiagram` refuses abstract concepts (nothing
   literal to draw) and `frayermodel` explains a term only on its own terms, this block's whole
   job is the bridge to PRIOR knowledge. `breaksDown` is first-class rather than an afterthought:
   an analogy that can't say where it stops holding teaches a wrong model. Use for "explain X
   like I already know Y", "what's a good analogy for …", onboarding an unfamiliar domain.
   domains: education, tech, science. ── */

export interface AnalogyPair {
  /** The part of the FAMILIAR thing (left column), e.g. "Your house key". */
  familiar: string;
  /** The part of the concept it maps onto (right column), e.g. "The private key". */
  target: string;
  /** What the correspondence actually IS — the shared role, drawn on the connector. */
  note?: string;
  /** Mark a correspondence that only roughly holds: the connector draws dashed and warning-tinted,
   *  and the figure gains a legend line saying so. Use it rather than quietly overstating a match. */
  loose?: boolean;
}

export interface AnalogyMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The familiar domain the analogy borrows from, e.g. "A house and its keys". */
  familiar: string;
  /** The unfamiliar concept being explained, e.g. "Public-key cryptography". */
  target: string;
  /** One row per correspondence, in teaching order; 3–6 read best. */
  pairs: AnalogyPair[];
  /** Where the analogy stops holding — the wrong model a learner would otherwise carry away. */
  breaksDown?: string[];
  /** A one-line caption under the figure. */
  caption?: string;
  footer?: HtmlString;
}
