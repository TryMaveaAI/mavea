// "Building your CRM from your site", Mavéa reads the site, shows what it understood, the
// data model, and the screens, then builds a working CRM gated before anything touches real
// data. Flow: understand → assumptions → schema → screens → build steps → live preview.
//
// The BuildProgress block id is `buildprog` (not `build`) to avoid shadowing the topic id
// `build`, keeps deep-intent resolution and spotlight targeting unambiguous.
import type { ConversationSpec } from '../conversation';

export const build: ConversationSpec = {
  id: 'build',
  workspace: 'Studio CRM',
  title: 'Building your CRM from your site',
  sub: "I read your site, here's what I'll build, before I build it.",
  opener:
    "I read your studio site. Here's what I understood, then the model, the screens, and the build.",
  switchSay: 'Love it, let me read your site first.',
  gather: 'Reading studio-aria.com',
  found: 'Got it. Look at what I understood before I build anything.',
  tint: '#b07cf0',
  context: [
    { name: 'studio-aria.com', color: 'var(--insight)' },
    { name: '12 pages read', color: 'var(--presence-soft)' },
    { name: 'Your answers', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'understand',
      col: 7,
      id: 'understood',
      delay: 0,
      props: {
        title: 'What I learned about your studio',
        conf: 'strong',
        items: [
          {
            text: "You're a <b>branding & web design studio</b> selling to other businesses.",
            source: '/about',
          },
          {
            text: 'You work in <b>projects with stages</b>, pitch, active, delivered.',
            source: '/work',
          },
          {
            text: 'Leads come in through a <b>contact form</b> and referrals.',
            source: '/contact',
          },
          { text: 'You bill <b>per project</b>, not hourly.', source: '/pricing' },
        ],
      },
    },
    {
      type: 'list',
      col: 5,
      id: 'answers',
      delay: 90,
      props: {
        title: 'A couple of things I assumed',
        icon: 'proof',
        iconColor: 'var(--warning)',
        items: [
          '<b>Track companies, not just people</b>, since you sell B2B. (You can switch this off.)',
          '<b>Pipeline by project stage</b>, pitch → active → delivered, matching your work page.',
          "<b>No email sending yet</b>, I'll never message a client without your say-so.",
        ],
      },
    },
    {
      type: 'schema',
      col: 12,
      id: 'schema',
      delay: 180,
      props: {
        title: "The data model I'll build",
        entities: [
          {
            name: 'Company',
            color: 'var(--presence)',
            badge: 'B2B',
            fields: [
              { name: 'name', type: 'text', key: true },
              { name: 'industry', type: 'text' },
              { name: 'website', type: 'url' },
            ],
          },
          {
            name: 'Contact',
            color: 'var(--insight)',
            fields: [
              { name: 'name', type: 'text', key: true },
              { name: 'email', type: 'email' },
              { name: 'company', type: '→ Company' },
            ],
          },
          {
            name: 'Project',
            color: 'var(--warning)',
            fields: [
              { name: 'title', type: 'text', key: true },
              { name: 'stage', type: 'enum' },
              { name: 'value', type: 'money' },
            ],
          },
          {
            name: 'Activity',
            color: 'var(--presence-soft)',
            fields: [
              { name: 'type', type: 'enum' },
              { name: 'note', type: 'text' },
              { name: 'contact', type: '→ Contact' },
            ],
          },
        ],
        relations: [
          { from: 'Company', label: 'has many', to: 'Contacts' },
          { from: 'Contact', label: 'has many', to: 'Projects' },
          { from: 'Project', label: 'logs', to: 'Activities' },
        ],
        footer: 'Mirrors how you already work, projects with stages, not generic “deals.”',
      },
    },
    {
      type: 'screenmap',
      col: 7,
      id: 'screens',
      delay: 260,
      props: {
        title: "The screens you'll get",
        screens: [
          { name: 'Dashboard', kind: 'dashboard' },
          { name: 'Contacts', kind: 'table' },
          { name: 'Pipeline', kind: 'board' },
          { name: 'Company', kind: 'detail' },
          { name: 'Activity log', kind: 'list' },
        ],
        footer: 'Tap any screen to rename or reorder before I build.',
      },
    },
    {
      type: 'buildprog',
      col: 5,
      id: 'buildprog',
      delay: 340,
      props: {
        title: 'Building it',
        steps: [
          { label: 'Created the data model', sub: '4 tables, relationships wired', status: 'done' },
          { label: 'Generated 5 screens', sub: 'from your stages + fields', status: 'done' },
          { label: 'Imported sample data', sub: '8 leads pulled from your site', status: 'active' },
          { label: 'Connect your contact form', sub: 'needs your permission', status: 'todo' },
        ],
        footer: "Everything's a draft on your private workspace until you say go.",
      },
    },
    {
      type: 'preview',
      col: 12,
      id: 'preview',
      delay: 420,
      props: {
        app: 'Studio CRM',
        seededFrom: 'Seeded from studio-aria.com',
        nav: [
          { label: 'Dashboard', view: 'dashboard' },
          { label: 'Contacts', view: 'table' },
          { label: 'Pipeline', view: 'board' },
          { label: 'Companies', view: 'group' },
          { label: 'Activity', view: 'activity' },
        ],
        stages: [
          { key: 'Pitch', kind: 'lead', color: 'var(--presence)' },
          { key: 'Active', kind: 'warm', color: 'var(--warning)' },
          { key: 'Delivered', kind: 'won', color: 'var(--insight)' },
        ],
        rows: [
          {
            name: 'Maya Okafor',
            group: 'Northwind Co',
            stage: 'Active',
            amt: 18000,
            value: '$18k',
            color: 'var(--insight)',
          },
          {
            name: 'Leo Park',
            group: 'Tasc Labs',
            stage: 'Pitch',
            amt: 9000,
            value: '$9k',
            color: 'var(--presence)',
          },
          {
            name: 'Ruth Adler',
            group: 'Bloom & Co',
            stage: 'Active',
            amt: 15000,
            value: '$15k',
            color: 'var(--warning)',
          },
          {
            name: 'Sam Cole',
            group: 'Northwind Co',
            stage: 'Delivered',
            amt: 22000,
            value: '$22k',
            color: 'var(--danger)',
          },
          {
            name: 'Ivy Chen',
            group: 'Forma',
            stage: 'Pitch',
            amt: 7000,
            value: '$7k',
            color: 'var(--insight-soft)',
          },
        ],
        kpis: [
          { v: '8', k: 'Open leads' },
          { v: '3', k: 'Active projects' },
          { v: '$42k', k: 'In pipeline' },
        ],
        columns: ['Contact', 'Company', 'Stage', 'Value'],
        groupColumns: ['Company', 'Contacts', 'Pipeline'],
        pipelineLabel: 'Pipeline by stage',
        agg: 'money',
        createdNote: 'created this CRM with Mavéa',
        activities: [
          { who: 'Maya Okafor', what: 'moved to Active', when: '2h ago', color: 'var(--insight)' },
          {
            who: 'Leo Park',
            what: 'added from contact form',
            when: 'today',
            color: 'var(--presence)',
          },
          {
            who: 'Ruth Adler',
            what: 'sent a proposal',
            when: 'yesterday',
            color: 'var(--warning)',
          },
        ],
        footer:
          'A real, working CRM, seeded from your site. Click around the dashboard; it all works.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Opening a PR',
      say: "I'll open a draft PR with the CRM starter, you run it yourself.",
      props: {
        eyebrow: 'Action · pull request',
        icon: 'external',
        title: 'Open PR: “Studio CRM starter”',
        lines: [
          { k: 'Branch', v: 'feat/studio-crm → main' },
          { k: 'Includes', v: '4 tables, 5 screens, 8 sample leads' },
        ],
        perm: 'Mavéa opens a draft PR. Nothing merges without your review and approval.',
        cta: 'Open draft PR',
        doneText: 'Draft PR opened · waiting for your review',
        mcpId: 'github.openDraftPr',
        fields: [
          { param: 'title', label: 'PR title', value: 'Studio CRM starter' },
          { param: 'head', label: 'Branch', value: 'feat/studio-crm' },
          { param: 'base', label: 'Target branch', value: 'main' },
          {
            param: 'body',
            label: 'PR description',
            value:
              'B2B-first CRM shaped like your studio: Companies → Contacts → Projects, seeded from studio-aria.com.',
            multiline: true,
          },
        ],
      },
    },
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Writing it up',
      say: "Here's a one-pager on what I built and why.",
      props: {
        kicker: 'WHAT I BUILT',
        head: 'A CRM shaped like your studio',
        foot: 'Made by Mavéa · from studio-aria.com',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Projects with stages</b>, not generic deals, matches how you actually work.',
          },
          {
            color: 'var(--presence)',
            text: '<b>B2B-first</b>: Companies → Contacts → Projects, seeded from your site.',
          },
          {
            color: 'var(--warning)',
            text: "<b>Nothing external yet</b>, connect your contact form when you're ready.",
          },
        ],
      },
    },
  },
  group: 'docs',
  tryChip: { label: 'Build a CRM from my site', route: 'topic:build' },
  suggests: [
    {
      label: 'Did you get my business right?',
      icon: 'proof',
      route: 'build:understood',
      lead: 'Try',
    },
    { label: 'Show me the data model', icon: 'layers', route: 'build:schema' },
    { label: 'What screens do I get?', icon: 'slides', route: 'build:screens' },
    { label: 'Looks right, build it', icon: 'spark', route: 'build:run' },
    { label: 'Open the CRM PR', icon: 'external', route: 'send' },
  ],
  intents: {
    understood: {
      kind: 'spotlight',
      spotId: 'understood',
      say: "Yes, a B2B branding & web studio that works in projects with stages. Correct anything that's off.",
    },
    schema: {
      kind: 'spotlight',
      spotId: 'schema',
      say: 'Four tables, Company, Contact, Project, Activity, wired the way you already work.',
    },
    screens: {
      kind: 'spotlight',
      spotId: 'screens',
      say: 'Five screens: a dashboard, contacts, the pipeline, a company view, and an activity log.',
    },
    run: {
      kind: 'spotlight',
      spotId: 'buildprog',
      say: "Building it now, the model and screens are done; I'm importing your leads. Nothing external until you say go.",
    },
  },
  keywords: [
    {
      // The router is first-match-wins across ALL topics, so these build verbs must be
      // CRM-specific, otherwise they'd hijack requests like "make me a one-pager".
      test: /\bcrm\b|build me a (crm|tool|app|tracker|dashboard)|make me a (crm|tool|app|tracker|dashboard)|(app|tool|crm|dashboard) from my (site|website)|turn my (site|website).*into|internal tool|customer (database|tracker)/,
      route: 'topic:build',
      sub: [
        { test: /schema|data model|\btables\b|the model/, route: 'build:schema' },
        { test: /screen|wireframe|what.*(screens|pages).*get/, route: 'build:screens' },
        {
          test: /get.*(business|me).*right|did you (get|understand)|about my (business|studio)/,
          route: 'build:understood',
        },
        { test: /open (it|my)|publish|go live|launch it/, route: 'send' },
        { test: /build it|looks right|go ahead|do it|ship it/, route: 'build:run' },
      ],
    },
  ],
};
