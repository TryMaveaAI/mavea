// account.ts, "Let's set up your account", a warm, voice-first onboarding & preferences
// flow. Mavéa SHOWS the whole setup as one living canvas of form cards: profile, workspace,
// notifications, security, and a verify step, each one a real, interactive primitive. Uses
// every forms key (buttonbar, textfield, textarea, select, combobox, checkboxgroup,
// radiogroup, switchset, togglegroup, otp, actionchecklist) plus the two pickers form
// surfaces (formpanel, fileupload), opened by two insight blocks and grounded by a friendly
// callout. 16 blocks.
import type { ConversationSpec } from '../conversation';

export const account: ConversationSpec = {
  id: 'account',
  workspace: 'Account setup',
  title: "Let's get your account just right",
  sub: 'Profile, workspace, notifications, security, set up once, in about two minutes.',
  opener:
    "We'll do this together, top to bottom. Fill what you like, skip what you don't, I'll remember your choices and you can change any of them later.",
  switchSay: "Let's set up your account.",
  gather: 'Pulling your profile + sensible defaults',
  found: "Here's everything in one place, tweak anything, then we're done.",
  tint: '#7bdcb5',
  context: [
    { name: 'john.smith@example.com', color: 'var(--presence-soft)' },
    { name: 'New workspace', color: 'var(--insight)' },
    { name: 'Free plan', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative: two insight blocks ──
    {
      type: 'insight',
      col: 8,
      id: 'welcome',
      num: '1',
      delay: 0,
      props: {
        title: 'Your setup is about two minutes, and 3 of 8 steps are already done',
        stat: '3 / 8',
        delta: 'pre-filled from your sign-in',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'I carried over your email, name, and time zone so you start ahead. Everything below is editable, and nothing saves until you say so.',
        sources: [{ file: 'Google sign-in', loc: 'profile' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'privacy',
      num: '2',
      delay: 80,
      props: {
        title: 'Private by default',
        stat: 'You',
        delta: 'only you can see this',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Your workspace is solo until you invite someone. Notifications and sharing both start off.',
      },
    },

    // ── a warm, grounding callout ──
    {
      type: 'callout',
      col: 12,
      delay: 160,
      props: {
        title: 'No rush, pick up where you left off anytime',
        icon: 'spark',
        iconColor: 'var(--insight)',
        tone: 'success',
        kicker: 'Welcome',
        body: "I'll <b>autosave a draft</b> as you go. Close the tab and your progress is right here when you come back, no lost work, no re-typing.",
        points: [
          'Required fields are marked, everything else is optional.',
          'Hover any control to see what it changes.',
          'You can <mark>undo</mark> any choice from Settings later.',
        ],
        footer: 'Let’s start with who you are.',
      },
    },

    // ════════ STEP 1, PROFILE BASICS ════════
    {
      type: 'textfield',
      col: 7,
      delay: 240,
      id: 'profile',
      props: {
        title: 'Your profile',
        icon: 'edit',
        iconColor: 'var(--presence)',
        color: 'var(--presence)',
        fields: [
          {
            label: 'Full name',
            value: 'John Smith',
            icon: 'edit',
            state: 'success',
            helper: 'Looks good, this is how Mavéa will greet you.',
          },
          {
            label: 'Display handle',
            placeholder: '@you',
            value: '@johnsmith',
            icon: 'spark',
            state: 'success',
            helper: '@johnsmith is available.',
          },
          {
            label: 'Work email',
            value: 'john.smith@example.com',
            icon: 'mail',
            state: 'default',
            helper: "We'll send a 6-digit code to verify this below.",
          },
          {
            label: 'Set a password',
            placeholder: 'At least 10 characters',
            password: true,
            icon: 'lock',
            state: 'error',
            helper: 'Add one number and one symbol to make it strong.',
            optional: true,
          },
        ],
        footer: 'Two are pre-filled, just confirm the rest.',
      },
    },
    {
      type: 'fileupload',
      col: 5,
      delay: 320,
      props: {
        title: 'Profile photo',
        icon: 'image',
        iconColor: 'var(--insight)',
        color: 'var(--insight)',
        prompt: 'Drop a photo here, or click to browse',
        hint: 'PNG, JPG or GIF · up to 5 MB · square looks best',
        files: [
          { name: 'john-headshot.jpg', size: '2.4 MB', progress: 100, kind: 'image' },
          { name: 'team-offsite-2025.png', size: '4.1 MB', progress: 62, kind: 'image' },
        ],
        footer: 'The first photo is set as your avatar.',
      },
    },
    {
      type: 'textarea',
      col: 7,
      delay: 400,
      props: {
        title: 'A short bio',
        icon: 'quote',
        iconColor: 'var(--presence-soft)',
        color: 'var(--presence-soft)',
        label: 'Tell Mavéa a little about you',
        placeholder: 'What do you work on? What are you here to figure out?',
        value:
          'Product lead exploring voice-first AI. I want Mavéa to help me reason through decisions and show its work.',
        max: 240,
        minRows: 3,
        footer: 'This helps me tailor what I show you, totally optional.',
      },
    },
    {
      type: 'combobox',
      col: 5,
      delay: 480,
      props: {
        title: 'Where are you based?',
        icon: 'globe',
        iconColor: 'var(--insight)',
        color: 'var(--insight)',
        label: 'Time zone',
        placeholder: 'Search cities or zones…',
        noun: 'zones',
        selected: 1,
        items: [
          { label: 'San Francisco', meta: 'PT · UTC−8', icon: 'globe' },
          { label: 'New York', meta: 'ET · UTC−5', icon: 'globe' },
          { label: 'London', meta: 'GMT · UTC+0', icon: 'globe' },
          { label: 'Berlin', meta: 'CET · UTC+1', icon: 'globe' },
          { label: 'Bengaluru', meta: 'IST · UTC+5:30', icon: 'globe' },
          { label: 'Singapore', meta: 'SGT · UTC+8', icon: 'globe' },
        ],
        footer: 'I detected New York from your sign-in, change it if that’s off.',
      },
    },

    // ════════ STEP 2, WORKSPACE ════════
    {
      type: 'formpanel',
      col: 7,
      delay: 560,
      id: 'workspace',
      props: {
        title: 'Name your workspace',
        icon: 'layers',
        iconColor: 'var(--presence)',
        color: 'var(--presence)',
        heading: 'This is where your conversations and canvases live.',
        fields: [
          {
            key: 'wsname',
            label: 'Workspace name',
            type: 'text',
            value: 'John’s Studio',
            required: true,
            hint: 'Shown in the top-left of every canvas.',
          },
          {
            key: 'wsurl',
            label: 'Workspace URL',
            type: 'text',
            value: 'john-studio',
            required: true,
            hint: 'mavea.app/john-studio',
          },
          {
            key: 'team',
            label: 'Team size',
            type: 'select',
            options: ['Just me', '2–5 people', '6–20 people', '20+ people'],
            value: 'Just me',
          },
          {
            key: 'use',
            label: 'Primary use',
            type: 'select',
            options: ['Research & decisions', 'Product & design', 'Data & analytics', 'Writing'],
            value: 'Research & decisions',
          },
        ],
        submitLabel: 'Create workspace',
        success: 'Workspace created, mavea.app/john-studio is yours.',
        footer: 'You can rename or add teammates anytime.',
      },
    },
    {
      type: 'radiogroup',
      col: 5,
      delay: 640,
      props: {
        title: 'Choose your plan',
        icon: 'spark',
        iconColor: 'var(--insight)',
        color: 'var(--insight)',
        layout: 'card',
        selected: 0,
        options: [
          {
            label: 'Free',
            caption: 'Solo canvases · 30 conversations / mo',
            icon: 'check',
            value: '$0',
          },
          {
            label: 'Pro',
            caption: 'Unlimited canvases · voice replays · exports',
            icon: 'sparkle',
            value: '$18/mo',
          },
          {
            label: 'Team',
            caption: 'Shared workspaces · roles · SSO',
            icon: 'layers',
            value: '$32/seat',
          },
        ],
        footer: 'Start free, upgrade in one click whenever you’re ready.',
      },
    },
    {
      type: 'select',
      col: 4,
      delay: 720,
      props: {
        title: 'Default canvas theme',
        icon: 'image',
        iconColor: 'var(--presence-soft)',
        color: 'var(--presence-soft)',
        label: 'Appearance',
        placeholder: 'Pick a theme',
        selected: 2,
        options: [
          { label: 'Light', caption: 'Bright, high-contrast', icon: 'sun' },
          { label: 'Dark', caption: 'Easy on the eyes at night', icon: 'moon' },
          { label: 'Match system', caption: 'Follows your device', icon: 'screen' },
        ],
        footer: 'You can switch instantly from any canvas.',
      },
    },
    {
      type: 'togglegroup',
      col: 4,
      delay: 800,
      props: {
        title: 'Text density',
        icon: 'table',
        iconColor: 'var(--insight)',
        color: 'var(--insight)',
        mode: 'single',
        hint: 'Comfortable, roomy spacing, the default.',
        items: [
          { label: 'Compact', icon: 'arrowUp', title: 'Tighter spacing' },
          { label: 'Comfortable', icon: 'check', title: 'Default spacing', on: true },
          { label: 'Spacious', icon: 'arrowDown', title: 'Extra breathing room' },
        ],
        footer: 'Affects how tightly cards are packed on the canvas.',
      },
    },
    {
      type: 'buttonbar',
      col: 4,
      delay: 880,
      props: {
        title: 'Quick actions',
        icon: 'spark',
        iconColor: 'var(--presence)',
        color: 'var(--presence)',
        hint: 'Saved, your workspace defaults are set.',
        buttons: [
          { label: 'Save defaults', variant: 'primary', icon: 'check' },
          { label: 'Invite a teammate', variant: 'outline', icon: 'plus' },
          { label: 'Import settings', variant: 'secondary', icon: 'upload' },
          { variant: 'icon', icon: 'share' },
          { label: 'Reset', variant: 'ghost', icon: 'undo' },
          { label: 'Delete workspace', variant: 'destructive', icon: 'x', disabled: true },
        ],
        footer: 'Delete is disabled until your workspace has data.',
      },
    },

    // ════════ STEP 3, NOTIFICATIONS & PRIVACY ════════
    {
      type: 'switchset',
      col: 6,
      delay: 960,
      id: 'notify',
      props: {
        title: 'Notifications',
        icon: 'bell',
        iconColor: 'var(--insight)',
        color: 'var(--insight)',
        items: [
          {
            label: 'Product updates',
            description: 'New components and canvas features.',
            icon: 'sparkle',
            on: true,
          },
          {
            label: 'Weekly digest',
            description: 'A Monday recap of your conversations.',
            icon: 'mail',
            on: true,
          },
          {
            label: 'Mentions & replies',
            description: 'When a teammate tags you.',
            icon: 'chat',
            on: false,
          },
          {
            label: 'Marketing emails',
            description: 'Occasional tips and offers.',
            icon: 'send',
            on: false,
          },
          {
            label: 'Do Not Disturb',
            description: 'Pause everything 10pm–8am, your time.',
            icon: 'moon',
            on: true,
          },
        ],
        footer: 'You’ll always get security alerts, those can’t be turned off.',
      },
    },
    {
      type: 'checkboxgroup',
      col: 6,
      delay: 1040,
      props: {
        title: 'Data & privacy preferences',
        icon: 'shield',
        iconColor: 'var(--presence)',
        color: 'var(--presence)',
        allLabel: 'Select all',
        items: [
          {
            label: 'Save conversation history',
            caption: 'Keep canvases so you can revisit them.',
            checked: true,
          },
          {
            label: 'Personalize what I show you',
            caption: 'Use your bio and choices to tailor cards.',
            checked: true,
          },
          {
            label: 'Help improve Mavéa',
            caption: 'Share anonymized usage, never your content.',
            checked: false,
          },
          {
            label: 'Allow workspace search indexing',
            caption: 'Teammates can find shared canvases.',
            checked: false,
            disabled: true,
          },
        ],
        footer: 'Indexing unlocks on Team plans, your data stays yours either way.',
      },
    },

    // ════════ SETUP CHECKLIST, what's left ════════
    {
      type: 'actionchecklist',
      col: 6,
      delay: 1080,
      props: {
        title: 'Finish setting up',
        icon: 'check',
        iconColor: 'var(--presence)',
        color: 'var(--presence)',
        subtitle: 'A few quick steps and your workspace is ready, tick them off as you go.',
        items: [
          {
            label: 'Confirm your profile basics',
            detail: 'Name, role, and a photo so teammates recognize you.',
            meta: 'Step 1',
            done: true,
          },
          {
            label: 'Name your workspace',
            detail: 'Where all your canvases live.',
            priority: 'medium',
            meta: 'Step 2',
            done: true,
          },
          {
            label: 'Choose notification preferences',
            detail: 'Pick only the alerts that are actually useful.',
            priority: 'low',
            meta: 'Step 3',
          },
          {
            label: 'Verify your email',
            detail: 'Enter the 6-digit code to unlock everything.',
            priority: 'high',
            meta: 'Step 4',
          },
          {
            label: 'Invite a teammate',
            detail: 'Optional, you can always do this later.',
            priority: 'low',
            meta: 'Optional',
          },
        ],
        footer: 'You can change any of these later in Settings.',
      },
    },

    // ════════ STEP 4, VERIFY EMAIL ════════
    {
      type: 'otp',
      col: 12,
      delay: 1120,
      id: 'verify',
      props: {
        title: 'Verify your email',
        icon: 'lock',
        iconColor: 'var(--insight)',
        color: 'var(--insight)',
        prompt: 'Demo UI only — enter the example 6-digit code',
        length: 6,
        code: '428913',
        resendLabel: 'Didn’t get it? Resend in 0:24',
        footer: 'Gallery fixture only. Mavéa does not create an account or send this email.',
      },
    },
    {
      type: 'trustmap',
      col: 10,
      delay: 720,
      id: 'trustmap',
      props: {
        title: 'Example privacy map · fictional product',
        icon: 'shield',
        iconColor: 'var(--presence)',
        flows: [
          {
            data: 'Email and name',
            location: 'Fictional database for this UI example',
            access: 'Not collected by Mavéa',
            retention: 'Example only',
          },
          {
            data: 'Saved memories',
            location: 'Browser storage in the real app',
            access: 'Anyone with browser or device access may reach it',
            retention: 'Until feature deletion, site-data clearing, or browser eviction',
          },
          {
            data: 'Voice recordings',
            location: 'Browser, speech endpoint, or browser-vendor service',
            access: 'Depends on the selected speech path',
            retention: 'Provider and deployment policies apply',
          },
          {
            data: 'Usage analytics',
            location: 'Not collected by the unmodified Mavéa project',
            access: 'A modified deployment may differ',
            retention: 'Deployment operator must disclose changes',
          },
        ],
        checklist: [
          { label: 'Two-factor authentication is on', ok: true },
          { label: 'Login alerts for new devices', ok: true },
          { label: 'Data export available anytime', ok: true },
          { label: 'A recovery email is still missing', ok: false },
        ],
        note: 'This block demonstrates a privacy-map UI; it is not a claim about a hosted Mavéa account.',
        footer: 'See Mavéa’s <b>Privacy Policy</b> for the project’s actual data flows.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll save your account settings and finish setup.",
      props: {
        eyebrow: 'Action · finish setup',
        icon: 'check',
        title: 'Save your account & preferences',
        lines: [
          { k: 'Saves', v: 'Profile, workspace, notifications, privacy' },
          { k: 'To', v: 'john.smith@example.com' },
        ],
        perm: 'Demo-only preview. Mavéa has no account backend and this action does not save or send data.',
        cta: 'Finish setup',
        doneText: 'All set, welcome to your workspace',
      },
    },
  },

  group: 'home',
  tryChip: { label: 'Help me set up my account', route: 'topic:account' },
  suggests: [
    { label: 'Verify my email now', icon: 'lock', route: 'account:verify', lead: 'Try' },
    { label: 'Finish setup', icon: 'check', route: 'send' },
    { label: 'Tweak my notifications', icon: 'bell', route: 'account:notify' },
    { label: 'Name my workspace', icon: 'layers', route: 'account:workspace' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  intents: {
    profile: {
      kind: 'spotlight',
      spotId: 'profile',
      say: "Here's your profile, confirm the basics and we'll move on.",
    },
    workspace: {
      kind: 'spotlight',
      spotId: 'workspace',
      say: "Let's name your workspace, this is where everything lives.",
    },
    notify: {
      kind: 'spotlight',
      spotId: 'notify',
      say: "Here are your notifications, flip on only what's useful.",
    },
    verify: {
      kind: 'spotlight',
      spotId: 'verify',
      say: "Last step, pop in the 6-digit code and you're done.",
    },
  },
  keywords: [
    {
      test: /sign.?up|onboard|preferences|my (workspace|account|settings|profile)|account settings|set up (my )?(account|profile|workspace)|set.?up (my )?account|create (an? )?account/i,
      route: 'topic:account',
      sub: [
        {
          test: /verify|otp|code|confirm (my )?email|6.?digit/i,
          route: 'account:verify',
        },
        {
          test: /notif|alert|email me|digest|do not disturb|dnd/i,
          route: 'account:notify',
        },
      ],
    },
  ],
};
