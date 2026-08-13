// media family block types — images, maps, audio/video, color & collage visuals.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
import type { IconKey } from '../../../icons/icons';

// ───────────────────────── beforeafter ─────────────────────────
export interface BeforeAfterProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** label + gradient for the "before" plate (real image via `src`, gradient fallback) */
  before: { label: string; from: AccentVar; to: AccentVar; caption?: string; src?: string };
  /** label + gradient for the "after" plate (real image via `src`, gradient fallback) */
  after: { label: string; from: AccentVar; to: AccentVar; caption?: string; src?: string };
  /** initial divider position 0..100 (default 50) */
  position?: number;
  footer?: HtmlString;
}

// ───────────────────────── carousel ─────────────────────────
export interface CarouselSlide {
  label: string;
  caption?: string;
  from: AccentVar;
  to: AccentVar;
  tag?: string;
  /** real image URL; falls back to the from/to gradient while loading or if absent */
  src?: string;
}
export interface CarouselProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  slides: CarouselSlide[];
  /** first slide index (default 0) */
  start?: number;
  footer?: HtmlString;
}

// ───────────────────────── imagecallouts ─────────────────────────
export interface Callout {
  /** anchor point on the image, 0..100 in each axis */
  x: number;
  y: number;
  label: string;
  detail?: string;
  color?: AccentVar;
}
export interface ImageCalloutsProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  image: { from: AccentVar; to: AccentVar; label?: string; src?: string };
  callouts: Callout[];
  footer?: HtmlString;
}

// ───────────────────────── waveform ─────────────────────────
export interface WaveformProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** bar amplitudes 0..1 */
  bars: number[];
  durationLabel?: string;
  /** accent for the played portion */
  color?: AccentVar;
  /** initial playhead 0..100 (default 32) */
  position?: number;
  markers?: { at: number; label: string }[];
  footer?: HtmlString;
}

// ───────────────────────── videoembed ─────────────────────────
export interface VideoChapter {
  time: string;
  /** start position 0..100 along the scrubber */
  at: number;
  title: string;
}
export interface VideoEmbedProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  thumb: { from: AccentVar; to: AccentVar; label?: string };
  /** real video file URL; when set, renders a native <video> (controls, chapters seek) */
  video?: string;
  /** poster frame shown before the video plays (real image URL) */
  poster?: string;
  durationLabel?: string;
  chapters: VideoChapter[];
  /** index of chapter highlighted by default (default 0) */
  active?: number;
  footer?: HtmlString;
}

/** A pin on a REAL map (MapLibre + OpenFreeMap tiles). The model supplies actual coordinates —
 *  it reliably knows lat/lng for real places — so this renders an interactive, draggable map
 *  rather than the stylized grid. */
export interface GeoMarker {
  lat: number;
  lng: number;
  name: string;
  detail?: string;
  color?: AccentVar;
}
export interface GeoMapProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  markers: GeoMarker[];
  /** initial zoom when there's a single marker (default 13). Multi-marker maps fit all pins. */
  zoom?: number;
  /** Optional zoning/land-use overlay: colored polygons + a legend. See `GeoZone` (zoningmap). */
  zones?: GeoZone[];
  footer?: HtmlString;
}

// ───────────────────────── lightbox ─────────────────────────
export interface LightboxItem {
  label: string;
  caption?: string;
  from: AccentVar;
  to: AccentVar;
  /** real image URL; falls back to the from/to gradient while loading or if absent */
  src?: string;
}
export interface LightboxProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: LightboxItem[];
  footer?: HtmlString;
}

// ───────────────────────── moodboard ─────────────────────────
export type MoodTileKind = 'image' | 'color' | 'text';
export interface MoodTile {
  kind: MoodTileKind;
  /** column span 1..2 */
  span?: number;
  /** row span 1..2 */
  rows?: number;
  from?: AccentVar;
  to?: AccentVar;
  swatch?: AccentVar;
  hex?: string;
  label?: string;
  text?: string;
  /** for an `image` tile: real image URL; falls back to the from/to gradient */
  src?: string;
}
export interface MoodboardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  tiles: MoodTile[];
  footer?: HtmlString;
}

// ───────────────────────── palette ─────────────────────────
export interface Swatch {
  name: string;
  hex: string;
  /** AA / AAA / fail style contrast verdict against white text */
  contrast?: string;
  /** true → light swatch needs dark text */
  light?: boolean;
}
export interface PaletteProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  swatches: Swatch[];
  footer?: HtmlString;
}

// ───────────────────────── photo ─────────────────────────
// A reviewed photograph (vs the gradient placeholders above). Models cannot clear image rights;
// runtime URLs survive only when the exact file appears in the media clearance set.
export interface PhotoProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** A reviewed bundled path or exact cleared remote URL (see lib/safeImageUrl). */
  src: string;
  /** Extra individually cleared URLs in preference order. */
  candidates?: string[];
  /** Alt text; falls back to the caption/title. */
  alt?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── family union ─────────────────────────
/* ── diagram — a general LABELED FIGURE: vector shapes (circle/rect/line/polygon/path,
   lines can be arrows) drawn in a 0–100 coordinate space, with callout labels that point
   at figure points. One primitive for anatomy, geometry, physics free-body diagrams,
   geography, biology, and engineering schematics — no image needed. ── */
