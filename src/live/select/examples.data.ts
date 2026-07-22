// Tabular and matrix block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const DATA_EXAMPLES: Record<string, Record<string, unknown>> = {
  matrix: {
    title: 'Confusion Matrix — Model A',
    icon: 'table',
    iconColor: 'var(--presence)',
    caption: 'Predicted vs. Actual',
    corner: 'Actual \\ Pred',
    cols: ['Positive', 'Negative'],
    bracket: true,
    rows: [
      {
        label: 'Positive',
        cells: [
          {
            v: 85,
            hot: true,
          },
          {
            v: 15,
          },
        ],
      },
      {
        label: 'Negative',
        cells: [
          {
            v: 10,
          },
          {
            v: 90,
            hot: true,
          },
        ],
      },
    ],
    footer: 'Accuracy: 87.5% — strong diagonal indicating good model fit.',
  },
  datatable: {
    title: 'Sales Pipeline',
    icon: 'table',
    iconColor: 'var(--insight)',
    columns: [
      {
        key: 'account',
        label: 'Account',
        align: 'left',
      },
      {
        key: 'stage',
        label: 'Stage',
        align: 'left',
      },
      {
        key: 'value',
        label: 'Value',
        align: 'right',
        numeric: true,
      },
      {
        key: 'owner',
        label: 'Owner',
        align: 'left',
      },
    ],
    rows: [
      {
        account: 'TechCorp Inc',
        stage: 'Proposal',
        value: '$45,000',
        owner: 'Alex Chen',
      },
      {
        account: 'BuildCo Ltd',
        stage: 'Negotiation',
        value: '$120,000',
        owner: 'Sarah Martinez',
      },
      {
        account: 'DataFlow Systems',
        stage: 'Closing',
        value: '$85,500',
        owner: 'James Park',
      },
      {
        account: 'CloudFirst Co',
        stage: 'Prospecting',
        value: '$12,500',
        owner: 'Emma Wilson',
      },
    ],
    sortKey: 'value',
    sortDir: 'desc',
    searchable: true,
    searchPlaceholder: 'Filter by account, stage, or owner…',
    footer: '4 deals in pipeline — $263k total value.',
  },
  pivot: {
    title: 'Q3 Revenue by Region & Channel',
    icon: 'table',
    iconColor: 'var(--presence)',
    rowGroup: 'Region',
    colHeaders: ['Direct', 'Partner', 'Marketplace'],
    measures: [
      {
        key: 'revenue',
        label: 'Revenue',
        unit: 'k',
        prefix: '$',
      },
      {
        key: 'units',
        label: 'Units',
        unit: '',
        prefix: '',
      },
    ],
    rows: [
      {
        label: 'North America',
        cells: [
          {
            values: {
              revenue: 450,
              units: 2200,
            },
          },
          {
            values: {
              revenue: 320,
              units: 1100,
            },
          },
          {
            values: {
              revenue: 180,
              units: 650,
            },
          },
        ],
      },
      {
        label: 'EMEA',
        cells: [
          {
            values: {
              revenue: 280,
              units: 1400,
            },
          },
          {
            values: {
              revenue: 210,
              units: 900,
            },
          },
          {
            values: {
              revenue: 95,
              units: 320,
            },
          },
        ],
      },
      {
        label: 'APAC',
        cells: [
          {
            values: {
              revenue: 160,
              units: 750,
            },
          },
          {
            values: {
              revenue: 140,
              units: 600,
            },
          },
          {
            values: {
              revenue: 85,
              units: 280,
            },
          },
        ],
      },
    ],
    measure: 0,
    accent: 'var(--insight)',
    footer: 'Toggle between Revenue and Units to analyze mix by region and channel.',
  },
  treetable: {
    title: 'Budget Allocation — FY2025',
    icon: 'layers',
    iconColor: 'var(--presence)',
    valueLabel: 'Budget ($k)',
    accent: 'var(--insight)',
    nodes: [
      {
        label: 'Engineering',
        value: '2400',
        pct: 0.48,
        open: true,
        children: [
          {
            label: 'Platform',
            value: '1200',
            pct: 0.24,
            color: 'var(--insight)',
          },
          {
            label: 'Backend',
            value: '800',
            pct: 0.16,
            color: 'var(--insight)',
          },
          {
            label: 'DevOps',
            value: '400',
            pct: 0.08,
            color: 'var(--presence)',
          },
        ],
      },
      {
        label: 'Product & Design',
        value: '1100',
        pct: 0.22,
        open: false,
        children: [
          {
            label: 'Product Management',
            value: '600',
            pct: 0.12,
          },
          {
            label: 'Design',
            value: '500',
            pct: 0.1,
          },
        ],
      },
      {
        label: 'Sales & Marketing',
        value: '900',
        pct: 0.18,
        open: false,
        children: [
          {
            label: 'Sales',
            value: '550',
            pct: 0.11,
          },
          {
            label: 'Marketing',
            value: '350',
            pct: 0.07,
          },
        ],
      },
      {
        label: 'Operations & Admin',
        value: '600',
        pct: 0.12,
        color: 'var(--text-muted)',
        open: false,
        children: [
          {
            label: 'Finance',
            value: '300',
            pct: 0.06,
          },
          {
            label: 'HR',
            value: '300',
            pct: 0.06,
          },
        ],
      },
    ],
    footer: 'Total FY2025 headcount budget: $5,000k — click to expand departments.',
  },
  matrixgrid: {
    title: 'Feature Correlation Matrix',
    icon: 'table',
    iconColor: 'var(--presence)',
    rowLabels: ['Price', 'Bedrooms', 'Sqft', 'Age', 'Reviews'],
    colLabels: ['Price', 'Bedrooms', 'Sqft', 'Age', 'Reviews'],
    cells: [
      [100, 45, 78, -22, 88],
      [45, 100, 62, 18, 35],
      [78, 62, 100, -15, 72],
      [-22, 18, -15, 100, -8],
      [88, 35, 72, -8, 100],
    ],
    min: -100,
    max: 100,
    accent: 'var(--insight)',
    diagonal: true,
    unit: '%',
    legend: ['Negative', 'Positive'],
    footer: 'Darker cells = stronger correlation. Diagonal always 100% (self-correlation).',
  },
};
