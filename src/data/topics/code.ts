// "Adding dark mode to Settings", a coding-agent walkthrough: weighs three approaches,
// maps the blast radius, runs the tests, shows the diff, and grounds the API against the
// installed react-native before offering to open a draft PR.
import type { ConversationSpec } from '../conversation';

export const code: ConversationSpec = {
  id: 'code',
  workspace: 'Add dark mode',
  title: 'Adding dark mode to Settings',
  sub: "Before I touch anything, here's the whole picture.",
  opener:
    "Five files, one risky one. I'll show what I changed, why, and what it touches, look before you let me run.",
  switchSay: 'On it, let me map the change and the reasoning first.',
  gather: 'Reading your repo + conventions',
  found: "I scoped it and weighed the approaches. Here's the why before the how.",
  tint: '#54c7c0',
  context: [
    { name: 'your-app · main', color: 'var(--insight)' },
    { name: '1,240 files indexed', color: 'var(--presence-soft)' },
    { name: 'ThemeContext.tsx', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'scope',
      num: '1',
      delay: 0,
      props: {
        title: 'Small change, one file to watch',
        stat: '5 files',
        delta: '+1 risky',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Mostly additive. ThemeContext is the one with real blast radius.',
        sources: [{ file: 'your-app', loc: 'main' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'ground',
      num: '2',
      delay: 90,
      prove: true,
      props: {
        title: "The theme API you'll use is real",
        conf: 'strong',
        summary:
          'useColorScheme exists in your version, not a hallucination. I checked the source.',
        sources: [{ file: 'react-native', loc: '0.74' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'risk',
      num: '3',
      delay: 180,
      props: {
        title: 'One test will fail without a tweak',
        conf: 'partial',
        summary: "A snapshot test pins the old light colors. I'll update it in the same change.",
        sources: [{ file: 'CI' }],
      },
    },
    {
      type: 'compare',
      col: 12,
      id: 'approaches',
      delay: 240,
      props: {
        eyebrow: 'How I could build it, and why I picked one',
        options: [
          { name: 'useColorScheme', sub: 'OS-driven hook', pick: true },
          { name: 'Custom theme hook', sub: 'hand-rolled' },
          { name: 'CSS @media only', sub: 'no JS' },
        ],
        criteria: [
          {
            label: 'Respects OS setting',
            cells: [{ v: 'Yes', win: true }, { v: 'Manual' }, { v: 'Yes', win: true }],
          },
          {
            label: 'Manual override',
            cells: [{ v: 'Yes', win: true }, { v: 'Yes', win: true }, { v: 'Hard' }],
          },
          {
            label: 'Uses existing deps',
            cells: [{ v: 'Already in', win: true }, { v: 'New code' }, { v: 'None', win: true }],
          },
          {
            label: 'Lines to change',
            cells: [{ v: '~17', win: true }, { v: '~60' }, { v: '~25' }],
          },
          {
            label: 'Matches your patterns',
            cells: [{ v: 'Yes', win: true }, { v: 'Partly' }, { v: 'No' }],
          },
        ],
        recommendation:
          "<b>Picked useColorScheme.</b> It's already in your dependency tree, respects the OS setting, and keeps the manual override you store in Settings, the fewest moving parts for the same result.",
      },
    },
    {
      type: 'codemap',
      col: 7,
      id: 'map',
      delay: 320,
      props: {
        title: 'Blast radius, what this touches',
        center: 'ThemeContext.tsx',
        nodes: [
          { label: 'SettingsPage.tsx', hot: true, note: 'edited' },
          { label: 'useTheme.ts', hot: true, note: 'edited' },
          { label: 'tokens.css', hot: true, note: '+dark vars' },
          { label: 'App.tsx', note: 'imports, safe' },
          { label: 'Navbar.tsx', note: 'reads theme' },
        ],
        footer: '12 call sites read the theme, none of their signatures change.',
      },
    },
    {
      type: 'checks',
      col: 5,
      id: 'tests',
      delay: 400,
      props: {
        title: 'Tests after the change',
        summary: '23 passed · 1 needs updating · ran in 8.2s',
        items: [
          { name: 'ThemeContext.test', status: 'pass', note: '6 passed' },
          { name: 'SettingsPage.test', status: 'pass', note: '4 passed' },
          { name: 'useTheme.test', status: 'pass', note: '3 passed' },
          { name: 'Navbar.snapshot', status: 'fail', note: 'old colors' },
          { name: 'a11y · contrast', status: 'pass', note: 'AA in both' },
        ],
      },
    },
    {
      type: 'list',
      col: 12,
      id: 'why',
      delay: 460,
      props: {
        title: 'Why I made these calls',
        icon: 'spark',
        iconColor: 'var(--presence-soft)',
        items: [
          '<b>Followed your ThemeProvider pattern</b>, the change lives where every other theme value already does, so a reviewer knows exactly where to look.',
          '<b>Kept the manual override</b> you persist in Settings, so turning on OS dark mode never stomps a choice the user made on purpose.',
          '<b>Fixed the snapshot test in the same commit</b> instead of leaving CI red for the next person.',
          '<b>Left the 12 read sites untouched</b>, no signature changes means no ripple, trivial to review and to revert.',
        ],
      },
    },
    {
      type: 'diff',
      col: 12,
      id: 'diff',
      delay: 520,
      props: {
        title: 'The diff',
        file: 'src/theme/ThemeContext.tsx',
        add: 14,
        del: 3,
        lines: [
          {
            t: 'ctx',
            c: '<span class="k">import</span> { useColorScheme } <span class="k">from</span> <span class="s">"react-native"</span>;',
          },
          { t: 'ctx', c: '' },
          { t: 'ctx', c: '<span class="k">export function</span> ThemeProvider({ children }) {' },
          { t: 'del', c: '  <span class="k">const</span> theme = lightTheme;' },
          { t: 'add', c: '  <span class="k">const</span> scheme = useColorScheme();' },
          {
            t: 'add',
            c: '  <span class="k">const</span> theme = scheme === <span class="s">"dark"</span> ? darkTheme : lightTheme;',
          },
          { t: 'ctx', c: '  <span class="k">return</span> (' },
          { t: 'ctx', c: '    <ThemeCtx.Provider value={theme}>' },
          { t: 'add', c: '    {<span class="c">/* persists the user override */</span>}' },
          { t: 'ctx', c: '      {children}' },
          { t: 'ctx', c: '    </ThemeCtx.Provider>' },
          { t: 'ctx', c: '  );' },
        ],
        footer: 'Reads the OS setting, with a manual override you already store in Settings.',
      },
    },
    {
      type: 'componentapi',
      col: 10,
      delay: 520,
      id: 'componentapi',
      props: {
        title: 'Button API',
        icon: 'sliders',
        iconColor: 'var(--insight)',
        component: '<Button>',
        props: [
          {
            name: 'variant',
            type: "'primary' | 'ghost' | 'danger'",
            required: false,
            default: "'primary'",
            desc: 'Visual style of the button.',
          },
          {
            name: 'size',
            type: "'sm' | 'md' | 'lg'",
            required: false,
            default: "'md'",
            desc: 'Controls padding and font size.',
          },
          {
            name: 'onClick',
            type: '(e: MouseEvent) => void',
            required: true,
            desc: 'Handler fired when the button is pressed.',
          },
          {
            name: 'disabled',
            type: 'boolean',
            required: false,
            default: 'false',
            desc: 'Greys out the button and blocks clicks.',
          },
          {
            name: 'children',
            type: 'ReactNode',
            required: true,
            desc: 'The button label or contents.',
          },
        ],
        footer: 'Only onClick and children are required, everything else has a sensible default.',
      },
    },
    {
      type: 'terminal',
      col: 6,
      id: 'run',
      delay: 360,
      props: {
        title: 'Ran it locally',
        prompt: '~/your-app %',
        lines: [
          { kind: 'command', text: 'pnpm test ThemeContext' },
          { kind: 'stdout', text: '✓ reads OS color scheme (12 ms)' },
          { kind: 'stdout', text: '✓ user override beats system (9 ms)' },
          { kind: 'stderr', text: '✕ snapshot: Settings pins the old light colors' },
          { kind: 'comment', text: 'expected — the snapshot still has the pre-dark palette' },
          { kind: 'command', text: 'pnpm test -u ThemeContext' },
          { kind: 'stdout', text: '✓ 23 passed · 1 snapshot updated' },
        ],
        exitCode: 0,
        caption: 'Green after updating the one snapshot that pinned the old colors.',
      },
    },
    {
      type: 'logstream',
      col: 6,
      id: 'logs',
      delay: 450,
      props: {
        title: 'Dev server while toggling theme',
        entries: [
          {
            time: '12:04:01.118',
            level: 'info',
            source: 'vite',
            message: 'hmr update /src/theme/ThemeContext.tsx',
          },
          {
            time: '12:04:01.204',
            level: 'debug',
            source: 'theme',
            message: 'colorScheme: light → dark (source: OS)',
          },
          {
            time: '12:04:01.205',
            level: 'info',
            source: 'theme',
            message: 'applied 14 dark tokens',
          },
          {
            time: '12:04:01.260',
            level: 'warn',
            source: 'a11y',
            message: 'contrast 4.3:1 on .muted text — below AA for small text',
          },
          {
            time: '12:04:02.010',
            level: 'debug',
            source: 'theme',
            message: 'user override set: forced light',
          },
          {
            time: '12:04:05.442',
            level: 'error',
            source: 'settings',
            message: 'Cannot read scheme of undefined (the pre-fix path)',
          },
        ],
        caption: 'One real a11y warning to chase: muted text drops below AA in dark.',
      },
    },
  ],
  proof: {
    spotId: 'ground',
    say: "Here's the exact API in your installed version, it's real.",
    claim: 'useColorScheme is a real API in your React Native version',
    conf: 'strong',
    file: { label: 'react-native', type: 'csv', loc: 'node_modules · 0.74' },
    rows: [
      { a: 'useColorScheme', b: 'exported', c: '✓ 0.74', hot: true },
      { a: 'Appearance.get', b: 'exported', c: '✓ 0.74' },
      { a: 'darkTheme token', b: 'your tokens.css', c: 'to add', hot: true },
      { a: 'ThemeCtx', b: 'your code', c: '✓ exists' },
    ],
    note: "I grounded the API against <mark>your installed react-native 0.74</mark>, not my training data, <mark>useColorScheme is real here</mark>, so this won't fail at runtime.",
    assumptions: [
      'Your app already wraps the tree in ThemeProvider.',
      "Dark color tokens don't exist yet, I'll add them to tokens.css.",
    ],
  },
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Opening a PR',
      say: "I'll open a PR, you review before it merges.",
      props: {
        eyebrow: 'Action · pull request',
        icon: 'external',
        title: 'Open PR: “Add dark mode to Settings”',
        lines: [
          { k: 'Branch', v: 'feat/dark-mode → main' },
          { k: 'Includes', v: '5 files, updated snapshot test' },
        ],
        perm: 'Mavéa opens a draft PR. Nothing merges without your review and approval.',
        cta: 'Open draft PR',
        doneText: 'Draft PR opened · waiting for your review',
        mcpId: 'github.openDraftPr',
        fields: [
          { param: 'title', label: 'PR title', value: 'Add dark mode to Settings' },
          { param: 'head', label: 'Branch', value: 'feat/dark-mode' },
          { param: 'base', label: 'Target branch', value: 'main' },
          {
            param: 'body',
            label: 'PR description',
            value:
              'Reads the OS color scheme via useColorScheme, updates one snapshot test. No API changes.',
            multiline: true,
          },
        ],
      },
    },
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Writing the PR',
      say: "Here's the PR description, written for your reviewer.",
      props: {
        kicker: 'PULL REQUEST',
        head: 'Add dark mode to Settings',
        foot: 'Made by Mavéa · draft PR',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Reads the OS color scheme</b> via useColorScheme, with a stored manual override.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Updates one snapshot test</b> that pinned the old light palette.',
          },
          {
            color: 'var(--presence)',
            text: '<b>No API changes</b>, the 12 components that read the theme are untouched.',
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'Add dark mode to Settings', route: 'topic:code' },
  suggests: [
    { label: 'Why did you build it this way?', icon: 'proof', route: 'code:why', lead: 'Try' },
    { label: 'What does this touch?', icon: 'layers', route: 'code:map' },
    { label: 'Show me the diff', icon: 'edit', route: 'code:diff' },
    { label: 'Did anything break?', icon: 'check', route: 'code:tests' },
    { label: 'Open a PR', icon: 'external', route: 'send' },
  ],
  intents: {
    map: {
      kind: 'spotlight',
      spotId: 'map',
      say: 'It touches five files. ThemeContext is the one to watch.',
    },
    why: {
      kind: 'spotlight',
      spotId: 'approaches',
      say: "I weighed three approaches. useColorScheme wins, it's already in your deps and keeps your override.",
    },
    diff: {
      kind: 'spotlight',
      spotId: 'diff',
      say: "Here's the exact diff, reads the OS scheme, keeps your override.",
    },
    tests: {
      kind: 'spotlight',
      spotId: 'tests',
      say: "23 pass. One snapshot needs the new colors, I'll update it.",
    },
  },
  keywords: [
    {
      test: /code|coding|feature|bug|function|api|refactor|dark mode|pull request|\bpr\b|diff|repo|deploy|component|test/,
      route: 'topic:code',
      sub: [
        { test: /why|reason|rationale|tradeoff|approach|decide|choose/, route: 'code:why' },
        { test: /touch|blast|impact|affect|break|map|depend/, route: 'code:map' },
        { test: /diff|change|show me the code|what did you/, route: 'code:diff' },
        { test: /test|broke|break|ci|pass/, route: 'code:tests' },
        { test: /sure|real|hallucin|exist|prove|ground/, route: 'prove' },
        { test: /pr|pull request|ship|open/, route: 'send' },
      ],
    },
  ],
};