export type DiagShapeKind = 'circle' | 'rect' | 'line' | 'polygon' | 'path';
export interface DiagShape {
  kind: DiagShapeKind;
  /** circle */ cx?: number;
  cy?: number;
  r?: number;
  /** rect */ x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** line */ x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** polygon: "x,y x,y …" ; path: SVG d (all in 0–100 space) */
  points?: string;
  d?: string;
  color?: AccentVar;
  fill?: AccentVar;
  /** draw a line with an arrowhead (e.g. a force vector) */
  arrow?: boolean;
}
export interface DiagLabel {
  /** the figure point being labeled (0–100 space) */
  x: number;
  y: number;
  text: string;
  /** which side the text sits on (default 'right') */
  side?: 'left' | 'right' | 'top' | 'bottom';
  color?: AccentVar;
}
export interface DiagramProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  shapes: DiagShape[];
  labels: DiagLabel[];
  /** canvas width:height ratio (default 1.6) */
  ratio?: number;
  footer?: HtmlString;
}

// ───────────────────────── svgblock ─────────────────────────
// Tier-3 escape hatch: the model generates a raw SVG string when no native component
// fits. A strict local allow-list sanitizer checks it before render; CSS custom properties are inherited so
// design tokens work; width="100%" is enforced for responsiveness.
// SVG RULES the model must follow:
//   • Use var(--presence/--insight/--warning/--danger/--text-primary/--surface-elevated) for all colors
//   • Always include viewBox="0 0 W H" — no fixed width/height attributes
//   • No <script>, no <foreignObject>, no external hrefs in <use> or <image>
//   • Keep paths clean — no tool-generated bloat
export interface SvgBlockProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Raw SVG markup — allow-list sanitized before render. Must include a valid viewBox. */
  svg: string;
  /** Optional text caption rendered below the SVG. */
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── mediacard ─────────────────────────
// A poster-forward detail card for ONE title (film/show/book/game): cover art (real `src` or
// the from/to gradient fallback used across the media family), meta chips, a 0–100 score badge,
// a spoiler-safe logline, genre tags, and "where to watch" provider chips. For a single
// recommendation; carousel/lightbox are galleries of many.
export interface MediaCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Poster art: a real image `src`, with a from/to gradient placeholder behind it (or instead). */
  cover: { src?: string; from?: AccentVar; to?: AccentVar };
  /** Release year, e.g. "2024". */
  year?: string;
  /** Runtime or length, e.g. "2h 8m" / "412 pages". */
  runtime?: string;
  /** Content/age rating, e.g. "PG-13" / "TV-MA". */
  rating?: string;
  /** Critic/aggregate score on a 0–100 scale; tiers the badge accent. */
  score?: number;
  /** Genre labels shown as tags. */
  genres?: string[];
  /** A short, SPOILER-SAFE description of the premise. */
  logline?: string;
  /** "Where to watch/read" provider/platform names. */
  providers?: string[];
  footer?: HtmlString;
}

// ───────────────────────── dimensiondrawing ─────────────────────────
/* A technical/shop drawing: a part profile drawn to scale with proper dimension lines
   (extension lines + arrowheads + measurement text), an optional tolerance note, and a small
   title block — the kind of figure an engineer hands a machinist. Coordinates are in arbitrary
   "drawing units"; the component fits the profile + its dimension callouts to the viewBox. */
export interface DimensionLine {
  /** Start point of the measured span, in drawing units. */
  from: [number, number];
  /** End point of the measured span, in drawing units. */
  to: [number, number];
  /** The dimension text, e.g. "60" or "Ø12". */
  label: string;
  /** How far the dimension line sits off the part, in drawing units (signed → which side).
   *  Default ±10 picked from the span's orientation. */
  offset?: number;
}
export interface DimensionDrawingProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The part profile as a closed polygon, in drawing units (any scale; auto-fit to the frame). */
  outline: { x: number; y: number }[];
  /** The dimension callouts placed around the part. */
  dimensions: DimensionLine[];
  /** A general tolerance note, e.g. "±0.1 unless noted". */
  tolerance?: string;
  /** A small drawing title block (part number, scale, units). */
  titleBlock?: { part?: string; scale?: string; units?: string };
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── explodedview ─────────────────────────
/* An exploded assembly diagram: simple part shapes separated along an axis with dashed
   centerlines and numbered balloon callouts, beside a numbered parts list. Computes the
   stack/offset geometry from the part order — the model supplies only the parts. */
export interface ExplodedPart {
  /** Callout number (1-based), matching the balloon on the figure. */
  n: number;
  /** Part name shown in the list. */
  name: string;
  /** Quantity in the assembly (default 1). */
  qty?: number;
}
export interface ExplodedViewProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  parts: ExplodedPart[];
  /** Separation axis (default 'vertical'). */
  axis?: 'vertical' | 'diagonal';
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── weldsymbol ─────────────────────────
/* A welding callout: the joint cross-section AND the AWS weld symbol (reference line, arrow,
   weld-type glyph, size + length-pitch), with a legend explaining each part of the symbol.
   Everything is computed from the joint kind + the size/length/pitch strings. */
export type WeldJoint = 'fillet' | 'groove' | 'lap' | 'butt' | 'tee';
export interface WeldSymbolProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  joint: WeldJoint;
  /** Which side of the reference line the weld sits on (default 'arrow'). */
  side?: 'arrow' | 'other' | 'both';
  /** Weld size, e.g. "6" (mm leg/throat). */
  size?: string;
  /** Weld length, e.g. "50". */
  length?: string;
  /** Centre-to-centre pitch for intermittent welds, e.g. "100". */
  pitch?: string;
  /** Welding process abbreviation in the tail, e.g. "GMAW". */
  process?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── cutlist ─────────────────────────
