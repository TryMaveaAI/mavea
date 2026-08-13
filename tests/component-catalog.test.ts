import { RAW_CATALOG } from '../src/canvas/blocks/catalog/catalog.data';
import { describe, it, expect } from 'vitest';
import {
  isDataShape,
  isArchetype,
  isCap,
  ARCHETYPES,
  type Archetype,
} from '../src/canvas/blocks/catalog/meta';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { COERCIBLE_TYPES, ARCHETYPE_BASE } from '../src/live/select/catalog';
import { Icon, ICON_KEYS } from '../src/icons/icons';
import { gaps } from '../scripts/enum-coverage.mjs';
describe('component catalog', () => {
  it('has a well-formed, unique entry for every component', () => {
    const seen = new Set<string>();
    for (const m of RAW_CATALOG) {
      expect(m.type).toBeTruthy();
      expect(seen.has(m.type)).toBe(false);
      seen.add(m.type);
      expect(m.dataShapes.length).toBeGreaterThan(0);
      for (const s of m.dataShapes) expect(isDataShape(s)).toBe(true);
      expect(m.wowWeight).toBeGreaterThanOrEqual(0);
      expect(m.wowWeight).toBeLessThanOrEqual(1);
      expect(m.colDefault).toBeGreaterThanOrEqual(1);
      expect(m.colDefault).toBeLessThanOrEqual(12);
      if (m.colMin !== undefined) expect(m.colMin).toBeLessThanOrEqual(m.colDefault);
      expect(['base', 'frontier', 'cutting']).toContain(m.tier);
      expect(['generic', 'custom']).toContain(m.coercer);
      // B1 faceted tagging: every entry resolves to a valid archetype, and any caps are valid.
      expect(isArchetype(m.archetype), `${m.type} has invalid archetype ${m.archetype}`).toBe(true);
      for (const c of m.caps ?? []) expect(isCap(c), `${m.type} has invalid cap ${c}`).toBe(true);
    }
  });
  it('every archetype base is Live-coercible, and the core archetypes are populated', () => {
    // The selector clusters candidates by archetype and offers a representative; the archetype's
    // canonical base (ARCHETYPE_BASE) must be renderable or the "build on <base> + annotate" path
    // would teach the model a type it can't emit.
    const coercible = COERCIBLE_TYPES;
    for (const a of ARCHETYPES) {
      const base = ARCHETYPE_BASE[a];
      if (base) {
        expect(coercible.has(base), `ARCHETYPE_BASE[${a}] = ${base} is not Live-coercible`).toBe(
          true,
        );
      }
    }
    // The everyday archetypes must actually have members (so clustering surfaces them).
    const present = new Set<Archetype>(RAW_CATALOG.map((m) => m.archetype));
    const core: Archetype[] = [
      'stat',
      'trend',
      'bar',
      'composition',
      'table',
      'compare',
      'list',
      'timeline',
      'prose',
      'code',
      'map',
      'matrix',
    ];
    for (const a of core) expect(present.has(a), `no catalog member has archetype ${a}`).toBe(true);
  });
  it('the flagship specialists factor onto the right base (receipt = table, etc.)', () => {
    const arch = (t: string) => RAW_CATALOG.find((m) => m.type === t)?.archetype;
    // Only assert for specialists that actually exist in the catalog (skip if absent).
    const expectations: [string, Archetype][] = [
      ['receipt', 'table'],
      ['recipecard', 'steps'],
      ['geomap', 'map'],
      ['sportspitch', 'canvas'],
      ['pdfreader', 'document'],
      ['codeblock', 'code'],
    ];
    for (const [type, want] of expectations) {
      const got = arch(type);
      if (got !== undefined) expect(got, `${type} should be archetype ${want}`).toBe(want);
    }
  });
  it('covers the eight base types', () => {
    const types = new Set(RAW_CATALOG.map((m) => m.type));
    for (const t of [
      'insight',
      'chart',
      'breakdown',
      'list',
      'timeline',
      'compare',
      'kpi',
      'ring',
    ]) {
      expect(types.has(t)).toBe(true);
    }
  });
  it('spans many families and includes a healthy set of interactive components', () => {
    expect(new Set(RAW_CATALOG.map((m) => m.family)).size).toBeGreaterThanOrEqual(10);
    expect(RAW_CATALOG.filter((m) => m.interactive).length).toBeGreaterThan(20);
    expect(RAW_CATALOG.length).toBeGreaterThan(120);
  });
  it('every blurb redirect points at a real, Live-selectable block', () => {
    // Misuse-prone blurbs steer the model away from a wrong-domain block with a
    // "Never for X — use Y" clause. If Y names a block that does not exist or that
    // Live can never emit (custom-coercer, not hand-built, or fake-data), the
    // redirect quietly sends the model to a dead end and reintroduces the very
    // mis-selection it was meant to prevent (this caught a stale "schedule"/"plot"
    // redirect). Parse each redirect clause and assert every target is selectable.
    for (const m of RAW_CATALOG) {
      if (!m.blurb.includes('Never for')) continue;
      // Redirect grammar: after "use ", a comma-separated list of redirect groups;
      // within a group, "/" and " or " join alternative block names; an optional
      // "for <purpose>" / "otherwise" tail is prose and ends that group's targets.
      // (e.g. "use workoutplan for exercises, agenda for plans, checklist/datatable
      // otherwise" -> workoutplan, agenda, checklist, datatable.)
      for (const clause of m.blurb.match(/\buse ([^.]*)/g) ?? []) {
        const body = clause.replace(/^use /, '').replace(/\//g, ' or ');
        for (const group of body.split(',')) {
          for (const raw of group.trim().split(/\s+/)) {
            const tok = raw.replace(/[^a-z]/g, ''); // drop punctuation like a trailing ")"
            if (!tok || tok === 'or') continue;
            if (tok === 'for' || tok === 'otherwise') break; // rest of the group is prose
            expect(
              COERCIBLE_TYPES.has(tok),
              `${m.type}: blurb redirects to "${tok}", which is not a Live-selectable block`,
            ).toBe(true);
          }
        }
      }
    }
  });
  it('preserves the exact length and ordered type list', () => {
    // Pins RAW_CATALOG as a flat, ordered list so any edit that drops, duplicates, reorders,
    // or renames an entry is caught immediately — the list must stay the same entries in the
    // same order with the same count. Update this list (and the count) only when intentionally
    // adding, removing, or reordering a component.
    //
    // The canonical order is families alphabetically, entries in file order (see catalog.data.ts).
    // It is load-bearing: the selector's seeded draw iterates the facts index in exactly this order,
    // so a reshuffle silently changes which components a given ask surfaces.
    const ORDERED_TYPES = [
      'reasoning',
      'toolcalls',
      'agenttrace',
      'modelcompare',
      'tokenstream',
      'retrieval',
      'whatchanged',
      'routing',
      'embedmap',
      'calibration',
      'httpexchange',
      'trainingcurve',
      'treemap',
      'sunburst',
      'sankey',
      'network',
      'radar',
      'waterfall',
      'funnel',
      'histogram',
      'boxplot',
      'streamgraph',
      'correlationheatmap',
      'bcgmatrix',
      'flowchord',
      'venn',
      'quadrant',
      'piedonut',
      'distributioncurve',
      'latencydist',
      'captable',
      'lifewheel',
      'violinplot',
      'stemleafplot',
      'tamsam',
      'slopegraph',
      'dumbbell',
      'lollipop',
      'bulletchart',
      'candlestick',
      'gantt',
      'bubble',
      'arearange',
      'waffle',
      'groupedbars',
      'stackedbars',
      'bridge',
      'calheat',
      'bump',
      'marimekko',
      'plot',
      'dualaxis',
      'scatterregression',
      'dotplot',
      'controlchart',
      'areaplot',
      'supplydemand',
      'bigo',
      'errorbars',
      'eratimeline',
      'payoffdiagram',
      'phasediagram',
      'indifferencecurve',
      'breakeven',
      'burnrunway',
      'loaddiagram',
      'ecgstrip',
      'vitalstrip',
      'growthcurve',
      'sleepcycle',
      'seasonband',
      'roccurve',
      'surfaceplot',
      'gradientdescent',
      'biasvariance',
      'timeseriesdecomposition',
      'precisionrecallcurve',
      'chromatogram',
      'stressstraincurve',
      'gatingplot',
      'gellane',
      'flightchart',
      'paybandchart',
      'linebalance',
      'epicurve',
      'pareto',
      'populationpyramid',
      'parallelcoordinates',
      'scatterplotmatrix',
      'pictogramchart',
      'qqplot',
      'samplingdistribution',
      'hrdiagram',
      'ternaryplot',
      'parliamentseats',
      'componentapi',
      'stacktrace',
      'syntaxbreakdown',
      'codewalk',
      'terminal',
      'logstream',
      'gitgraph',
      'queryplan',
      'flamegraph',
      'regexscope',
      'sequencealign',
      'voicestyle',
      'messagedraft',
      'chatthread',
      'dialogue',
      'variants',
      'verse',
      'slidedeck',
      'screenplay',
      'socialpost',
      'longread',
      'ideaboard',
      'insight',
      'chart',
      'breakdown',
      'timeline',
      'list',
      'compare',
      'ring',
      'bars',
      'stack',
      'scatter',
      'heat',
      'flow',
      'web',
      'gallery',
      'codemap',
      'diff',
      'checks',
      'donut',
      'gauge',
      'scoreboard',
      'standings',
      'pipeline',
      'kpi',
      'quotes',
      'checklist',
      'understand',
      'schema',
      'screenmap',
      'buildprog',
      'preview',
      'diagramflow',
      'composite',
      'sequencediagram',
      'statemachine',
      'erdiagram',
      'circuitdiagram',
      'controlblockdiagram',
      'fiveforces',
      'fivewhychain',
      'sysarchdiagram',
      'datapipeline',
      'threatmodel',
      'foodweb',
      'recursiontree',
      'primefactortree',
      'nnarchitecture',
      'synthesisroute',
      'plasmidmap',
      'argumentmap',
      'toulmin',
      'castmap',
      'probabilitytree',
      'datastructure',
      'causationchain',
      'protocolstack',
      'wiringdiagram',
      'pipingschematic',
      'logicgates',
      'algorithmtrace',
      'dptable',
      'cyclewheel',
      'hashtable',
      'trie',
      'graphtrace',
      'binarytree',
      'sortingviz',
      'gridtrace',
      'tournamentbracket',
      'prooftree',
      'fishbone',
      'classdiagram',
      'analogymap',
      'avatar',
      'avatargroup',
      'badgeset',
      'chipset',
      'kbd',
      'codeblock',
      'banner',
      'toaststack',
      'spinner',
      'notification',
      'eligibilitycheck',
      'evidencetrace',
      'reviewsynth',
      'annotateddoc',
      'redline',
      'citationchain',
      'factcheck',
      'confidencemeter',
      'highlightsnippet',
      'annotcallouts',
      'sourcelist',
      'claimgrid',
      'docoutline',
      'docview',
      'pdfreader',
      'diffviewer',
      'clinicaltimeline',
      'researchsummary',
      'hypothesiscard',
      'paralleltext',
      'resume',
      'changelog',
      'lessonplan',
      'casebrief',
      'patentclaimchart',
      'storystructure',
      'vetpatientchart',
      'scoutingreport',
      'allocatepeople',
      'forecast',
      'agenda',
      'picks',
      'timezones',
      'transitroute',
      'amortization',
      'receipt',
      'settleup',
      'bracketbar',
      'recipecard',
      'workoutplan',
      'medicationschedule',
      'macrobreakdown',
      'plangrid',
      'budgetallocator',
      'howtosteps',
      'livecompute',
      'countdown',
      'livescore',
      'nutritionlabel',
      'unitconvert',
      'packlist',
      'pregnancyweek',
      'cycletrack',
      'contractiontimer',
      'prayertimes',
      'labprotocol',
      'caregivercoord',
      'readinglist',
      'cocktailcard',
      'runninglog',
      'userpersona',
      'runofshow',
      'podcastplanner',
      'vaxschedule',
      'claimagecompare',
      'weathernow',
      'tierlist',
      'paystub',
      'taxbracket',
      'menucard',
      'familytree',
      'seatingchart',
      'relationshipmap',
      'meetingnotes',
      'stickerchart',
      'statblock',
      'vestingschedule',
      'termsheet',
      'fundraisingrounds',
      'saferterms',
      'dilutionwaterfall',
      'threestatementlink',
      'yieldcurve',
      'efficientfrontier',
      'bondladder',
      'cashflowtimeline',
      'trustmap',
      'kanban',
      'wizard',
      'decisiontree',
      'goaltree',
      'plandag',
      'milestones',
      'processflow',
      'journeymap',
      'logicmodel',
      'orgchart',
      'issuetree',
      'roadmap',
      'contentcalendar',
      'headcountplan',
      'chronologicaltimeline',
      'skilltree',
      'businesscanvas',
      'blanks',
      'buttonbar',
      'textfield',
      'textarea',
      'select',
      'combobox',
      'checkboxgroup',
      'actionchecklist',
      'radiogroup',
      'switchset',
      'togglegroup',
      'otp',
      'preflightchecklist',
      'estateplanchecklist',
      'visachecklist',
      'callout',
      'verdictcard',
      'scenarioset',
      'worthit',
      'companionnote',
      'positioncard',
      'differential',
      'reframecard',
      'breathpacer',
      'copingmenu',
      'subtextdecode',
      'rehearsal',
      'messagescriptset',
      'talktrack',
      'lifeline',
      'proscons',
      'takeaways',
      'faq',
      'tabs',
      'divider',
      'pullquote',
      'storystrip',
      'casestudy',
      'deflist',
      'accordion',
      'scansionmark',
      'typespec',
      'shotlist',
      'beatsheet',
      'promptset',
      'zoneladder',
      'picturesequence',
      'storyarc',
      'devicemark',
      'thoughtrecord',
      'dosdonts',
      'variantswitch',
      'equationblock',
      'numberline',
      'workedexample',
      'quiz',
      'quizsession',
      'flashcard',
      'molecularstructure',
      'periodictable',
      'bodymap',
      'geometrycanvas',
      'freebodydiagram',
      'musicstaff',
      'vectorspace',
      'reactionmechanism',
      'chorddiagram',
      'developmentmilestone',
      'teachdiagram',
      'gridmatrix',
      'fractionbar',
      'wave',
      'energydiagram',
      'phylotree',
      'parsetree',
      'celldiagram',
      'raydiagram',
      'vectorfield',
      'pedigree',
      'bohrmodel',
      'equationbalancer',
      'yieldcalc',
      'vseprmolecule',
      'unitcircle',
      'solidfigure',
      'crosssection',
      'pianokeys',
      'fretboardmap',
      'circleoffifths',
      'odontogram',
      'clockface',
      'moneytray',
      'placevaluechart',
      'shapecard',
      'letterform',
      'toolscale',
      'craftchart',
      'areamodel',
      'gridtransform',
      'polarplot',
      'twocolumnproof',
      'pyramidtiers',
      'linespectrum',
      'dnahelix',
      'taylorseries',
      'phaseportrait',
      'sightwordlist',
      'alphabetchart',
      'columnarithmetic',
      'titrationcurve',
      'interferencepattern',
      'orbitaldiagram',
      'pictograph',
      'particlemodel',
      'morphemebreakdown',
      'practicelog',
      'taxonrank',
      'numbersequence',
      'constantcard',
      'elementcard',
      'energybarchart',
      'guitartab',
      'karyotype',
      'frayermodel',
      'numberbond',
      'beforeafter',
      'carousel',
      'imagecallouts',
      'waveform',
      'videoembed',
      'geomap',
      'lightbox',
      'moodboard',
      'palette',
      'mediacard',
      'diagram',
      'svgblock',
      'sportspitch',
      'floorplan',
      'dimensiondrawing',
      'explodedview',
      'weldsymbol',
      'cutlist',
      'spacefit',
      'anatomyfigure',
      'exposuretriangle',
      'colorwheel',
      'artanalysis',
      'mixerboard',
      'wireframe',
      'maproute',
      'moonphase',
      'skychart',
      'orbitdiagram',
      'gameboard',
      'patternpiece',
      'emotionwheel',
      'creativetest',
      'brandguide',
      'siteplan',
      'zoningmap',
      'wordsearch',
      'playingcards',
      'stitchchart',
      'pianoroll',
      'navbar',
      'sidenav',
      'breadcrumb',
      'pagination',
      'menubar',
      'megamenu',
      'toolbar',
      'commandbar',
      'treeview',
      'bottomnav',
      'modal',
      'confirmdialog',
      'drawer',
      'sheet',
      'popover',
      'hovercard',
      'tooltip',
      'menu',
      'contextmenu',
      'commandk',
      'datepicker',
      'calendarpick',
      'daterange',
      'timepicker',
      'colorpicker',
      'fileupload',
      'tagsinput',
      'numberstepper',
      'searchselect',
      'formpanel',
      'scalefelt',
      'hearit',
      'factsheet',
      'newsdigest',
      'dictionary',
      'translation',
      'pronunciation',
      'gloss',
      'ipachart',
      'scriptstroke',
      'phonicsword',
      'speciescard',
      'etymtree',
      'hazardcard',
      'termbase',
      'sizecompare',
      'baseconversion',
      'historicalperson',
      'onthisday',
      'countrycard',
      'worldgrid',
      'warconflict',
      'posbreakdown',
      'distinctioncard',
      'sparkstat',
      'counter',
      'herostat',
      'trendtile',
      'scorebadge',
      'percentilebar',
      'statpair',
      'scorecard',
      'deltacascade',
      'bulletkpi',
      'confusionmatrix',
      'kpidashboard',
      'abtestresult',
      'powersample',
      'inventoryreorder',
      'boardgamescore',
      'cvssscorecard',
      'ridgeplot',
      'ecdf',
      'forestplot',
      'a11yaudit',
      'progressbar',
      'stepindicator',
      'statustimeline',
      'healthgrid',
      'emptystate',
      'skeleton',
      'sliderinput',
      'segmented',
      'rangefilter',
      'ratinginput',
      'litigationtimeline',
      'billtracker',
      'triageboard',
      'mentalhealthscreen',
      'usabilityfindings',
      'roomblockdashboard',
      'immigrationcase',
      'painscale',
      'habittracker',
      'streakgrid',
      'datatable',
      'pivot',
      'leaderboard',
      'treetable',
      'swimlane',
      'footnotetable',
      'sparktable',
      'smallmultiples',
      'comparebars',
      'comparematrix',
      'matrixgrid',
      'clearancematrix',
      'matrix',
      'sensitivitytable',
      'labpanel',
      'ingredientmatrix',
      'conjugation',
      'financialstatement',
      'cohortgrid',
      'riskmatrix',
      'careplan',
      'doseladder',
      'sizechart',
      'pricingtable',
      'raci',
      'rubric',
      'interviewscorecard',
      'gradebook',
      'datadictionary',
      'ablationtable',
      'spectrumtable',
      'fmeatable',
      'billofmaterials',
      'complexitysummary',
      'expressionheatmap',
      'discoverytracker',
      'dentaltreatmentplan',
      'rollcall',
      'collectiontracker',
      'cma',
      'taxreturnsummary',
      'depreciationschedule',
      'vendortracker',
      'sponsorshiptracker',
      'caseload',
    ];
    expect(RAW_CATALOG.length).toBe(608);
    expect(RAW_CATALOG.map((m) => m.type)).toEqual(ORDERED_TYPES);
  });
  it('every itemShape names a real prop on its component (no orphan item contracts)', () => {
    // An itemShape repairs/teaches a specific array prop. If that prop is not in the
    // component's requires/optional, it can never reach the renderer — a typo'd contract
    // that would silently do nothing. Catch it here. (Custom-coerced components don't run
    // the generic item path, so an itemShape on one is dead weight — flag those too.)
    for (const m of RAW_CATALOG) {
      for (const spec of m.itemShapes ?? []) {
        const known = new Set([...m.requires, ...m.optional]);
        expect(
          known.has(spec.prop),
          `${m.type}: itemShape prop "${spec.prop}" is not in requires/optional`,
        ).toBe(true);
        expect(m.coercer, `${m.type}: itemShape on a custom-coerced component has no effect`).toBe(
          'generic',
        );
        // A child item array is a field carried on each item, not a top-level prop, so it
        // is not checked against requires/optional — but its own text/prop must be set.
        if (spec.children) {
          expect(spec.children.prop, `${m.type}: child itemShape needs a prop`).toBeTruthy();
        }
      }
    }
  });
});
describe('generic, metadata-driven coercion (the long tail beyond the hand-built dozen)', () => {
  it('renders a long-tail component when its required data is present', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'funnel',
            props: {
              title: 'Signups',
              stages: [
                { label: 'Visit', value: 100 },
                { label: 'Buy', value: 8 },
              ],
            },
          },
        ],
      },
      new Set(['funnel']),
    );
    expect(r).not.toBeNull();
    expect(r!.blocks[0]?.type).toBe('funnel');
  });
  it('drops a long-tail component missing its required data (never shows it empty)', () => {
    const r = validateLiveResponse(
      { title: 'T', blocks: [{ type: 'funnel', props: { title: 'Signups' } }] },
      new Set(['funnel']),
    );
    expect((r?.blocks ?? []).some((b) => b.type === 'funnel')).toBe(false);
  });
  it('neutralizes HTML-forming characters in generic props', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'funnel',
            props: { title: '<script>x</script>', stages: [{ label: 'a', value: 1 }] },
          },
        ],
      },
      new Set(['funnel']),
    );
    const block = r!.blocks.find((b) => b.type === 'funnel') as
      { props: { title: string } } | undefined;
    expect(block?.props.title.includes('<')).toBe(false);
  });
});
describe('constrained-vocabulary exposure (the model can only pick a valid value if shown it)', () => {
  // The icon vocabulary the prompt hands the model must stay in lockstep with what's drawable —
  // an icon name that isn't in `Icon` renders nothing.
  it('ICON_KEYS exactly mirrors the drawable icon set', () => {
    expect(ICON_KEYS.length).toBeGreaterThan(40);
    expect([...ICON_KEYS].sort()).toEqual(Object.keys(Icon).sort());
    expect(ICON_KEYS).toContain('chart');
    expect(ICON_KEYS).toContain('sparkle');
  });
  // The exhaustive drift-guard. A source scan resolves every string-literal enum prop on every
  // Live-facing block (recursing through nested item arrays) and checks the catalog teaches its
  // values. A new component with an unexposed enum — or a deleted propHint — fails here, naming
  // exactly what to fix. Deliberate non-exposures live in the analyzer's reasoned ALLOW list.
  it('every enum prop on a Live-facing block is taught in propHints (or allow-listed)', () => {
    const detail = gaps
      .map(
        (g) =>
          `  ${g.type}.${g.path} → ${g.values.join('|')} (only ${g.named}/${g.values.length} named)`,
      )
      .join('\n');
    expect(
      gaps,
      `Components with an enum prop the model is never shown — add propHints (or an ALLOW entry with a reason in scripts/enum-coverage.mjs):\n${detail}`,
    ).toEqual([]);
  });
});
