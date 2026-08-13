import { entry, type BlockRegistry } from '../registry-types';
import { ElementCard } from './ElementCard';
import { ConstantCard } from './ConstantCard';
import { NumberSequence } from './NumberSequence';
import { TaxonRank } from './TaxonRank';
import { PracticeLog } from './PracticeLog';
import { EquationBlock } from './EquationBlock';
import { NumberLine } from './NumberLine';
import { WorkedExample } from './WorkedExample';
import { Quiz } from './Quiz';
import { QuizSession } from './QuizSession';
import { Flashcard } from './Flashcard';
import { MolecularStructure } from './MolecularStructure';
import { PeriodicTable } from './PeriodicTable';
import { BodyMap } from './BodyMap';
import { GeometryCanvas } from './GeometryCanvas';
import { FreeBodyDiagram } from './FreeBodyDiagram';
import { MusicStaff } from './MusicStaff';
import { VectorSpace } from './VectorSpace';
import { ReactionMechanism } from './ReactionMechanism';
import { ChordDiagram } from './ChordDiagram';
import { DevelopmentMilestone } from './DevelopmentMilestone';
import { TeachDiagram } from './TeachDiagram';
import { GridMatrix } from './GridMatrix';
import { FractionBar } from './FractionBar';
import { WaveDiagram } from './WaveDiagram';
import { EnergyDiagram } from './EnergyDiagram';
import { PhyloTree } from './PhyloTree';
import { ParseTree } from './ParseTree';
import { CellDiagram } from './CellDiagram';
import { RayDiagram } from './RayDiagram';
import { VectorField } from './VectorField';
import { Pedigree } from './Pedigree';
import { BohrModel } from './BohrModel';
import { EquationBalancer } from './EquationBalancer';
import { YieldCalc } from './YieldCalc';
import { VseprMolecule } from './VseprMolecule';
import { UnitCircle } from './UnitCircle';
import { SolidFigure } from './SolidFigure';
import { CrossSection } from './CrossSection';
import { PianoKeys } from './PianoKeys';
import { FretboardMap } from './FretboardMap';
import { CircleOfFifths } from './CircleOfFifths';
import { Odontogram } from './Odontogram';
import { ClockFace } from './ClockFace';
import { MoneyTray } from './MoneyTray';
import { PlaceValueChart } from './PlaceValueChart';
import { ShapeCard } from './ShapeCard';
import { LetterForm } from './LetterForm';
import { ToolScale } from './ToolScale';
import { CraftChart } from './CraftChart';
import { DnaHelix } from './DnaHelix';
import { LineSpectrum } from './LineSpectrum';
import { PyramidTiers } from './PyramidTiers';
import { TwoColumnProof } from './TwoColumnProof';
import { GridTransform } from './GridTransform';
import { AreaModel } from './AreaModel';
import { PolarPlot } from './PolarPlot';
import { TaylorSeries } from './TaylorSeries';
import { PhasePortrait } from './PhasePortrait';
import { SightWordList } from './SightWordList';
import { AlphabetChart } from './AlphabetChart';
import { ColumnArithmetic } from './ColumnArithmetic';
import { TitrationCurve } from './TitrationCurve';
import { InterferencePattern } from './InterferencePattern';
import { OrbitalDiagram } from './OrbitalDiagram';
import { Pictograph } from './Pictograph';
import { ParticleModel } from './ParticleModel';
import { MorphemeBreakdown } from './MorphemeBreakdown';
import { EnergyBarChart } from './EnergyBarChart';
import { GuitarTab } from './GuitarTab';
import { Karyotype } from './Karyotype';
import { FrayerModel } from './FrayerModel';
import { NumberBond } from './NumberBond';
import type { MolecularStructureProps, TeachDiagramProps } from './types';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** learn family registry — STEM notation + assessment primitives. */
export const learnRegistry: BlockRegistry = {
  equationblock: entry(EquationBlock),
  numberline: entry(NumberLine),
  workedexample: entry(WorkedExample),
  quiz: entry(Quiz),
  quizsession: entry(QuizSession),
  flashcard: entry(Flashcard),
  molecularstructure: (p, c) => (
    <MolecularStructure {...(p as MolecularStructureProps)} delay={c.delay} />
  ),
  periodictable: entry(PeriodicTable),
  bodymap: entry(BodyMap),
  geometrycanvas: entry(GeometryCanvas),
  freebodydiagram: entry(FreeBodyDiagram),
  musicstaff: entry(MusicStaff),
  vectorspace: entry(VectorSpace),
  reactionmechanism: entry(ReactionMechanism),
  chorddiagram: entry(ChordDiagram),
  developmentmilestone: entry(DevelopmentMilestone),
  // teachdiagram loops its build while the tour spotlights it → needs `spotlight`; `blockId` lets
  // the voice tour walk claim its step clock (stepDriver.ts) once it lands on this card.
  teachdiagram: (p, c) => (
    <TeachDiagram
      {...(p as TeachDiagramProps)}
      delay={c.delay}
      spotlight={c.spotlight}
      blockId={c.blockId}
    />
  ),
  gridmatrix: entry(GridMatrix),
  fractionbar: entry(FractionBar),
  wave: entry(WaveDiagram),
  energydiagram: entry(EnergyDiagram),
  phylotree: entry(PhyloTree),
  parsetree: entry(ParseTree),
  celldiagram: entry(CellDiagram),
  raydiagram: entry(RayDiagram),
  vectorfield: entry(VectorField),
  pedigree: entry(Pedigree),
  bohrmodel: entry(BohrModel),
  equationbalancer: entry(EquationBalancer),
  yieldcalc: entry(YieldCalc),
  vseprmolecule: entry(VseprMolecule),
  unitcircle: entry(UnitCircle),
  solidfigure: entry(SolidFigure),
  crosssection: entry(CrossSection),
  pianokeys: entry(PianoKeys),
  fretboardmap: entry(FretboardMap),
  circleoffifths: entry(CircleOfFifths),
  odontogram: entry(Odontogram),
  clockface: entry(ClockFace),
  moneytray: entry(MoneyTray),
  placevaluechart: entry(PlaceValueChart),
  shapecard: entry(ShapeCard),
  letterform: entry(LetterForm),
  toolscale: entry(ToolScale),
  craftchart: entry(CraftChart),
  dnahelix: entry(DnaHelix),
  linespectrum: entry(LineSpectrum),
  pyramidtiers: entry(PyramidTiers),
  twocolumnproof: entry(TwoColumnProof),
  gridtransform: entry(GridTransform),
  areamodel: entry(AreaModel),
  polarplot: entry(PolarPlot),
  taylorseries: entry(TaylorSeries),
  phaseportrait: entry(PhasePortrait),
  sightwordlist: entry(SightWordList),
  alphabetchart: entry(AlphabetChart),
  columnarithmetic: entry(ColumnArithmetic),
  titrationcurve: entry(TitrationCurve),
  interferencepattern: entry(InterferencePattern),
  orbitaldiagram: entry(OrbitalDiagram),
  pictograph: entry(Pictograph),
  particlemodel: entry(ParticleModel),
  morphemebreakdown: entry(MorphemeBreakdown),
  energybarchart: entry(EnergyBarChart),
  guitartab: entry(GuitarTab),
  karyotype: entry(Karyotype),
  frayermodel: entry(FrayerModel),
  numberbond: entry(NumberBond),

  practicelog: entry(PracticeLog),

  taxonrank: entry(TaxonRank),

  numbersequence: entry(NumberSequence),

  constantcard: entry(ConstantCard),

  elementcard: entry(ElementCard),
};