/* A material cut list + nesting layout: a parts table beside an SVG of the stock sheet with
   the parts packed as labeled rectangles (authored x/y, else a shelf-pack), the leftover
   offcut highlighted, and a computed yield %. Real-data-only: areas + yield are computed. */
export interface CutPart {
  label: string;
  /** Part width in `unit`. */
  w: number;
  /** Part height in `unit`. */
  h: number;
  /** How many of this part to cut. */
  qty: number;
  /** Optional explicit placement on the sheet, in `unit` from the top-left. When omitted the
   *  component shelf-packs the part. Either both x+y are given or neither. */
  x?: number;
  y?: number;
}
export interface CutListProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The raw stock sheet dimensions, in `unit`. */
  stock: { w: number; h: number; label?: string };
  parts: CutPart[];
  /** Length unit shown in the table + scale, e.g. "mm". Default "mm". */
  unit?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── spacefit ─────────────────────────
/* A to-scale top-down room layout with furniture: the room rectangle drawn to scale with
   furniture rectangles placed (and rotated) inside, a scale ruler, and called-out
   walkway/clearance gaps (a gap below a comfortable threshold is flagged). Positions are in
   `unit` from the top-left of the room; the component fits the room to the frame. */
export interface SpaceItem {
  label: string;
  /** Footprint width in `unit` (before rotation). */
  w: number;
  /** Footprint depth in `unit` (before rotation). */
  d: number;
  /** Left edge in `unit` from the room's top-left. */
  x: number;
  /** Top edge in `unit` from the room's top-left. */
  y: number;
  /** Rotation in degrees, clockwise (default 0). 90 swaps width/depth. */
  rot?: number;
}
export interface SpaceFitProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The room footprint, in `unit`. */
  room: { w: number; d: number; unit?: string };
  items: SpaceItem[];
  /** Named walkway/clearance gaps to call out; one below the comfortable floor is flagged. */
  clearances?: { label: string; gap: number }[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── anatomyfigure ─────────────────────────
/* A labeled anatomy figure drawn from a small built-in library of correct organ shapes.
   The component AUTHORS the recognizable organ illustration (a stylized but faithful SVG path
   per organ); the model only names the organ and places numbered callout pins at x/y points
   (0..100 of the viewBox) — like imagecallouts, but the figure itself is the drawing, not a
   gradient plate or a real image. One primitive for any "label the parts of …" anatomy ask. */
export type OrganKind =
  | 'heart'
  | 'kidney'
  | 'nephron'
  | 'brain'
  | 'lung'
  | 'eye'
  | 'ear'
  | 'neuron'
  | 'skeleton'
  | 'stomach'
  | 'liver';
export interface AnatomyPin {
  /** Horizontal anchor on the figure, 0..100 of the viewBox. */
  x: number;
  /** Vertical anchor on the figure, 0..100 of the viewBox. */
  y: number;
  label: string;
  /** A short clarifying note revealed when the pin is active. */
  note?: string;
}
export interface AnatomyFigureProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Which organ illustration to draw, from the built-in library. */
  organ: OrganKind;
  /** Numbered callout pins placed on the figure. */
  pins: AnatomyPin[];
  /** A short view descriptor, e.g. "anterior" / "coronal section". */
  view?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── exposuretriangle ─────────────────────────
/* The photography exposure triangle: aperture, shutter, and ISO at the corners of a triangle,
   wired together with the trade-off each axis makes (depth of field / motion / noise). The
   component COMPUTES the corner geometry and reads the three settings + the resulting EV from
   props; the side-effect cues are author-supplied notes tagged to an axis. */
export type ExposureAxis = 'aperture' | 'shutter' | 'iso';
export interface ExposureEffect {
  /** Which corner the cue belongs to. */
  axis: ExposureAxis;
  /** The trade-off / side-effect note, e.g. "shallow depth of field". */
  note: string;
}
export interface ExposureTriangleProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Aperture setting, e.g. "f/2.8". */
  aperture: string;
  /** Shutter speed, e.g. "1/250". */
  shutter: string;
  /** ISO sensitivity, e.g. 200. */
  iso: number;
  /** The resulting exposure value, e.g. "EV 12". */
  ev?: string;
  /** Side-effect cues, each tagged to one corner of the triangle. */
  effects?: ExposureEffect[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── colorwheel ─────────────────────────
/* A color-theory wheel: a hue ring drawn as conic segments, the base hue marked, and the
   harmony geometry (lines to the related hues) drawn over it, with a swatch row of the resulting
   colors + hex. The related hues are COMPUTED from `baseHue` + `harmony` when explicit swatches
   aren't supplied, so the geometry and the swatches always agree. */
export type ColorHarmony = 'complementary' | 'analogous' | 'triad' | 'split' | 'tetrad';
export interface ColorSwatch {
  /** Hue angle 0..360 on the wheel. */
  hue: number;
  /** The rendered color as a hex string, e.g. "#3b82f6". */
  hex: string;
  /** Role label, e.g. "base" / "accent". */
  role?: string;
}
export interface ColorWheelProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The base hue angle, 0..360. */
  baseHue: number;
  /** The harmony rule that places the related hues (default 'complementary'). */
  harmony?: ColorHarmony;
  /** Explicit resulting colors; when omitted the component derives them from baseHue + harmony. */
  swatches?: ColorSwatch[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── artanalysis ─────────────────────────
/* A composition / art-technique breakdown over an abstract canvas (no supplied image): the chosen
   compositional overlay (rule-of-thirds grid / leading lines / golden spiral / symmetry axis) is
   drawn to scale, focal regions are boxed and labeled, a dominant-palette row sits below, and
   technique/light/style notes are called out. The overlay geometry is COMPUTED; regions + palette
   + notes come from props. */
export type ArtOverlay = 'thirds' | 'leadinglines' | 'goldenratio' | 'symmetry';
export interface ArtRegion {
  /** Left edge 0..100 of the canvas. */
  x: number;
  /** Top edge 0..100 of the canvas. */
  y: number;
  /** Width 0..100. */
  w: number;
  /** Height 0..100. */
  h: number;
  label: string;
}
export interface ArtSwatch {
  /** Dominant color as a hex string. */
  hex: string;
  /** Role label, e.g. "highlight" / "shadow". */
  role?: string;
}
export interface ArtNote {
  /** Note heading, e.g. "Light" / "Composition". */
  label: string;
  text: string;
}
export interface ArtAnalysisProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The compositional overlay drawn over the canvas (default 'thirds'). */
  overlay?: ArtOverlay;
  /** Boxed, labeled focal regions on the canvas. */
  regions?: ArtRegion[];
  /** The dominant-palette swatch row. */
  palette?: ArtSwatch[];
  /** Technique / light / style callout notes. */
  notes?: ArtNote[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── mixerboard ─────────────────────────
/* A multitrack DAW / mixer view: stacked labeled track lanes share one bar-numbered timeline,
   with clip blocks positioned by start + length, and each lane carrying a small volume bar, a pan
   indicator, and its mute/solo state. The timeline span is COMPUTED from `bars` (or the furthest
   clip end), so the clip positions are always to scale. */
export interface MixerClip {
  /** Start position in bars (0-based). */
  start: number;
  /** Length in bars. */
  len: number;
  /** Optional clip label, e.g. "verse". */
  label?: string;
}
export interface MixerTrack {
  name: string;
  /** Audio clips on the lane, positioned along the shared bar timeline. */
  clips?: MixerClip[];
  /** Fader level 0..100 (default 80). */
  volume?: number;
  /** Stereo pan -100 (L) .. 100 (R), 0 = centre. */
  pan?: number;
  /** Muted lane — dimmed, with an "M" badge. */
  mute?: boolean;
  /** Soloed lane — accented, with an "S" badge. */
  solo?: boolean;
  /** Lane accent color. */
  color?: AccentVar;
}
export interface MixerBoardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  tracks: MixerTrack[];
  /** Total bars on the timeline; defaults to the furthest clip end (min 4). */
  bars?: number;
  caption?: string;
  footer?: HtmlString;
}

/* ── wireframe ── a low-fi single-page wireframe laid out on a column grid ── */
/** The placeholder kinds a wireframe region can stand in for — each renders its own
 *  low-fidelity sketch (lorem bars for text, a diagonal-crossed box for an image, a pill
 *  for a button…). A closed set so the renderer can map every kind to a shape. */
export type WireKind =
  'header' | 'hero' | 'nav' | 'image' | 'text' | 'button' | 'card' | 'list' | 'footer' | 'input';
export interface WireRegion {
  kind: WireKind;
  /** label drawn on/under the placeholder (e.g. "Hero", "Feature card") */
  label?: string;
  /** how many of the 12 columns this region spans (1..12); defaults per kind */
  col?: number;
  /** how tall the placeholder is, in grid rows (1 ≈ a band); defaults per kind */
  rows?: number;
}
export interface WireframeProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the placeholder regions, laid out left→right, wrapping onto new rows */
  regions: WireRegion[];
  /** columns in the layout grid (default 12) */
  cols?: number;
  /** caption under the frame, e.g. "Landing page · above the fold" */
  caption?: HtmlString;
  footer?: HtmlString;
}

// ───────────────────────── maproute ─────────────────────────
/* An ordered route drawn over a REAL MapLibre map (same tiles + teardown as geomap): the
   waypoints connect into a polyline with numbered markers, beside an itinerary list and a
   distance/elevation summary. The model supplies actual coordinates (it reliably knows lat/lng);
   the leg order, polyline, and summary are computed from the waypoints — real-data-only. */
export interface RouteWaypoint {
  lat: number;
  lng: number;
  /** Stop name shown on the marker popup + in the itinerary. */
  label: string;
  /** The leg INTO this stop, e.g. "1.2 km · 15 min" — shown under the itinerary row. */
  leg?: string;
}
export interface MapRouteProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Optional map centre [lat, lng]; the route is auto-fit to all waypoints regardless. */
  center?: [number, number];
  /** Initial zoom (the map fits the whole route, so this is a hint only). */
  zoom?: number;
  /** The ordered stops along the route; connected in order into the drawn line. */
  waypoints: RouteWaypoint[];
  /** Total route distance in kilometres — shown in the summary. */
  distanceKm?: number;
  /** Total elevation gain in metres — shown in the summary. */
  elevationGainM?: number;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── moonphase ─────────────────────────
/* A lunar-phase disk: an SVG moon with the terminator computed from the illuminated fraction
   (and the waxing/waning side), the phase name, % illumination, and an optional strip of
   upcoming nights. Real-data-only: the lit shape is derived from `illumination`, not drawn by hand. */
export interface MoonNight {
  /** A short date/label for the night, e.g. "Thu 21". */
  date: string;
  /** Illuminated fraction that night, 0..1. */
  illumination: number;
}
export interface MoonPhaseProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Illuminated fraction of the disk, 0..1 — drives the terminator. */
  illumination: number;
  /** Whether the Moon is waxing (lit on the right) vs waning (lit on the left). Default true. */
  waxing?: boolean;
  /** The phase name, e.g. "Waxing Gibbous". */
  phaseName?: string;
  /** The date this phase is for, e.g. "Jun 20, 2026". */
  date?: string;
  /** A strip of upcoming nights, each with its own illuminated fraction. */
  upcoming?: MoonNight[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── skychart ─────────────────────────
/* A circular planisphere: a sky dome (the horizon ring) with stars plotted at x/y (0..1 within the
   dome) sized by magnitude, constellation connect-the-dots over them, and labeled bright stars +
   planets. The dome geometry is scaffolding; every plotted point comes from props (real-data-only). */
export interface SkyStar {
  /** Horizontal position within the dome, 0..1 (0 = west edge, 1 = east edge). */
  x: number;
  /** Vertical position within the dome, 0..1 (0 = north edge, 1 = south edge). */
  y: number;
  /** Apparent magnitude — lower is brighter; drives the dot size. Default 3. */
  mag?: number;
  /** Star name shown as a label when bright/notable. */
  name?: string;
}
export interface SkyConstellation {
  name: string;
  /** Connect-the-dots segments as [fromStarIndex, toStarIndex] into `stars`. */
  lines: [number, number][];
}
export interface SkyPlanet {
  name: string;
  /** Horizontal position within the dome, 0..1. */
  x: number;
  /** Vertical position within the dome, 0..1. */
  y: number;
}
export interface SkyChartProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  stars: SkyStar[];
  constellations?: SkyConstellation[];
  planets?: SkyPlanet[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── orbitdiagram ─────────────────────────
/* A scaled orbital/celestial-system diagram: a central body with concentric labeled orbit rings,
   a sized body on each ring, and distance/period annotations. The ring radii + body positions are
   COMPUTED from the orbitRadius values (linearly to-scale, or sqrt-compressed when not `toScale`)
   so the diagram always fits the frame — only the values come from props. */
export interface OrbitBody {
  name: string;
  /** Orbit radius in arbitrary units (e.g. AU); normalized to the frame across all bodies. */
  orbitRadius: number;
  /** Body draw size, 1..5 (relative); default scales with the radius rank. */
  size?: number;
  /** Body accent color. */
  color?: AccentVar;
  /** Orbital period annotation, e.g. "365 days" / "88 days". */
  period?: string;
  /** Distance annotation, e.g. "1.0 AU". */
  distance?: string;
}
export interface OrbitDiagramProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The central body name, e.g. "Sun". */
  center: string;
  /** The orbiting bodies, drawn on rings ordered by orbit radius. */
  bodies: OrbitBody[];
  /** Keep orbit radii linearly to scale (default false → sqrt-compressed so inner + outer fit). */
  toScale?: boolean;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── gameboard ─────────────────────────
/* A configurable abstract game board: an 8×8 chess/checkers grid (alternating squares), a 19×19
   Go board (intersection grid), a hex grid, or a plain grid. Pieces sit on cells (a glyph or a
   short label, tinted by side), squares can be highlighted, and moves draw as arrows between
   cells. The cell geometry is COMPUTED from the board kind + size; pieces/highlights/moves come
   from props — one primitive for openings, puzzles, tactics, and any positional ask. */
export type BoardKind = 'chess' | 'checkers' | 'go' | 'hex' | 'grid';
export interface BoardPiece {
  /** Row index from the top, 0-based. */
  row: number;
  /** Column index from the left, 0-based. */
  col: number;
  /** A short text label drawn on the piece (e.g. "♞" written out, or "X"). */
  label?: string;
  /** A single glyph drawn on the piece (a chess figurine, a stone). Wins over `label`. */
  glyph?: string;
  /** Which player the piece belongs to — tints it (a = light/presence, b = dark/ink). */
  side?: 'a' | 'b';
}
export interface BoardSquare {
  row: number;
  col: number;
}
export interface BoardMove {
  /** Origin cell [row, col]. */
  from: [number, number];
  /** Destination cell [row, col]. */
  to: [number, number];
}
export interface GameBoardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Which board to draw (default 'chess'). */
  board: BoardKind;
  /** Grid dimension (squares/intersections per side). Defaults per board: chess/checkers 8,
   *  go 19, hex/grid 8. */
  size?: number;
  /** Pieces placed on cells. */
  pieces: BoardPiece[];
  /** Squares to highlight (a target, a threatened cell). */
  highlights?: BoardSquare[];
  /** Moves drawn as arrows from cell to cell. */
  moves?: BoardMove[];
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── patternpiece ─────────────────────────
/* A sewing-pattern / fabric cutting layout: the fabric rectangle drawn to scale (folded fabric is
   marked) with pattern pieces placed as labeled rectangles, each carrying a grainline arrow and an
   "on fold" mark where its edge sits on the fold. Mirrors the CutList/FloorPlan rect idiom; the
   yield (placed area ÷ fabric area, counting qty) is COMPUTED, never invented. */
export interface PatternPart {
  /** Piece name shown in the centre, e.g. "Front panel". */
  label: string;
  /** Piece width in `unit`. */
  w: number;
  /** Piece height in `unit`. */
  h: number;
  /** Left edge in `unit` from the fabric's top-left. */
  x: number;
  /** Top edge in `unit` from the fabric's top-left. */
  y: number;
  /** Mark the piece's left edge as sitting on the fold (drawn as a fold line, no seam allowance). */
  fold?: boolean;
  /** How many to cut from the laid-out fabric (default 1); folds into the yield. */
  qty?: number;
}
export interface PatternPieceProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The fabric the pieces are laid on. */
  fabric: { w: number; h: number; label?: string };
  /** The pattern pieces placed on the fabric. */
  pieces: PatternPart[];
  /** Length unit shown in the scale + yield note, e.g. "cm". Default "cm". */
  unit?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── emotionwheel ─────────────────────────
/* A Plutchik-style feeling wheel: concentric donut wedges, one per named emotion. A wedge's
   angular width is COMPUTED from how many segments share its intensity tier (equal division of
   360°) and its ring band is computed from that tier — primary sits on the outer ring, secondary
   and tertiary nest inward for progressively more specific/nuanced feelings — the same computed-
   geometry approach ColorWheel uses for its hue ring, except each wedge carries its own color
   instead of one derived base hue + harmony. Defaults to the 8 core Plutchik emotions (joy, trust,
   fear, surprise, sadness, disgust, anger, anticipation) when no segments are supplied, so the
   wheel is never empty. `highlight` ring-marks one segment, reusing ColorWheel's selected-swatch
   marker treatment. */
export type EmotionIntensity = 'primary' | 'secondary' | 'tertiary';
export interface EmotionSegment {
  /** The feeling's name, e.g. "joy" or "optimism". */
  label: string;
  /** Explicit centre angle in degrees (0 = top, clockwise); auto-spaced within its tier when omitted. */
  angle?: number;
  /** Which ring the wedge sits on — primary (outer, the core feeling) down to tertiary (inner,
   *  the most nuanced shade of it). Default 'primary'. */
  intensity?: EmotionIntensity;
  /** The wedge's fill; derived from the label (or cycled by position) when omitted. */
  color?: AccentVar;
}
export interface EmotionWheelProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The named feelings to wheel. Defaults to the 8 core Plutchik emotions. */
  segments?: EmotionSegment[];
  /** Label of the segment to ring-mark as the highlighted feeling (case-insensitive match). */
  highlight?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── wordsearch ─────────────────────────
/* A word-search puzzle GENERATED client-side: the component hashes a seed (or the word list),
   places every word into the grid in one of 8 directions with a seeded PRNG (overlaps allowed),
   and fills the rest with frequency-weighted random letters. The model supplies ONLY the words —
   a model-authored letter grid would not actually contain them. Clicking a word in the side list
   reveals its placement as a capsule highlight; "Reveal all" shows every answer. */
export interface WordSearchProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The words to hide. Normalized to A–Z uppercase; duplicates dropped; a word longer than the
   *  grid side is skipped with a quiet note. */
  words: string[];
  /** Grid side, 8–15. Defaults to fit the longest word. */
  size?: number;
  /** Deterministic placement seed; defaults to the joined word list, so the same words always
   *  build the same grid. */
  seed?: string;
  footer?: HtmlString;
}

// ───────────────────────── playingcards ─────────────────────────
/* Standard playing cards rendered as crisp SVG (corner index, true pip arrangements for the
   number cards, letter + large pip for court cards and aces, a patterned back for face-down
   cards), grouped into labeled hands laid out as a fan, a row, or a stack. Red suits use the
   danger token, black suits the ink token — theming stays automatic. */
export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardLayout = 'fan' | 'row' | 'stack';
export interface PlayingCard {
  /** Omitted on a face-down card; a missing rank on a face-up card degrades to a '?' face. */
  rank?: CardRank;
  /** Omitted on a face-down card; a missing suit falls back to spades. */
  suit?: CardSuit;
  /** Face-down card — draws the patterned back instead of rank/suit. */
  faceDown?: boolean;
}
export interface CardGroup {
  /** Group caption, e.g. "Your hand" / "Flop". */
  label?: string;
  cards: PlayingCard[];
  /** How the group's cards are laid out (default 'row'). */
  layout?: CardLayout;
}
export interface PlayingCardsProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  groups: CardGroup[];
  /** A short annotation under the groups, e.g. the odds being illustrated. */
  note?: string;
  footer?: HtmlString;
}

// ───────────────────────── stitchchart ─────────────────────────
/* A knitting symbol chart read the way real charts are: bottom-up, RS (right side) rows right to
   left and WS rows left to right, with the row number on the side the row is read from. Each cell
   draws the standard symbol for its stitch key (blank = knit, dot = purl, O = yarn over, / and \
   for the decreases, crossing strokes for cables…), and an auto-legend beneath lists ONLY the
   symbols the chart actually uses. Unknown keys render as their literal text, so a chart never
   silently drops an authored stitch. */
export interface StitchRow {
  /** Row number; defaults to the bottom-up position (rows[0] = row 1). */
  number?: number;
  /** Which fabric side the row is worked on. Defaults RS for odd rows, WS for even. */
  side?: 'RS' | 'WS';
  /** Stitch keys in knitting order: 'k','p','yo','k2tog','ssk','c4f','c4b','sl','bo','co','mb'.
   *  Unknown keys render as literal text. */
  stitches: string[];
}
export interface StitchLegendEntry {
  /** The stitch key the meaning belongs to, e.g. "mb". */
  key: string;
  /** The meaning shown in the legend, e.g. "make bobble (5 sts in 1)". */
  meaning: string;
}
export interface StitchChartProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Chart rows in knitting order — rows[0] is row 1, drawn at the BOTTOM. */
  rows: StitchRow[];
  /** Override or extend the built-in legend meanings for used keys. */
  legend?: StitchLegendEntry[];
  /** Gauge note, e.g. "22 sts × 30 rows = 10 cm in stockinette". */
  gauge?: string;
  caption?: string;
  footer?: HtmlString;
}

// ───────────────────────── pianoroll ─────────────────────────
/* A MIDI-style piano roll: a vertical mini keyboard in the left gutter (black-key rows tinted,
   octave labels on the C rows), a beat grid with heavier bar lines, and one bar per note placed
   by start beat, sized by duration, and tinted by velocity. Pitch arrives as a note name
   ('C4', 'F#3') or a MIDI number; both axes auto-range from the notes. Static — no audio, no
   animation loops. */
export interface PianoNote {
  /** Scientific pitch ('C4', 'F#3', 'Bb2') or a MIDI number 0–127. Malformed pitches are
   *  skipped with a quiet note. */
  pitch: string | number;
  /** Start position in beats, ≥ 0. */
  start: number;
  /** Length in beats, > 0. */
  duration: number;
  /** Note velocity 0–1 — drives the bar's tint intensity (default 0.75). */
  velocity?: number;
  /** Text shown on the bar when it fits; defaults to the note name. */
  label?: string;
}
export interface PianoRollProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  notes: PianoNote[];
  /** Beats per bar for the heavy grid lines (default 4). */
  beatsPerBar?: number;
  /** Tempo label shown as a chip, e.g. "96 BPM". */
  tempo?: string;
  caption?: string;
  footer?: HtmlString;
}

