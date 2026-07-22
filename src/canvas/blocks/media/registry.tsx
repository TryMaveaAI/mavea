import { entry, type BlockRegistry } from '../registry-types';
import type { PhotoProps } from './types';
import { GameBoard } from './GameBoard';
import { PatternPiece } from './PatternPiece';
import { Photo } from './Photo';
import { Diagram } from './Diagram';
import { Wireframe } from './Wireframe';
import { AnatomyFigure } from './AnatomyFigure';
import { ExposureTriangle } from './ExposureTriangle';
import { ColorWheel } from './ColorWheel';
import { ArtAnalysis } from './ArtAnalysis';
import { MixerBoard } from './MixerBoard';
import { BeforeAfter } from './BeforeAfter';
import { Carousel } from './Carousel';
import { ImageCallouts } from './ImageCallouts';
import { Waveform } from './Waveform';
import { VideoEmbed } from './VideoEmbed';
import { GeoMap } from './GeoMap';
import { Lightbox } from './Lightbox';
import { Moodboard } from './Moodboard';
import { Palette } from './Palette';
import { SvgBlock } from './SvgBlock';
import { SportsPitch } from './SportsPitch';
import { FloorPlan } from './FloorPlan';
import { MediaCard } from './MediaCard';
import { DimensionDrawing } from './DimensionDrawing';
import { ExplodedView } from './ExplodedView';
import { WeldSymbol } from './WeldSymbol';
import { CutList } from './CutList';
import { SpaceFit } from './SpaceFit';
import { MapRoute } from './MapRoute';
import { MoonPhase } from './MoonPhase';
import { SkyChart } from './SkyChart';
import { OrbitDiagram } from './OrbitDiagram';
import { EmotionWheel } from './EmotionWheel';
import { CreativeTest } from './CreativeTest';
import { BrandGuide } from './BrandGuide';
import { SitePlan } from './SitePlan';
import { WordSearch } from './WordSearch';
import { PlayingCards } from './PlayingCards';
import { StitchChart } from './StitchChart';
import { PianoRoll } from './PianoRoll';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** Maps each media block `type` to its renderer; props arrive untyped from the
 *  block stream, so each entry casts to the component's concrete props. */
export const mediaRegistry: BlockRegistry = {
  gameboard: entry(GameBoard),
  patternpiece: entry(PatternPiece),
  // Photo is the one media block that loads a remote URL with no gradient plate to fall back to,
  // so it needs its id + the drop channel: when every candidate fails AND it has no text to
  // degrade to, it removes itself from the canvas (see Photo.tsx / registry-types BlockCommon).
  photo: (props, common) => (
    <Photo
      {...(props as PhotoProps)}
      delay={common.delay}
      blockId={common.blockId}
      onUnrenderable={common.onUnrenderable}
    />
  ),
  diagram: entry(Diagram),
  wireframe: entry(Wireframe),
  anatomyfigure: entry(AnatomyFigure),
  exposuretriangle: entry(ExposureTriangle),
  colorwheel: entry(ColorWheel),
  artanalysis: entry(ArtAnalysis),
  mixerboard: entry(MixerBoard),
  beforeafter: entry(BeforeAfter),
  carousel: entry(Carousel),
  imagecallouts: entry(ImageCallouts),
  waveform: entry(Waveform),
  videoembed: entry(VideoEmbed),
  geomap: entry(GeoMap),
  lightbox: entry(Lightbox),
  moodboard: entry(Moodboard),
  palette: entry(Palette),
  svgblock: entry(SvgBlock),
  sportspitch: entry(SportsPitch),
  floorplan: entry(FloorPlan),
  mediacard: entry(MediaCard),
  dimensiondrawing: entry(DimensionDrawing),
  explodedview: entry(ExplodedView),
  weldsymbol: entry(WeldSymbol),
  cutlist: entry(CutList),
  spacefit: entry(SpaceFit),
  maproute: entry(MapRoute),
  moonphase: entry(MoonPhase),
  skychart: entry(SkyChart),
  orbitdiagram: entry(OrbitDiagram),
  emotionwheel: entry(EmotionWheel),
  creativetest: entry(CreativeTest),
  brandguide: entry(BrandGuide),
  siteplan: entry(SitePlan),
  zoningmap: entry(GeoMap),
  wordsearch: entry(WordSearch),
  playingcards: entry(PlayingCards),
  stitchchart: entry(StitchChart),
  pianoroll: entry(PianoRoll),
};
