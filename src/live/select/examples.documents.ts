// Document, evidence, and annotation block examples (split from authoredExamples.ts; see the
// barrel there for the full rationale). Entries verbatim — do not edit content.
export const DOCUMENT_EXAMPLES: Record<string, Record<string, unknown>> = {
  docview: {
    title: 'Smith et al. Study (2024)',
    icon: 'doc',
    iconColor: 'var(--presence)',
    source: 'Smith_et_al_2024.pdf · 14 pp',
    page: {
      n: 3,
      of: 14,
    },
    blocks: [
      {
        kind: 'h1',
        text: 'Methods',
      },
      {
        kind: 'p',
        text: 'We conducted a randomized controlled trial with 500 participants over 12 weeks.',
      },
      {
        kind: 'p',
        text: 'The primary outcome was measured using standardized instruments.',
        spot: true,
      },
      {
        kind: 'caption',
        text: 'Figure 1: Distribution of baseline characteristics.',
      },
    ],
    note: 'This is the key measurement point—the outcome metric was 0.89 (95% CI).',
    footer: 'See Methods section for full protocol details.',
  },
  pdfreader: {
    title: 'Acme MSA v3 Agreement',
    icon: 'doc',
    iconColor: 'var(--presence)',
    source: 'Acme_MSA_v3.pdf · 18 pp',
    pages: [
      {
        blocks: [
          {
            kind: 'h1',
            text: 'Master Service Agreement',
          },
          {
            kind: 'p',
            text: 'This agreement is entered into as of the date of execution between Acme Inc. and the Client.',
          },
        ],
      },
      {
        blocks: [
          {
            kind: 'h2',
            text: '1. Services',
          },
          {
            kind: 'p',
            text: 'Acme agrees to provide the services described in Schedule A.',
          },
        ],
      },
      {
        blocks: [
          {
            kind: 'h2',
            text: '2. Payment Terms',
          },
          {
            kind: 'p',
            text: 'Invoices are due within 30 days of receipt.',
          },
        ],
      },
    ],
    footer: 'Download or print the full agreement from the button above.',
  },
  annotateddoc: {
    title: 'Legal Review: Contract 2024-07',
    icon: 'doc',
    iconColor: 'var(--presence)',
    docName: 'Contract_v2024_07.docx',
    paragraphs: [
      'This agreement becomes effective upon execution by both parties and continues for a period of one year.',
      'Either party may terminate with 30 days written notice. The termination clause is binding.',
      'All disputes shall be resolved through binding arbitration in the state of Delaware.',
    ],
    highlights: [
      {
        phrase: 'becomes effective upon execution',
        note: 'Key date anchor—execution triggers all obligations.',
        color: 'var(--presence)',
        author: 'Legal',
      },
      {
        phrase: '30 days written notice',
        note: 'Short termination window; consider impact on operations.',
        color: 'var(--warning)',
        author: 'AM',
      },
      {
        phrase: 'binding arbitration',
        note: 'Dispute resolution cost and venue lock; affects appeal options.',
        color: 'var(--danger)',
        author: 'Risk',
      },
    ],
    footer: '3 highlights flagged for executive review.',
  },
  annotcallouts: {
    title: 'UI Layout Annotations',
    icon: 'image',
    iconColor: 'var(--presence)',
    caption: 'Mobile app dashboard with key feature callouts.',
    ratio: 0.5625,
    callouts: [
      {
        x: 50,
        y: 15,
        label: 'Header',
        note: 'Top navigation; 48px height for touch targets.',
        color: 'var(--presence)',
      },
      {
        x: 25,
        y: 45,
        label: 'Sidebar',
        note: 'Collapsible left rail; swipe-to-open on mobile.',
        color: 'var(--insight)',
      },
      {
        x: 75,
        y: 50,
        label: 'Content Area',
        note: 'Main feed; infinite scroll with virtual list.',
        color: 'var(--warning)',
      },
      {
        x: 50,
        y: 90,
        label: 'Bottom Tab Bar',
        note: '5 tabs; active indicator animates on press.',
        color: 'var(--presence)',
      },
    ],
    footer: 'Designed for 375px width; tested on iPhone 12 and larger.',
  },
  citationchain: {
    title: 'Evidence Chain: AI Productivity Impact',
    icon: 'layers',
    iconColor: 'var(--presence)',
    root: {
      label: 'AI tools increase developer productivity by 30%',
      cite: 'McKinsey Q4 2024',
      color: 'var(--presence)',
      strength: 'strong',
      children: [
        {
          label: 'Survey of 500+ engineering teams showed time savings',
          cite: 'McKinsey report',
          strength: 'strong',
          children: [
            {
              label: 'Code generation reduces boilerplate by 40–60%',
              cite: 'Internal measurement',
              strength: 'partial',
            },
            {
              label: 'Debugging time cut in half with AI copilots',
              cite: '3rd-party audit',
              strength: 'strong',
            },
          ],
        },
        {
          label: 'Companies report 25% faster sprint velocity',
          cite: 'Gartner CIO poll',
          color: 'var(--insight)',
          strength: 'partial',
        },
      ],
    },
    footer: '2 sources, 3 claims; drill down to inspect evidence basis.',
  },
  claimgrid: {
    title: 'Fact Check: 2024 Climate Summit Pledges',
    icon: 'table',
    iconColor: 'var(--presence)',
    columns: ['Scientific Evidence', 'Official Verification', 'Implementation Status'],
    rows: [
      {
        claim: 'Net-zero target met by 2050',
        cells: [
          {
            state: 'yes',
            note: 'IPCC models confirm feasibility.',
          },
          {
            state: 'yes',
            note: 'Signed into law Feb 2024.',
          },
          {
            state: 'partial',
            note: 'On track; 60% committed funding released.',
          },
        ],
      },
      {
        claim: 'Renewable energy will exceed 80% by 2035',
        cells: [
          {
            state: 'partial',
            note: 'Depends on policy hold; grid capacity is bottleneck.',
          },
          {
            state: 'yes',
            note: 'Legislation mandates target.',
          },
          {
            state: 'partial',
            note: 'Solar + wind at 65%; hydro/nuclear lag.',
          },
        ],
      },
      {
        claim: 'Carbon credits market will offset 25% of emissions',
        cells: [
          {
            state: 'no',
            note: 'Empirical studies show 15% offset max due to additionality issues.',
          },
          {
            state: 'partial',
            note: 'Draft framework; enforcement unclear.',
          },
          {
            state: 'no',
            note: 'Credit trades stalled in Q3 2024.',
          },
        ],
      },
    ],
    footer: 'Sourced from 12 independent fact-checkers; hover cells for detail.',
  },
  docoutline: {
    title: 'Document Structure',
    icon: 'doc',
    iconColor: 'var(--presence)',
    docName: 'Research_Paper.pdf',
    sections: [
      {
        heading: 'Introduction',
        loc: 'pp. 1–3',
        weight: 25,
        children: [
          {
            heading: 'Background',
            loc: 'p. 1',
            weight: 10,
          },
          {
            heading: 'Problem Statement',
            loc: 'pp. 2–3',
            weight: 15,
          },
        ],
      },
      {
        heading: 'Methods',
        loc: 'pp. 4–7',
        weight: 30,
        children: [
          {
            heading: 'Data Collection',
            loc: 'pp. 4–5',
            weight: 15,
          },
          {
            heading: 'Analysis',
            loc: 'pp. 6–7',
            weight: 15,
          },
        ],
      },
      {
        heading: 'Results',
        loc: 'pp. 8–12',
        weight: 35,
      },
    ],
    activeIndex: 1,
    footer: '18 pages · last updated 2 days ago',
  },
  redline: {
    title: 'Proposal Review',
    icon: 'edit',
    iconColor: 'var(--presence)',
    docName: 'Q2_Roadmap.docx',
    tokens: [
      {
        text: 'The quarterly roadmap focuses on ',
      },
      {
        ins: 'core infrastructure improvements',
        by: 'Alex',
      },
      {
        text: ' and ',
      },
      {
        del: 'experimental features',
        by: 'Jordan',
      },
      {
        ins: 'user-requested enhancements',
        by: 'Jordan',
      },
      {
        text: '. Priority goes to ',
      },
      {
        ins: 'scalability',
        by: 'Morgan',
      },
      {
        text: ' first.',
      },
    ],
    footer: '3 insertions · 1 deletion',
  },
};