export type MediaBlock =
  | (BlockBase & { type: 'gameboard'; props: GameBoardProps })
  | (BlockBase & { type: 'patternpiece'; props: PatternPieceProps })
  | (BlockBase & { type: 'diagram'; props: DiagramProps })
  | (BlockBase & { type: 'maproute'; props: MapRouteProps })
  | (BlockBase & { type: 'moonphase'; props: MoonPhaseProps })
  | (BlockBase & { type: 'skychart'; props: SkyChartProps })
  | (BlockBase & { type: 'orbitdiagram'; props: OrbitDiagramProps })
  | (BlockBase & { type: 'wireframe'; props: WireframeProps })
  | (BlockBase & { type: 'anatomyfigure'; props: AnatomyFigureProps })
  | (BlockBase & { type: 'exposuretriangle'; props: ExposureTriangleProps })
  | (BlockBase & { type: 'colorwheel'; props: ColorWheelProps })
  | (BlockBase & { type: 'artanalysis'; props: ArtAnalysisProps })
  | (BlockBase & { type: 'mixerboard'; props: MixerBoardProps })
  | (BlockBase & { type: 'photo'; props: PhotoProps })
  | (BlockBase & { type: 'beforeafter'; props: BeforeAfterProps })
  | (BlockBase & { type: 'carousel'; props: CarouselProps })
  | (BlockBase & { type: 'imagecallouts'; props: ImageCalloutsProps })
  | (BlockBase & { type: 'waveform'; props: WaveformProps })
  | (BlockBase & { type: 'videoembed'; props: VideoEmbedProps })
  | (BlockBase & { type: 'geomap'; props: GeoMapProps })
  | (BlockBase & { type: 'lightbox'; props: LightboxProps })
  | (BlockBase & { type: 'moodboard'; props: MoodboardProps })
  | (BlockBase & { type: 'palette'; props: PaletteProps })
  | (BlockBase & { type: 'svgblock'; props: SvgBlockProps })
  | (BlockBase & { type: 'sportspitch'; props: SportsPitchProps })
  | (BlockBase & { type: 'floorplan'; props: FloorPlanProps })
  | (BlockBase & { type: 'creativetest'; props: CreativeTestProps })
  | (BlockBase & { type: 'brandguide'; props: BrandGuideProps })
  | (BlockBase & { type: 'siteplan'; props: SitePlanProps })
  | (BlockBase & { type: 'zoningmap'; props: GeoMapProps })
  | (BlockBase & { type: 'mediacard'; props: MediaCardProps })
  | (BlockBase & { type: 'dimensiondrawing'; props: DimensionDrawingProps })
  | (BlockBase & { type: 'explodedview'; props: ExplodedViewProps })
  | (BlockBase & { type: 'weldsymbol'; props: WeldSymbolProps })
  | (BlockBase & { type: 'cutlist'; props: CutListProps })
  | (BlockBase & { type: 'spacefit'; props: SpaceFitProps })
  | (BlockBase & { type: 'emotionwheel'; props: EmotionWheelProps })
  | (BlockBase & { type: 'wordsearch'; props: WordSearchProps })
  | (BlockBase & { type: 'playingcards'; props: PlayingCardsProps })
  | (BlockBase & { type: 'stitchchart'; props: StitchChartProps })
  | (BlockBase & { type: 'pianoroll'; props: PianoRollProps });

