import { entry, type BlockRegistry } from '../registry-types';
import { AlgorithmTrace } from './AlgorithmTrace';
import { ArgumentMap } from './ArgumentMap';
import { BinaryTree } from './BinaryTree';
import { CastMap } from './CastMap';
import { CausationChain } from './CausationChain';
import { CircuitDiagram } from './CircuitDiagram';
import { ClassDiagram } from './ClassDiagram';
import { ControlBlockDiagram } from './ControlBlockDiagram';
import { CycleWheel } from './CycleWheel';
import { DataPipeline } from './DataPipeline';
import { DataStructure } from './DataStructure';
import { DiagramFlow } from './DiagramFlow';
import { DpTable } from './DpTable';
import { ErDiagram } from './ErDiagram';
import { Fishbone } from './Fishbone';
import { FiveForces } from './FiveForces';
import { FiveWhyChain } from './FiveWhyChain';
import { FoodWeb } from './FoodWeb';
import { GraphTrace } from './GraphTrace';
import { HashTable } from './HashTable';
import { LogicGates } from './LogicGates';
import { MindShape } from './MindShape';
import { NnArchitecture } from './NnArchitecture';
import { PipingSchematic } from './PipingSchematic';
import { PlasmidMap } from './PlasmidMap';
import { PrimeFactorTree } from './PrimeFactorTree';
import { ProbabilityTree } from './ProbabilityTree';
import { ProofTree } from './ProofTree';
import { ProtocolStack } from './ProtocolStack';
import { RecursionTree } from './RecursionTree';
import { SequenceDiagram } from './SequenceDiagram';
import { SortingViz } from './SortingViz';
import { GridTrace } from './GridTrace';
import { StateMachine } from './StateMachine';
import { SynthesisRoute } from './SynthesisRoute';
import { SysArchDiagram } from './SysArchDiagram';
import { ThreatModel } from './ThreatModel';
import { Toulmin } from './Toulmin';
import { TournamentBracket } from './TournamentBracket';
import { Trie } from './Trie';
import { WiringDiagram } from './WiringDiagram';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** diagrams family registry — freeform labeled node/edge figures.
 *  Keyed `diagramflow` so it does NOT collide with the media family's `diagram` (a vector
 *  shapes-and-labels figure the demos use); they're distinct primitives and both must stay
 *  reachable. (Before this, the barrel merged diagrams last and DiagramFlow shadowed the
 *  media Diagram, so every shapes/labels block crashed in layoutNodes.) */
export const diagramsRegistry: BlockRegistry = {
  algorithmtrace: entry(AlgorithmTrace),
  argumentmap: entry(ArgumentMap),
  binarytree: entry(BinaryTree),
  castmap: entry(CastMap),
  causationchain: entry(CausationChain),
  circuitdiagram: entry(CircuitDiagram),
  classdiagram: entry(ClassDiagram),
  controlblockdiagram: entry(ControlBlockDiagram),
  cyclewheel: entry(CycleWheel),
  datapipeline: entry(DataPipeline),
  datastructure: entry(DataStructure),
  diagramflow: entry(DiagramFlow),
  dptable: entry(DpTable),
  erdiagram: entry(ErDiagram),
  fishbone: entry(Fishbone),
  fiveforces: entry(FiveForces),
  fivewhychain: entry(FiveWhyChain),
  foodweb: entry(FoodWeb),
  graphtrace: entry(GraphTrace),
  hashtable: entry(HashTable),
  logicgates: entry(LogicGates),
  mindshape: entry(MindShape),
  nnarchitecture: entry(NnArchitecture),
  pipingschematic: entry(PipingSchematic),
  plasmidmap: entry(PlasmidMap),
  primefactortree: entry(PrimeFactorTree),
  probabilitytree: entry(ProbabilityTree),
  prooftree: entry(ProofTree),
  protocolstack: entry(ProtocolStack),
  recursiontree: entry(RecursionTree),
  sequencediagram: entry(SequenceDiagram),
  sortingviz: entry(SortingViz),
  gridtrace: entry(GridTrace),
  statemachine: entry(StateMachine),
  synthesisroute: entry(SynthesisRoute),
  sysarchdiagram: entry(SysArchDiagram),
  threatmodel: entry(ThreatModel),
  toulmin: entry(Toulmin),
  tournamentbracket: entry(TournamentBracket),
  trie: entry(Trie),
  wiringdiagram: entry(WiringDiagram),
};
