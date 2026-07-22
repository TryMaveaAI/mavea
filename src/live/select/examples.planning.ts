// Code-listing, tree, and planning/roadmap block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const PLANNING_EXAMPLES: Record<string, Record<string, unknown>> = {
  // Raw code is the preferred form: send the source verbatim in `code` (real newlines) + a `lang`,
  // and Mavéa highlights it with a real grammar. Never pre-tokenize or escape it.
  codeblock: {
    title: 'Initialize the database connection',
    icon: 'doc',
    iconColor: 'var(--presence)',
    lang: 'ts',
    filename: 'db.ts',
    lineNumbers: true,
    highlight: [3],
    code: "import { Pool } from 'pg';\n\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL,\n});\n\nexport default pool;",
    footer: 'Line 3 creates the shared connection pool.',
  },
  treeview: {
    title: 'Project structure',
    icon: 'layers',
    iconColor: 'var(--presence)',
    nodes: [
      {
        label: 'src',
        icon: 'layers',
        open: true,
        children: [
          {
            label: 'components',
            icon: 'layers',
            meta: '8 files',
            children: [
              {
                label: 'Button.tsx',
                icon: 'doc',
                meta: '2.3 KB',
              },
              {
                label: 'Card.tsx',
                icon: 'doc',
                meta: '1.8 KB',
              },
            ],
          },
          {
            label: 'hooks',
            icon: 'layers',
            meta: '4 files',
          },
          {
            label: 'index.ts',
            icon: 'doc',
            meta: '180 B',
          },
        ],
      },
      {
        label: 'public',
        icon: 'layers',
        children: [
          {
            label: 'favicon.ico',
            icon: 'doc',
            meta: '4.2 KB',
          },
        ],
      },
    ],
    selected: 'Button.tsx',
    color: 'var(--presence)',
    footer: 'Click to select; folder icons collapse/expand nested items',
  },
  gantt: {
    title: 'Q2 Product roadmap',
    icon: 'clock',
    iconColor: 'var(--presence)',
    cols: ['Apr 1-7', 'Apr 8-14', 'Apr 15-21', 'Apr 22-28', 'May 1-7', 'May 8-14'],
    tasks: [
      {
        name: 'Design system review',
        start: 0,
        span: 2,
        lane: 'Design',
        pct: 100,
        color: 'var(--insight)',
      },
      {
        name: 'Build component library',
        start: 1,
        span: 3,
        lane: 'Frontend',
        pct: 75,
        dependsOn: 0,
        color: 'var(--presence)',
      },
      {
        name: 'API specification',
        start: 0,
        span: 2,
        lane: 'Backend',
        pct: 100,
        color: 'var(--insight)',
      },
      {
        name: 'Implement endpoints',
        start: 2,
        span: 3,
        lane: 'Backend',
        pct: 45,
        dependsOn: 2,
        color: 'var(--presence)',
      },
      {
        name: 'QA & testing',
        start: 4,
        span: 2,
        lane: 'QA',
        pct: 0,
        detail: 'Begin after frontend and backend are integration-ready',
        color: 'var(--warning)',
      },
    ],
    footer: 'Click task bars to see details; dependencies shown with connector lines',
  },
  goaltree: {
    title: '2024 Strategic objectives',
    icon: 'spark',
    iconColor: 'var(--presence)',
    objectives: [
      {
        name: 'Become the most intuitive design tool',
        owner: 'Design team',
        progress: 68,
        keyResults: [
          {
            label: 'Reduce onboarding time to < 5 min',
            progress: 82,
            target: '5 min (was 12 min)',
            color: 'var(--insight)',
          },
          {
            label: 'Achieve 4.8+ star rating',
            progress: 56,
            target: '4.8 stars (was 4.2)',
          },
          {
            label: 'Win 2 major design awards',
            progress: 50,
            target: '2 awards',
          },
        ],
      },
      {
        name: 'Scale revenue to $10M ARR',
        owner: 'Revenue team',
        progress: 42,
        keyResults: [
          {
            label: 'Land 15 enterprise customers',
            progress: 33,
            target: '15 contracts (have 5)',
          },
          {
            label: 'Grow free tier to 1M users',
            progress: 62,
            target: '1M users (620K today)',
          },
          {
            label: 'Increase NRR to 115%',
            progress: 35,
            target: '115% (currently 102%)',
          },
        ],
      },
      {
        name: 'Build world-class engineering culture',
        owner: 'People team',
        progress: 71,
        keyResults: [
          {
            label: 'Hire 8 senior engineers',
            progress: 75,
            target: '8 hires (6 onboarded)',
          },
          {
            label: 'Achieve 90% eNPS score',
            progress: 68,
            target: '90 eNPS (currently 72)',
          },
          {
            label: 'Launch mentorship program',
            progress: 80,
            target: '10 pairs matched',
          },
        ],
      },
    ],
    footer: 'Click objectives to expand key results and view per-KR progress',
  },
  journeymap: {
    title: 'Customer onboarding journey',
    persona: 'New SaaS user',
    icon: 'user',
    iconColor: 'var(--presence)',
    stages: [
      {
        name: 'Awareness',
        action: 'Search for solution',
        emotion: 0,
        touchpoints: ['Google', 'ProductHunt'],
        opportunity: 'Show pricing early',
      },
      {
        name: 'Signup',
        action: 'Create account',
        emotion: 1,
        touchpoints: ['Website', 'Email'],
        opportunity: 'Reduce form fields',
      },
      {
        name: 'Onboarding',
        action: 'Complete setup',
        emotion: 0,
        touchpoints: ['In-app guide', 'Support chat'],
        opportunity: 'Interactive templates',
      },
      {
        name: 'First success',
        action: 'Run first project',
        emotion: 2,
        touchpoints: ['Dashboard', 'Notification'],
      },
    ],
    footer: 'Track the emotional arc across the entire customer journey',
  },
  milestones: {
    title: 'Project milestones',
    icon: 'clock',
    iconColor: 'var(--presence)',
    milestones: [
      {
        label: 'Kickoff',
        date: 'Jan 15',
        status: 'done',
        detail: 'Team alignment and scope review',
        owner: 'Alice',
      },
      {
        label: 'Design phase',
        date: 'Feb 1',
        status: 'done',
        detail: 'Wireframes and prototypes',
        owner: 'Bob',
      },
      {
        label: 'Development',
        date: 'Mar 1',
        status: 'active',
        detail: 'Core feature implementation',
        owner: 'Charlie',
      },
      {
        label: 'Testing',
        date: 'Apr 15',
        status: 'todo',
        detail: 'QA and bug fixes',
      },
    ],
    footer: 'Track progress across key project phases',
  },
  plandag: {
    title: 'Project task dependencies',
    icon: 'share',
    iconColor: 'var(--presence)',
    nodes: [
      {
        id: 'n1',
        label: 'Requirements',
        col: 0,
        row: 0,
        status: 'done',
        meta: '2 days',
      },
      {
        id: 'n2',
        label: 'Design',
        col: 1,
        row: 0,
        status: 'done',
        meta: '5 days',
      },
      {
        id: 'n3',
        label: 'Frontend',
        col: 1,
        row: 1,
        status: 'active',
        meta: '7 days',
      },
      {
        id: 'n4',
        label: 'Backend',
        col: 1,
        row: 2,
        status: 'active',
        meta: '10 days',
      },
      {
        id: 'n5',
        label: 'Testing',
        col: 2,
        row: 1,
        status: 'todo',
        meta: '3 days',
      },
    ],
    edges: [
      {
        from: 'n1',
        to: 'n2',
      },
      {
        from: 'n2',
        to: 'n3',
      },
      {
        from: 'n2',
        to: 'n4',
      },
      {
        from: 'n3',
        to: 'n5',
      },
      {
        from: 'n4',
        to: 'n5',
      },
    ],
    footer: 'Visual dependency graph with status tracking',
  },
  processflow: {
    title: 'How to deploy',
    icon: 'layers',
    iconColor: 'var(--presence)',
    steps: [
      {
        label: 'Commit changes',
        detail: 'Push to feature branch',
        icon: 'check',
      },
      {
        label: 'Open pull request',
        detail: 'Request review from team lead',
        icon: 'gitlab',
      },
      {
        label: 'Pass tests',
        detail: 'All CI checks must be green',
        icon: 'check',
        branch: 'or fix and recommit',
      },
      {
        label: 'Merge to main',
        detail: 'Squash and merge',
        icon: 'code',
      },
      {
        label: 'Deploy to production',
        detail: 'Runs automated deployment',
        icon: 'rocket',
      },
    ],
    footer: 'Standard deployment workflow',
  },
  roadmap: {
    title: '2024 product roadmap',
    icon: 'table',
    iconColor: 'var(--presence)',
    quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
    lanes: [
      {
        name: 'Frontend',
        accent: 'var(--insight)',
        items: [
          {
            label: 'Dark mode',
            startQ: 0,
            spanQ: 1,
            status: 'done',
            detail: 'Complete theming system',
          },
          {
            label: 'Mobile redesign',
            startQ: 1,
            spanQ: 2,
            status: 'active',
            detail: 'Responsive overhaul',
          },
          {
            label: 'Performance optimization',
            startQ: 3,
            spanQ: 1,
            status: 'todo',
          },
        ],
      },
      {
        name: 'Backend',
        accent: 'var(--presence)',
        items: [
          {
            label: 'Auth system upgrade',
            startQ: 0,
            spanQ: 2,
            status: 'done',
          },
          {
            label: 'API v2',
            startQ: 1,
            spanQ: 3,
            status: 'active',
            detail: 'RESTful redesign',
          },
        ],
      },
      {
        name: 'Data',
        accent: 'var(--warning)',
        items: [
          {
            label: 'Analytics pipeline',
            startQ: 2,
            spanQ: 2,
            status: 'todo',
          },
        ],
      },
    ],
    footer: 'Track features across teams and quarters',
  },
  wizard: {
    title: 'Getting started',
    icon: 'play',
    iconColor: 'var(--presence)',
    activeStep: 0,
    steps: [
      {
        label: 'Choose a template',
        caption: 'Step 1 of 4',
        body: 'Select a starting template or begin from scratch to create your first project.',
        bullets: ['Browse templates', 'Preview designs', 'Start from blank'],
      },
      {
        label: 'Customize settings',
        caption: 'Step 2 of 4',
        body: 'Configure your project name, description, and visibility settings.',
        bullets: ['Name your project', 'Set privacy level', 'Add team members'],
        status: 'todo',
      },
      {
        label: 'Add content',
        caption: 'Step 3 of 4',
        body: 'Import or create content blocks to build your first dashboard.',
        bullets: ['Import data', 'Create visualizations', 'Write descriptions'],
        status: 'todo',
      },
      {
        label: 'Review and publish',
        caption: 'Step 4 of 4',
        body: 'Review your project and publish it to make it live.',
        bullets: ['Verify layout', 'Check all content', 'Publish'],
        status: 'todo',
      },
    ],
    footer: 'Interactive step-through with progress tracking',
  },
};
