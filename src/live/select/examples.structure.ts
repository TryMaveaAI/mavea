// Hierarchy, graph, and flow visualization block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const STRUCTURE_EXAMPLES: Record<string, Record<string, unknown>> = {
  kanban: {
    title: 'Q3 Product Roadmap — Board View',
    icon: 'layers',
    iconColor: 'var(--presence)',
    stages: [
      {
        name: 'Backlog',
        accent: 'var(--text-muted)',
        cards: [
          {
            id: 'feat-16',
            title: 'Dark mode toggle',
            tag: 'UI',
            tagColor: 'var(--presence-soft)',
            points: 3,
            assignee: 'Jordan Lee',
          },
          {
            id: 'feat-17',
            title: 'API rate limiting',
            tag: 'Backend',
            tagColor: 'var(--warning)',
            points: 5,
          },
          {
            id: 'feat-18',
            title: 'Analytics dashboard',
            tag: 'Product',
            points: 8,
            assignee: 'Maya Patel',
          },
        ],
      },
      {
        name: 'Ready',
        accent: 'var(--insight)',
        cards: [
          {
            id: 'feat-10',
            title: 'User authentication refactor',
            tag: 'Tech Debt',
            tagColor: 'var(--presence)',
            points: 5,
            assignee: 'Chris Morgan',
          },
        ],
      },
      {
        name: 'In Progress',
        accent: 'var(--presence)',
        cards: [
          {
            id: 'feat-11',
            title: 'Search indexing optimization',
            tag: 'Perf',
            tagColor: 'var(--insight)',
            points: 8,
            assignee: 'Alejandro Garcia',
          },
          {
            id: 'feat-12',
            title: 'Email notification system',
            tag: 'Feature',
            tagColor: 'var(--presence)',
            points: 5,
            assignee: 'Sam Chen',
          },
        ],
      },
      {
        name: 'Review',
        accent: 'var(--warning)',
        cards: [
          {
            id: 'feat-13',
            title: 'Mobile responsive tables',
            tag: 'UI',
            tagColor: 'var(--presence-soft)',
            points: 3,
            assignee: 'Jordan Lee',
          },
        ],
      },
      {
        name: 'Done',
        accent: 'var(--insight)',
        cards: [
          {
            id: 'feat-01',
            title: 'Login page redesign',
            tag: 'Shipped',
            tagColor: 'var(--insight)',
            points: 5,
            assignee: 'Maya Patel',
          },
          {
            id: 'feat-02',
            title: 'Export to CSV',
            tag: 'Feature',
            points: 3,
            assignee: 'Chris Morgan',
          },
        ],
      },
    ],
    footer:
      '11 items in flight — 2 blocked waiting for design review. Drag cards left/right to move between stages.',
  },
  bubble: {
    title: 'Company Market Positioning',
    icon: 'chart',
    iconColor: 'var(--presence)',
    xLabel: 'Revenue Growth',
    yLabel: 'Market Share',
    xDomain: [0, 100],
    yDomain: [0, 50],
    categories: [
      {
        name: 'Tech Leader',
        color: 'var(--insight)',
      },
      {
        name: 'Challenger',
        color: 'var(--warning)',
      },
      {
        name: 'Emerging',
        color: 'var(--presence)',
      },
    ],
    points: [
      {
        label: 'Company A',
        x: 75,
        y: 40,
        size: 45,
        cat: 'Tech Leader',
      },
      {
        label: 'Company B',
        x: 55,
        y: 28,
        size: 32,
        cat: 'Challenger',
      },
      {
        label: 'Company C',
        x: 30,
        y: 12,
        size: 18,
        cat: 'Emerging',
      },
      {
        label: 'Our Company',
        x: 62,
        y: 35,
        size: 38,
        cat: 'Challenger',
      },
    ],
    footer: 'Bubble size represents employee count; interactive legend filters by category',
  },
  sunburst: {
    title: 'Company Org Spend Breakdown',
    icon: 'layers',
    iconColor: 'var(--insight)',
    unit: '$',
    root: {
      label: 'Total Company',
      value: 10000,
      color: 'var(--presence)',
      children: [
        {
          label: 'Engineering',
          value: 5000,
          color: 'var(--insight)',
          children: [
            {
              label: 'Backend',
              value: 2500,
              color: 'var(--presence)',
            },
            {
              label: 'Frontend',
              value: 1800,
              color: 'var(--warning)',
            },
            {
              label: 'DevOps',
              value: 700,
              color: 'var(--presence-soft)',
            },
          ],
        },
        {
          label: 'Product',
          value: 3000,
          color: 'var(--warning)',
          children: [
            {
              label: 'Management',
              value: 1500,
              color: 'var(--presence)',
            },
            {
              label: 'Design',
              value: 1000,
              color: 'var(--insight)',
            },
            {
              label: 'Research',
              value: 500,
              color: 'var(--warning)',
            },
          ],
        },
        {
          label: 'Operations',
          value: 2000,
          color: 'var(--presence-soft)',
          children: [
            {
              label: 'Finance',
              value: 1200,
              color: 'var(--presence)',
            },
            {
              label: 'HR',
              value: 600,
              color: 'var(--insight)',
            },
            {
              label: 'Legal',
              value: 200,
              color: 'var(--warning)',
            },
          ],
        },
      ],
    },
    footer: 'Click a ring to drill in; center hub steps back',
  },
  treemap: {
    title: 'Website Disk Usage by Type',
    icon: 'layers',
    iconColor: 'var(--insight)',
    unit: 'GB',
    root: {
      label: 'All Storage',
      value: 500,
      color: 'var(--presence)',
      children: [
        {
          label: 'Videos',
          value: 250,
          color: 'var(--insight)',
          children: [
            {
              label: 'HD',
              value: 180,
              color: 'var(--presence)',
            },
            {
              label: '4K',
              value: 70,
              color: 'var(--warning)',
            },
          ],
        },
        {
          label: 'Images',
          value: 120,
          color: 'var(--warning)',
          children: [
            {
              label: 'Thumbnails',
              value: 40,
              color: 'var(--presence)',
            },
            {
              label: 'Full Resolution',
              value: 80,
              color: 'var(--presence-soft)',
            },
          ],
        },
        {
          label: 'Documents',
          value: 80,
          color: 'var(--presence-soft)',
          children: [
            {
              label: 'PDFs',
              value: 50,
              color: 'var(--presence)',
            },
            {
              label: 'Text',
              value: 30,
              color: 'var(--insight)',
            },
          ],
        },
        {
          label: 'Other',
          value: 50,
          color: 'var(--text-muted)',
          children: [
            {
              label: 'Logs',
              value: 35,
              color: 'var(--presence)',
            },
            {
              label: 'Cache',
              value: 15,
              color: 'var(--warning)',
            },
          ],
        },
      ],
    },
    footer: 'Click a region to drill in; breadcrumb to step back',
  },
  network: {
    title: 'Team Collaboration Graph',
    icon: 'share',
    iconColor: 'var(--presence)',
    layout: 'circle',
    nodes: [
      {
        id: 'alice',
        label: 'Alice (Lead)',
        group: 0,
        weight: 3,
        color: 'var(--insight)',
      },
      {
        id: 'bob',
        label: 'Bob',
        group: 0,
        weight: 2,
        color: 'var(--insight)',
      },
      {
        id: 'carol',
        label: 'Carol',
        group: 1,
        weight: 2,
        color: 'var(--warning)',
      },
      {
        id: 'dave',
        label: 'Dave',
        group: 1,
        weight: 1,
        color: 'var(--warning)',
      },
      {
        id: 'eve',
        label: 'Eve (Design)',
        group: 2,
        weight: 2,
        color: 'var(--presence)',
      },
    ],
    edges: [
      {
        source: 'alice',
        target: 'bob',
        weight: 5,
      },
      {
        source: 'alice',
        target: 'carol',
        weight: 3,
      },
      {
        source: 'bob',
        target: 'eve',
        weight: 2,
      },
      {
        source: 'carol',
        target: 'dave',
        weight: 4,
      },
      {
        source: 'dave',
        target: 'eve',
        weight: 1,
      },
    ],
    footer: 'Hover a node to highlight connections; edge weight reflects interaction frequency',
  },
  sankey: {
    title: 'Customer Journey: Awareness to Purchase',
    icon: 'share',
    iconColor: 'var(--presence)',
    unit: 'Users: ',
    nodes: [
      {
        id: 'awareness_ad',
        label: 'Display Ads',
        layer: 0,
        color: 'var(--insight)',
      },
      {
        id: 'awareness_soc',
        label: 'Social Media',
        layer: 0,
        color: 'var(--warning)',
      },
      {
        id: 'awareness_ref',
        label: 'Referral',
        layer: 0,
        color: 'var(--presence)',
      },
      {
        id: 'visit',
        label: 'Website Visit',
        layer: 1,
        color: 'var(--presence)',
      },
      {
        id: 'signup',
        label: 'Sign Up',
        layer: 2,
        color: 'var(--insight)',
      },
      {
        id: 'trial',
        label: 'Free Trial',
        layer: 3,
        color: 'var(--warning)',
      },
      {
        id: 'purchase',
        label: 'Purchase',
        layer: 4,
        color: 'var(--insight)',
      },
    ],
    links: [
      {
        source: 'awareness_ad',
        target: 'visit',
        value: 1200,
      },
      {
        source: 'awareness_soc',
        target: 'visit',
        value: 800,
      },
      {
        source: 'awareness_ref',
        target: 'visit',
        value: 400,
      },
      {
        source: 'visit',
        target: 'signup',
        value: 1600,
      },
      {
        source: 'signup',
        target: 'trial',
        value: 1200,
      },
      {
        source: 'trial',
        target: 'purchase',
        value: 480,
      },
    ],
    footer: 'Hover a flow or node to trace the path; width indicates throughput',
  },
  orgchart: {
    title: 'Product Team Organization',
    icon: 'share',
    iconColor: 'var(--presence)',
    rootId: 'jane',
    nodes: [
      {
        id: 'jane',
        name: 'Jane (VP Product)',
        role: 'Executive',
        accent: 'var(--insight)',
        children: ['bob', 'carol'],
      },
      {
        id: 'bob',
        name: 'Bob (Senior PM)',
        role: 'Platform',
        accent: 'var(--warning)',
        children: ['dave', 'eve'],
      },
      {
        id: 'carol',
        name: 'Carol (Senior PM)',
        role: 'Growth',
        accent: 'var(--presence)',
        children: ['frank'],
      },
      {
        id: 'dave',
        name: 'Dave',
        role: 'Associate PM',
        accent: 'var(--presence-soft)',
        children: [],
      },
      {
        id: 'eve',
        name: 'Eve',
        role: 'Associate PM',
        accent: 'var(--presence-soft)',
        children: [],
      },
      {
        id: 'frank',
        name: 'Frank',
        role: 'Associate PM',
        accent: 'var(--presence-soft)',
        children: [],
      },
    ],
    footer: 'Expand/collapse branches; accent color per node distinguishes teams',
  },
  decisiontree: {
    title: 'Should we launch the feature?',
    icon: 'share',
    iconColor: 'var(--presence)',
    rootId: 'q1',
    nodes: [
      {
        id: 'q1',
        question: 'Is the feature complete?',
        detail: 'All acceptance criteria met',
        yes: 'q2',
        no: 'blocked1',
      },
      {
        id: 'q2',
        question: 'Have we tested it in production?',
        detail: 'Canary deployment successful',
        yes: 'q3',
        no: 'blocked2',
      },
      {
        id: 'q3',
        question: 'Do we have stakeholder sign-off?',
        yes: 'launch',
        no: 'blocked3',
      },
      {
        id: 'launch',
        outcome: 'Green light — ship it',
        outcomeColor: 'var(--insight)',
      },
      {
        id: 'blocked1',
        outcome: 'Halt — incomplete work',
        outcomeColor: 'var(--danger)',
      },
      {
        id: 'blocked2',
        outcome: 'Delay — test first',
        outcomeColor: 'var(--warning)',
      },
      {
        id: 'blocked3',
        outcome: 'Return to planning',
        outcomeColor: 'var(--warning)',
      },
    ],
    footer: 'Navigate with yes/no buttons; outcomes are decision endpoints',
  },
};