/* ── sportspitch: a sports field/court with optional positions and play arrows.
   Use for: "4-3-3 formation", "basketball play", "tennis court diagram". ── */

export type SportKind = 'soccer' | 'basketball' | 'football' | 'tennis' | 'baseball';

export interface PitchPosition {
  /** Short label, e.g. "GK", "LW", "PG". */
  label: string;
  /** Horizontal 0..100 (left=0, right=100). */
  x: number;
  /** Vertical 0..100 (top=0, bottom=100). */
  y: number;
  /** Optional player name or detail. */
  name?: string;
}

export interface PitchPlay {
  from: [number, number];
  to: [number, number];
  /** 'pass' (solid), 'run' (dashed), 'shot' (bold). Default: 'pass'. */
  kind?: 'pass' | 'run' | 'shot';
  label?: string;
}

export interface SportsPitchProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  sport: SportKind;
  positions?: PitchPosition[];
  plays?: PitchPlay[];
  footer?: HtmlString;
}

/* ── floorplan: a top-down room layout from declarative room data.
   Use for: "apartment floor plan", "office layout", "room dimensions". ── */

export interface FloorRoom {
  /** Room label shown inside. */
  name: string;
  /** Left edge 0..100. */
  x: number;
  /** Top edge 0..100. */
  y: number;
  /** Width 0..100. */
  w: number;
  /** Height 0..100. */
  h: number;
  /** Optional note or dimensions, e.g. "12×14 ft". */
  note?: string;
}

