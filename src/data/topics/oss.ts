// oss.ts, a fictional source-publication strategy exercise. It is not Mavéa's licensing policy;
// the real policy lives in LICENSE/TERMS and the product legal links.
// Enriched: insight + kpi (comparable-launch signal) + compare + bars (adoption over releases) +
// chart (12-mo projection) + timeline (rollout plan) + comparable-launches web + memo slide.
import type { ConversationSpec } from '../conversation';

export const oss: ConversationSpec = {
  id: 'oss',
  workspace: 'Fictional source strategy',
  title: 'Should Northstar publish source under noncommercial terms?',
  sub: 'A fictional exercise in balancing evaluation reach and product control.',
  opener:
    "Source access can improve evaluation and trust. The tradeoff is enforcement and commercial leakage. Here's the fictional scenario.",
  switchSay: "Big strategy call. Let's think it through.",
  gather: 'Looking at comparable launches',
  found: 'Noncommercial source access can widen evaluation while reserving commercial rights.',
  tint: '#9a7cff',
  context: [
    { name: 'Comparable launches', color: 'var(--presence-soft)' },
    { name: 'Our revenue model', color: 'var(--insight)' },
    { name: 'Community signal', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'verdict',
      num: '1',
      delay: 0,
      props: {
        title: 'Publish noncommercial source, keep product control',
        conf: 'inferred',
        summary:
          'Source-available terms can support evaluation while reserving commercialization and code maintenance to the owners.',
        sources: [{ file: 'Our revenue model' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'reach',
      num: '2',
      delay: 90,
      props: {
        title: 'Source access could widen evaluation',
        stat: '10x',
        delta: 'reach',
        deltaDir: 'up',
        conf: 'partial',
        summary: 'This fictional model assumes source visibility increases first-year evaluation.',
        sources: [{ file: 'Comparable launches' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'risk',
      num: '3',
      delay: 180,
      props: {
        title: 'Revenue risk is real but bounded',
        conf: 'partial',
        summary:
          'Noncommercial terms still require clear enforcement, ownership, and brand boundaries.',
        sources: [{ file: 'Our revenue model' }],
      },
    },
    {
      type: 'kpi',
      col: 12,
      delay: 240,
      props: {
        title: 'Fictional year-one source-available scenario',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 4,
        kpis: [
          { val: '24k', label: 'GitHub stars', color: 'var(--insight)' },
          { val: '310', label: 'Issue reports', color: 'var(--presence)' },
          { val: '4.1k', label: 'Forks' },
          { val: '160k', label: 'Installs', color: 'var(--insight)' },
        ],
        footer: 'Medians across five comparable editor + infra launches in their first 12 months.',
      },
    },
    {
      type: 'compare',
      col: 12,
      delay: 300,
      props: {
        eyebrow: 'Private vs. source-available',
        options: [
          { name: 'Keep it closed', sub: 'Status quo' },
          { name: 'Publish noncommercial source', sub: 'Source-available', pick: true },
        ],
        criteria: [
          { label: 'Developer trust', cells: [{ v: 'Limited' }, { v: 'High', win: true }] },
          { label: 'Adoption speed', cells: [{ v: 'Steady' }, { v: 'Much faster', win: true }] },
          {
            label: 'Direct revenue',
            cells: [{ v: 'Fully protected', win: true }, { v: 'Cloud only' }],
          },
          {
            label: 'External feedback',
            cells: [{ v: 'Limited' }, { v: 'Issue reports', win: true }],
          },
          {
            label: 'Code maintenance',
            cells: [
              { v: 'Owners only', win: true },
              { v: 'Owners only', win: true },
            ],
          },
        ],
        recommendation:
          '<b>Publish a reviewed snapshot under noncommercial source-available terms.</b> Reserve commercial and trademark rights, accept issue feedback only, and keep code maintenance with the owners.',
      },
    },
    {
      type: 'fiveforces',
      col: 6,
      delay: 340,
      props: {
        title: 'Why the market is pushing us this way',
        icon: 'chart',
        iconColor: 'var(--warning)',
        industry: 'AI coding assistants',
        forces: [
          {
            id: 'rivalry',
            label: 'Well-funded incumbents',
            strength: 'high',
            note: 'Two capitalized players already own distribution.',
          },
          {
            id: 'newEntrants',
            label: 'New entrants',
            strength: 'high',
            note: 'Foundation-model APIs lower the barrier every quarter.',
          },
          {
            id: 'suppliers',
            label: 'Model API providers',
            strength: 'medium',
            note: 'A handful of frontier labs set the price and the pace.',
          },
          {
            id: 'buyers',
            label: 'Enterprise buyers',
            strength: 'medium',
            note: 'Switching cost is low until data + workflow lock-in builds.',
          },
          {
            id: 'substitutes',
            label: 'General chat LLMs',
            strength: 'high',
            note: 'A generic assistant already covers the easy 80% of asks, free.',
          },
        ],
        footer:
          'Rivalry and substitutes are the two forces working against the fictional company — source visibility is one possible response.',
      },
    },
    {
      type: 'bars',
      col: 6,
      delay: 380,
      props: {
        title: 'Evaluation by release, source-available',
        icon: 'chart',
        iconColor: 'var(--insight)',
        unit: 'k installs',
        goal: 100,
        goalLabel: 'year-one target',
        bars: [
          { label: 'v0.1', value: 8, label2: '8k' },
          { label: 'v0.2', value: 23, label2: '23k', color: 'var(--presence-soft)' },
          { label: 'v0.3', value: 51, label2: '51k', color: 'var(--presence)' },
          { label: 'v0.4', value: 96, label2: '96k', color: 'var(--insight)' },
          { label: 'v1.0', value: 160, label2: '160k', hot: true, color: 'var(--insight)' },
        ],
        footer: 'Each release compounds on the last, v1.0 clears the year-one target by 60%.',
      },
    },
    {
      type: 'chart',
      col: 6,
      delay: 440,
      props: {
        title: 'Projected evaluation, published vs. private (12 mo)',
        unit: '',
        labels: ['M1', 'M3', 'M6', 'M9', 'M12'],
        series: [
          { name: 'Source-available (proj.)', color: 'var(--insight)', data: [2, 14, 48, 92, 160] },
          { name: 'Private (proj.)', color: 'var(--text-muted)', data: [2, 6, 12, 19, 27] },
        ],
        footer:
          'Fictional projection in thousands of evaluations; not a forecast or factual benchmark.',
      },
    },
    {
      type: 'timeline',
      col: 7,
      delay: 500,
      props: {
        eyebrow: 'How we would roll it out',
        title: 'Source-available publication plan',
        events: [
          {
            time: 'Wk 1–2',
            title: 'Carve out the client + schema',
            detail: 'Create a clean snapshot; scrub secrets, history, and internal connectors.',
            color: 'var(--presence)',
          },
          {
            time: 'Wk 3',
            title: 'License + ownership',
            tag: 'legal',
            detail:
              'Confirm ownership, apply noncommercial terms, and publish a feedback-only policy.',
            color: 'var(--presence-soft)',
          },
          {
            time: 'Wk 4',
            title: 'Soft launch to design partners',
            detail: 'A quiet repo for a dozen friendly teams before the noise.',
            color: 'var(--insight)',
          },
          {
            time: 'Wk 6',
            title: 'Public source release',
            tag: 'go live',
            detail:
              'Publish the reviewed snapshot and legal notices; keep the roadmap owner-controlled.',
            color: 'var(--insight)',
          },
        ],
      },
    },
    {
      type: 'web',
      col: 5,
      delay: 560,
      props: {
        title: 'Comparable launches',
        live: true,
        results: [
          {
            domain: 'github.com',
            path: ' · trending',
            color: 'var(--presence)',
            title: 'Fictional comparison set',
            excerpt:
              'This exercise assumes source visibility produces <mark>more first-year evaluation</mark>; the figures are illustrative.',
          },
          {
            domain: 'news.ycombinator.com',
            color: 'var(--warning)',
            title: '“Publishing source under limits”',
            excerpt:
              'Illustrative feedback: <mark>inspectability improved trust</mark>, while ownership and commercial limits stayed explicit.',
          },
        ],
      },
    },
    {
      type: 'cvssscorecard',
      col: 4,
      id: 'presplit-cve',
      delay: 600,
      props: {
        title: 'Worst finding from the pre-split security sweep',
        icon: 'shield',
        iconColor: 'var(--warning)',
        baseScore: 7.5,
        severity: 'high',
        cve: 'CVE-2024-21306',
        vector: [
          { label: 'AV', value: 'Network' },
          { label: 'AC', value: 'Low' },
          { label: 'PR', value: 'None' },
          { label: 'UI', value: 'None' },
          { label: 'S', value: 'Unchanged' },
        ],
        footer:
          'Already patched upstream in a transitive dependency; bumping it is part of Wk 1–2.',
      },
    },
    {
      type: 'changelog',
      col: 8,
      delay: 620,
      props: {
        title: 'What six weeks of a source publication could look like',
        icon: 'doc',
        iconColor: 'var(--presence)',
        versions: [
          {
            version: 'v1.0',
            date: 'Wk 6',
            entries: [
              {
                kind: 'added',
                text: 'Public release: docs site and the reviewed source-available snapshot.',
              },
              { kind: 'added', text: 'Maintainer-built connector catalog.' },
            ],
          },
          {
            version: 'v0.4',
            date: 'Wk 4',
            entries: [
              { kind: 'added', text: 'Soft launch to twelve design-partner teams.' },
              { kind: 'changed', text: 'Switched the component schema to the stable v1 contract.' },
              {
                kind: 'fixed',
                text: 'Local build no longer requires the internal package registry.',
              },
            ],
          },
          {
            version: 'v0.3',
            date: 'Wk 3',
            entries: [
              {
                kind: 'added',
                text: 'PolyForm Noncommercial terms, feedback policy, and legal notices.',
              },
              { kind: 'deprecated', text: 'The old private-snapshot publication script.' },
            ],
          },
          {
            version: 'v0.2',
            date: 'Wk 2',
            entries: [
              {
                kind: 'removed',
                text: 'Internal-only connectors, scrubbed from the public snapshot.',
              },
              {
                kind: 'security',
                text: 'Purged secrets accidentally left in the git history before the split.',
              },
            ],
          },
          {
            version: 'v0.1',
            date: 'Wk 1',
            entries: [
              { kind: 'added', text: 'Client and schema carved out into their own repository.' },
            ],
          },
        ],
        footer: 'Five fictional milestones from carve-out to public source release.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Writing the memo',
      say: "Here's a one-page memo for the team.",
      props: {
        kicker: 'STRATEGY MEMO',
        head: 'Publish noncommercial source, keep product control',
        foot: 'Fictional strategy exercise · not Mavéa policy',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Source-available</b>: noncommercial inspection and use, with commercial rights reserved.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Illustrative reach</b> through inspectability and issue-based feedback.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Residual risk</b>: terms still require ownership, enforcement, and brand controls.',
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'Should we publish the source?', route: 'topic:oss' },
  suggests: [
    { label: 'Which way should we go?', icon: 'proof', route: 'oss:pick', lead: 'Try' },
    { label: 'Write the memo', icon: 'slides', route: 'slide' },
    { label: "How's the business?", icon: 'chart', route: 'topic:biz' },
    { label: 'Add dark mode to Settings', icon: 'layers', route: 'topic:code' },
  ],
  intents: {
    pick: {
      kind: 'spotlight',
      spotId: 'verdict',
      say: 'For this fictional case: publish noncommercial source, reserve commercial rights, and keep code maintenance with the owners.',
    },
  },
  keywords: [
    {
      test: /open.?source|open.?core|oss|open claw|give.*away|community|license/,
      route: 'topic:oss',
      sub: [{ test: /which|pick|recommend|should we|decide|verdict/, route: 'oss:pick' }],
    },
  ],
};
