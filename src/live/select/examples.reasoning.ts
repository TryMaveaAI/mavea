// Agent-trace, calibration, and form block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const REASONING_EXAMPLES: Record<string, Record<string, unknown>> = {
  agenttrace: {
    title: 'Research Strategy',
    icon: 'share',
    iconColor: 'var(--presence)',
    nodes: [
      {
        step: 'Step 1',
        decision: 'Which data sources to consult?',
        branches: [
          {
            label: 'Academic journals only',
            note: 'High credibility, limited scope',
            score: 0.65,
            chosen: false,
          },
          {
            label: 'Mix academic + industry',
            note: 'Balanced coverage',
            score: 0.88,
            color: 'var(--insight)',
            chosen: true,
          },
          {
            label: 'Include social media',
            note: 'Broad but noisy',
            score: 0.42,
            chosen: false,
          },
        ],
      },
      {
        step: 'Step 2',
        decision: 'How deep to search each source?',
        branches: [
          {
            label: 'Shallow scan (top 10 results)',
            score: 0.55,
            chosen: false,
          },
          {
            label: 'Deep dive (top 100)',
            note: 'Comprehensive approach',
            score: 0.92,
            color: 'var(--insight)',
            chosen: true,
          },
        ],
      },
    ],
    footer: 'Two-stage search strategy selected; total confidence 0.90',
  },
  calibration: {
    title: 'Model Calibration Analysis',
    icon: 'chart',
    iconColor: 'var(--presence)',
    color: 'var(--presence)',
    ece: '0.042',
    bins: [
      {
        predicted: 0.1,
        actual: 0.15,
        count: 245,
      },
      {
        predicted: 0.3,
        actual: 0.28,
        count: 189,
      },
      {
        predicted: 0.5,
        actual: 0.52,
        count: 312,
      },
      {
        predicted: 0.7,
        actual: 0.73,
        count: 267,
      },
      {
        predicted: 0.9,
        actual: 0.91,
        count: 198,
      },
    ],
    footer:
      'Dashed diagonal shows perfect calibration · model performs well across confidence ranges',
  },
  formpanel: {
    title: 'Contact Form',
    icon: 'edit',
    iconColor: 'var(--presence)',
    color: 'var(--presence)',
    heading: 'Get in touch',
    fields: [
      {
        key: 'name',
        label: 'Full Name',
        type: 'text',
        placeholder: 'Ada Lovelace',
        value: '',
        required: true,
      },
      {
        key: 'email',
        label: 'Work Email',
        type: 'email',
        placeholder: 'you@company.com',
        value: '',
        required: true,
        hint: "We'll never share it",
      },
      {
        key: 'role',
        label: 'Your Role',
        type: 'select',
        options: ['Engineer', 'Designer', 'Product Manager', 'Founder'],
        value: 'Engineer',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: "Tell us what's on your mind...",
        value: '',
      },
    ],
    submitLabel: 'Send Message',
    success: "Thanks for reaching out — we'll reply soon.",
    footer: 'Response usually within 24 hours',
  },
};