export interface FloorPlanProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  rooms: FloorRoom[];
  /** Optional overall scale label, e.g. "1 unit = 1 ft". */
  scale?: string;
  footer?: HtmlString;
}

// ───────────────────────── creativetest ─────────────────────────
/* A marketing A/B creative comparison: two (or a few) real ad/post images side by side, each
   carrying its own headline and a row of performance metric chips, with the winning variant
   ribboned. Real-data-only: every metric is author-supplied, never derived. */
export type CreativeMetricDir = 'good' | 'bad';
export interface CreativeMetric {
  /** Metric name, e.g. "CTR" or "Conversions". */
  label: string;
  /** The metric's display value, e.g. "4.2%" or "1,204". */
  value: string;
  /** A change vs. the other variant or a baseline, e.g. "+0.8pp". */
  delta?: string;
  /** Whether the delta favors this variant (colors the chip). */
  deltaDir?: CreativeMetricDir;
}
export interface CreativeVariant {
  /** Variant name, e.g. "Variant A" or "Warm CTA". */
  label: string;
  /** The real creative image URL. */
  src: string;
  /** Headline/copy overlaid on the creative, if the ad carries one. */
  headline?: string;
  metrics: CreativeMetric[];
}
export interface CreativeTestProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  variants: CreativeVariant[];
  /** Index into `variants` of the winning creative, if the test has concluded. */
  winner?: number;
  footer?: HtmlString;
}

