// Catalog entries for the `learn` family — the fact sheet the Live selector retrieves over
// and the prompt menu is built from. This module carries the DETAIL fields (blurb, requires,
// optional, item shapes, prop hints); the compact selection facts are generated from it into
// facts.generated.ts. It is loaded lazily, only for the families a turn actually reaches, which is
// what keeps per-turn cost proportional to the answer rather than to the library.
//
// After editing, run `pnpm gen:catalog` — a staleness test fails the build otherwise.
import { createMeta, type ComponentCatalog } from '../meta';

export const CATALOG_LEARN: ComponentCatalog = [
  // — learn additions —
  createMeta('equationblock', {
    family: 'learn',
    dataShapes: ['text', 'code'],
    requires: ['title', 'math'],
    optional: ['icon', 'iconColor', 'tex', 'number', 'caption', 'inline', 'footer'],
    interactive: false,
    wowWeight: 0.77,
    tier: 'frontier',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb: 'Rendered math equation (LaTeX or MathML) with an optional caption.',
    propHints: {
      math: 'a LaTeX string is preferred for anything beyond a single symbol — e.g. "\\\\frac{a}{b}", "\\\\int_0^1 x^2\\\\,dx", or a matrix "\\\\begin{bmatrix}1&0\\\\\\\\0&1\\\\end{bmatrix}". A declarative MathNode tree ({t:"frac",num:"a",den:"b"}) also works.',
      tex: 'optional explicit LaTeX string (same effect as putting LaTeX in `math`); wins if both set',
    },
  }),
  createMeta('numberline', {
    family: 'learn',
    dataShapes: ['scalar', 'series'],
    requires: ['title', 'min', 'max'],
    optional: ['icon', 'iconColor', 'step', 'unit', 'points', 'intervals', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'frontier',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb: 'Horizontal number line with marked points, ranges, and directional arrows.',
    itemShapes: [{ prop: 'points', text: 'label', textAliases: ['name', 'text', 'annotation'] }],
    propHints: {
      'points[].open': 'true for an open/excluded endpoint (hollow dot)',
    },
  }),
  createMeta('workedexample', {
    family: 'learn',
    dataShapes: ['sequence'],
    requires: ['title', 'steps'],
    optional: ['icon', 'iconColor', 'problem', 'result', 'progressive', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Numbered steps walking through a solved problem, each with formula, value, and explanation.',
    itemShapes: [{ prop: 'steps', text: 'label', textAliases: ['title', 'heading', 'name'] }],
    propHints: {
      'steps[].math': 'optional MathNode tree for the expression at this step',
      'steps[].why': 'plain-English explanation (HTML)',
    },
  }),
  createMeta('quiz', {
    family: 'learn',
    dataShapes: ['selection'],
    requires: ['title', 'question', 'options'],
    optional: ['icon', 'iconColor', 'explanation', 'footer'],
    interactive: true,
    wowWeight: 0.73,
    tier: 'frontier',
    colDefault: 7,
    coercer: 'generic',
    blurb: 'Interactive multiple-choice question with selectable options and optional explanation.',
    itemShapes: [{ prop: 'options', text: 'text', textAliases: ['label', 'choice', 'answer'] }],
    propHints: {
      'options[].correct': 'true on exactly one option',
    },
  }),
  createMeta('flashcard', {
    family: 'learn',
    dataShapes: ['text', 'keyvalue'],
    requires: ['title', 'cards'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: true,
    wowWeight: 0.69,
    tier: 'frontier',
    colDefault: 6,
    coercer: 'generic',
    blurb:
      'Flip card: question on the front, answer on the back; works for vocab, facts, formulas.',
    itemShapes: [{ prop: 'cards', text: 'front', textAliases: ['term', 'question', 'prompt'] }],
  }),
  createMeta('molecularstructure', {
    family: 'learn',
    dataShapes: ['structure', 'relationship'],
    requires: ['title'],
    optional: ['icon', 'iconColor', 'smiles', 'atoms', 'bonds', 'formula', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Accurate skeletal molecular structure. Give it a SMILES string and it computes correct 2-D ' +
      'geometry (atoms, bonds, formula) — the right way to show any real molecule or drug.',
    itemShapes: [{ prop: 'atoms', text: 'el', textAliases: ['element', 'symbol', 'label'] }],
    propHints: {
      smiles:
        'PREFERRED. The compound as a SMILES string (e.g. aspirin = "CC(=O)Oc1ccccc1C(=O)O", ' +
        'caffeine = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"). The component computes the exact 2-D structure ' +
        'and formula from it — supply this for ANY real molecule rather than placing atoms yourself.',
      atoms:
        'Only for a tiny hand-authored example when no SMILES applies; otherwise use `smiles`. ' +
        'Each atom: { el, x (0..100), y (0..100), implicit?: true for a bare carbon vertex }.',
      'bonds[].order': '1 (single), 2 (double), or 3 (triple)',
    },
  }),
  createMeta('periodictable', {
    family: 'learn',
    dataShapes: ['tabular', 'comparison'],
    requires: ['title', 'elements'],
    optional: ['icon', 'iconColor', 'categories', 'footer'],
    interactive: false,
    wowWeight: 0.88,
    tier: 'cutting',
    colDefault: 12,
    colMin: 10,
    coercer: 'generic',
    blurb:
      'Full 118-element periodic table with element cells highlighted or focused by category or property.',
    itemShapes: [{ prop: 'elements', text: 'name', textAliases: ['symbol', 'element', 'label'] }],
    propHints: {
      'elements[].z': 'atomic number (also drives canonical grid placement)',
      'elements[].on': 'true to emphasise/highlight this element',
    },
  }),
  // — learn additions —
  createMeta('bodymap', {
    family: 'learn',
    dataShapes: ['keyvalue', 'list'],
    requires: ['title'],
    optional: ['icon', 'iconColor', 'regions', 'side', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'Human body figure with named regions highlighted — anatomy, injury, muscle groups, health focus areas. Front or back view; omit regions for a fully-labelled body.',
    itemShapes: [{ prop: 'regions', text: 'label', textAliases: ['name', 'area', 'region'] }],
    propHints: {
      'regions[].id':
        "front: 'head'|'neck'|'leftShoulder'|'rightShoulder'|'chest'|'abdomen'|'hips'|'leftUpperArm'|'rightUpperArm'|'leftForearm'|'rightForearm'|'leftHand'|'rightHand'|'leftThigh'|'rightThigh'|'leftKnee'|'rightKnee'|'leftShin'|'rightShin'|'leftFoot'|'rightFoot'; back (side:'posterior') adds 'upperBack'|'lowerBack'|'glutes'|'leftHamstring'|'rightHamstring'|'leftCalf'|'rightCalf'; coarse: 'leftArm'|'rightArm'|'leftLeg'|'rightLeg'|'torso'",
      side: "'anterior' (front) | 'posterior' (back)",
    },
  }),
  // — tables additions —
  createMeta('geometrycanvas', {
    family: 'learn',
    dataShapes: ['relationship', 'scalar'],
    requires: ['title'],
    optional: [
      'icon',
      'iconColor',
      'xRange',
      'yRange',
      'xLabel',
      'yLabel',
      'showGrid',
      'points',
      'segments',
      'polygons',
      'circles',
      'vectors',
      'angles',
      'annotations',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A 2-D Cartesian canvas for geometry and math: points, line segments, polygons, circles, ' +
      'labeled vectors (arrows), and angle markers. Auto-fits the axis range from the data.',
    propHints: {
      'points[].x': 'x-coordinate in data units',
      'points[].y': 'y-coordinate in data units',
      'segments[].extend':
        "'none' (a plain segment), 'ray' (extend from x2,y2 outward), or 'line' (extend both ways)",
      'vectors[].dx': 'horizontal component — (x+dx, y+dy) is the tip of the arrow',
      'vectors[].dy': 'vertical component (positive = up)',
      'angles[].rightAngle': 'true to draw a square corner marker instead of an arc',
      xRange: 'auto-computed from data when omitted; supply to override, e.g. [-3, 3]',
      yRange: 'auto-computed from data when omitted',
    },
  }),
  createMeta('freebodydiagram', {
    family: 'learn',
    dataShapes: ['relationship'],
    requires: ['title', 'forces'],
    optional: ['icon', 'iconColor', 'object', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A physics free-body diagram: a labeled object with named force arrows radiating from it at ' +
      'specified angles and optional magnitudes.',
    itemShapes: [{ prop: 'forces', text: 'label', textAliases: ['name', 'force', 'description'] }],
    propHints: {
      'forces[].angle':
        'degrees CCW from the right: 0=→, 90=↑, 180=←, 270=↓. Use 90 for normal force (up), 270 for gravity (down).',
      'forces[].magnitude': 'optional magnitude in Newtons, shown in parentheses on the label',
      object: 'label on the central box, e.g. "Block", "Car", "Person"',
    },
  }),
  createMeta('musicstaff', {
    family: 'learn',
    dataShapes: ['sequence'],
    requires: ['title', 'notes'],
    optional: ['icon', 'iconColor', 'clef', 'timeSignature', 'tempo', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 10,
    colMin: 7,
    coercer: 'generic',
    blurb:
      'A 5-line music staff with notes: treble or bass clef, note heads, stems, flags, accidentals ' +
      '(♯ ♭), ledger lines, time signature, and optional tempo. Use for music theory, scales, melodies.',
    itemShapes: [{ prop: 'notes', text: 'pitch', textAliases: ['note', 'name'] }],
    propHints: {
      'notes[].pitch':
        'Scientific notation: letter + optional accidental + octave. E.g. "C4" (middle C), ' +
        '"G4", "F#4", "Bb3". Treble clef comfortable range: C4–F5; bass clef: E2–A3.',
      'notes[].duration': '"whole" | "half" | "quarter" | "eighth". Default "quarter".',
      clef: '"treble" (default) or "bass"',
      timeSignature: 'e.g. "4/4", "3/4", "6/8"',
    },
  }),
  createMeta('vectorspace', {
    family: 'learn',
    dataShapes: ['relationship', 'scalar'],
    requires: ['title', 'vectors'],
    optional: ['icon', 'iconColor', 'transformed', 'showSpan', 'xRange', 'yRange', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A linear-algebra vector canvas: 2-D vectors from the origin as colored arrows, optional ' +
      'post-transformation dashed arrows, and optional span shading. For eigenvectors, basis ' +
      'vectors, and linear-transformation topics.',
    itemShapes: [{ prop: 'vectors', text: 'label', textAliases: ['name', 'vector'] }],
    propHints: {
      'vectors[].x': 'tip x-coordinate (tail is always at the origin)',
      'vectors[].y': 'tip y-coordinate (positive = up)',
      transformed: 'the same vectors after a linear transformation — shown dashed',
      showSpan: 'shade the parallelogram spanned by the first two vectors',
    },
    intents: ['explain', 'quantify'],
    domains: ['math', 'science', 'education', 'data'],
  }),
  createMeta('reactionmechanism', {
    family: 'learn',
    dataShapes: ['structure', 'sequence'],
    requires: ['title', 'steps'],
    optional: ['icon', 'iconColor', 'reactionType', 'conditions', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 12,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'A chemistry reaction mechanism: compounds/intermediates connected by reaction arrows with ' +
      'optional conditions (temperature, reagents) above each arrow. Use for SN1/SN2, addition, ' +
      'substitution, and multi-step organic reactions.',
    itemShapes: [{ prop: 'steps', text: 'label', textAliases: ['formula', 'compound', 'name'] }],
    propHints: {
      'steps[].label':
        'compound name or formula as HTML — use <sub> for subscripts, e.g. "CH<sub>3</sub>OH"',
      'steps[].tag': 'role label: "reactant", "intermediate", or "product"',
      'steps[].color': 'use "var(--warning)" for unstable intermediates',
      conditions: 'array of condition strings, one per arrow: ["NaOH, H₂O", "Δ, 2h"]',
      reactionType: 'reaction class shown as a badge, e.g. "SN2", "Aldol", "E2"',
    },
    stringItems: ['conditions'],
  }),
  // learn — music + child development
  createMeta('chorddiagram', {
    family: 'learn',
    dataShapes: ['media', 'list'],
    requires: ['title', 'chordName', 'frets'],
    optional: ['icon', 'iconColor', 'fingers', 'capoFret', 'notes', 'instrument', 'footer'],
    interactive: false,
    wowWeight: 0.85,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A guitar/ukulele chord diagram — fretboard grid with finger positions, open/muted markers, and optional note names. Use for any "how do I play X chord" or music theory ask.',
    propHints: {
      frets: 'array of 6 (guitar) or 4 (ukulele) values: 0=open, "x"=muted, 1–12=fret number',
      instrument: '"Guitar"|"Ukulele"|"Bass"',
    },
    stringItems: ['notes'],
  }),
  createMeta('developmentmilestone', {
    family: 'learn',
    dataShapes: ['list', 'status'],
    requires: ['title', 'ageLabel', 'domains'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: true,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Child developmental milestones by age and domain (motor, language, social, cognitive). Use for parenting, pediatric, or child development asks.',
    propHints: {
      'domains[].domain': '"motor"|"language"|"social"|"cognitive"',
    },
  }),
  createMeta('teachdiagram', {
    family: 'learn',
    dataShapes: ['flow', 'sequence', 'structure'],
    requires: ['title', 'steps'],
    optional: ['icon', 'iconColor', 'baseShapes', 'baseLabels', 'ratio', 'footer'],
    interactive: true,
    wowWeight: 0.92,
    tier: 'frontier',
    colDefault: 10,
    colMin: 8,
    coercer: 'generic',
    blurb:
      'An animated step-by-step figure that builds up on screen — geometry proofs, free-body diagrams, anatomy, circuits, chemical structures: any concept with REAL spatial geometry, understood by watching it get assembled stroke by stroke. Each step adds vector shapes + labels and auto-plays paced to speaking time. Never for an abstract business/process sequence with no literal shape to draw — a funding lifecycle, a hiring pipeline, a sales funnel — the model ends up inventing meaningless disconnected lines; use processflow, journeymap, or milestones.',
    propHints: {
      'steps[].add':
        'array of DiagShape: {kind:"circle"|"rect"|"line"|"polygon"|"path", coords per kind, color?:"var(--presence)|var(--insight)|var(--warning)|var(--text-muted)", fill?, arrow?}',
      'steps[].labels':
        'optional callout labels: [{x, y, text, side:"left"|"right"|"top"|"bottom"}]',
    },
  }),
  createMeta('gridmatrix', {
    family: 'learn',
    dataShapes: ['tabular', 'comparison'],
    requires: ['title', 'cells'],
    optional: [
      'icon',
      'iconColor',
      'variant',
      'rowHeaders',
      'colHeaders',
      'highlight',
      'note',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A 2-D grid table with optional row/column headers. Supports Punnett squares, truth tables, multiplication tables, ten-frames, or a general labeled matrix.',
    propHints: {
      variant: '"punnett" | "truth" | "multiplication" | "tenframe" | "grid"',
      cells: '2-D array of cell values, e.g. [["TT","Tt"],["Tt","tt"]]',
      highlight: 'array of [rowIndex, colIndex] to accent',
    },
    stringItems: ['rowHeaders', 'colHeaders'],
  }),
  createMeta('fractionbar', {
    family: 'learn',
    dataShapes: ['composition', 'comparison'],
    requires: ['title', 'fractions'],
    optional: ['icon', 'iconColor', 'showPie', 'note', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Segmented fraction bars (with optional pies) for one or more fractions. Ideal for teaching fractions, probability, ratios, and part-whole relationships.',
    propHints: {
      'fractions[].numerator': 'filled segments',
      'fractions[].denominator': 'total segments',
      'fractions[].label': 'row label, e.g. "Class A" or "3/8 chance"',
    },
  }),
  createMeta('wave', {
    family: 'learn',
    dataShapes: ['relationship', 'series'],
    requires: ['title', 'waves'],
    optional: [
      'icon',
      'iconColor',
      'xUnit',
      'showWavelength',
      'showAmplitude',
      'showPeriod',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A labelled sine wave for physics, sound, and signals: one or two sine waves over an ' +
      'equilibrium axis with measurement annotations — wavelength (λ, crest-to-crest), amplitude ' +
      '(A, centre-to-crest), and an optional period (T) marker. Computes the curve from amplitude, ' +
      'wavelength, and phase. Use for waves/oscillations, NOT an audio player.',
    itemShapes: [{ prop: 'waves', text: 'label', textAliases: ['name', 'wave'] }],
    propHints: {
      'waves[].amplitude': 'peak displacement from the centre line (y-axis units)',
      'waves[].wavelength': 'distance over which the wave repeats, crest to crest (must be > 0)',
      'waves[].phase': 'phase shift in RADIANS (horizontal shift); default 0',
      xUnit: 'horizontal-axis label, e.g. "x (m)", "time (ms)", "distance"',
      showPeriod: 'true to mark the period T along the axis — use when the x-axis is time',
    },
    intents: ['explain', 'teach', 'quantify'],
    domains: ['science', 'math', 'education'],
  }),
  createMeta('energydiagram', {
    family: 'learn',
    dataShapes: ['sequence', 'relationship'],
    requires: ['title'],
    optional: [
      'icon',
      'iconColor',
      'steps',
      'reactants',
      'ts',
      'products',
      'reactantLabel',
      'tsLabel',
      'productLabel',
      'yLabel',
      'yUnit',
      'xLabel',
      'showEa',
      'showDelta',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A reaction-coordinate energy-profile diagram: energy vs reaction progress, a curve from ' +
      'reactants over the transition-state peak(s) to products, with the activation energy (Ea) and ' +
      'overall ΔH computed and marked with labelled arrows. Use for reaction kinetics/thermodynamics ' +
      '(endo/exothermic, catalysis lowering Ea) and multi-step mechanisms with intermediate wells.',
    itemShapes: [{ prop: 'steps', text: 'label', textAliases: ['name', 'stage'] }],
    propHints: {
      'steps[].energy': 'energy of this point on the y-axis, in the chosen unit (e.g. kJ/mol)',
      'steps[].kind':
        "'reactant' | 'ts' (a transition-state peak) | 'intermediate' (a well between peaks) | 'product'",
      reactants: 'endpoint form: reactant energy (used when `steps` is omitted)',
      ts: 'endpoint form: transition-state (peak) energy; omit for a barrierless profile',
      products: 'endpoint form: product energy',
      yUnit: 'energy unit, e.g. "kJ/mol" or "eV" — shown on the axis and the Ea/ΔH readouts',
      showEa: 'draw the activation-energy arrow (reactant level → first peak). Default true',
      showDelta: 'draw the ΔH arrow (reactant level → product level). Default true',
    },
    intents: ['explain', 'teach', 'quantify'],
    domains: ['science', 'education'],
  }),
  createMeta('phylotree', {
    family: 'learn',
    dataShapes: ['hierarchy', 'relationship'],
    requires: ['title', 'root'],
    optional: ['icon', 'iconColor', 'clades', 'traits', 'distanceLabel', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A phylogenetic / evolutionary tree (cladogram): taxa at the tips, branches joining at ' +
      'shared common ancestors, read left to right. Computes a tidy layout from a nested ' +
      '{name, children} tree — tips evenly spaced, ancestors at branch points. Optional clade ' +
      'brackets and trait marks. For evolution, taxonomy, "how are these species related".',
    itemShapes: [
      { prop: 'clades', text: 'label' },
      { prop: 'traits', text: 'label' },
    ],
    propHints: {
      root: 'A nested tree: { name?, children?: [...] }. A node with no children is a tip (a species). Internal nodes are common ancestors and usually have no name.',
      'root.children[].length':
        'optional branch length (time or substitutions). Supplying lengths anywhere draws a scaled phylogram with a distance axis; omit everywhere for a plain cladogram (topology only).',
      'root.children[].support':
        'optional branch support, e.g. a bootstrap percentage, drawn at the node',
      'clades[].tips': 'array of tip names (must match name in the tree) the bracket groups',
      'traits[].on': 'the tip or ancestor name whose incoming branch the trait mark sits on',
      distanceLabel:
        'axis label for a phylogram, e.g. "Millions of years ago" — only shown with branch lengths',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('parsetree', {
    family: 'learn',
    dataShapes: ['hierarchy', 'structure'],
    requires: ['title', 'root'],
    optional: ['icon', 'iconColor', 'colorPos', 'sentence', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A sentence syntax / constituency parse tree for grammar: the literal words at the leaves, ' +
      'phrase nodes (S, NP, VP, PP, …) above joining down to them, drawn top-down with a tidy ' +
      'auto-computed layout. Use for grammar lessons, sentence diagramming, and any ' +
      'constituency/expression tree.',
    // No `itemShapes`: `root` is a SINGLE recursive ParseTreeNode, not an item array. itemShapes
    // runs `root` through array normalization, which turns the object into `[]` and trips the
    // requires-check (empty array → block dropped). The tree's nested `children` are laid out by
    // the ParseTree component itself, so the coercer must leave `root` untouched.
    propHints: {
      'root.label': "the constituent tag, e.g. 'S' for the whole sentence",
      'root.children':
        'nested constituents; a phrase has its own children, a word leaf has a `word` instead',
      'children[].word':
        "the literal word at a leaf; when set, `label` is the part-of-speech tag drawn above it (e.g. { label: 'N', word: 'fox' })",
      colorPos: 'true to colour the part-of-speech leaves instead of muting them',
      sentence: 'optional plain-text sentence shown above the tree for context',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['education'],
  }),
  createMeta('celldiagram', {
    family: 'learn',
    dataShapes: ['structure', 'hierarchy'],
    requires: ['title'],
    optional: ['icon', 'iconColor', 'cellType', 'parts', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A labelled schematic biological cell: membrane outline with organelles (nucleus, ' +
      'mitochondria, ER, Golgi, ribosomes…), each a recognisable glyph with a leader line to its ' +
      'label. Animal or plant (plant adds cell wall, chloroplast, vacuole). List which organelles ' +
      'to show + highlight — the component owns the layout. Pick it for cell-biology explainers.',
    itemShapes: [{ prop: 'parts', text: 'key', textAliases: ['name', 'organelle'] }],
    propHints: {
      cellType:
        "'animal' (default) | 'plant' (adds the cell wall, chloroplast, and central vacuole)",
      'parts[].key':
        "the organelle to draw: 'nucleus'|'nucleolus'|'mitochondria'|'er'|'golgi'|'ribosomes'|'vacuole'|'cytoplasm'|'membrane'; animal-only: 'lysosome'|'centrosome'; plant-only: 'chloroplast'|'cell wall'. Synonyms like 'ribosome','rough ER','central vacuole','plasma membrane' resolve too. Organelles that don't fit the cellType are skipped.",
      'parts[].highlight':
        'true to emphasise this organelle (its glyph + label take the accent colour)',
      'parts[].note': 'a short fact shown beside the cell in the legend',
      'parts[].color': 'highlight colour, e.g. var(--presence) | var(--insight) | var(--warning)',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('raydiagram', {
    family: 'learn',
    dataShapes: ['relationship', 'scalar'],
    requires: ['title', 'objectDistance', 'focalLength'],
    optional: ['icon', 'iconColor', 'element', 'objectHeight', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'An optics ray diagram: a lens (convex/concave) or mirror (concave/convex) on a principal ' +
      'axis with an object arrow, the standard construction rays, marked focal points F, and the ' +
      'image it forms. The thin-lens/mirror equation is solved from the data, so image position, ' +
      'size and nature (real/virtual, upright/inverted) are computed correctly. Pick it for image ' +
      'formation, magnifiers, focal length, and magnification questions.',
    propHints: {
      element:
        "'convex-lens' (converging) | 'concave-lens' (diverging) | 'concave-mirror' (converging) | " +
        "'convex-mirror' (diverging). Default 'convex-lens'.",
      objectDistance:
        'distance from the element in axis units (object is drawn to the left), e.g. 30',
      focalLength: 'focal length magnitude in the same units, e.g. 10 — the type sets its sign',
      objectHeight:
        'object arrow height in axis units (default 1); only its ratio to the image matters',
    },
    intents: ['explain', 'teach'],
    domains: ['science', 'education'],
  }),
  // — learn additions (long-tail academic) —
  createMeta('vectorfield', {
    family: 'learn',
    dataShapes: ['relationship', 'distribution'],
    requires: ['title', 'samples'],
    optional: [
      'icon',
      'iconColor',
      'curves',
      'xRange',
      'yRange',
      'xLabel',
      'yLabel',
      'mode',
      'normalize',
      'colorByMagnitude',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.83,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A 2-D vector / slope field on a lattice: a short glyph at each sampled grid point showing ' +
      'the field direction (and magnitude by colour/length) — arrows for a vector field {x,y,u,v}, ' +
      'headless tangent dashes for a slope field {x,y,slope}. Overlay solution curves / streamlines. ' +
      'Glyph lengths are normalised from the lattice spacing; axes auto-fit. Pick it for ' +
      'differential-equation slope fields, gradient (∇f) fields, and physics E/B/gravitational/' +
      'fluid-flow fields.',
    itemShapes: [{ prop: 'curves', text: 'label', textAliases: ['name', 'curve'] }],
    propHints: {
      'samples[].x': 'sample location, x in data units (best on a regular grid of points)',
      'samples[].y': 'sample location, y in data units',
      'samples[].u': 'vector field: horizontal component at (x,y); positive = right',
      'samples[].v': 'vector field: vertical component at (x,y); positive = up',
      'samples[].slope':
        "slope field: tangent dy/dx at (x,y), drawn as a headless dash — use for y'=f(x,y) ODEs (give EITHER u,v OR slope, not both)",
      'curves[].points': 'a solution curve / streamline as an ordered array of {x,y} points',
      mode: "'vector' (arrows from u,v) | 'slope' (dashes from slope). Auto-detected when omitted.",
      normalize:
        'true (default) draws every arrow the same length (direction-only); false scales length by magnitude',
      colorByMagnitude: 'true (default) ramps glyph colour from low to high field magnitude',
      xRange: 'auto-fit from the data when omitted; supply to override, e.g. [-2, 2]',
      yRange: 'auto-fit from the data when omitted',
    },
    intents: ['explain', 'teach', 'quantify'],
    domains: ['math', 'science', 'education'],
  }),
  createMeta('pedigree', {
    family: 'learn',
    dataShapes: ['hierarchy', 'relationship'],
    requires: ['title', 'people'],
    optional: ['icon', 'iconColor', 'affectedLabel', 'carrierLabel', 'showLegend', 'footer'],
    interactive: false,
    wowWeight: 0.83,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A genetics pedigree chart for tracing inheritance: squares = male, circles = female, ' +
      'diamonds = unknown sex; a filled symbol is affected, a centre dot marks an unaffected ' +
      'carrier. People are linked by mating lines and descend to their children through a sibship ' +
      'bar. Generation rows (I, II, III…) and child centring are computed from the parent graph. ' +
      'Pick it for autosomal / X-linked inheritance, genetic counseling, "trace the trait through ' +
      'the family".',
    itemShapes: [{ prop: 'people', text: 'label', textAliases: ['name', 'id'] }],
    propHints: {
      'people[].id': "a stable unique id, referenced by other people's parents/partner",
      'people[].sex': "'male' (square) | 'female' (circle) | 'unknown' (diamond)",
      'people[].affected': 'true to fill the symbol (the person expresses the trait)',
      'people[].carrier': 'true to draw a centre dot (unaffected carrier); ignored when affected',
      'people[].deceased': 'true to draw a diagonal slash through the symbol',
      'people[].proband': 'true to mark the index case with a small arrow',
      'people[].parents':
        'the two parents as [motherId, fatherId] (ids in this same people array); omit for founders',
      'people[].partner':
        'id of a partner with no shared child of record — draws a bare mating line (a married-in spouse)',
      'people[].gen':
        'optional 0-based generation row; usually inferred from parents, set only to pin a founder',
      'people[].label': 'short identifier under the symbol, e.g. "II-3" or "Maria"',
      'people[].genotype': 'optional genotype under the name, e.g. "Aa", "XAY"',
      affectedLabel: 'legend wording for the filled symbol (default "Affected")',
      carrierLabel: 'legend wording for the centre-dot symbol (default "Carrier")',
      showLegend: 'false to hide the symbol-key legend (default true)',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('bohrmodel', {
    family: 'learn',
    dataShapes: ['structure', 'composition'],
    requires: ['title', 'protons', 'shells'],
    optional: ['icon', 'iconColor', 'neutrons', 'symbol', 'name', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A Bohr model of an atom: a central nucleus showing the proton (and neutron) count, ringed ' +
      'by concentric electron shells, each carrying exactly the given number of electrons drawn as ' +
      'evenly-spaced dots. Ring radii and dot placement are computed from the data; the element, ' +
      'per-shell occupancy, mass number and any net charge are labelled. For atomic structure and ' +
      'electron-configuration intros — "draw the Bohr model of sodium", "show oxygen’s shells".',
    propHints: {
      protons: 'number of protons = the atomic number (e.g. 11 for sodium)',
      neutrons: 'number of neutrons; omit if unknown. mass number = protons + neutrons',
      shells:
        'electrons per shell, innermost first, e.g. [2,8,1] = sodium, [2,8,8] = argon, [2,4] = carbon. Each ring draws exactly this many dots; their sum is the electron total. For a neutral atom the sum equals protons; a mismatch is rendered as an ion charge.',
      symbol: 'element symbol shown above the atom, e.g. "Na", "O", "C"',
      name: 'element name shown beneath the atom, e.g. "Sodium"',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
  }),
  // — Wave 2: skilled-trades drawing + STEM deepening —
  createMeta('equationbalancer', {
    family: 'learn',
    dataShapes: ['structure', 'tabular'],
    requires: ['title', 'reactants', 'products'],
    optional: ['icon', 'iconColor', 'elementTally', 'balanced', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A chemical-equation balancer: reactants → products as coefficient·formula (digits subscripted) ' +
      'with a per-element atom-conservation tally (matched rows read insight, mismatched read danger) ' +
      'and a balanced/not-balanced badge. Use for combustion, stoichiometry, conservation of mass.',
    itemShapes: [
      { prop: 'reactants', text: 'formula', textAliases: ['compound', 'species', 'name'] },
      { prop: 'products', text: 'formula', textAliases: ['compound', 'species', 'name'] },
      { prop: 'elementTally', text: 'element', textAliases: ['symbol', 'atom'] },
    ],
    propHints: {
      'reactants[].formula':
        'chemical formula WITHOUT subscript markup, e.g. "CH4", "O2", "H2O" — the digits are lowered to subscripts automatically. A trailing charge is written like "SO4^2-" or "Na^+".',
      'reactants[].coeff': 'stoichiometric coefficient (integer ≥ 1); a leading 1 is hidden',
      'products[].coeff': 'stoichiometric coefficient (integer ≥ 1)',
      'elementTally[].left': 'total atoms of this element on the REACTANT (left) side',
      'elementTally[].right': 'total atoms of this element on the PRODUCT (right) side',
      balanced: 'optional; derived from the tally (all left===right) when omitted',
    },
    intents: ['explain', 'quantify'],
    domains: ['science', 'education'],
  }),
  createMeta('yieldcalc', {
    family: 'learn',
    dataShapes: ['scalar', 'tabular'],
    requires: ['title'],
    optional: [
      'icon',
      'iconColor',
      'reaction',
      'limitingReagent',
      'molesAvailable',
      'theoreticalYield',
      'actualYield',
      'unit',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A stoichiometry / percent-yield calculator: a headline percent-yield readout ' +
      '(actual ÷ theoretical × 100, computed client-side from the real numbers given) with an ' +
      'optional reagent-moles reference table, the limiting reagent badged. With no yield ' +
      'numbers it still shows the reaction and limiting reagent — never a fabricated percent. ' +
      'Use for percent-yield problems, limiting-reagent identification, and stoichiometry.',
    itemShapes: [
      { prop: 'molesAvailable', text: 'reagent', textAliases: ['compound', 'species', 'name'] },
    ],
    propHints: {
      reaction: 'the balanced equation as typed, e.g. "2 H2 + O2 -> 2 H2O"; shown verbatim',
      limitingReagent: 'name/formula of the limiting reagent, matched to a molesAvailable row',
      'molesAvailable[].reagent': 'chemical formula or name, e.g. "H2", "O2"',
      'molesAvailable[].moles': 'moles on hand of this reagent',
      theoreticalYield: 'the maximum possible yield from stoichiometry, in `unit`',
      actualYield: 'the yield actually obtained, in `unit` — percent yield needs BOTH figures',
      unit: 'unit for the yield figures, e.g. "g", "mol" (default "g")',
    },
    intents: ['quantify', 'explain'],
    domains: ['science', 'education'],
  }),
  createMeta('vseprmolecule', {
    family: 'learn',
    dataShapes: ['structure', 'relationship'],
    requires: ['title', 'central', 'bonds'],
    optional: ['icon', 'iconColor', 'lonePairs', 'shape', 'bondAngle', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A 3-D molecular-geometry (VSEPR) figure: a central atom with bonds drawn to its substituents ' +
      'at the geometry implied by the shape (wedge/dash bonds for depth), lone pairs as dot-pairs, ' +
      'and the shape name + ideal bond angle. For molecular shape and bond-angle questions.',
    itemShapes: [{ prop: 'bonds', text: 'atom', textAliases: ['element', 'symbol', 'name'] }],
    propHints: {
      central: 'central-atom symbol, e.g. "O", "C", "N", "S"',
      'bonds[].atom': 'bonded-atom symbol, e.g. "H", "Cl", "O"',
      'bonds[].order': '1 (single, default), 2 (double), or 3 (triple)',
      lonePairs: 'number of lone pairs on the central atom (drawn as dot-pairs)',
      shape:
        "VSEPR geometry: 'linear' | 'trigonal' | 'tetrahedral' | 'bent' | 'pyramidal' | 'octahedral'. Inferred from the bond + lone-pair count when omitted.",
      bondAngle: 'ideal bond angle label, e.g. "104.5°", "109.5°", "120°", "180°"',
    },
    intents: ['explain'],
    domains: ['science', 'education'],
  }),
  createMeta('unitcircle', {
    family: 'learn',
    dataShapes: ['relationship', 'scalar'],
    requires: ['title', 'angleDeg'],
    optional: ['icon', 'iconColor', 'showSpecial', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A trigonometry unit circle: the swept angle arc, the terminal radius to (cosθ, sinθ), the ' +
      'dropped reference triangle (sin/cos legs), the angle in degrees AND radians, and the exact ' +
      'coordinate — all computed from one angle. For trig fundamentals and reference angles.',
    propHints: {
      angleDeg:
        'the angle in DEGREES, measured counter-clockwise from the +x axis (e.g. 30, 45, 135, 210). Radians, cosθ, sinθ and the point are all computed from it.',
      showSpecial: 'true (default) to tick the standard angles (0/30/45/60/90…) around the rim',
    },
    intents: ['explain', 'quantify'],
    domains: ['math', 'education'],
  }),
  createMeta('solidfigure', {
    family: 'learn',
    dataShapes: ['structure', 'scalar'],
    requires: ['title', 'solid'],
    optional: ['icon', 'iconColor', 'dims', 'labels', 'surfaceArea', 'volume', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'cutting',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A 3-D solid in oblique projection (front face + depth offset) with dashed hidden edges, ' +
      'optional labelled vertex/edge/face counts (with an Euler V−E+F check), and surface-area / ' +
      'volume call-outs. For solid geometry, surface area & volume, and Euler-formula lessons.',
    propHints: {
      solid:
        "which solid to draw: 'cube' | 'rectprism' | 'cylinder' | 'cone' | 'sphere' | 'pyramid' | 'prism'",
      dims: 'relative proportions only (shape the drawing, not measured to scale): { w?, h?, d?, r? }',
      labels: 'counts shown as chips: { v?: vertices, e?: edges, f?: faces }',
      surfaceArea: 'computed surface-area read-out WITH unit, e.g. "94 cm²"',
      volume: 'computed volume read-out WITH unit, e.g. "60 cm³"',
    },
    intents: ['explain', 'quantify'],
    domains: ['math', 'education'],
  }),
  createMeta('crosssection', {
    family: 'learn',
    dataShapes: ['structure', 'composition'],
    requires: ['title', 'layers'],
    optional: ['icon', 'iconColor', 'orientation', 'depthUnit', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A labelled stratified cross-section: stacked bands sized by thickness (Earth strata, tissue ' +
      'layers, ocean zones) with leader labels and an optional depth axis — or concentric rings ' +
      '(a planet interior) when orientation is "concentric". For geology, anatomy, oceanography.',
    itemShapes: [{ prop: 'layers', text: 'name', textAliases: ['label', 'layer', 'zone'] }],
    propHints: {
      'layers[].thickness': 'layer thickness in depthUnit-s (> 0); drives the band’s relative size',
      'layers[].color':
        "design-token tint, e.g. 'var(--warning)' | 'var(--danger)' | 'var(--presence)' | 'var(--insight)'; cycles the accents when omitted",
      'layers[].note': 'short note shown beside the layer (a depth range or composition)',
      orientation:
        "'horizontal' (default, stacked bands) | 'concentric' (nested rings, e.g. a planet interior)",
      depthUnit: 'unit on the cumulative depth axis, e.g. "km", "mm", "m"',
    },
    intents: ['explain', 'locate'],
    domains: ['science', 'education'],
  }),
  createMeta('pianokeys', {
    family: 'learn',
    dataShapes: ['media', 'list'],
    requires: ['highlight'],
    optional: [
      'title',
      'icon',
      'iconColor',
      'octaves',
      'startNote',
      'chordName',
      'showLabels',
      'caption',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A piano keyboard with a chord, scale, or set of notes lit up — keys coloured by role/finger, with note labels and the chord name. Use for chords, scales, intervals, and "what notes are in X".',
    itemShapes: [{ prop: 'highlight', text: 'note', textAliases: ['pitch', 'key', 'name'] }],
    propHints: {
      'highlight[].note':
        'scientific pitch to light up, e.g. "C4", "E4", "G#4", "Bb3" — must fall in the rendered range',
      'highlight[].role': "harmonic role: 'root'|'3rd'|'5th'|'7th' — sets the key colour and badge",
      'highlight[].finger': 'fingering 1–5 shown on the key (used to colour when no role is given)',
      startNote: 'leftmost key, a natural/white note in scientific pitch, e.g. "C3", "C4"',
      octaves: 'how many octaves to draw (1–4, default 2)',
      chordName: 'name shown beside the keyboard, e.g. "Cmaj7", "A minor pentatonic"',
    },
    domains: ['music'],
    intents: ['explain', 'reference'],
  }),
  createMeta('fretboardmap', {
    family: 'learn',
    dataShapes: ['media', 'list'],
    requires: ['dots'],
    optional: [
      'title',
      'icon',
      'iconColor',
      'strings',
      'frets',
      'tuning',
      'scaleName',
      'caption',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.8,
    tier: 'cutting',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A full-neck guitar/bass fretboard map: nut, frets, strings, inlay markers, with coloured dots at string/fret positions (roots emphasised) and interval labels. Use for scales, arpeggios, and chord shapes across the neck.',
    itemShapes: [{ prop: 'dots', text: 'label', textAliases: ['interval', 'note', 'name'] }],
    propHints: {
      'dots[].string':
        'string index, 1 = thickest/lowest string (low E on a guitar) up to `strings`',
      'dots[].fret': 'fret number, 0 = open (drawn on the nut) up to `frets`',
      'dots[].label': 'interval/note shown on the dot, e.g. "R", "b3", "5", "A"',
      'dots[].role': "'root'|'third'|'fifth'|'other' — drives the dot colour; roots are emphasised",
      tuning: 'open-string notes thickest→thinnest, e.g. ["E","A","D","G","B","E"]',
      strings: 'number of strings (4–7, default 6)',
      frets: 'frets drawn from the nut (4–24, default 12)',
    },
    domains: ['music'],
    intents: ['explain', 'reference'],
    stringItems: ['tuning'],
  }),
  createMeta('circleoffifths', {
    family: 'learn',
    dataShapes: ['relationship', 'structure'],
    requires: ['title'],
    optional: ['icon', 'iconColor', 'highlightKey', 'showMinors', 'related', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'The circle of fifths: twelve major keys around an outer ring, their relative minors inside, and each key signature on the rim. Highlights the queried key and spokes to related keys (IV/V/relative). Use for key signatures, relative keys, and the IV–I–V relationship.',
    propHints: {
      highlightKey: 'the major key to centre on, e.g. "C", "G", "Bb", "F#"',
      related:
        'other keys to spoke to (its IV, V, and relative minor make sense), e.g. ["C","D","Em"]; minor keys carry an "m" suffix',
      showMinors: 'draw the relative-minor inner ring (default true)',
    },
    domains: ['music'],
    intents: ['explain', 'reference'],
    stringItems: ['related'],
  }),
  createMeta('odontogram', {
    family: 'learn',
    dataShapes: ['tabular', 'status'],
    requires: ['teeth'],
    optional: ['title', 'icon', 'iconColor', 'system', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'cutting',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A dental chart (odontogram): the upper and lower arches tooth-by-tooth, each numbered per the system and colour-coded by status (caries, filling, crown, missing, implant, root canal), with a legend. Use for charting, treatment plans, and "show me which teeth X".',
    // teeth are a positional/keyed array (identified by tooth number + status), not free text — a
    // text-keyed itemShape would drop every tooth without an optional `note`, emptying the chart.
    propHints: {
      'teeth[].n':
        'tooth number in the chosen system — Universal 1–32 or FDI two-digit (e.g. 11, 26, 36)',
      'teeth[].status': "'healthy'|'caries'|'filling'|'crown'|'missing'|'implant'|'rootcanal'",
      'teeth[].surface': 'affected surface(s), e.g. "MOD", "occlusal", "buccal"',
      system: "'universal' (1–32, default) | 'fdi' (two-digit quadrant notation)",
    },
    domains: ['health'],
    intents: ['reference', 'explain'],
  }),
  // — Wave 4 —
  createMeta('clockface', {
    family: 'learn',
    dataShapes: ['scalar', 'status'],
    requires: ['time'],
    optional: [
      'title',
      'icon',
      'iconColor',
      'showSecond',
      'second',
      'digital',
      'elapsedTo',
      'caption',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'An analog teaching clock: a full dial (numerals, hour ticks, minute marks) with the hour, ' +
      'minute and optional second hands computed from the time, an optional digital read-out, and an ' +
      'optional shaded elapsed-time arc. For telling time, elapsed-time problems, and clock reading.',
    propHints: {
      time: "the time as 'HH:MM' (24h) or 'H:MM', e.g. '3:40' or '15:40' — the hands are computed from it",
      showSecond: 'true to draw a sweeping second hand (pair with `second`)',
      second: 'seconds past the minute (0–59) for the second hand',
      digital: 'true to show a 12-hour digital read-out (e.g. 3:40 PM) beneath the dial',
      elapsedTo:
        "a later time as 'HH:MM' — shades the elapsed arc from `time` to here and reads the span",
    },
    intents: ['explain', 'reference'],
    domains: ['math', 'education'],
  }),
  createMeta('moneytray', {
    family: 'learn',
    dataShapes: ['composition', 'scalar'],
    requires: ['tokens'],
    optional: ['title', 'icon', 'iconColor', 'currency', 'target', 'mode', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A coins-and-bills tray: denomination stacks (coins as circles, bills as rectangles) with ' +
      'counts, a running total computed from denom×count, and — in change mode — the gap to a target ' +
      'plus the fewest-tokens suggestion. For counting money, making change, and money-sense lessons.',
    itemShapes: [{ prop: 'tokens', text: 'label', textAliases: ['name', 'denomination'] }],
    propHints: {
      'tokens[].denom':
        'face value of one token in the base unit (0.25 = a quarter, 5 = a $5 bill)',
      'tokens[].count': 'how many of this denomination sit on the tray',
      'tokens[].label':
        'name under the stack, e.g. "Quarter", "$5" (defaults to the formatted denom)',
      currency: "currency symbol prefixed to totals, default '$'",
      mode: "'count' (default) tallies the tray; 'change' reads the gap to `target` + a fewest-tokens hint",
      target: 'goal amount in change mode — the gap to here is read out',
    },
    intents: ['quantify', 'explain'],
    domains: ['math', 'money', 'education'],
  }),
  createMeta('placevaluechart', {
    family: 'learn',
    dataShapes: ['composition', 'scalar'],
    requires: ['value'],
    optional: [
      'title',
      'icon',
      'iconColor',
      'columns',
      'showBlocks',
      'expanded',
      'caption',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A base-ten place-value chart: a labelled column per place (thousands/hundreds/tens/ones) showing ' +
      'the digit, its base-ten block glyphs (hundred-flats, ten-rods, unit-cubes), and the expanded ' +
      'form — all computed from one value. For place value, base ten, and expanded-form lessons.',
    propHints: {
      value: 'the whole number to chart — the digits and block glyphs are computed from it',
      columns:
        "which places to show, left→right: any of 'thousands' | 'hundreds' | 'tens' | 'ones' (auto-fits the value when omitted)",
      showBlocks:
        'true (default) to draw the base-ten block glyphs (flats/rods/cubes) under each digit',
      expanded: 'true (default) to show the expanded form, e.g. 300 + 40 + 7',
    },
    intents: ['explain', 'quantify'],
    domains: ['math', 'education'],
  }),
  createMeta('shapecard', {
    family: 'learn',
    dataShapes: ['structure', 'list'],
    requires: ['shapes'],
    optional: ['title', 'icon', 'iconColor', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'An illustrated 2-D/3-D shape gallery: each shape drawn as a clean filled figure (polygons built ' +
      'from their side count, solids in oblique projection) with attribute call-outs (sides/vertices/' +
      'faces/edges) and a real-world example. For shape recognition and polygon/solid attributes.',
    itemShapes: [{ prop: 'shapes', text: 'name', textAliases: ['shape', 'label'] }],
    propHints: {
      'shapes[].kind':
        "which figure to draw: 'triangle' | 'square' | 'rectangle' | 'pentagon' | 'hexagon' | 'octagon' | 'circle' | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'pyramid'",
      'shapes[].sides': 'number of sides (2-D) — shown as an attribute chip',
      'shapes[].vertices': 'number of vertices (corners) — shown as a chip',
      'shapes[].faces': 'number of faces (3-D) — shown as a chip',
      'shapes[].edges': 'number of edges (3-D) — shown as a chip',
      'shapes[].example': 'a real-world example, e.g. "Honeycomb cell", "Dice"',
    },
    intents: ['explain', 'reference'],
    domains: ['math', 'education'],
  }),
  createMeta('letterform', {
    family: 'learn',
    dataShapes: ['sequence', 'text'],
    requires: ['letter', 'strokes'],
    optional: ['title', 'icon', 'iconColor', 'case', 'showGuides', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'frontier',
    colDefault: 5,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A handwriting letter-formation card: the large letter seated on baseline/midline/cap guidelines ' +
      'with a faint trace ghost, numbered stroke-order indices, and the ordered stroke hints. For ' +
      'handwriting, letter formation, and stroke-order practice.',
    itemShapes: [{ prop: 'strokes', text: 'hint', textAliases: ['text', 'description'] }],
    propHints: {
      letter: 'the single character to form, e.g. "a", "B"',
      case: "'upper' or 'lower' (default) — which form of the letter to draw",
      'strokes[].order': 'stroke sequence number (1, 2, 3…)',
      'strokes[].hint': 'what the stroke does, e.g. "Curve left and down", "Straight line down"',
      showGuides: 'true (default) to draw the baseline / midline / cap-height guidelines',
    },
    intents: ['howto', 'reference'],
    domains: ['language', 'education'],
  }),
  createMeta('toolscale', {
    family: 'learn',
    dataShapes: ['scalar', 'status'],
    requires: ['instrument', 'value', 'max'],
    optional: ['title', 'icon', 'iconColor', 'unit', 'fractional', 'reading', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Reading a measuring instrument: a ruler with fraction ticks, a protractor arc, a caliper jaw, or ' +
      'a thermometer column, with a movable indicator at the value and a read-out — every tick and the ' +
      'indicator computed from value/max. For measurement, fractions of an inch, angles, temperature.',
    propHints: {
      instrument: "which instrument to draw: 'ruler' | 'protractor' | 'caliper' | 'thermometer'",
      value: 'the measured value the indicator points to',
      max: "full-scale value (the instrument's max reading) — drives tick spacing and the indicator",
      unit: "unit shown on the read-out, e.g. 'in', '°', 'mm', '°C'",
      fractional:
        'true to tick the scale in fractions (½ ¼ ⅛) rather than decimals — for an inch ruler',
      reading:
        "override the read-out string, e.g. '2 3/8 in' (computed from value/unit when omitted)",
    },
    intents: ['explain', 'howto', 'reference'],
    domains: ['math', 'education'],
  }),
  createMeta('craftchart', {
    family: 'learn',
    dataShapes: ['tabular', 'structure'],
    requires: ['rows', 'cols', 'cells'],
    optional: ['title', 'icon', 'iconColor', 'legend', 'craft', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A gridded craft pattern chart — the literal chart a maker follows stitch by stitch: a rows×cols ' +
      'grid where each filled cell carries a colour and/or a stitch symbol, with numbered stitch/row ' +
      'rulers on the margins and a symbol/colour legend. For cross-stitch, knitting, pixel-art, beading, ' +
      'and weaving charts.',
    itemShapes: [
      { prop: 'legend', text: 'meaning', textAliases: ['label', 'name', 'description'] },
    ],
    propHints: {
      rows: 'number of rows in the chart',
      cols: 'number of columns (stitches per row)',
      craft:
        "re-skins each cell: 'crossstitch' (default) and 'knit' show the stitch glyph, 'pixel' a flat block, 'bead' a round bead, 'weave' a solid square",
      'cells[].r': 'row index of a filled cell, 0-based top→bottom',
      'cells[].c': 'column index of a filled cell, 0-based left→right',
      'cells[].color':
        "cell fill — a CSS color or design-token, e.g. 'var(--danger)', 'var(--insight)', '#c0392b' (a thread shade)",
      'cells[].symbol': 'stitch symbol drawn in the cell, e.g. "×", "♥", "▲", "k", "p"',
      'legend[].symbol': "the symbol this key row matches (a cell's symbol)",
      'legend[].color': "the colour this key row matches (a cell's color), drawn as a swatch",
      'legend[].meaning': "what the symbol/colour means, e.g. 'DMC 321 — red', 'knit', 'purl'",
    },
    intents: ['howto', 'reference'],
    domains: ['design', 'art'],
  }),
  createMeta('areamodel', {
    family: 'learn',
    dataShapes: ['composition', 'structure'],
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'Proportional-rectangle multiplication model: a rectangle partitioned into sub-rectangles whose area equals the partial product of the corresponding factorA (width) × factorB (height) slice. Partial products are labelled inside each cell; the total appears below. Use for distributive property (23×14 → 20×10 + 20×4 + 3×10 + 3×4), polynomial expansion ((a+b)(c+d)), fraction of a fraction, and area-addition postulate. Custom string labels via labelsA/labelsB let it handle algebra (e.g. "x", "3").',
    requires: ['title', 'factorA', 'factorB'],
    optional: ['labelsA', 'labelsB', 'showProducts', 'showSum', 'caption'],
    propHints: {
      factorA: 'width-axis decomposition as number[], e.g. [20, 3] for factor 23',
      factorB: 'height-axis decomposition as number[], e.g. [10, 4] for factor 14',
      labelsA: 'string labels overriding factorA values (e.g. ["a", "b"] for algebra)',
      labelsB: 'string labels overriding factorB values',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['math'],
    stringItems: ['labelsA', 'labelsB'],
  }),
  createMeta('gridtransform', {
    family: 'learn',
    dataShapes: ['relationship', 'structure'],
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Linear transformation visualiser: shows a 2-D Cartesian grid before and after applying a 2×2 matrix transformation, with animated morphing between states. Illustrates shear, rotation, reflection, scaling, and projection. The model supplies the 2×2 matrix (or named transform) and optional sample vectors to track through the transformation. Use for linear algebra (matrix multiplication intuition), computer graphics (basis vectors, coordinate changes), and data augmentation.',
    requires: ['title', 'matrix'],
    optional: ['showEigens', 'animated', 'caption'],
    propHints: {
      matrix: '2×2 transformation matrix as [[a,b],[c,d]] — applied to the unit grid',
      showEigens: 'draw dashed eigenvector rays through the origin, default true',
      animated: 'morphs from identity to transformed grid on mount, default true',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['math', 'code'],
  }),
  createMeta('polarplot', {
    family: 'learn',
    dataShapes: ['relationship', 'structure'],
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'Polar coordinate plot: renders parametric or r=f(θ) curves on a polar grid with concentric rings and radial spokes. Supports rose curves, spirals, limaçons, cardioids, and arbitrary parametric paths. Use for polar coordinate systems, complex number arguments, antenna radiation patterns, and physics (orbit shapes). The model supplies the curve definition (function name or a list of (theta, r) points); the component draws the grid and curves.',
    requires: ['title'],
    optional: ['type', 'curves', 'domain', 'caption'],
    propHints: {
      type: "'polar' (r=f(θ) curves) | 'parametric' (x and y each as f(t)) — default 'polar'",
      curves: 'array of polar curves — each has a name and either a formula string or points[]',
      domain: '[tMin, tMax] parameter range; defaults to [0, 2π]',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['math', 'science'],
  }),
  createMeta('twocolumnproof', {
    family: 'learn',
    dataShapes: ['structure', 'sequence'],
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'Two-column geometric proof: statements on the left, justifications (theorems, postulates, definitions) on the right, numbered row by row. Given conditions and the "prove" statement appear at the top; an optional diagram note describes the figure. Perfect for high-school geometry — triangle congruence, parallel lines, circle theorems. The final row auto-bolds to highlight QED.',
    requires: ['title', 'given', 'prove', 'steps'],
    optional: ['diagram', 'caption'],
    propHints: {
      steps: 'array of {statement, reason} objects — one per proof row',
      given: 'what is assumed true (e.g. "AB ∥ CD, ∠1 ≅ ∠2")',
      prove: 'what must be proven (e.g. "△ABC ≅ △DEF")',
      diagram: 'short text describing the reference figure',
    },
    intents: ['explain', 'teach'],
    domains: ['math', 'education'],
  }),
  createMeta('pyramidtiers', {
    family: 'learn',
    dataShapes: ['hierarchy', 'ranking'],
    tier: 'base',
    colDefault: 5,
    colMin: 4,
    coercer: 'generic',
    blurb:
      "Hierarchical pyramid diagram: each tier is a coloured trapezoid that tapers toward the top, ideal for ranking structures with the largest/most-foundational level at the base. Perfect for Bloom's Taxonomy (education), Maslow's Hierarchy of Needs (psychology/sociology), an energy pyramid by biomass (ecology), or any layered classification where relative size conveys importance or quantity. For the actual who-eats-whom graph of individual organisms and predator-prey links, use foodweb instead.",
    requires: ['title', 'tiers'],
    optional: ['caption'],
    propHints: {
      tiers: 'array of {label, value?, note?, color?} — bottom tier first, top tier last',
      'tiers[].label': 'tier name (e.g. "Remember", "Physiological Needs")',
      'tiers[].value': 'optional numeric annotation (e.g. percentage or count)',
      'tiers[].note': 'short italicised note shown inside the tier',
      'tiers[].color': 'CSS color or var(--token) — defaults to a semantic palette',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['education', 'science', 'psychology', 'ecology'],
  }),
  createMeta('linespectrum', {
    family: 'learn',
    dataShapes: ['distribution', 'series'],
    tier: 'base',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Atomic emission or absorption spectrum: a horizontal strip spanning the visible wavelength range (380–780 nm), with sharp coloured lines at each measured wavelength. Emission mode shows bright lines on a dark background; absorption mode shows dark cutout lines on the rainbow continuum. Optional labels identify each line (e.g. "Hα 656 nm"). Use for hydrogen series, helium, sodium doublet, or any spectroscopic data in chemistry and physics.',
    requires: ['title', 'lines'],
    optional: ['mode', 'range', 'elementLabel', 'caption'],
    propHints: {
      lines: 'array of {wavelength, intensity?, label?} — wavelength in nm (380–780)',
      mode: '"emission" (default, bright lines on dark) or "absorption" (dark lines on rainbow)',
      range: '[minNm, maxNm] — default [380, 780]',
      elementLabel: 'element name shown on axis label (e.g. "Hydrogen")',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['science', 'chemistry', 'physics'],
  }),
  createMeta('dnahelix', {
    family: 'learn',
    dataShapes: ['structure', 'sequence'],
    tier: 'base',
    colDefault: 4,
    colMin: 3,
    coercer: 'generic',
    blurb:
      'DNA double helix or ladder diagram: two backbone strands connected by A–T (yellow) and G–C (blue-green) base-pair rungs. Helix mode renders the classic 3-D twisted view with depth cues; ladder mode shows the "unzipped" flat ladder. Base labels (A, T, G, C) are shown by default; direction labels (5′ → 3′) mark both strands. Highlights a specific base pair by setting highlight:true. Use for DNA replication, complementary base pairing, and molecular biology lessons.',
    requires: ['title'],
    optional: ['bases', 'count', 'mode', 'showLabels', 'caption'],
    propHints: {
      bases: 'array of {pair, highlight?} — pair is "AT"|"TA"|"GC"|"CG"; omit for random sequence',
      count: 'number of base pairs when bases not supplied (default 10, max 16)',
      mode: '"helix" (default 3-D twist) or "ladder" (flat unzipped view)',
      showLabels: 'true (default) shows A/T/G/C labels on each rung',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['science', 'biology'],
  }),
  createMeta('taylorseries', {
    family: 'learn',
    dataShapes: ['series', 'relationship'],
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Taylor series approximation visualizer: plots the true function f(x) and its polynomial approximation, showing how adding more terms narrows the error. Supports sin, cos, exp, ln, and arctan. The expansion centre a is marked; a term-count slider (default interactive at 3, up to maxTerms) lets you step through more terms, with an optional shaded error band. Use for calculus courses on power series, convergence radius, and numerical approximation.',
    requires: ['title', 'fn'],
    optional: ['center', 'maxTerms', 'showTerms', 'xDomain', 'showError', 'footer'],
    propHints: {
      fn: '"sin" | "cos" | "exp" | "ln" | "arctan" — function to approximate',
      center: 'expansion point a (default 0; ignored for ln, which always expands around 1)',
      maxTerms: 'highest term count the slider can reach (default 7)',
      showTerms:
        'pin a fixed term count and disable the slider (omit for an interactive default of 3)',
      xDomain: '[xMin, xMax] display window (default depends on function)',
      showError: 'true to shade the error band between the true function and the approximation',
    },
    intents: ['explain', 'visualize', 'teach'],
    domains: ['math', 'education'],
  }),
  createMeta('phaseportrait', {
    family: 'learn',
    dataShapes: ['relationship'],
    requires: ['fx', 'gy'],
    optional: [
      'title',
      'icon',
      'iconColor',
      'xDomain',
      'yDomain',
      'trajectories',
      'showNullclines',
      'xlabel',
      'ylabel',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.87,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'ODE system phase portrait: vector field arrows, x/y-nullclines (where dx/dt=0 or dy/dt=0), equilibrium classification by Jacobian trace/det (stable/unstable node, spiral, saddle), and optional RK4 trajectories. fx and gy are JS expressions in x and y.',
    propHints: {
      fx: 'dx/dt as a JS math expression in x,y — e.g. "y"',
      gy: 'dy/dt as a JS math expression in x,y — e.g. "-x - 0.5*y"',
      'trajectories[].x0': 'initial x for a trajectory',
      'trajectories[].y0': 'initial y for a trajectory',
      showNullclines: 'draw nullclines, default true',
    },
    intents: ['explain', 'teach', 'visualize'],
    domains: ['education', 'math', 'science'],
  }),
  createMeta('sightwordlist', {
    family: 'learn',
    dataShapes: ['list', 'status'],
    requires: ['title', 'words'],
    optional: ['icon', 'iconColor', 'listName', 'footer'],
    interactive: true,
    wowWeight: 0.62,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'K-2 sight-word practice list (Dolch/Fry style): tap-to-hear word chips colored by mastery — new, practicing, or mastered — with tallies. Use for sight-word drills, word walls, and early-reading fluency checks.',
    itemShapes: [{ prop: 'words', text: 'word', textAliases: ['text', 'term'] }],
    propHints: {
      listName: 'the list\'s name/source, e.g. "Dolch Pre-Primer", "Fry\'s First 100"',
      'words[].mastery': "'new'|'practicing'|'mastered' — defaults to 'new'",
    },
    intents: ['reference', 'howto'],
    domains: ['education', 'language'],
  }),
  createMeta('alphabetchart', {
    family: 'learn',
    dataShapes: ['list'],
    requires: ['title'],
    optional: ['icon', 'iconColor', 'letters', 'footer'],
    wowWeight: 0.55,
    tier: 'base',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A-Z reference grid — one cell per letter with its upper+lowercase glyph and a keyword ("Aa is for Apple"). Renders a complete default alphabet when letters are omitted. Use for alphabet recognition, letter-sound association, and A-Z reference walls.',
    itemShapes: [{ prop: 'letters', text: 'letter', textAliases: ['char', 'value', 'name'] }],
    propHints: {
      'letters[].letter': 'the letter, e.g. "A" — only the first character is used',
      'letters[].keyword':
        'the mnemonic word, e.g. "Apple" for "Aa is for Apple" (optional — falls back to a default keyword when omitted)',
    },
    intents: ['reference'],
    domains: ['education', 'language'],
  }),
  createMeta('columnarithmetic', {
    family: 'learn',
    dataShapes: ['sequence', 'structure'],
    requires: ['title', 'op', 'operands'],
    optional: ['icon', 'iconColor', 'showCarries', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 5,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A worked column-arithmetic figure: digits stacked by place value with the real carry ' +
      '(addition) or borrow (subtraction) marks worked out, or — for long division — the ' +
      'classic bracket-and-bring-down layout. Every mark and step is computed from the ' +
      'operands, never authored. Use for "show your work" multi-digit addition/subtraction/' +
      'division.',
    propHints: {
      op: "'add'|'sub'|'longdiv'",
      operands:
        "the whole numbers to work through, in order — 'add' sums any count, 'sub' subtracts every later row from the first, 'longdiv' reads only the first two as [dividend, divisor]",
      showCarries: 'show the worked carry/borrow marks. Default true',
    },
    intents: ['teach', 'explain', 'howto'],
    domains: ['education'],
  }),
  createMeta('titrationcurve', {
    family: 'learn',
    dataShapes: ['relationship', 'series'],
    requires: ['title', 'points'],
    optional: ['icon', 'iconColor', 'equivalenceVolumeMl', 'pKa', 'bufferBand', 'footer'],
    interactive: false,
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A pH-vs-titrant-volume curve for acid/base titrations, plotted strictly from sampled ' +
      'points on a 0-14 pH axis, with an optional dashed equivalence-point marker, a shaded ' +
      'buffer-region band, and a pKa label at half-equivalence. Use for titration, buffer ' +
      'capacity, and equivalence-point questions.',
    propHints: {
      'points[].volumeMl': 'titrant volume added, in mL',
      'points[].pH': 'measured pH at that volume',
      equivalenceVolumeMl: 'volume at the equivalence point, in mL — drawn as a dashed marker',
      pKa: "the acid's pKa, labelled at half the equivalence volume",
      bufferBand: '[startMl, endMl] of the buffering plateau, shaded as a band',
    },
    intents: ['explain', 'teach', 'quantify'],
    domains: ['science', 'education'],
  }),
  createMeta('interferencepattern', {
    family: 'learn',
    dataShapes: ['relationship', 'series'],
    requires: ['title', 'slits', 'intensity'],
    optional: ['icon', 'iconColor', 'wavelengthNm', 'slitSeparationUm', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Single- or double-slit diffraction: a barrier/slit schematic with Huygens wavelets up ' +
      "top, and the fringe intensity below plotted strictly from the caller's sampled points — " +
      'the interference pattern itself is never computed here. Use for wave-optics lessons on ' +
      'single vs. double slit diffraction.',
    propHints: {
      slits: '1 (single slit) or 2 (double slit)',
      'intensity[].position': 'position along the screen (any consistent unit)',
      'intensity[].value': 'measured/relative intensity at that position (0 at the dark fringes)',
      wavelengthNm: 'illustrative only — labels the schematic, e.g. 550 for green light',
      slitSeparationUm: 'illustrative only — labels the schematic slit spacing',
    },
    intents: ['explain', 'teach'],
    domains: ['science', 'education'],
  }),
  createMeta('orbitaldiagram', {
    family: 'learn',
    dataShapes: ['structure', 'sequence'],
    requires: ['title', 'orbitals'],
    optional: ['icon', 'iconColor', 'element', 'configString', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Aufbau electron-configuration boxes: one row per subshell, in filling order, each with ' +
      'its canonical box count (s=1, p=3, d=5, f=7) and an up/down spin-arrow per electron. Use ' +
      "for electron-configuration and Hund's-rule/Pauli-exclusion teaching.",
    itemShapes: [{ prop: 'orbitals', text: 'subshell' }],
    propHints: {
      'orbitals[].subshell': 'e.g. "1s", "2p", "3d" — filling order matters, list earliest first',
      'orbitals[].boxes': 'orbital count for this subshell; omit to use the canonical count',
      'orbitals[].electrons':
        'one entry per box, left to right: 0 (empty), 1 (spin-up only), or 2 (paired)',
      configString: 'the condensed configuration, e.g. "1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶"',
    },
    intents: ['explain', 'teach'],
    domains: ['science', 'education'],
  }),
  createMeta('pictograph', {
    family: 'learn',
    dataShapes: ['composition', 'comparison'],
    requires: ['title', 'unitValue', 'rows'],
    optional: ['icon', 'iconColor', 'icon2', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A repeated-icon tally chart: each row tiles as whole icons plus a proportionally clipped ' +
      'partial icon for the remainder, at unitValue per icon, with a "each icon = N" key line. ' +
      'Use for "each icon represents N" style counts: population, votes, units sold.',
    itemShapes: [{ prop: 'rows', text: 'label', textAliases: ['name', 'category'] }],
    propHints: {
      unitValue: 'how much ONE full icon represents, e.g. 1000 for "each icon = 1,000 people"',
      'rows[].count': 'the real count for this row, in the same unit as unitValue',
    },
    intents: ['quantify', 'compare', 'explain'],
    domains: [],
  }),
  createMeta('particlemodel', {
    family: 'learn',
    dataShapes: ['comparison', 'structure'],
    requires: ['title', 'panels'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Side-by-side solid/liquid/gas particle diagrams: a solid draws a tight lattice with ' +
      'small vibration arcs, a liquid a loose cluster with short drift lines, a gas scattered ' +
      'particles with longer motion trails. Use for states-of-matter and kinetic-theory ' +
      'lessons.',
    propHints: {
      'panels[].phase': "'solid'|'liquid'|'gas'",
      'panels[].particleCount': 'how many particles to draw in this panel. Default 12',
    },
    intents: ['explain', 'teach', 'compare'],
    domains: ['science', 'education'],
  }),
  createMeta('morphemebreakdown', {
    family: 'learn',
    dataShapes: ['structure', 'text'],
    requires: ['title', 'word', 'morphemes'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.66,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      "Synchronic single-word decomposition: a word's prefix/root/suffix segments, underlined " +
      'and colour-coded by role, with a gloss legend below. Distinct from etymtree (cross-' +
      'language ancestry) — this is what the word breaks into right now. Use for morphology ' +
      'teaching and vocabulary word-part drills.',
    itemShapes: [{ prop: 'morphemes', text: 'text' }],
    propHints: {
      word: 'the whole word being decomposed, e.g. "unbreakable"',
      'morphemes[].text': 'the morpheme spelling, e.g. "un", "break", "able", left to right',
      'morphemes[].role': "'prefix'|'root'|'suffix'",
      'morphemes[].meaning': 'short gloss, e.g. "not, opposite of" for "un-"',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['education', 'language'],
  }),
  createMeta('practicelog', {
    family: 'learn',
    dataShapes: ['series', 'status'],
    requires: ['title', 'instrument', 'sessions'],
    optional: ['icon', 'iconColor', 'streak', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'An instrument practice tracker: a calendar-heat strip of real minutes-per-day above a ' +
      'session list, with per-piece cumulative-minute tags. Totals, day buckets, and streak are ' +
      'computed from the sessions, never invented. Use for "log my piano practice", "how much ' +
      'have I practiced this month", "show my violin streak".',
    itemShapes: [{ prop: 'sessions' }],
    propHints: {
      'sessions[].date': 'the session date, any string Date can parse, e.g. "2026-06-24"',
      'sessions[].minutes': 'minutes practiced in this session',
      'sessions[].piece': 'the piece worked on, e.g. "Clair de Lune" — omit for technique drills',
      'sessions[].focus': 'what the session focused on, e.g. "scales", "sight-reading", "tempo"',
      streak:
        'current consecutive-day streak in days — omit to let the component compute it from the sessions themselves',
    },
    intents: ['track', 'reflect', 'quantify'],
    domains: ['education', 'music'],
  }),
  createMeta('taxonrank', {
    family: 'learn',
    dataShapes: ['hierarchy'],
    requires: ['title', 'ranks'],
    optional: ['icon', 'iconColor', 'scientificName', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 4,
    colMin: 3,
    coercer: 'generic',
    blurb:
      "A single organism's taxonomic classification ladder — Kingdom down to Species (or any " +
      'subset) — as a vertical stack of rank pills joined by a connector, widening as it ' +
      'descends. Distinct from phylotree (a multi-species evolutionary tree): this is one ' +
      'organism\'s own classification, no tree layout involved. For "classify a red fox", ' +
      '"taxonomy of T. rex", "kingdom through species for a housecat".',
    itemShapes: [{ prop: 'ranks', text: 'name' }],
    propHints: {
      'ranks[].level': "'Kingdom'|'Phylum'|'Class'|'Order'|'Family'|'Genus'|'Species'",
      'ranks[].name': 'the taxon at this level, e.g. "Animalia", "Chordata", "Tyrannosaurus"',
      'ranks[].highlight': 'true to emphasise this one rung — the level the answer is about',
      scientificName: 'the full binomial name, e.g. "Tyrannosaurus rex" — shown italicized',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('numbersequence', {
    family: 'learn',
    dataShapes: ['sequence'],
    requires: ['title', 'kind', 'terms'],
    optional: ['icon', 'iconColor', 'rule', 'highlightPattern', 'footer'],
    interactive: false,
    wowWeight: 0.66,
    tier: 'base',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A Fibonacci / prime / triangular / square number visualizer for general curiosity — a ' +
      'row of size-scaled dots, one per term, with the real gap between adjacent terms ' +
      'annotated on the connector. Distinct from a classroom sequences-and-series lesson. For ' +
      '"show me the Fibonacci sequence", "what are triangular numbers", "visualize the first ' +
      '10 primes".',
    propHints: {
      kind: "'fibonacci' | 'prime' | 'triangular' | 'square'",
      terms: 'the actual terms in order, e.g. [1, 1, 2, 3, 5, 8, 13] for Fibonacci',
      rule: 'plain-language generating rule, e.g. "each term is the sum of the two before it"',
      highlightPattern: 'true (default) to annotate the gap between adjacent terms',
    },
    intents: ['explain', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('constantcard', {
    family: 'learn',
    dataShapes: ['scalar'],
    requires: ['title', 'symbol', 'value', 'significance'],
    optional: ['icon', 'iconColor', 'digitsShown', 'visual', 'footer'],
    interactive: false,
    wowWeight: 0.62,
    tier: 'base',
    colDefault: 5,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A mathematical constant fact card (pi, e, phi, a googol, …): headline symbol + value, a ' +
      'short significance paragraph, and an optional illustrative diagram (a golden-ratio ' +
      'spiral for phi, a circle-and-diameter for pi). For "tell me about pi", "what is the ' +
      'golden ratio", "how big is a googol".',
    propHints: {
      symbol: 'the constant\'s symbol or short name, e.g. "π", "e", "φ", "Googol"',
      value: 'the decimal expansion AS A STRING, e.g. "3.14159265358979323846" — never a number',
      digitsShown: 'how many digits after the decimal point to display; omit to show value as-is',
      visual: "'spiral' (for φ) | 'circle' (for π) | 'none' (default)",
    },
    intents: ['explain', 'reference'],
    domains: ['science', 'education'],
  }),
  createMeta('elementcard', {
    family: 'learn',
    dataShapes: ['keyvalue'],
    requires: ['title', 'symbol', 'name', 'z'],
    optional: [
      'icon',
      'iconColor',
      'mass',
      'category',
      'electronConfig',
      'shells',
      'discovered',
      'meltingPoint',
      'boilingPoint',
      'uses',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.72,
    tier: 'base',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A single periodic-table element deep-dive: a classic textbook tile (large symbol, Z ' +
      'top-left, mass bottom-left) plus category, electron configuration, melting/boiling ' +
      'points, and real uses, with a compact electron-shell ring diagram when shells is given. ' +
      'Distinct from periodictable (the full 118-cell grid) and bohrmodel (a full per-electron ' +
      'diagram). For "tell me about iron", "element deep dive on oxygen".',
    propHints: {
      z: 'the atomic number',
      mass: 'standard atomic mass in u/amu, e.g. 55.845 for iron',
      category: 'e.g. "Transition metal", "Noble gas", "Alkali metal" — colors the tile',
      electronConfig: 'condensed configuration, e.g. "[Ar] 3d⁶ 4s²"',
      shells: 'electrons per shell, innermost first, e.g. [2, 8, 14, 2] for iron',
      discovered: 'e.g. "1669" or "Known since antiquity"',
      meltingPoint: 'in °C',
      boilingPoint: 'in °C',
      uses: 'real-world uses, e.g. ["Steelmaking", "Magnets"]',
    },
    intents: ['explain', 'reference'],
    domains: ['science', 'education'],
    stringItems: ['uses'],
  }),
  createMeta('energybarchart', {
    family: 'learn',
    dataShapes: ['comparison', 'series'],
    requires: ['title', 'snapshots'],
    optional: ['icon', 'iconColor', 'system', 'unit', 'footer'],
    interactive: false,
    wowWeight: 0.8,
    tier: 'frontier',
    colDefault: 8,
    colMin: 5,
    coercer: 'generic',
    blurb:
      "A physics energy-bar ('LOL') chart: one bar group per snapshot in a scenario, all sharing " +
      'ONE y-scale so the stores are directly comparable and conservation is checkable. `snapshots` ' +
      'is an array of {label, bars:[{kind, value}]} where kind is an open store token ' +
      "('KE','Ug','Us','Eth','W'…) and a NEGATIVE value draws below the zero line; `system` lists " +
      "the objects in the system and `unit` defaults to 'J'. The running total under each group " +
      'makes energy-in = energy-out obvious. For conservation-of-energy problems, pendulums, ' +
      'springs, and inclines. Never for a reaction-coordinate energy profile — use energydiagram.',
    itemShapes: [
      {
        prop: 'snapshots',
        text: 'label',
        textAliases: ['name', 'state', 'title'],
        requiredFields: ['bars'],
        children: {
          prop: 'bars',
          text: 'kind',
          textAliases: ['store', 'type', 'label'],
          requiredFields: ['value'],
        },
      },
    ],
    propHints: {
      'snapshots[].label': 'the state name, e.g. "Initial", "At the bottom", "Final"',
      'bars[].kind':
        'energy store shown as the bar label — an open token, e.g. "KE", "Ug", "Us", "Eth", "W"',
      'bars[].value': 'amount of energy in this store; a NEGATIVE value draws below the zero line',
      system: 'objects inside the chosen system, e.g. ["ball", "Earth"]',
      unit: 'energy unit for the axis and totals; default "J"',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
    stringItems: ['system'],
  }),
  createMeta('guitartab', {
    family: 'learn',
    dataShapes: ['sequence'],
    requires: ['title', 'notes'],
    optional: [
      'icon',
      'iconColor',
      'tuning',
      'beatsPerMeasure',
      'measuresPerRow',
      'tempo',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Guitar/bass tablature: a 6-line TAB staff split into measures and wrapped to rows, with fret ' +
      'numbers on the string lines at proportional beat positions and hammer-on/pull-off/bend/slide ' +
      'glyphs between notes. `notes` is an array of {measure, beat, string (1 = high e … 6 = low E), ' +
      "fret, technique?}; `tuning` (default 'EADGBE'), `beatsPerMeasure` (4), `measuresPerRow` (4) " +
      'and `tempo` set the staff. For riffs, licks, and tab transcriptions. Never for standard staff ' +
      'notation — use musicstaff; for a scale or chord shape mapped across the neck use fretboardmap.',
    itemShapes: [{ prop: 'notes', requiredFields: ['measure', 'beat', 'string', 'fret'] }],
    propHints: {
      'notes[].measure': '1-based measure number',
      'notes[].beat': 'beat position within the measure, 1‥beatsPerMeasure (fractions allowed)',
      'notes[].string': 'string number, 1 = highest (high e) up to 6 = lowest (low E)',
      'notes[].fret': 'fret number, 0 = open, up to 24',
      'notes[].technique':
        "'h' (hammer-on) | 'p' (pull-off) | 'b' (bend) | 's' (slide up) | '/' (slide down) | 'x' (mute)",
      tuning: 'open-string notes low→high as a string, e.g. "EADGBE" (standard) or "DADGAD"',
      beatsPerMeasure: 'time-signature numerator; default 4',
      measuresPerRow: 'measures before wrapping to the next row; default 4',
      tempo: 'tempo in BPM, shown as "♩ = n"',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['music'],
  }),
  createMeta('karyotype', {
    family: 'learn',
    dataShapes: ['structure'],
    requires: [],
    optional: ['title', 'icon', 'iconColor', 'sex', 'anomalies', 'highlightPairs', 'footer'],
    interactive: false,
    wowWeight: 0.82,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A human karyogram: the 22 autosome pairs on a real decreasing length scale plus the sex ' +
      'pair, each chromosome an SVG shape with a centromere pinch (metacentric→acrocentric) and ' +
      "deterministic G-bands. `sex` is 'XX' or 'XY'; `anomalies` is an array of {pair (1–22 or " +
      "'X'/'Y'), kind, note?} that redraws a slot — trisomy adds a third copy, monosomy leaves " +
      'one, deletion/duplication marks a band — and `highlightPairs` rings pairs for emphasis. ' +
      'Educational genetics only. For "draw a karyotype", trisomy 21, and sex-chromosome teaching. ' +
      'Never for a family inheritance chart — use pedigree; for the DNA double helix use dnahelix.',
    itemShapes: [{ prop: 'anomalies', requiredFields: ['pair', 'kind'] }],
    propHints: {
      sex: "'XX' | 'XY' — the sex-chromosome pair to draw; default 'XX'",
      'anomalies[].pair': 'affected pair, "1"–"22" or "X"/"Y"',
      'anomalies[].kind': "'trisomy' | 'monosomy' | 'deletion' | 'duplication'",
      'anomalies[].note': 'optional short caption under the slot, e.g. "Down syndrome"',
      highlightPairs: 'pair ids to ring for emphasis, e.g. ["21", "X"]',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['science', 'education'],
    stringItems: ['highlightPairs'],
  }),
  createMeta('frayermodel', {
    family: 'learn',
    dataShapes: ['keyvalue', 'text'],
    requires: ['term', 'definition', 'characteristics', 'examples', 'nonexamples'],
    optional: ['icon', 'iconColor', 'pronunciation', 'title', 'footer'],
    interactive: false,
    wowWeight: 0.66,
    tier: 'base',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A Frayer vocabulary model: the `term` (with optional `pronunciation`) over a 2×2 panel grid ' +
      '— `definition` (prose), `characteristics`, `examples`, and `nonexamples` (each a string ' +
      'array) — the classic graphic organiser for deep word knowledge, with equal-height, ' +
      'bounded-scroll panels. For vocabulary instruction and concept-building across any subject. ' +
      'Never for plotting items on two axes — use quadrant.',
    propHints: {
      term: 'the vocabulary term / concept being defined',
      definition: "the definition in the learner's own words (prose)",
      characteristics: 'essential attributes, e.g. ["Has four equal sides", "Four right angles"]',
      examples: 'things that fit the term',
      nonexamples: 'things that do NOT fit — they sharpen the boundary',
      pronunciation: 'respelling or IPA, e.g. "/ˌfoʊtoʊˈsɪnθəsɪs/"',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['education'],
    stringItems: ['characteristics', 'examples', 'nonexamples'],
  }),
  createMeta('numberbond', {
    family: 'learn',
    dataShapes: ['scalar', 'structure'],
    requires: ['parts'],
    optional: ['title', 'icon', 'iconColor', 'whole', 'factFamily', 'label', 'footer'],
    interactive: false,
    wowWeight: 0.64,
    tier: 'base',
    colDefault: 5,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A K–2 part-part-whole number bond: the `whole` in a large circle above its `parts` (2–4 ' +
      "smaller circles) joined by connectors. Any value may be null to render a '?' the learner " +
      'fills in; with `factFamily` on and the whole plus two parts known, the four related ' +
      'addition/subtraction equations are shown. `label` captions the bond. For number sense, ' +
      'making 10, and fact-family practice. Never for column/standard-algorithm arithmetic — use ' +
      'columnarithmetic.',
    propHints: {
      whole: 'the total as a number, or null to make the WHOLE the unknown "?"',
      parts:
        'the 2–4 parts as numbers; use null for an unknown to fill in, e.g. [6, 4] or [6, null]',
      factFamily:
        'true shows the four related equations when the whole and exactly two parts are known',
      label: 'short caption under the bond, e.g. "Ways to make 10"',
    },
    intents: ['teach', 'explain'],
    domains: ['education'],
  }),
];
