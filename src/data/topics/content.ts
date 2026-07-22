// content.ts, "Building your content tracker from your site" (creation layer, 2nd tool type).
// Same six-block arc as build.ts (understand → assumptions → schema → screens → build → live
// preview) in a DIFFERENT domain, to prove the creation layer is general, not CRM-specific.
// It reuses the very same config-driven PreviewFrame, just with content nav/stages/columns.
import type { ConversationSpec } from '../conversation';

export const content: ConversationSpec = {
  id: 'content',
  workspace: 'Content OS',
  title: 'Building your content tracker from your site',
  sub: "I read your newsletter, here's what I'll build, before I build it.",
  opener:
    "I read your site and your last two dozen posts. Here's what I understood, then the model, the screens, and the build.",
  switchSay: 'On it, let me read your site and recent posts first.',
  gather: 'Reading theofield.com + your archive',
  found: 'Got it. Look at what I understood before I build anything.',
  tint: '#3fb6e8',
  context: [
    { name: 'theofield.com', color: 'var(--insight)' },
    { name: '24 posts read', color: 'var(--presence-soft)' },
    { name: 'Your answers', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'understand',
      col: 7,
      id: 'understood',
      delay: 0,
      props: {
        title: 'What I learned about your work',
        conf: 'strong',
        items: [
          {
            text: 'You publish a <b>weekly newsletter</b> plus longer essays on your site.',
            source: '/about',
          },
          {
            text: 'Your writing clusters into a few <b>recurring themes</b>, tools, craft, interviews.',
            source: '/archive',
          },
          {
            text: 'You <b>cross-post to X and LinkedIn</b> after the newsletter goes out.',
            source: '/links',
          },
          {
            text: 'You plan in <b>drafts → scheduled → published</b>, not all at once.',
            source: '/now',
          },
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
          '<b>Track pieces, not just dates</b>, each post is a record with a status.',
          '<b>Group by channel</b>, newsletter, X, LinkedIn, so you see where things land.',
          "<b>No auto-posting</b>, I'll never publish or schedule anything without your say-so.",
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
            name: 'Piece',
            color: 'var(--warning)',
            badge: 'Core',
            fields: [
              { name: 'title', type: 'text', key: true },
              { name: 'status', type: 'enum' },
              { name: 'publish', type: 'date' },
            ],
          },
          {
            name: 'Channel',
            color: 'var(--presence)',
            fields: [
              { name: 'name', type: 'text', key: true },
              { name: 'kind', type: 'enum' },
              { name: 'audience', type: 'number' },
            ],
          },
          {
            name: 'Topic',
            color: 'var(--insight)',
            fields: [
              { name: 'name', type: 'text', key: true },
              { name: 'pillar', type: 'text' },
            ],
          },
          {
            name: 'Campaign',
            color: 'var(--presence-soft)',
            fields: [
              { name: 'name', type: 'text', key: true },
              { name: 'goal', type: 'text' },
              { name: 'piece', type: '→ Piece' },
            ],
          },
        ],
        relations: [
          { from: 'Topic', label: 'has many', to: 'Pieces' },
          { from: 'Piece', label: 'posts to', to: 'Channels' },
          { from: 'Campaign', label: 'groups', to: 'Pieces' },
        ],
        footer:
          'Shaped like an editorial calendar, pieces move through stages, grouped by channel.',
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
          { name: 'Pieces', kind: 'table' },
          { name: 'Status board', kind: 'board' },
          { name: 'Channel', kind: 'detail' },
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
          { label: 'Generated 5 screens', sub: 'from your themes + channels', status: 'done' },
          {
            label: 'Imported your last 12 posts',
            sub: 'pulled from your archive',
            status: 'active',
          },
          { label: 'Connect newsletter + social', sub: 'needs your permission', status: 'todo' },
        ],
        footer: "Everything's a draft on your private workspace until you say go.",
      },
    },
    {
      type: 'sponsorshiptracker',
      col: 12,
      id: 'sponsorships',
      delay: 400,
      props: {
        title: 'The brand deals sitting outside the tracker',
        icon: 'spark',
        iconColor: 'var(--presence)',
        deals: [
          {
            brand: 'Fieldnotes Co.',
            deliverable: 'Newsletter mention, 1 issue',
            rate: 1800,
            status: 'paid',
            paidDate: 'May 28',
          },
          {
            brand: 'Kerncraft Tools',
            deliverable: 'Dedicated newsletter feature',
            rate: 4200,
            status: 'contracted',
            dueDate: 'Jun 30',
          },
          {
            brand: 'Northline Studio',
            deliverable: 'X thread, 3 posts',
            rate: 1200,
            status: 'negotiating',
          },
          {
            brand: 'Verafirm',
            deliverable: 'LinkedIn post + newsletter blurb',
            rate: 2600,
            status: 'delivered',
            dueDate: 'Jun 10',
          },
          {
            brand: 'Loomstate',
            deliverable: 'Newsletter mention, 1 issue',
            rate: 1500,
            status: 'pitched',
          },
        ],
        footer:
          'Kerncraft is the one to invoice the moment the feature goes out — everything else is either settled or still in play.',
      },
    },
    {
      type: 'preview',
      col: 12,
      id: 'preview',
      delay: 420,
      props: {
        app: 'Content OS',
        seededFrom: 'Seeded from theofield.com',
        nav: [
          { label: 'Dashboard', view: 'dashboard' },
          { label: 'Pieces', view: 'table' },
          { label: 'Board', view: 'board' },
          { label: 'Channels', view: 'group' },
          { label: 'Activity', view: 'activity' },
        ],
        stages: [
          { key: 'Idea', kind: 'lead', color: 'var(--presence)' },
          { key: 'Drafting', kind: 'warm', color: 'var(--warning)' },
          { key: 'Scheduled', kind: 'warm', color: 'var(--presence-soft)' },
          { key: 'Published', kind: 'won', color: 'var(--insight)' },
        ],
        rows: [
          {
            name: 'The tools that stuck',
            group: 'Newsletter',
            stage: 'Published',
            amt: 8400,
            value: '8.4k',
            color: 'var(--insight)',
          },
          {
            name: 'Field notes #12',
            group: 'Newsletter',
            stage: 'Published',
            amt: 6200,
            value: '6.2k',
            color: 'var(--danger)',
          },
          {
            name: 'On craft vs. speed',
            group: 'Newsletter',
            stage: 'Scheduled',
            amt: 5000,
            value: '~5k',
            color: 'var(--presence-soft)',
          },
          {
            name: 'Interview: a solo founder',
            group: 'X',
            stage: 'Drafting',
            amt: 3000,
            value: '~3k',
            color: 'var(--presence)',
          },
          {
            name: 'Why I switched stacks',
            group: 'LinkedIn',
            stage: 'Idea',
            amt: 2000,
            value: '~2k',
            color: 'var(--warning)',
          },
        ],
        kpis: [
          { v: '12', k: 'Pieces' },
          { v: '2', k: 'Scheduled' },
          { v: '14.6k', k: 'Reach · 30d' },
        ],
        columns: ['Piece', 'Channel', 'Status', 'Reach'],
        groupColumns: ['Channel', 'Pieces', 'Reach'],
        pipelineLabel: 'Pipeline by status',
        agg: 'plain',
        createdNote: 'created this tracker with Mavéa',
        activities: [
          {
            who: 'Newsletter',
            what: 'went out, 8.4k opens',
            when: '2d ago',
            color: 'var(--insight)',
          },
          {
            who: 'X thread',
            what: 'drafted from your essay',
            when: 'today',
            color: 'var(--presence)',
          },
          { who: 'LinkedIn', what: 'queued for Tuesday', when: 'today', color: 'var(--warning)' },
        ],
        footer:
          'A real, working content tracker, seeded from your archive. Click around; it all works.',
      },
    },
    {
      type: 'contentcalendar',
      col: 12,
      delay: 500,
      props: {
        title: 'This month, across your channels',
        icon: 'table',
        iconColor: 'var(--presence)',
        platforms: ['Newsletter', 'X', 'LinkedIn'],
        weeks: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'],
        cells: [
          { platform: 'Newsletter', week: 'Wk 1', status: 'posted', title: 'The tools that stuck' },
          { platform: 'Newsletter', week: 'Wk 2', status: 'posted', title: 'Field notes #12' },
          {
            platform: 'Newsletter',
            week: 'Wk 3',
            status: 'scheduled',
            title: 'On craft vs. speed',
          },
          { platform: 'Newsletter', week: 'Wk 4', status: 'idea', title: 'Q&A with a reader' },
          { platform: 'X', week: 'Wk 1', status: 'posted', title: 'Thread: the tools recap' },
          { platform: 'X', week: 'Wk 2', status: 'drafted', title: 'Interview: a solo founder' },
          { platform: 'X', week: 'Wk 3', status: 'idea', title: 'Poll: biggest craft tradeoff' },
          { platform: 'LinkedIn', week: 'Wk 2', status: 'idea', title: 'Why I switched stacks' },
          {
            platform: 'LinkedIn',
            week: 'Wk 4',
            status: 'drafted',
            title: 'Cross-post: field notes recap',
          },
        ],
        footer: 'Newsletter carries the month; X and LinkedIn trail a week behind on purpose.',
      },
    },
    {
      type: 'podcastplanner',
      col: 5,
      id: 'podcast-plan',
      delay: 480,
      props: {
        title: "Next week's episode, planned",
        icon: 'mic',
        iconColor: 'var(--presence)',
        guest: 'Sana Osei, staff engineer turned solo founder',
        topics: [
          'Why she left a staff role to build alone',
          'The first six months without a team to lean on',
          'What she automated first, and what she still does by hand',
          'Advice for someone considering the same jump',
        ],
        chapters: [
          { timecode: '00:00', label: 'Intro' },
          { timecode: '03:40', label: 'Leaving the staff role' },
          { timecode: '14:10', label: 'The lonely first months' },
        ],
        footer: 'Add this as a Piece in the tracker once it&rsquo;s recorded.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Opening a PR',
      say: "I'll open a draft PR with the tracker starter, you run it yourself.",
      props: {
        eyebrow: 'Action · pull request',
        icon: 'external',
        title: 'Open PR: “Content OS starter”',
        lines: [
          { k: 'Branch', v: 'feat/content-os → main' },
          { k: 'Includes', v: '4 tables, 5 screens, 12 imported posts' },
        ],
        perm: 'Mavéa opens a draft PR. Nothing merges without your review and approval.',
        cta: 'Open draft PR',
        doneText: 'Draft PR opened · waiting for your review',
        mcpId: 'github.openDraftPr',
        fields: [
          { param: 'title', label: 'PR title', value: 'Content OS starter' },
          { param: 'head', label: 'Branch', value: 'feat/content-os' },
          { param: 'base', label: 'Target branch', value: 'main' },
          {
            param: 'body',
            label: 'PR description',
            value:
              'Channel-grouped content tracker, idea → drafting → scheduled → published, seeded from theofield.com.',
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
        head: 'A tracker shaped like your editorial flow',
        foot: 'Made by Mavéa · from theofield.com',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Pieces with a status</b>, idea → drafting → scheduled → published.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Grouped by channel</b>, newsletter, X, LinkedIn, seeded from your archive.',
          },
          {
            color: 'var(--warning)',
            text: "<b>Nothing auto-posts</b>, connect your channels when you're ready.",
          },
        ],
      },
    },
  },
  group: 'docs',
  tryChip: { label: 'Build a content tracker from my site', route: 'topic:content' },
  suggests: [
    {
      label: 'Did you get my work right?',
      icon: 'proof',
      route: 'content:understood',
      lead: 'Try',
    },
    { label: 'Show me the data model', icon: 'layers', route: 'content:schema' },
    { label: 'What screens do I get?', icon: 'slides', route: 'content:screens' },
    { label: 'Looks right, build it', icon: 'spark', route: 'content:run' },
    { label: 'Open the tracker PR', icon: 'external', route: 'send' },
  ],
  intents: {
    understood: {
      kind: 'spotlight',
      spotId: 'understood',
      say: "Yes, a weekly newsletter plus essays, cross-posted to X and LinkedIn. Fix anything that's off.",
    },
    schema: {
      kind: 'spotlight',
      spotId: 'schema',
      say: 'Four tables, Piece, Channel, Topic, Campaign, shaped like an editorial calendar.',
    },
    screens: {
      kind: 'spotlight',
      spotId: 'screens',
      say: 'Five screens: a dashboard, your pieces, a status board, a channel view, and an activity log.',
    },
    run: {
      kind: 'spotlight',
      spotId: 'buildprog',
      say: "Building it now, the model and screens are done; I'm importing your last posts. Nothing posts until you say go.",
    },
  },
  keywords: [
    {
      test: /content tracker|content (calendar|os)|editorial calendar|track my (content|posts|writing|newsletter)|newsletter (tracker|crm)|manage my (content|posts)|(content|posts) from my (site|website)/,
      route: 'topic:content',
      sub: [
        { test: /schema|data model|\btables\b|the model/, route: 'content:schema' },
        { test: /screen|wireframe|what.*(screens|pages).*get/, route: 'content:screens' },
        {
          test: /get.*(work|me).*right|did you (get|understand)|about my (work|content)/,
          route: 'content:understood',
        },
        { test: /open (it|my)|publish|go live|launch it/, route: 'send' },
        { test: /build it|looks right|go ahead|do it|ship it/, route: 'content:run' },
      ],
    },
  ],
};