// ───────────────────────── brandguide ─────────────────────────
/* A brand identity reference: the color palette (reusing Palette's swatch-copy row), a
   type-specimen row per typeface, and short voice/tone notes. Real-data-only: nothing here is
   computed, it's the identity as the model was given it. */
export interface TypeSpecimen {
  /** The role/name, e.g. "Display" or "Body". */
  name: string;
  /** Font family stack, e.g. "'Söhne', system-ui, sans-serif". */
  sample: string;
  /** Font weight, e.g. "700" or "Bold". */
  weight?: string;
}
export interface BrandGuideProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  colors: Swatch[];
  typography?: TypeSpecimen[];
  /** Short tone/voice guidance lines, e.g. "Confident, never cute." */
  voiceNotes?: string[];
  footer?: HtmlString;
}

// ───────────────────────── siteplan ─────────────────────────
/* A property boundary plan: the parcel outline, an optional building footprint, dashed setback
   lines with distance callouts, and diagonally-hatched easement strips — the outdoor counterpart
   to FloorPlan's interior rooms. Coordinates are in arbitrary site units (any scale; auto-fit to
   the frame, the same convention DimensionDrawing uses for a part profile). */
export type SitePoint = [number, number];
export interface SetbackLine {
  /** How far inside the property line this setback sits, in the boundary's own site units. */
  offset: number;
  /** e.g. "Front yard · 25 ft". */
  label: string;
}
export interface Easement {
  /** The easement strip outline, in site units. */
  path: SitePoint[];
  label: string;
}
export interface SitePlanProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** The parcel outline, in site units. */
  boundary: SitePoint[];
  /** The building/structure footprint, in the same site units. */
  structureFootprint?: SitePoint[];
  setbackLines?: SetbackLine[];
  easements?: Easement[];
  footer?: HtmlString;
}

// ───────────────────────── zoningmap ─────────────────────────
/* GeoMap's zoning overlay: the SAME real MapLibre map (markers, tiles, teardown) rendered by
   GeoMap, with an optional `zones` polygon layer color-filled by land-use category and a small
   legend chip row. Additive — GeoMap's own behavior is unchanged when `zones` is omitted, and
   `zoningmap` is a distinct, model-selectable catalog entry over the identical component/props
   so a zoning question is steered toward supplying real parcel polygons. */
export type ZoneCategory = 'residential' | 'commercial' | 'industrial' | 'mixed' | 'open-space';
export interface GeoZone {
  /** The zone boundary, [lat, lng] pairs. */
  coords: [number, number][];
  category: ZoneCategory;
  label: string;
}
