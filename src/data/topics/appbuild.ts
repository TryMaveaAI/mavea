// appbuild.ts, "Design the UI for my new SaaS dashboard." Mavéa walks through the app
// shell it would build for Northwind Analytics: the global navbar, the grouped sidebar,
// the breadcrumb trail, a megamenu + menubar + toolbar, the ⌘K palette and command bar,
// the file treeview, mobile bottom nav, results pagination, and the overlay layer
// (modal, drawer, ⌘K), a full product-design walkthrough of every navigation surface.
// Showcases the nav + overlays families: navbar, sidenav, breadcrumb, pagination,
// menubar, megamenu, toolbar, commandbar, treeview, bottomnav, modal, drawer, commandk.
import type { ConversationSpec } from '../conversation';

export const appbuild: ConversationSpec = {
  id: 'appbuild',
  workspace: 'Product design',
  title: 'The app shell for your SaaS dashboard',
  sub: 'Every navigation surface, top bar to ⌘K, laid out before a line of code.',
  opener:
    "Here's the shell I'd build for Northwind Analytics: one calm top bar, a grouped sidebar, and a ⌘K palette so power users never touch the mouse. Let me walk you through each surface.",
  switchSay: "Let's design your dashboard.",
  gather: 'Sketching the navigation · wiring the shell',
  found: "I designed every nav surface, here's the shape of the app.",
  tint: '#7c9cff',
  context: [
    { name: 'Northwind Analytics', color: 'var(--presence)' },
    { name: 'Brand · indigo', color: 'var(--insight)' },
    { name: 'Roles · admin + viewer', color: 'var(--presence-soft)' },
    { name: 'Target · desktop + mobile', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative: two insight blocks ──
    {
      type: 'insight',
      col: 8,
      id: 'shell',
      num: '1',
      delay: 0,
      props: {
        title: 'One shell, three navigation tiers, global, sectional, and command',
        stat: '13 surfaces',
        delta: 'one consistent grammar',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'The top <b>navbar</b> holds identity and search; the <b>sidebar</b> owns sections; the <b>⌘K palette</b> owns speed. Everything else, breadcrumbs, menus, toolbars, hangs off those three.',
        sources: [{ file: 'design-system.fig', loc: 'shell frame' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'speed',
      num: '2',
      delay: 80,
      props: {
        title: 'Keyboard-first, so daily users fly',
        stat: '⌘K',
        delta: 'every action, two keystrokes away',
        deltaDir: 'good',
        conf: 'partial',
        summary:
          'A command palette plus a contextual command bar means the heaviest workflows never need a mouse, the dashboard rewards return visits.',
        sources: [{ file: 'usability notes', loc: 'power-user track' }],
      },
    },

    // ════════ TIER 1, GLOBAL CHROME ════════
    {
      type: 'navbar',
      col: 12,
      delay: 160,
      id: 'topbar',
      props: {
        title: 'The global top bar',
        icon: 'layers',
        iconColor: 'var(--insight)',
        brand: 'Northwind',
        brandIcon: 'spark',
        links: [
          { label: 'Overview', icon: 'chart' },
          { label: 'Reports', icon: 'doc', badge: 4 },
          { label: 'Sources', icon: 'globe' },
          { label: 'Alerts', icon: 'bell', badge: 2 },
        ],
        active: 0,
        searchPlaceholder: 'Search dashboards, metrics, people…',
        avatar: 'AM',
        color: 'var(--insight)',
        footer: 'Identity left, search center, you right, the same on every screen.',
      },
    },
    {
      type: 'sidenav',
      col: 5,
      delay: 240,
      id: 'sidebar',
      props: {
        title: 'The grouped sidebar',
        icon: 'layers',
        iconColor: 'var(--presence-soft)',
        brand: 'Northwind',
        brandIcon: 'spark',
        groups: [
          {
            heading: 'Workspace',
            items: [
              { label: 'Overview', icon: 'chart' },
              { label: 'Reports', icon: 'doc', badge: 4 },
              { label: 'Dashboards', icon: 'layers' },
            ],
          },
          {
            heading: 'Data',
            items: [
              { label: 'Sources', icon: 'globe' },
              { label: 'Pipelines', icon: 'share' },
              { label: 'Alerts', icon: 'bell', badge: 2 },
            ],
          },
          {
            heading: 'Admin',
            items: [
              { label: 'Team', icon: 'share' },
              { label: 'Settings', icon: 'edit' },
            ],
          },
        ],
        active: '0.0',
        color: 'var(--presence)',
        footer: 'Three groups keep the rail scannable, collapse it to icons on small screens.',
      },
    },
    {
      type: 'treeview',
      col: 7,
      delay: 320,
      id: 'tree',
      props: {
        title: 'The reports tree',
        icon: 'doc',
        iconColor: 'var(--insight)',
        nodes: [
          {
            label: 'Reports',
            open: true,
            children: [
              {
                label: 'Revenue',
                open: true,
                children: [
                  { label: 'MRR by plan', meta: 'live' },
                  { label: 'Churn cohort', meta: '2d ago' },
                  { label: 'Expansion', meta: '1w ago' },
                ],
              },
              {
                label: 'Product',
                children: [
                  { label: 'Activation funnel', meta: 'live' },
                  { label: 'Feature usage', meta: '4h ago' },
                ],
              },
              { label: 'Exec summary', icon: 'proof', meta: 'pinned' },
            ],
          },
          {
            label: 'Drafts',
            children: [{ label: 'Q3 board deck', meta: 'wip' }],
          },
        ],
        selected: 'MRR by plan',
        color: 'var(--insight)',
        footer: 'Expand-collapse with nesting, the same tree powers the move-to picker.',
      },
    },
    {
      type: 'breadcrumb',
      col: 12,
      delay: 400,
      props: {
        title: 'Where you are, always',
        icon: 'chevR',
        iconColor: 'var(--text-muted)',
        items: [
          { label: 'Workspace', icon: 'layers' },
          { label: 'Reports', icon: 'doc' },
          { label: 'Revenue' },
          { label: 'MRR by plan' },
        ],
        maxVisible: 4,
        color: 'var(--presence-soft)',
        footer: 'Every crumb is clickable; a long trail collapses to a “…” overflow menu.',
      },
    },

    // ════════ TIER 2, MENUS, TOOLBARS, COMMANDS ════════
    {
      type: 'menubar',
      col: 6,
      delay: 480,
      id: 'menubar',
      props: {
        title: 'The application menu bar',
        icon: 'edit',
        iconColor: 'var(--presence)',
        menus: [
          {
            label: 'File',
            entries: [
              { label: 'New report', icon: 'plus', shortcut: '⌘N' },
              { label: 'Open…', icon: 'doc', shortcut: '⌘O', divider: true },
              { label: 'Export PDF', icon: 'export', shortcut: '⌘E' },
              { label: 'Print', icon: 'doc', shortcut: '⌘P', disabled: true },
            ],
          },
          {
            label: 'Edit',
            entries: [
              { label: 'Undo', icon: 'undo', shortcut: '⌘Z' },
              { label: 'Redo', shortcut: '⇧⌘Z', divider: true },
              { label: 'Find in report', icon: 'eye', shortcut: '⌘F' },
            ],
          },
          {
            label: 'View',
            entries: [
              { label: 'Toggle sidebar', icon: 'layers', shortcut: '⌘\\' },
              { label: 'Dark mode', icon: 'moon', shortcut: '⌘D' },
              { label: 'Full screen', icon: 'screen', shortcut: '⌃⌘F' },
            ],
          },
        ],
        color: 'var(--presence)',
        footer: 'Familiar File / Edit / View, click a title to drop its menu with shortcuts.',
      },
    },
    {
      type: 'toolbar',
      col: 6,
      delay: 560,
      id: 'toolbar',
      props: {
        title: 'The report-editor toolbar',
        icon: 'edit',
        iconColor: 'var(--insight)',
        groups: [
          {
            buttons: [
              { icon: 'chart', label: 'Add chart' },
              { icon: 'table', label: 'Add table' },
              { icon: 'image', label: 'Add image' },
            ],
          },
          {
            buttons: [
              { icon: 'edit', label: 'Bold', toggle: true, on: true },
              { icon: 'quote', label: 'Quote', toggle: true },
              { icon: 'link', label: 'Link', toggle: true },
            ],
          },
          {
            buttons: [
              { icon: 'undo', label: 'Undo' },
              { icon: 'share', label: 'Share' },
              { icon: 'export', label: 'Export' },
            ],
          },
        ],
        color: 'var(--insight)',
        footer: 'Grouped icon buttons with dividers, toggles stay pressed like Bold.',
      },
    },
    {
      type: 'megamenu',
      col: 12,
      delay: 640,
      id: 'mega',
      props: {
        title: 'The “Sources” mega-menu',
        icon: 'globe',
        iconColor: 'var(--presence-soft)',
        tabs: ['Overview', 'Sources', 'Templates', 'Pricing'],
        trigger: 1,
        columns: [
          {
            heading: 'Databases',
            links: [
              { label: 'PostgreSQL', icon: 'layers', desc: 'Live sync every 5 min' },
              { label: 'BigQuery', icon: 'layers', desc: 'Warehouse-scale queries' },
              { label: 'Snowflake', icon: 'layers', desc: 'Cost-aware reads', badge: 'New' },
            ],
          },
          {
            heading: 'SaaS apps',
            links: [
              { label: 'Stripe', icon: 'cart', desc: 'Revenue + subscriptions' },
              { label: 'Salesforce', icon: 'share', desc: 'Pipeline + accounts' },
              { label: 'HubSpot', icon: 'mail', desc: 'Marketing funnels' },
            ],
          },
          {
            heading: 'Files',
            links: [
              { label: 'Google Sheets', icon: 'table', desc: 'Schedule a refresh' },
              { label: 'CSV upload', icon: 'upload', desc: 'Drag-and-drop import' },
            ],
          },
        ],
        promoTitle: '60+ connectors',
        promoCopy: 'Most teams are live in <b>under ten minutes</b>, no engineering needed.',
        color: 'var(--presence-soft)',
        footer: 'Hover “Sources” to open a three-column panel with a promo rail.',
      },
    },
    {
      type: 'commandbar',
      col: 7,
      delay: 720,
      id: 'cmdbar',
      props: {
        title: 'The bulk-action command bar',
        icon: 'check',
        iconColor: 'var(--presence)',
        noun: 'report',
        totalItems: 6,
        selected: 3,
        rows: [
          { label: 'MRR by plan', meta: 'Revenue · live', icon: 'chart' },
          { label: 'Churn cohort', meta: 'Revenue · 2d ago', icon: 'table' },
          { label: 'Activation funnel', meta: 'Product · live', icon: 'chart' },
          { label: 'Feature usage', meta: 'Product · 4h ago', icon: 'doc' },
          { label: 'Exec summary', meta: 'Pinned', icon: 'proof' },
          { label: 'Q3 board deck', meta: 'Draft', icon: 'slides' },
        ],
        actions: [
          { label: 'Move', icon: 'share' },
          { label: 'Export', icon: 'export' },
          { label: 'Share', icon: 'mail' },
          { label: 'Delete', icon: 'x', danger: true },
        ],
        color: 'var(--presence)',
        footer: 'Select rows and a contextual bar rises with the actions for that selection.',
      },
    },
    {
      type: 'pagination',
      col: 5,
      delay: 800,
      id: 'pager',
      props: {
        title: 'Paging the results table',
        icon: 'table',
        iconColor: 'var(--insight)',
        total: 24,
        page: 3,
        siblings: 1,
        unitLabel: 'reports',
        perPage: 20,
        color: 'var(--insight)',
        footer: 'First / prev, numbered pages with an ellipsis, next / last, the live page tracks.',
      },
    },

    // ════════ TIER 3, OVERLAYS & MOBILE ════════
    {
      type: 'commandk',
      col: 7,
      delay: 880,
      id: 'palette',
      props: {
        title: 'The ⌘K command palette',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        trigger: 'Open command palette',
        triggerIcon: 'sparkle',
        description: 'One palette to jump anywhere or run any action, the keyboard-first core.',
        placeholder: 'Type a command or search…',
        groups: [
          {
            label: 'Navigate',
            commands: [
              { label: 'Go to Overview', icon: 'chart', shortcut: 'G O' },
              { label: 'Go to Reports', icon: 'doc', shortcut: 'G R' },
              { label: 'Go to Alerts', icon: 'bell', shortcut: 'G A' },
            ],
          },
          {
            label: 'Create',
            commands: [
              { label: 'New report', icon: 'plus', shortcut: '⌘N', hint: 'Blank or from template' },
              { label: 'Connect a source', icon: 'globe', hint: '60+ connectors' },
            ],
          },
          {
            label: 'Account',
            commands: [
              { label: 'Toggle dark mode', icon: 'moon', shortcut: '⌘D' },
              { label: 'Sign out', icon: 'lock', danger: true },
            ],
          },
        ],
        color: 'var(--insight)',
      },
    },
    {
      type: 'modal',
      col: 5,
      delay: 960,
      id: 'newreport',
      props: {
        title: 'The “New report” dialog',
        icon: 'plus',
        iconColor: 'var(--presence)',
        trigger: 'New report',
        triggerIcon: 'plus',
        description: 'A focused, centered dialog for the one decision that starts everything.',
        heading: 'Create a new report',
        body: 'Pick a starting point. You can switch the data source and layout any time, nothing here is permanent.<br/><br/>Blank canvas, or seed it from the <b>Revenue template</b>?',
        confirm: 'Create report',
        cancel: 'Cancel',
        color: 'var(--presence)',
      },
    },
    {
      type: 'drawer',
      col: 6,
      delay: 1040,
      id: 'inspector',
      props: {
        title: 'The right-side inspector drawer',
        icon: 'eye',
        iconColor: 'var(--insight)',
        trigger: 'Open inspector',
        triggerIcon: 'eye',
        description: 'Slides in from the right for details, without losing your place on the page.',
        heading: 'MRR by plan',
        subhead: 'Revenue · updated live',
        rows: [
          { label: 'Owner', value: 'John S.', icon: 'share' },
          { label: 'Source', value: 'Stripe', icon: 'cart' },
          { label: 'Refresh', value: 'Every 5 min', icon: 'clock' },
          { label: 'Visibility', value: 'Team · 12 people', icon: 'globe' },
          { label: 'Last edited', value: '2 days ago', icon: 'edit' },
          { label: 'Format', value: 'Currency · USD', icon: 'chart' },
        ],
        confirm: 'Save changes',
        cancel: 'Close',
        color: 'var(--insight)',
      },
    },
    {
      type: 'bottomnav',
      col: 6,
      delay: 1120,
      id: 'mobile',
      props: {
        title: 'The mobile bottom nav',
        icon: 'screen',
        iconColor: 'var(--presence-soft)',
        tabs: [
          { label: 'Home', icon: 'chart' },
          { label: 'Reports', icon: 'doc', badge: 4 },
          { label: 'Alerts', icon: 'bell', badge: 2 },
          { label: 'You', icon: 'share' },
        ],
        active: 0,
        screens: [
          'Home, your KPIs at a glance',
          'Reports, every dashboard, paged',
          'Alerts, 2 thresholds tripped',
          'You, account & preferences',
        ],
        color: 'var(--presence-soft)',
        footer: 'On phones the sidebar folds into four thumb-reach tabs with live badges.',
      },
    },

    // ── closing: the screens the shell wraps ──
    {
      type: 'screenmap',
      col: 12,
      delay: 1200,
      id: 'screens',
      props: {
        title: 'The screens this shell wraps',
        screens: [
          { name: 'Overview', kind: 'dashboard' },
          { name: 'Reports', kind: 'table' },
          { name: 'Pipelines', kind: 'board' },
          { name: 'Report detail', kind: 'detail' },
          { name: 'Alerts', kind: 'list' },
        ],
        footer: 'Same chrome, five layouts, the navigation makes them feel like one product.',
      },
    },
    {
      type: 'wireframe',
      col: 8,
      id: 'wireframe',
      delay: 120,
      props: {
        title: 'Landing page — before a line of code',
        icon: 'screen',
        iconColor: 'var(--presence-soft)',
        cols: 12,
        regions: [
          { kind: 'header', label: 'Top bar', col: 12, rows: 1 },
          { kind: 'hero', label: 'Hero', col: 12, rows: 3 },
          { kind: 'card', label: 'Feature', col: 4, rows: 2 },
          { kind: 'card', label: 'Feature', col: 4, rows: 2 },
          { kind: 'card', label: 'Feature', col: 4, rows: 2 },
          { kind: 'button', label: 'Get started', col: 12, rows: 1 },
          { kind: 'footer', label: 'Footer', col: 12, rows: 2 },
        ],
        caption: 'Above the fold → three feature cards → one clear call to action.',
        footer: 'Low-fi on purpose — settle structure first, polish pixels later.',
      },
    },
  ],

  proof: null,

  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the brief',
      say: "Here's a one-slide summary of the app shell.",
      props: {
        kicker: 'PRODUCT DESIGN · NORTHWIND SHELL',
        head: 'Three nav tiers, thirteen surfaces, one grammar',
        foot: 'Designed by Mavéa · desktop + mobile',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Global chrome</b>, navbar, sidebar, breadcrumb, and reports tree.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Menus & commands</b>, menubar, toolbar, megamenu, command bar, pagination.',
          },
          {
            color: 'var(--presence-soft)',
            text: '<b>Overlays & mobile</b>, ⌘K palette, modal, drawer, and a four-tab bottom nav.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll open a draft PR with the scaffolded shell.",
      props: {
        eyebrow: 'Action · pull request',
        icon: 'external',
        title: 'Open PR: “Scaffold the Northwind app shell”',
        lines: [
          { k: 'Branch', v: 'scaffold/northwind-shell → main' },
          { k: 'Includes', v: '13 nav components · 5 screens' },
        ],
        perm: 'Mavéa opens a draft PR. Nothing merges without your review and approval.',
        cta: 'Open draft PR',
        doneText: 'Draft PR opened · waiting for your review',
        mcpId: 'github.openDraftPr',
        fields: [
          { param: 'title', label: 'PR title', value: 'Scaffold the Northwind app shell' },
          { param: 'head', label: 'Branch', value: 'scaffold/northwind-shell' },
          { param: 'base', label: 'Target branch', value: 'main' },
          {
            param: 'body',
            label: 'PR description',
            value: 'React + TypeScript starter: 13 nav components, 5 screens, ⌘K palette.',
            multiline: true,
          },
        ],
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: "Here's a 20-second tour of the navigation.",
      props: {
        line: '“I asked Mavéa to design my SaaS dashboard. It laid out every navigation surface, top bar to ⌘K palette, as a living shell in 20 seconds.”',
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'Design my SaaS dashboard UI', route: 'topic:appbuild' },
  suggests: [
    { label: 'Open the ⌘K palette', icon: 'sparkle', route: 'appbuild:palette', lead: 'Try' },
    { label: 'Show the mobile shell', icon: 'screen', route: 'appbuild:mobile' },
    { label: 'Make it a one-slide brief', icon: 'slides', route: 'slide' },
    { label: 'Scaffold the shell', icon: 'layers', route: 'send' },
    { label: 'Clip a 20-second tour', icon: 'play', route: 'replay' },
  ],
  intents: {
    palette: {
      kind: 'spotlight',
      spotId: 'palette',
      say: 'This ⌘K palette is the keyboard-first heart of the app, every action lives here.',
    },
    mobile: {
      kind: 'spotlight',
      spotId: 'mobile',
      say: 'On phones, the whole sidebar folds into these four thumb-reach tabs.',
    },
    topbar: {
      kind: 'spotlight',
      spotId: 'topbar',
      say: 'The top bar is the one constant, identity, search, and you, on every screen.',
    },
  },
  keywords: [
    {
      test: /app (shell|ui|design)|design (the |my )?(ui|app|dashboard|navigation|nav)|saas dashboard|navbar|sidebar|command palette|cmd.?k|⌘k|product design|app navigation/i,
      route: 'topic:appbuild',
      sub: [
        {
          test: /palette|cmd.?k|⌘k|keyboard|command/i,
          route: 'appbuild:palette',
        },
        {
          test: /mobile|phone|bottom nav|responsive/i,
          route: 'appbuild:mobile',
        },
      ],
    },
  ],
};
