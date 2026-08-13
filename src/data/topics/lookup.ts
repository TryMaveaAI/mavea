// "Look it up", fact sheets, news digests, dictionary, translation, pronunciation, and gloss.
// Exercises the reference family and code family (stacktrace, syntaxbreakdown, codewalk).
import type { ConversationSpec } from '../conversation';

export const lookup: ConversationSpec = {
  id: 'lookup',
  workspace: 'Look it up',
  title: 'Facts, definitions, and news',
  sub: 'Reference answers: who, what, how to say it, and what happened today.',
  opener: 'Here are the key facts on the James Webb Space Telescope, plus word of the day.',
  switchSay: "I'll look that up for you.",
  tint: '#60c8e8',
  context: [
    { name: 'James Webb Telescope', color: 'var(--presence-soft)' },
    { name: 'Today · latest', color: 'var(--insight)' },
    { name: 'Word · ephemeral', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'factsheet',
      col: 7,
      delay: 0,
      props: {
        title: 'Fact Sheet',
        icon: 'layers',
        iconColor: 'var(--presence)',
        subject: 'James Webb Space Telescope',
        tagline: 'The most powerful space telescope ever built, revealing the earliest galaxies.',
        facts: [
          {
            label: 'Launch date',
            value: 'December 25, 2021',
            note: 'Ariane 5 rocket from Kourou, French Guiana',
          },
          { label: 'Location', value: 'L2 Lagrange point, 1.5M km from Earth' },
          { label: 'Mirror size', value: '6.5 meters (primary), 18 hexagonal segments' },
          { label: 'Wavelength', value: 'Near to mid-infrared (0.6–28 μm)' },
          { label: 'Cost', value: '$10 billion USD (NASA/ESA/CSA)' },
          { label: 'Design life', value: '10 years minimum; fuel for 20+' },
          {
            label: 'Deepest image',
            value: "SMACS 0723, 13.1 billion years ago, Hubble's first day beat",
          },
        ],
        body: 'JWST peers through cosmic dust with infrared light, revealing star nurseries and distant galaxies invisible to Hubble. It has already rewritten our understanding of the early universe.',
        footer: 'Source: NASA / ESA.',
      },
    },
    {
      type: 'newsdigest',
      col: 5,
      delay: 100,
      props: {
        title: 'Latest: Space Science',
        icon: 'globe',
        iconColor: 'var(--insight)',
        topic: 'James Webb Space Telescope',
        asOf: 'as of today',
        items: [
          {
            headline: 'Webb captures earliest galaxy merger ever recorded, 13.2 billion years ago',
            source: 'Nature Astronomy',
            time: '2 days ago',
            category: 'Discovery',
            summary:
              'Two proto-galaxies caught mid-collision just 600 million years after the Big Bang, challenging current merger-rate models.',
          },
          {
            headline: "JWST's infrared survey maps 100,000 new galaxies in 'deep field' mosaic",
            source: 'Space.com',
            time: '1 week ago',
            category: 'Survey',
            summary:
              'The COSMOS-Web survey released its largest image yet, a 0.6 sq-deg mosaic covering cosmic history back to z~7.',
          },
          {
            headline: 'Exoplanet atmosphere detected with record precision using Webb spectroscopy',
            source: 'ESA',
            time: '2 weeks ago',
            category: 'Exoplanets',
          },
        ],
        footer: 'Search-grounded results, click headlines for full articles.',
      },
    },
    {
      type: 'dictionary',
      col: 6,
      delay: 200,
      props: {
        title: 'Word of the Day',
        icon: 'layers',
        iconColor: 'var(--presence)',
        word: 'ephemeral',
        phonetic: '/ɪˈfɛm.ər.əl/',
        senses: [
          {
            pos: 'adjective',
            definition: 'Lasting for a very short time; transitory.',
            example: 'The ephemeral beauty of cherry blossoms makes them all the more precious.',
            synonyms: ['fleeting', 'transient', 'momentary', 'brief', 'short-lived'],
          },
          {
            pos: 'noun (rare)',
            definition:
              'Something with a very short lifespan, such as an insect that lives only one day.',
          },
        ],
        etymology:
          'From Greek ephēmeros: epi- ("on") + hēmera ("day"). Originally referred to a fever lasting only one day.',
        footer: 'From Greek: epi- (on) + hēmera (day), lasting just one day.',
      },
    },
    {
      type: 'translation',
      col: 6,
      delay: 280,
      props: {
        title: 'Translation',
        icon: 'globe',
        iconColor: 'var(--insight)',
        fromLang: 'English',
        toLang: 'Japanese',
        text: 'The stars are beautiful tonight.',
        result: '今夜は星が綺麗ですね。',
        pairs: [
          {
            original: 'The stars',
            translated: '星が (hoshi ga)',
            note: '星 = star; が = subject marker',
          },
          {
            original: 'are beautiful',
            translated: '綺麗です (kirei desu)',
            note: 'きれい = beautiful; です = polite copula',
          },
          {
            original: 'tonight',
            translated: '今夜は (konya wa)',
            note: '今夜 = tonight; は = topic marker',
          },
          {
            original: '(sentence-end)',
            translated: 'ね (ne)',
            note: 'Adds a gentle "isn\'t it?", inviting agreement',
          },
        ],
        footer: 'Romanization in parentheses to help with pronunciation.',
      },
    },
    {
      type: 'pronunciation',
      col: 5,
      delay: 340,
      props: {
        title: 'Pronunciation Guide',
        icon: 'layers',
        iconColor: 'var(--presence)',
        word: 'Worcestershire',
        ipa: '/ˈwʊs.tər.ʃɪr/',
        syllables: 'Worces·ter·shire',
        tips: [
          "Say 'WOOS-ter-sheer', drop the 'cester' and 'shire' is just 'sheer'.",
          "The 'ester' in Worcester is silent, it's spelled one way, said another.",
          "Common mistake: 'War-chest-er-shy-er', ignore the spelling entirely.",
        ],
        footer: "One of English's most notorious spelling traps.",
      },
    },
    {
      type: 'gloss',
      col: 7,
      delay: 400,
      props: {
        title: 'Astronomy Glossary',
        icon: 'layers',
        iconColor: 'var(--insight)',
        domain: 'Astrophysics',
        entries: [
          {
            term: 'Redshift',
            definition:
              'The increase in wavelength of electromagnetic radiation as a source moves away from the observer. Higher redshift = more distant / earlier universe.',
          },
          {
            term: 'Lagrange point',
            definition:
              'A position in space where a small object can orbit in a stable pattern relative to two larger ones. JWST sits at L2.',
            see: 'Halo orbit',
          },
          {
            term: 'Infrared',
            definition:
              'Light with wavelengths longer than visible light (700 nm–1 mm). JWST sees in near-to-mid infrared, which penetrates cosmic dust.',
            see: 'Redshift',
          },
          {
            term: 'Proto-galaxy',
            definition:
              'An early, incompletely formed galaxy, a clump of gas and dark matter in the process of collapsing and forming stars.',
          },
          {
            term: 'Spectroscopy',
            definition:
              "Analysis of light broken into its component wavelengths to determine a star's or planet's composition, temperature, and velocity.",
          },
        ],
        footer: 'Essential terms for reading Webb discovery papers.',
      },
    },
    {
      type: 'stacktrace',
      col: 10,
      delay: 480,
      props: {
        title: 'Error Explained',
        icon: 'alert',
        iconColor: 'var(--warning)',
        errorType: 'TypeError',
        message: "Cannot read properties of undefined (reading 'map')",
        frames: [
          {
            file: 'src/components/StarList.tsx',
            line: 42,
            fn: 'StarList',
            context: 'const items = data.results.map(r => r.name);',
            isUser: true,
          },
          {
            file: 'src/hooks/useStarData.ts',
            line: 18,
            fn: 'useStarData',
            context: 'return { results: await fetch(...).then(r => r.json()) }',
            isUser: true,
          },
          {
            file: 'node_modules/react/cjs/react-dom.development.js',
            line: 4164,
            fn: 'commitHookEffectListMount',
          },
        ],
        cause:
          'The fetch resolved before the component re-rendered, and results was undefined on the first render pass.',
        fix: 'Add a loading guard: `if (!data?.results) return <Spinner />;` before the .map() call. Or initialize with `results: []` in useStarData so the first render is always safe.',
        footer: 'Pattern: always guard array operations against undefined before mapping.',
      },
    },
    {
      type: 'syntaxbreakdown',
      col: 10,
      delay: 560,
      props: {
        title: 'Syntax Breakdown',
        icon: 'doc',
        iconColor: 'var(--insight)',
        summary: 'How TypeScript generic constraints work, one line at a time.',
        lines: [
          {
            code: 'function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {',
            explanation:
              'Generic function: T is any object type; K must be a key of T. Returns only the picked keys.',
            tokens: [
              { code: 'function', label: 'keyword', kind: 'keyword' },
              {
                code: '<T, K extends keyof T>',
                label: 'generic constraints: K must be a key of T',
                kind: 'type',
              },
              {
                code: 'Pick<T, K>',
                label: 'utility type: object with only the specified keys',
                kind: 'type',
              },
            ],
          },
          {
            code: '  return Object.fromEntries(keys.map(k => [k, obj[k]]));',
            explanation: 'Build a new object from just the requested keys using fromEntries + map.',
            tokens: [
              {
                code: 'Object.fromEntries',
                label: 'converts [key, value] pairs → object',
                kind: 'identifier',
              },
              {
                code: 'keys.map(k => [k, obj[k]])',
                label: 'for each key, pair it with the value from obj',
                kind: 'value',
              },
            ],
          },
          { code: '}', explanation: 'End of function.' },
        ],
        footer:
          "The 'extends keyof T' constraint is what makes this type-safe, TypeScript rejects invalid keys at compile time.",
      },
    },
    {
      type: 'codewalk',
      col: 10,
      delay: 640,
      props: {
        title: 'Algorithm Walkthrough',
        icon: 'doc',
        iconColor: 'var(--presence)',
        algorithm: 'Binary Search',
        steps: [
          {
            step: 1,
            title: 'Set up the search window',
            code: 'let lo = 0, hi = arr.length - 1;',
            lang: 'typescript',
            explanation:
              'Start with the full array, lo points to the first element, hi to the last.',
          },
          {
            step: 2,
            title: 'Pick the midpoint',
            code: 'const mid = lo + Math.floor((hi - lo) / 2);',
            lang: 'typescript',
            explanation:
              'Calculate the middle index. The `lo + (hi - lo) / 2` form avoids integer overflow that `(lo + hi) / 2` can cause.',
          },
          {
            step: 3,
            title: 'Compare and narrow',
            code: 'if (arr[mid] === target) return mid;\nelse if (arr[mid] < target) lo = mid + 1;\nelse hi = mid - 1;',
            lang: 'typescript',
            explanation:
              'If we found it, return. Otherwise, discard the half that cannot contain target. Each step halves the search space, O(log n).',
          },
          {
            step: 4,
            title: 'Repeat until found or empty',
            code: 'while (lo <= hi) { /* step 2 & 3 */ }\nreturn -1; // not found',
            lang: 'typescript',
            explanation:
              'Keep looping while the window has elements. If lo passes hi, the target is not in the array.',
          },
        ],
        footer: 'Binary search: O(log n) time, O(1) space. Requires a sorted array.',
      },
    },
    {
      type: 'hearit',
      col: 6,
      delay: 460,
      id: 'hearit',
      props: {
        title: 'Hear It',
        icon: 'speaker',
        iconColor: 'var(--presence)',
        items: [
          {
            label: 'Worcestershire',
            kind: 'word',
            value: 'Worcestershire',
            sub: "Say it: 'WOOS-ter-sheer'",
          },
          { label: 'Concert A (A4)', kind: 'note', value: 'A4', sub: 'The 440 Hz tuning pitch' },
          { label: 'Middle C (C4)', kind: 'note', value: 'C4', sub: 'A piano keyboard anchor' },
          {
            label: 'A perfect fifth above',
            kind: 'note',
            value: 'E5',
            sub: 'The interval A4 to E5',
          },
          { label: '1 kHz reference tone', kind: 'tone', value: 1000, sub: 'A pure 1000 Hz sine' },
        ],
        footer: "Tap a row to hear it. Words use your browser's voice; notes ring a soft tone.",
      },
    },
    {
      type: 'ipachart',
      col: 6,
      id: 'ipa-english-front-vowels',
      delay: 80,
      props: {
        title: 'English front vowels',
        icon: 'globe',
        iconColor: 'var(--presence)',
        kind: 'vowels',
        highlight: ['i', 'ɪ', 'æ'],
        examples: [
          { symbol: 'iː', word: 'beat' },
          { symbol: 'ɪ', word: 'bit' },
          { symbol: 'æ', word: 'bat' },
        ],
        caption:
          'The vowel quadrilateral maps tongue position: front → back across the top, close → open down the side. “beat”, “bit” and “bat” step steadily downward and forward.',
        footer:
          'Lengthening <b>ɪ</b> toward <b>iː</b> is the single biggest cue for “bit” → “beat”.',
      },
    },
    {
      type: 'scriptstroke',
      col: 5,
      id: 'scriptstroke-mu-tree',
      delay: 80,
      props: {
        title: 'Writing 木 (tree)',
        icon: 'edit',
        iconColor: 'var(--presence)',
        glyph: '木',
        grid: 'mi',
        romanization: 'mù',
        meaning: 'tree, wood',
        strokes: [
          { order: 1, path: 'M18 38 H82', hint: 'Horizontal — left to right across the top.' },
          { order: 2, path: 'M50 20 V92', hint: 'Vertical — straight down through the centre.' },
          {
            order: 3,
            path: 'M50 56 L20 90',
            hint: 'Left-falling stroke — down and out to the lower left.',
          },
          {
            order: 4,
            path: 'M50 56 L82 90',
            hint: 'Right-falling stroke — down and out to the lower right.',
          },
        ],
        caption:
          'Four strokes: the crossbar first, then the trunk, then the two roots splaying out — top-to-bottom, left-before-right, the universal stroke-order rules.',
        footer:
          'Master the four roots of 木 and the radicals 林 (woods) and 森 (forest) become repetition, not new shapes.',
      },
    },
    {
      type: 'paralleltext',
      col: 10,
      id: 'paralleltext',
      delay: 1520,
      props: {
        title: 'One line, three hands',
        icon: 'layers',
        iconColor: 'var(--presence)',
        caption:
          'Dante, Inferno I.1 — the opening tercet, original beside two canonical English renderings.',
        columns: [
          { label: 'Dante (1320)', lang: 'Italian' },
          { label: 'Longfellow, 1867', lang: 'en' },
          { label: 'Ciardi, 1954', lang: 'en' },
        ],
        rows: [
          {
            cells: [
              'Nel mezzo del cammin di nostra vita',
              'Midway upon the journey of our life',
              'Midway in our life’s journey, I went astray',
            ],
            note: 'Ciardi pulls “I went astray” up from line 3 to keep the pentameter; Longfellow tracks the Italian word order.',
          },
          {
            cells: [
              'mi ritrovai per una selva oscura,',
              'I found myself within a forest dark,',
              'from the straight road and woke to find myself',
            ],
            note: 'Both keep the dark wood, but Longfellow mirrors the line break while Ciardi enjambs across it.',
            diverge: true,
          },
          {
            cells: [
              'ché la diritta via era smarrita.',
              'For the straightforward pathway had been lost.',
              'alone in a dark wood. How shall I say',
            ],
            note: '“diritta via” — the straight way — is rendered literally by Longfellow; Ciardi defers it, ending instead on the speaker’s hesitation.',
            diverge: true,
          },
        ],
        footer:
          'Read each row across: the same Italian line, weighed differently for <strong>meter</strong> vs <strong>literal sense</strong>.',
      },
    },

    // ── comparematrix: three ways to organize an economy, attribute by attribute ──
    {
      type: 'comparematrix',
      col: 10,
      delay: 1600,
      id: 'comparematrix',
      props: {
        title: 'Market vs mixed vs command economies',
        icon: 'table',
        iconColor: 'var(--presence)',
        caption: 'Three ways to organize an economy',
        cols: ['Market', 'Mixed', 'Command'],
        rows: [
          {
            label: 'Who owns production',
            cells: [
              { value: 'Private individuals' },
              { value: 'Mostly private, some state' },
              { value: 'The state' },
            ],
          },
          {
            label: 'Private property',
            cells: [{ kind: 'yes' }, { kind: 'partial' }, { kind: 'no' }],
          },
          {
            label: 'Prices set by',
            cells: [
              { value: 'Supply & demand' },
              { value: 'Markets + regulation' },
              { value: 'Central planners' },
            ],
          },
          {
            label: 'Degree of state control',
            cells: [
              { kind: 'rating', value: 1 },
              { kind: 'rating', value: 3 },
              { kind: 'rating', value: 5 },
            ],
          },
          {
            label: 'A real example',
            cells: [
              { value: 'Hong Kong', note: 'historically' },
              { value: 'Most countries today' },
              { value: 'The Soviet economy' },
            ],
          },
        ],
        footer:
          'Real economies sit on a spectrum — the <strong>mixed</strong> column is where almost every country actually lives.',
      },
    },

    // ── toulmin: the six roles of a full argument (the canonical Toulmin illustration) ──
    {
      type: 'toulmin',
      col: 10,
      id: 'lookup-toulmin',
      delay: 400,
      props: {
        title: 'Toulmin Analysis',
        icon: 'proof',
        iconColor: 'var(--presence)',
        claim: 'Harry is a British citizen.',
        grounds: 'Harry was born in Bermuda.',
        warrant: 'A person born in Bermuda is generally a British citizen.',
        backing:
          'On account of the British Nationality Acts and the statutes governing citizenship by birth in British territories.',
        qualifier: 'presumably',
        rebuttal:
          'both his parents were foreign nationals, or he has since formally renounced his citizenship.',
        footer: 'The classic worked example from Toulmin’s <em>The Uses of Argument</em> (1958).',
      },
    },

    // ── etymtree: origin tree for the word "disaster" ──
    {
      type: 'etymtree',
      col: 8,
      id: 'lookup-etymtree',
      delay: 500,
      props: {
        word: 'disaster',
        roots: [
          { form: '*ster-', lang: 'Proto-Indo-European', gloss: 'star' },
          { form: 'astrum', lang: 'Latin', gloss: 'star' },
          { form: 'disastro', lang: 'Italian', gloss: 'ill-starred event' },
        ],
        descendants: [
          { form: 'disastrous', lang: 'English', gloss: 'causing disaster' },
          { form: 'désastre', lang: 'French', gloss: 'catastrophe' },
        ],
        note: 'From the belief that calamities were caused by unfavourable star positions.',
      },
    },
    {
      type: 'rollcall',
      col: 9,
      id: 'lookup-rollcall',
      delay: 720,
      props: {
        title: 'Latest: how the vote went',
        icon: 'chart',
        iconColor: 'var(--presence)',
        bill: 'H.R. 4521, Infrastructure Modernization Act',
        legislators: [
          { name: 'A. Reyes', party: 'D', vote: 'yea' },
          { name: 'B. Whitfield', party: 'R', vote: 'nay' },
          { name: 'C. Okafor', party: 'D', vote: 'yea' },
          { name: 'D. Larsen', party: 'R', vote: 'yea' },
          { name: 'E. Marsh', party: 'D', vote: 'yea' },
          { name: 'F. Nakamura', party: 'I', vote: 'yea' },
          { name: 'G. Pruitt', party: 'R', vote: 'nay' },
          { name: 'H. Delgado', party: 'D', vote: 'present' },
          { name: 'I. Sato', party: 'R', vote: 'nay' },
          { name: 'J. Kowalski', party: 'D', vote: 'absent' },
        ],
        footer: 'Passed 5–3, with 1 present and 1 absent. Heads to the Senate next.',
      },
    },

    // ── termbase: localization QA — UI string consistency across languages ──
    {
      type: 'termbase',
      col: 10,
      id: 'lookup-termbase',
      delay: 700,
      props: {
        title: 'UI String Consistency Check',
        icon: 'table',
        iconColor: 'var(--presence)',
        terms: [
          {
            term: 'Cancel',
            translations: [
              { lang: 'French', text: 'Annuler', status: 'preferred' },
              { lang: 'German', text: 'Abbrechen', status: 'preferred' },
              { lang: 'Spanish', text: 'Cancelar', status: 'preferred' },
              { lang: 'Japanese', text: 'キャンセル', status: 'preferred' },
            ],
          },
          {
            term: 'Delete Account',
            translations: [
              { lang: 'French', text: 'Supprimer le compte', status: 'preferred' },
              { lang: 'German', text: 'Konto löschen', status: 'preferred' },
              { lang: 'Spanish', text: 'Eliminar cuenta', status: 'preferred' },
              { lang: 'Japanese', text: 'アカウントを削除', status: 'preferred' },
            ],
          },
          {
            term: 'Save Changes',
            translations: [
              { lang: 'French', text: 'Enregistrer les modifications', status: 'preferred' },
              { lang: 'German', text: 'Änderungen speichern', status: 'preferred' },
              { lang: 'Spanish', text: 'Guardar cambios', status: 'preferred' },
              { lang: 'Japanese', text: '変更を保存', status: 'preferred' },
            ],
          },
          {
            term: 'Sign Out',
            translations: [
              { lang: 'French', text: 'Se déconnecter', status: 'preferred' },
              { lang: 'French', text: 'Quitter la session', status: 'deprecated' },
              { lang: 'German', text: 'Abmelden', status: 'preferred' },
              { lang: 'Spanish', text: 'Cerrar sesión', status: 'preferred' },
              { lang: 'Japanese', text: 'サインアウト', status: 'avoid' },
            ],
          },
        ],
        footer:
          'Rows flagged <b>avoid</b> or <b>deprecated</b> carry an older string still live in a few screens, reconcile before the next release.',
      },
    },

    // ── historicalperson: Ada Lovelace, "who was the first programmer" ──
    {
      type: 'historicalperson',
      col: 7,
      id: 'lookup-historicalperson',
      delay: 760,
      props: {
        title: 'Who Was',
        icon: 'doc',
        iconColor: 'var(--presence)',
        name: 'Ada Lovelace',
        era: 'Victorian era',
        born: 'December 10, 1815 — London, England',
        died: 'November 27, 1852 — Marylebone, London',
        knownFor: 'Writing the first algorithm intended for a machine to run',
        facts: [
          { label: 'Father', value: 'Lord Byron, the poet' },
          { label: 'Collaborator', value: 'Charles Babbage' },
          { label: 'Key work', value: '"Notes on the Analytical Engine" (1843)' },
        ],
        lifeEvents: [
          { year: '1815', label: 'Born to Lord Byron and Annabella Milbanke' },
          { year: '1833', label: 'Meets Charles Babbage at age 17' },
          { year: '1843', label: 'Publishes Note G, the Bernoulli-number algorithm' },
          { year: '1852', label: 'Dies at age 36' },
        ],
        legacy:
          'Note G is widely regarded as the first algorithm written for a machine to execute, a century before electronic computers existed. The Ada programming language was named for her in 1980.',
        footer: 'Sources: the Lovelace-Babbage correspondence, Somerville College archives.',
      },
    },

    // ── onthisday: July 20, a date the lookup card's space theme keeps returning to ──
    {
      type: 'onthisday',
      col: 7,
      id: 'lookup-onthisday',
      delay: 820,
      props: {
        title: 'On This Day',
        icon: 'clock',
        iconColor: 'var(--insight)',
        date: 'July 20',
        events: [
          {
            year: 1969,
            label: "Apollo 11's lunar module lands; Armstrong and Aldrin walk on the Moon.",
            category: 'Science',
          },
          {
            year: 1976,
            label: 'Viking 1 becomes the first spacecraft to land successfully on Mars.',
            category: 'Science',
          },
          {
            year: 1944,
            label: "Claus von Stauffenberg's bomb fails to kill Hitler at the Wolf's Lair.",
            category: 'War',
          },
        ],
        born: [{ year: 1919, name: 'Edmund Hillary, first to summit Mount Everest' }],
        died: [{ year: 1937, name: 'Guglielmo Marconi, inventor of radio' }],
        footer: 'A date the space program keeps returning to, seven years apart.',
      },
    },

    // ── countrycard: Japan, pairing with the Japanese translation above ──
    {
      type: 'countrycard',
      col: 6,
      id: 'lookup-countrycard',
      delay: 880,
      props: {
        title: 'Country Profile',
        icon: 'globe',
        iconColor: 'var(--presence)',
        name: 'Japan',
        flag: '🇯🇵',
        capital: 'Tokyo',
        population: '123.3 million',
        area: '377,975 km²',
        officialLanguages: ['Japanese'],
        currency: 'Japanese yen (¥)',
        facts: [
          { label: 'Government', value: 'Unitary parliamentary constitutional monarchy' },
          { label: 'Time zone', value: 'JST, UTC+9' },
        ],
        footer: 'Source: national statistics bureau, latest census estimate.',
      },
    },

    // ── worldgrid: neighbors at a glance, alongside the countrycard deep-dive above ──
    {
      type: 'worldgrid',
      col: 7,
      id: 'lookup-worldgrid',
      delay: 940,
      props: {
        title: 'Neighbors at a Glance',
        icon: 'globe',
        iconColor: 'var(--insight)',
        countries: [
          {
            flag: '🇰🇷',
            name: 'South Korea',
            capital: 'Seoul',
            currency: 'Won',
            language: 'Korean',
          },
          {
            flag: '🇨🇳',
            name: 'China',
            capital: 'Beijing',
            currency: 'Renminbi',
            language: 'Mandarin',
          },
          {
            flag: '🇻🇳',
            name: 'Vietnam',
            capital: 'Hanoi',
            currency: 'Đồng',
            language: 'Vietnamese',
          },
          { flag: '🇹🇭', name: 'Thailand', capital: 'Bangkok', currency: 'Baht', language: 'Thai' },
          {
            flag: '🇵🇭',
            name: 'Philippines',
            capital: 'Manila',
            currency: 'Peso',
            language: 'Filipino',
          },
        ],
        footer: 'A compact spread — tap countrycard above for the full profile on any one.',
      },
    },

    // ── warconflict: American Civil War overview ──
    {
      type: 'warconflict',
      col: 8,
      id: 'lookup-warconflict',
      delay: 1000,
      props: {
        title: 'Conflict Overview',
        icon: 'shield',
        iconColor: 'var(--danger)',
        dates: '1861–1865',
        sides: [
          {
            name: 'Union',
            leaders: ['Abraham Lincoln', 'Ulysses S. Grant'],
            color: 'var(--presence)',
          },
          {
            name: 'Confederacy',
            leaders: ['Jefferson Davis', 'Robert E. Lee'],
            color: 'var(--danger)',
          },
        ],
        keyBattles: [
          { label: 'Fort Sumter', at: 'April 1861, South Carolina' },
          { label: 'Antietam', at: 'September 1862, Maryland' },
          { label: 'Gettysburg', at: 'July 1863, Pennsylvania' },
          { label: 'Appomattox Court House', at: 'April 1865, Virginia' },
        ],
        casualties: 'An estimated 620,000–750,000 dead, the deadliest war in U.S. history.',
        outcome:
          'Union victory. The Confederacy was dissolved, slavery was abolished nationwide by the 13th Amendment, and federal authority over the states was firmly established.',
        footer: 'Source: National Park Service, American Battlefield Trust.',
      },
    },

    // ── distinctioncard: the swap test that separates affect / effect / impact ──
    {
      type: 'distinctioncard',
      col: 7,
      id: 'lookup-distinctioncard',
      delay: 1060,
      props: {
        title: 'Affect vs. effect',
        icon: 'proof',
        iconColor: 'var(--presence)',
        terms: [
          {
            term: 'affect',
            tag: 'verb',
            gist: 'To influence or change something.',
            example: 'The drought affected the harvest.',
            color: 'var(--presence)',
          },
          {
            term: 'effect',
            tag: 'noun',
            gist: 'The result that influence produces.',
            example: 'The drought had a lasting effect on the harvest.',
            color: 'var(--insight)',
          },
          {
            term: 'impact',
            tag: 'verb or noun',
            gist: 'Grammatical as both, but it reads as jargon — reach for affect or effect first.',
            example: 'The drought impacted the harvest.',
            color: 'var(--warning)',
          },
        ],
        discriminator:
          'Swap the word for "influence". If the sentence still reads, you want affect; if "result" fits instead, you want effect.',
        discriminatorLabel: 'The swap test',
        commonMistake:
          'Writing "the affects of the drought" — anything you can put "the" in front of is a noun, so it has to be effect.',
        footer:
          'Each word has a rarer second life: <b>affect</b> is a noun in psychology (observable emotion), and <b>effect</b> is a verb meaning to bring something about, as in "effect change".',
      },
    },
  ],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [
    { label: 'Translate another phrase', icon: 'globe', route: 'topic:lookup' },
    { label: 'More JWST news', icon: 'globe', route: 'topic:lookup' },
    { label: 'Explain a coding concept', icon: 'doc', route: 'topic:code' },
  ],
  keywords: [
    {
      test: /\bdefine\b|\bdefinition\b|\bdictionary\b|\btranslate\b|\bpronounce\b|\bfact\s+sheet\b|\bwho\s+is\b|\bwhat\s+is\b|\bglossary\b|\bnews\b|\bnewsdigest\b|\bstacktrace\b|\berror\s+(explain|help|debug)\b/,
      route: 'topic:lookup',
    },
  ],
};
