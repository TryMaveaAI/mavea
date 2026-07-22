// seed.ts — the worked example: a hand-authored, clearly-labelled sample PR. It is NOT a live
// analysis; it's a showcase, the way the persona demos are scripted. Crucially, it only depicts what
// Ripple can ACTUALLY build from a connected GitHub repo — the diff, the file contents, and the
// in-repo callers a code search finds. There is no production traffic, no cross-repo services, no
// incident history, and no owner data, because GitHub alone can't give us those; showing them would
// promise a capability Ripple doesn't have. `provenance.example` flags it as a worked example.
import type { ShipModel } from './model';

export const SEED_SHIP: ShipModel = {
  pr: {
    repo: 'acme/auth-service',
    number: '#482',
    branch: 'feat/short-lived-tokens',
    base: 'main',
    added: 142,
    removed: 38,
    files: 7,
    title: 'Short-lived access tokens + refresh rotation',
    summary:
      'It cuts access-token lifetime to 15 minutes and adds refresh-token rotation, so a stolen ' +
      'token expires fast while real sessions stay alive by quietly refreshing. The web client ' +
      'absorbs the change — users never see a logout.',
    risks: [
      {
        level: 'breaks',
        text: 'src/api/guard.ts:21 calls validateToken the old way — it throws at runtime on every guarded route.',
      },
      {
        level: 'watch',
        text: 'Two changed paths have no test — the route guard and the token reaper.',
      },
      {
        level: 'watch',
        text: 'Rotation isn’t atomic — concurrent refreshes can double-rotate a session.',
      },
    ],
    p0Ways: 1,
    readScope:
      'Read from the diff: 7 files across 4 areas, plus the in-repo callers a search found.',
  },

  // ── the impact map: this PR at the centre, the in-repo areas it touches around it. No production
  //    traffic or cross-repo services — only what the diff + an in-repo caller search can prove. ──
  nodes: [
    {
      id: 'pr',
      label: 'auth-service',
      sub: 'THIS PR',
      type: 'pr',
      status: 'affected',
      scope: 'in-pr',
    },
    {
      id: 'auth',
      label: 'src/auth',
      sub: '4 files',
      type: 'module',
      status: 'affected',
      scope: 'in-pr',
      owner: '@acme/auth-team',
      contract: 'Issues and verifies tokens; this PR reshapes validateToken and adds rotation.',
      problem: 'The new validateToken(opts) signature is the source of the breaking call below.',
      fix: 'Land the new signature with every in-repo caller updated in the same change.',
    },
    {
      id: 'api',
      label: 'src/api',
      sub: '1 file',
      type: 'module',
      status: 'breaks',
      scope: 'in-pr',
      owner: '@acme/platform-team',
      contract: 'The route guard verifies every protected request via validateToken.',
      problem:
        'guard.ts:21 still calls validateToken without opts — a runtime TypeError on each route.',
      fix: 'Pass the new VerifyOpts (or make it required so the build catches missing callers).',
    },
    {
      id: 'web',
      label: 'src/web',
      sub: '1 file',
      type: 'client',
      status: 'safe',
      scope: 'in-pr',
      owner: '@acme/web-team',
      contract: 'The fetch wrapper retries once on a 401 by refreshing.',
      problem:
        'Already updated in this PR — auto-refresh absorbs the shorter TTL, no visible logout.',
      fix: 'No action; this caller is ready.',
    },
    {
      id: 'mig',
      label: 'migrations',
      sub: '0042.sql',
      type: 'datastore',
      status: 'migration',
      scope: 'in-pr',
      contract: 'Adds an index for refresh-token lookups and a token_version column.',
      problem: 'A NOT NULL add rewrites the table — on a large table that can lock writes.',
      fix: 'Run it expand/contract; confirm the real row count before running on prod.',
    },
    {
      id: 'tests',
      label: 'tests',
      sub: '1 file',
      type: 'module',
      status: 'untested',
      scope: 'in-pr',
      contract: 'Covers the rotation happy path.',
      problem: 'The guard and reaper paths this PR changed are not covered.',
      fix: 'Add a test that exercises guard.ts with the new signature.',
    },
  ],
  edges: [
    { from: 'pr', to: 'api', verb: 'calls', status: 'breaks', breaking: true },
    { from: 'pr', to: 'auth', verb: 'changes', status: 'affected' },
    { from: 'pr', to: 'mig', verb: 'migrates', status: 'migration' },
    { from: 'pr', to: 'web', verb: 'refreshes', status: 'safe' },
    { from: 'pr', to: 'tests', verb: 'covers', status: 'untested' },
  ],

  // ── the changes: each diff row, its intent, why, and the in-repo callers it touches ──
  changes: [
    {
      id: 'ttl',
      subsystem: 'AUTH',
      file: 'src/config.ts:12',
      kind: 'config',
      risk: 'watch',
      title: 'Access-token TTL cut to 15m',
      intent:
        'It shrinks the window a stolen access token stays valid — from an hour down to fifteen minutes.',
      why: 'Short tokens are only safe if clients can silently refresh — so this change only makes sense alongside the new rotation flow.',
      diff: {
        file: 'src/config.ts',
        add: 1,
        del: 1,
        lines: [
          { t: 'del', c: 'ACCESS_TTL = 60 * 60' },
          { t: 'add', c: 'ACCESS_TTL = 15 * 60' },
        ],
      },
      blastRadius: ['web'],
      blastFiles: 2,
      blastOutside: 0,
      links: [
        { name: 'fetch wrapper', ref: 'src/web/api.ts:130', scope: 'in-pr', status: 'updated' },
      ],
      risks: [
        {
          level: 'watch',
          text: 'For one TTL window after deploy, tokens minted as v1 are still live.',
        },
      ],
    },
    {
      id: 'sig',
      subsystem: 'AUTH',
      file: 'src/auth/token.ts:42',
      kind: 'interface',
      risk: 'breaks',
      title: 'validateToken() signature changed',
      intent:
        'It adds a VerifyOpts argument so callers can pass a clock and an audience — the rotation flow needs the clock-skew tolerance.',
      why: 'Old call-sites still compile because opts is optional — which is exactly the trap: they pass undefined and fail at runtime, not at build.',
      diff: {
        file: 'src/auth/token.ts',
        add: 1,
        del: 1,
        lines: [
          { t: 'del', c: 'validateToken(t: string)' },
          { t: 'add', c: 'validateToken(t: string, opts: VerifyOpts)' },
        ],
      },
      blastRadius: ['api', 'auth'],
      blastFiles: 3,
      blastOutside: 0,
      symbols: ['validateToken'],
      links: [
        { name: 'route guard', ref: 'src/api/guard.ts:21', scope: 'in-pr', status: 'breaks' },
        {
          name: 'refreshSession()',
          ref: 'src/auth/session.ts:88',
          scope: 'in-pr',
          status: 'updated',
        },
        {
          name: 'token reaper job',
          ref: 'src/jobs/reaper.ts:14',
          scope: 'in-pr',
          status: 'untested',
        },
      ],
      risks: [
        {
          level: 'breaks',
          text: 'guard.ts:21 still passes the old shape — throws a TypeError on the first request.',
        },
      ],
    },
    {
      id: 'refresh',
      subsystem: 'AUTH',
      file: 'src/auth/refresh.ts:1',
      kind: 'behavior',
      risk: 'watch',
      title: 'Refresh-token rotation added',
      intent:
        'It issues a fresh refresh token on every use and revokes the old one — the core mechanism that lets short access tokens stay usable.',
      why: 'This is the heart of the PR. Everything else — the shorter TTL, the client retry, the new index — exists to support it.',
      diff: {
        file: 'src/auth/refresh.ts',
        add: 2,
        del: 0,
        lines: [
          { t: 'add', c: 'export async function rotateRefresh(session) {' },
          { t: 'ctx', c: '  const next = await mint(session.user)' },
          { t: 'add', c: '  await revoke(session.refresh)' },
          { t: 'ctx', c: '  return next' },
          { t: 'ctx', c: '}' },
        ],
      },
      blastRadius: ['auth', 'mig'],
      blastFiles: 3,
      blastOutside: 0,
      symbols: ['rotateRefresh'],
      links: [
        {
          name: 'refreshSession()',
          ref: 'src/auth/session.ts:88',
          scope: 'in-pr',
          status: 'updated',
        },
      ],
      risks: [
        {
          level: 'watch',
          text: 'Not atomic — two concurrent refreshes can double-rotate and orphan a token.',
        },
      ],
    },
    {
      id: 'del',
      subsystem: 'AUTH',
      file: 'src/auth/legacy.ts',
      kind: 'breaking',
      risk: 'breaks',
      title: 'Removed parseLegacyJWT()',
      intent:
        'It deletes the pre-2023 token parser, now that the new format is the only one issued.',
      why: 'Dead on the issue path — but a search finds the reaper still imports it, and that caller is in this repo.',
      diff: {
        file: 'src/auth/legacy.ts',
        add: 0,
        del: 3,
        lines: [
          { t: 'del', c: 'export function parseLegacyJWT(token) {' },
          { t: 'del', c: '  // ...decodes v1 tokens' },
          { t: 'del', c: '}' },
        ],
      },
      blastRadius: ['auth'],
      blastFiles: 2,
      blastOutside: 0,
      symbols: ['parseLegacyJWT'],
      links: [
        {
          name: 'token reaper job',
          ref: 'src/jobs/reaper.ts:14',
          scope: 'in-pr',
          status: 'breaks',
        },
      ],
      risks: [
        {
          level: 'breaks',
          text: 'reaper.ts:14 imports parseLegacyJWT — its build breaks the moment this lands.',
        },
      ],
    },
    {
      id: 'mw',
      subsystem: 'API',
      file: 'src/api/guard.ts:21',
      kind: 'behavior',
      risk: 'breaks',
      title: 'Route guard now awaits validateToken',
      intent:
        'It makes the protected-route guard async so it can verify tokens through the new path.',
      why: 'Wires the guard into the new verifier — but was never updated for the new signature, so it calls it the old way.',
      diff: {
        file: 'src/api/guard.ts',
        add: 1,
        del: 1,
        lines: [
          { t: 'del', c: 'const ok = checkToken(tok)' },
          { t: 'add', c: 'const ok = await validateToken(tok)  // no opts' },
        ],
      },
      blastRadius: ['api'],
      blastFiles: 2,
      blastOutside: 0,
      links: [
        {
          name: 'all protected routes',
          ref: 'src/api/routes/*',
          scope: 'in-pr',
          status: 'affected',
        },
      ],
      risks: [
        {
          level: 'breaks',
          text: 'Calls validateToken without opts — breaks at runtime on every guarded route.',
        },
        { level: 'watch', text: 'No test covers this path.' },
      ],
    },
    {
      id: 'idx',
      subsystem: 'DATA',
      file: 'migrations/0042.sql:1',
      kind: 'perf',
      risk: 'watch',
      title: 'Index + token_version on refresh_tokens',
      intent: 'It indexes the refresh-token table and adds a token_version column for rotation.',
      why: 'Rotation reads refresh_tokens on every request — without the index it’s a full scan; the column tracks the rotation generation.',
      diff: {
        file: 'migrations/0042.sql',
        add: 3,
        del: 0,
        lines: [
          { t: 'add', c: 'CREATE INDEX CONCURRENTLY idx_refresh_user ON refresh_tokens(user_id);' },
          { t: 'add', c: 'ALTER TABLE refresh_tokens' },
          { t: 'add', c: '  ADD COLUMN token_version INT NOT NULL DEFAULT 0;' },
        ],
      },
      blastRadius: ['mig'],
      blastFiles: 1,
      blastOutside: 0,
      links: [],
      risks: [
        {
          level: 'watch',
          text: 'The NOT NULL add rewrites the table — fine when small, a write-lock when large. Row count isn’t in the diff.',
        },
      ],
    },
    {
      id: 'client',
      subsystem: 'WEB',
      file: 'src/web/api.ts:130',
      kind: 'behavior',
      risk: 'safe',
      title: 'Web client auto-refreshes on 401',
      intent:
        'It transparently refreshes and retries once when a request comes back 401 — so the shorter TTL is invisible to users.',
      why: 'This is what keeps the 15-minute token from causing surprise logouts — the UX half of the security change.',
      diff: {
        file: 'src/web/api.ts',
        add: 4,
        del: 0,
        lines: [
          { t: 'add', c: 'if (res.status === 401) {' },
          { t: 'add', c: '  await refresh()' },
          { t: 'add', c: '  return retry(req)' },
          { t: 'add', c: '}' },
        ],
      },
      blastRadius: ['web'],
      blastFiles: 1,
      blastOutside: 0,
      links: [],
      risks: [
        { level: 'watch', text: 'No backoff — a persistently-401 request could retry-loop.' },
      ],
    },
    {
      id: 'test',
      subsystem: 'TESTS',
      file: 'tests/refresh.test.ts:1',
      kind: 'test',
      risk: 'safe',
      title: 'Refresh-flow tests added',
      intent: 'It covers the happy path of token rotation with new assertions.',
      why: 'Good coverage on rotation itself — but the guard and reaper paths it touches are still untested.',
      diff: {
        file: 'tests/refresh.test.ts',
        add: 3,
        del: 0,
        lines: [
          { t: 'add', c: "describe('rotateRefresh', () => {" },
          { t: 'add', c: "  it('mints and revokes', ...)" },
          { t: 'add', c: '})' },
        ],
      },
      blastRadius: [],
      blastFiles: 1,
      blastOutside: 0,
      links: [],
      risks: [{ level: 'watch', text: 'guard.ts and reaper paths remain uncovered.' }],
    },
  ],

  // ── the cascade: how one line becomes an outage, hop by hop — grounded in the in-repo caller ──
  cascades: [
    {
      trigger: 'validateToken() gets a new arg',
      triggerRef: { ref: 'src/auth/token.ts:42', evidence: 'verified' },
      hops: [
        {
          label: 'src/api/guard.ts:21 still calls the old shape',
          context: 'IN-REPO CALLER · found by search',
          severity: 'breaks',
        },
        {
          label: 'every guarded route 500s',
          context: 'EFFECT · at runtime, not at build',
          severity: 'breaks',
        },
      ],
      incident: 'Protected routes fail on the first request after deploy',
      incidentSeverity: 'P0',
      caughtBeforeMerge:
        'Update guard.ts to the new signature (or make opts required) before merge.',
    },
    {
      trigger: 'delete parseLegacyJWT()',
      triggerRef: { ref: 'src/auth/legacy.ts', evidence: 'verified' },
      hops: [
        {
          label: 'src/jobs/reaper.ts:14 imports it',
          context: 'IN-REPO CALLER · found by search',
          severity: 'breaks',
        },
        {
          label: 'the reaper job fails to build',
          context: 'EFFECT · token cleanup stops',
          severity: 'watch',
        },
      ],
      incident: 'The token-reaper job breaks',
      incidentSeverity: 'P2',
      caughtBeforeMerge: 'Migrate the reaper off parseLegacyJWT in the same change.',
    },
  ],

  // ── the migration — honest about what a diff can and can't tell you ──
  migration: {
    file: 'migrations/0042.sql',
    sql: ['ALTER TABLE refresh_tokens', '  ADD COLUMN token_version INT NOT NULL DEFAULT 0;'],
    rows: 'unknown',
    lockCost: 'depends on the table size — a NOT NULL add rewrites every row under a lock',
    expand: [
      {
        title: 'Add it nullable',
        detail: 'ADD COLUMN token_version INT — instant, no rewrite, no lock.',
      },
      { title: 'Backfill in batches', detail: 'Fill existing rows off-peak so replicas keep up.' },
      { title: 'Then set NOT NULL', detail: 'A fast validate once every row is populated.' },
    ],
    note: 'The real row count and lock time aren’t in the diff — confirm them against the table before running on prod.',
  },

  // ── a safe rollout order — reasoned from the change, in this one repo ──
  rollout: [
    {
      order: 1,
      team: 'STEP 1',
      deploy: 'Run the migration (expand)',
      note: 'Add token_version nullable + backfill, or create the index CONCURRENTLY. No write lock.',
    },
    {
      order: 2,
      team: 'STEP 2',
      deploy: 'Fix the in-repo callers',
      note: 'Update guard.ts to the new validateToken signature and migrate the reaper off parseLegacyJWT.',
    },
    {
      order: 3,
      team: 'STEP 3',
      deploy: 'Ship auth + web together',
      note: 'New tokens + the client auto-refresh go live in the same release; tighten the column to NOT NULL after.',
      trap: true,
    },
  ],

  // ── every kind of change ──
  workTypes: [
    {
      type: 'security',
      label: 'Security',
      blurb: 'Tightening auth, rotating a secret, scoping a permission.',
      surfaces: 'who in this repo still holds the old token or scope.',
    },
    {
      type: 'feature',
      label: 'Feature work',
      blurb: 'A new endpoint, field, or function on the surface.',
      surfaces: 'the in-repo callers you didn’t update.',
    },
    {
      type: 'fix',
      label: 'Bug fix',
      blurb: 'The “tiny,” obviously-safe one-line fix.',
      surfaces: 'the callers that quietly relied on the old behaviour.',
    },
    {
      type: 'refactor',
      label: 'Refactor',
      blurb: 'Rename, move, or delete something shared.',
      surfaces: 'every in-repo reference a search can find.',
    },
    {
      type: 'migration',
      label: 'Migration',
      blurb: 'A schema or data change.',
      surfaces: 'the lock the SQL implies — and what the diff can’t tell you (the row count).',
    },
    {
      type: 'dependency',
      label: 'Dependency bump',
      blurb: 'Upgrade a library or pin.',
      surfaces: 'the bumped packages and what changed between versions.',
    },
  ],

  // No incident history / decision trails — GitHub doesn't give us those, so we don't show them.
  hotspots: [],

  // ── suggestions a staff engineer would raise — grounded only in the diff (no traffic numbers) ──
  suggestions: [
    {
      id: 'race',
      category: 'CONCURRENCY',
      title: 'Did you consider two refreshes racing?',
      gist: 'rotateRefresh() mints then revokes with no lock — concurrent refreshes can double-rotate.',
      why: 'mint() and revoke() are separate writes. Two clients refreshing the same session within milliseconds can both mint before either revokes — orphaning a valid token and breaking single-use rotation.',
      evidence: 'src/auth/refresh.ts:1 (no transaction) · src/auth/session.ts:88 (two callers)',
      fix: 'Wrap mint + revoke in one transaction, or take a row lock on session.id.',
    },
    {
      id: 'compat',
      category: 'COMPATIBILITY',
      title: 'Did you think about the v1 / v2 token overlap?',
      gist: 'For one TTL window after deploy, tokens minted as v1 are still live — does v2 accept them?',
      why: 'You shorten the TTL and change validateToken in the same PR. For ~15 minutes after deploy, in-flight v1 tokens are still valid. If validateToken(v2) rejects the old claim shape, active sessions 401 mid-request until they refresh — a self-inflicted spike at rollout.',
      evidence:
        'src/config.ts:12 (TTL → 15m) · src/auth/token.ts:42 (new shape) · no dual-accept path in the diff',
      fix: 'Accept both claim shapes for one TTL window, then drop v1 behind a flag.',
    },
    {
      id: 'obs',
      category: 'OBSERVABILITY',
      title: 'Did you add a signal for any of this?',
      gist: 'You changed the auth hot path but the diff adds no metric or alert on refresh-failure rate.',
      why: 'If anything above goes wrong, the first signal will be user reports, not a dashboard. A principal-level rollout ships the metric before the change so the blast is visible in seconds.',
      evidence: 'no new counters in src/auth/refresh.ts / src/api/guard.ts in this diff',
      fix: 'Emit refresh_success / refresh_fail + p95 and alert on the fail rate before enabling.',
    },
    {
      id: 'cost',
      category: 'DATA',
      title: 'Did you think about write amplification?',
      gist: 'Rotating on every request turns reads into writes on refresh_tokens — growth and cleanup?',
      why: 'Every authed request now writes refresh_tokens. That is sustained write load and unbounded row growth unless old tokens are reaped — and the reaper is exactly what this PR is about to break.',
      evidence:
        'src/auth/refresh.ts (write per call) · migrations/0042.sql (index, not a TTL) · reaper untested',
      fix: 'Confirm the reaper covers rotated tokens; consider a TTL or partition on the table.',
    },
  ],
  suppressedNits: 12,

  // ── onboarding: the repo as modules you can learn (areas + entry points from the tree) ──
  modules: [
    {
      id: 'auth',
      name: 'src/auth',
      purpose: 'Tokens, sessions, rotation — the security core.',
      entry: 'src/auth/token.ts',
      owner: '@acme/auth-team',
      health: '~4 files',
      explain:
        'Issues and verifies tokens, runs refresh/rotation, enforces scopes. The most security-sensitive area — a change here ripples to every route that calls it. Start with token.ts, then session.ts.',
      startHere: ['src/auth/token.ts', 'src/auth/session.ts', 'src/auth/refresh.ts'],
      depends: ['migrations'],
      usedBy: ['src/api', 'src/web'],
    },
    {
      id: 'api',
      name: 'src/api',
      purpose: 'HTTP routes + the auth guard — the front door.',
      entry: 'src/api/guard.ts',
      owner: '@acme/platform-team',
      health: '~1 file in this PR',
      explain:
        'Every request passes the guard, which verifies the token before the route runs. Routes stay thin: validate, call into a module, shape the response.',
      startHere: ['src/api/guard.ts', 'src/api/routes'],
      depends: ['src/auth'],
      usedBy: ['src/web'],
    },
    {
      id: 'web',
      name: 'src/web',
      purpose: 'The browser client + fetch wrapper.',
      entry: 'src/web/api.ts',
      owner: '@acme/web-team',
      health: '~1 file in this PR',
      explain:
        'Talks to the API and transparently refreshes on a 401, so a short token TTL is invisible to users. The retry/refresh logic lives in the fetch wrapper.',
      startHere: ['src/web/api.ts'],
      depends: ['src/api'],
      usedBy: [],
    },
    {
      id: 'mig',
      name: 'migrations',
      purpose: 'Schema changes, run in order.',
      entry: 'migrations/0042.sql',
      owner: '@acme/data-team',
      health: 'SQL files',
      explain:
        'Plain SQL migrations applied in sequence. Schema changes on big tables use expand/contract — add nullable, backfill, then tighten — to avoid a write lock.',
      startHere: ['migrations/0042.sql'],
      depends: [],
      usedBy: ['src/auth'],
    },
  ],
  onboarding: {
    firstWeek: [
      {
        team: 'AUTH',
        title: 'How a token is verified',
        sub: 'The heart of the service.',
        file: 'src/auth/token.ts',
      },
      {
        team: 'API',
        title: 'The guard',
        sub: 'How every route is protected.',
        file: 'src/api/guard.ts',
      },
      {
        team: 'AUTH',
        title: 'Rotation',
        sub: 'How short tokens stay usable.',
        file: 'src/auth/refresh.ts',
      },
      {
        team: 'WEB',
        title: 'The client',
        sub: 'How a 401 becomes a refresh.',
        file: 'src/web/api.ts',
      },
    ],
    requestLife: [
      'src/api/guard.ts',
      'src/auth/token.ts',
      'route handler',
      'src/web/api.ts (on 401 → refresh)',
    ],
  },

  // ── one progressive curriculum: every reader works through all of it, in order. The "Explain for"
  //    altitude only changes HOW each lesson reads (explainFor), never which lessons you get. ──
  courses: [
    {
      title: 'Get oriented',
      subtitle: 'Run it, read the shape, find the front door.',
      level: 'beginner',
      lessons: [
        {
          title: 'The big picture',
          minutes: 15,
          goal: 'Know what auth-service does and how its four areas fit together.',
          explainFor: {
            newgrad:
              'auth-service is the part of the system that answers “who is this request, and are they allowed?”. It has four areas: src/auth (makes and checks tokens), src/api (the routes, with a guard in front of them), src/web (the browser client), and migrations (database changes). A “token” is just a signed string the client sends to prove who it is. Start in src/auth/token.ts — that’s where a token is created and checked.',
            working:
              'Four areas: src/auth owns token mint/verify/rotation, src/api is the HTTP surface fronted by a guard that calls into auth, src/web is the client, migrations are the schema. The dependency arrow runs api → auth → migrations. token.ts is the centre of gravity.',
            principal:
              'Single service, four areas, one inbound trust boundary: the guard in src/api delegates all verification to src/auth. Everything else (rotation, the migration, the client retry) hangs off that one boundary — so a change to validateToken’s contract is a change to the whole surface.',
          },
          read: ['README.md', 'src/auth/token.ts'],
          concepts: ['Access vs refresh tokens', 'The guard → module → response shape'],
          checkpoint: {
            question: 'Name the four areas and what each is for.',
            answer:
              'src/auth — tokens, sessions, rotation; src/api — HTTP routes + the auth guard; src/web — the browser client + fetch wrapper; migrations — ordered SQL schema changes.',
          },
        },
        {
          title: 'Follow a request',
          minutes: 20,
          goal: 'Trace one request from the guard to a response.',
          explainFor: {
            newgrad:
              'Every protected request hits the guard first (src/api/guard.ts). The guard takes the token off the request and calls validateToken (in src/auth/token.ts). If the token is good, the real route runs; if not, the request is rejected before anything else happens. Read guard.ts top-to-bottom, then jump to validateToken to see what “good” means.',
            working:
              'guard.ts pulls the bearer token, awaits validateToken, and short-circuits on failure. validateToken decodes + checks signature/expiry/audience. The route handler only runs past the guard. This is the one choke point worth knowing cold.',
            principal:
              'The guard is the only place verification happens — there’s no second check downstream. That’s good (one place to reason about) and risky (one place to get wrong): a guard that fails open, or calls validateToken incorrectly, exposes every route at once.',
          },
          read: ['src/api/guard.ts', 'src/auth/token.ts'],
          concepts: ['How the guard verifies a token', 'Where validateToken is called'],
          caution:
            'The guard is the ONLY place a token is verified — there is no second check downstream. That makes it easy to reason about, but it also means a guard that fails open, or calls validateToken wrong, exposes every protected route at once. Treat any change to guard.ts as a change to the whole surface.',
          checkpoint: {
            question: 'Where would a bad token be rejected?',
            answer:
              'In src/api/guard.ts — it awaits validateToken and returns/throws before the route handler runs, so a bad token never reaches your code.',
          },
        },
      ],
      quiz: [
        {
          question: 'Which single file verifies every protected request?',
          answer: 'src/api/guard.ts — it reads the bearer token and awaits validateToken first.',
        },
        {
          question: 'Access token vs refresh token — what is each for?',
          answer:
            'The access token is short-lived and sent on every request; the refresh token is long-lived and exchanged for a fresh access token when it expires.',
        },
        {
          question: 'If a token fails validation, where does the request stop?',
          answer:
            'At the guard — the route handler never runs, so bad tokens never reach app code.',
        },
      ],
    },
    {
      title: 'Build a feature',
      subtitle: 'The token lifecycle, a guarded route, and the test for it.',
      level: 'intermediate',
      lessons: [
        {
          title: 'The token lifecycle',
          minutes: 25,
          goal: 'Understand minting, verifying, and rotating a token.',
          explainFor: {
            newgrad:
              'A token is created (“minted”) when you log in, checked (“verified”) on every request, and — new in this change — “rotated”: each time you use a refresh token, you get a brand-new one and the old one stops working. That’s what lets the short 15-minute token be safe: if one leaks, it’s useless in minutes. See mint/verify in token.ts and the new rotateRefresh in refresh.ts.',
            working:
              'mint() issues access+refresh; validateToken(t, opts) checks them with a clock/audience; rotateRefresh() mints a new refresh and revokes the old (single-use). opts exists so verification can tolerate clock skew and pin an audience — which is why the signature had to change.',
            principal:
              'Rotation makes refresh tokens single-use, which bounds replay to one window — but only if mint+revoke is atomic. The opts arg is the real API change: it’s optional, so every caller still compiles while silently passing undefined. That’s the trap this whole PR turns on.',
          },
          read: ['src/auth/token.ts', 'src/auth/refresh.ts', 'src/auth/session.ts'],
          concepts: ['Rotation: mint then revoke', 'Why opts (clock/audience) exists'],
          caution:
            'validateToken’s new opts arg is OPTIONAL, so every existing caller still compiles while silently passing undefined — then throws at runtime. The cause-and-effect: a “safe-looking” signature change becomes a prod 500 because the type system never flags the gap. Make opts required if you want the compiler to catch the missing callers.',
          checkpoint: {
            question: 'Why must a caller pass VerifyOpts now?',
            answer:
              'validateToken(t, opts) uses opts for clock-skew tolerance and audience pinning. opts is optional so old callers still compile — but they pass undefined and fail at runtime, which is exactly the bug in guard.ts.',
          },
        },
        {
          title: 'Add a guarded route',
          minutes: 25,
          goal: 'Wire a new protected endpoint through the guard.',
          explainFor: {
            newgrad:
              'To add a protected endpoint, you put it behind the guard and let the guard do the token check for you — you don’t verify tokens yourself. The one thing to get right: the guard now calls validateToken with an extra argument (opts). Copy the correct call; don’t call validateToken the old one-argument way.',
            working:
              'Mount the route behind guard.ts; the guard awaits validateToken(tok, opts) and your handler runs only on success. The current guard.ts:21 calls it without opts — copy the new signature, don’t the broken line.',
            principal:
              'The guard is shared, so getting the call wrong breaks every route, not just yours. Prefer making opts required at the type level so the compiler catches a missing caller instead of a runtime TypeError in prod.',
          },
          read: ['src/api/guard.ts', 'src/api/routes'],
          concepts: ['async guard', 'Calling validateToken correctly'],
          checkpoint: {
            question: 'What breaks if you forget the opts argument?',
            answer:
              'validateToken throws at runtime (a TypeError) on the first request — and because the guard fronts every protected route, all of them 500 at once. The build won’t catch it because opts is optional.',
          },
        },
        {
          title: 'Cover it with a test',
          minutes: 20,
          goal: 'Add a test that exercises the new path.',
          explainFor: {
            newgrad:
              'A test runs your code with fake inputs and checks the result, so a future change can’t silently break it. The existing tests cover rotation but NOT the guard or the reaper — the two paths this change actually breaks. Add a test that calls the guard with the new token shape.',
            working:
              'tests/refresh.test.ts covers rotateRefresh’s happy path. The guard and reaper paths are uncovered — add a guard test that asserts validateToken is called with opts and rejects a bad token.',
            principal:
              'The coverage gap is exactly on the risky paths (guard, reaper). A test there is the cheapest insurance against the runtime break; without it, the first signal is a 500 in prod, not a red CI.',
          },
          read: ['tests/refresh.test.ts'],
          concepts: ['Testing the rotation happy path', 'The untested guard/reaper paths'],
          checkpoint: {
            question: 'Which changed paths still have no test?',
            answer:
              'The route guard (src/api/guard.ts) and the token reaper (src/jobs/reaper.ts) — both changed by this PR, neither covered.',
          },
        },
      ],
      quiz: [
        {
          question: 'What does rotateRefresh() do, and why does it make a 15-minute token safe?',
          answer:
            'It mints a new refresh token and revokes the old one (single-use), so a leaked token is useless within one short window.',
        },
        {
          question: 'Why does old code that calls validateToken(t) still compile but break?',
          answer:
            'The new opts argument is optional, so callers compile passing undefined — then throw a runtime TypeError on the first request.',
        },
        {
          question: 'Where do you wire a new protected route, and what must you copy?',
          answer:
            'Behind src/api/guard.ts; copy the new validateToken(tok, opts) call — not the old one-argument line.',
        },
      ],
    },
    {
      title: 'Go deep',
      subtitle: 'The design, the failure modes, the migration strategy.',
      level: 'expert',
      lessons: [
        {
          title: 'Rotation atomicity',
          minutes: 30,
          goal: 'See why mint-then-revoke can race, and how to make it safe.',
          explainFor: {
            newgrad:
              'rotateRefresh does two separate database writes: it creates a new token, then deletes the old one. If two requests for the same session arrive at almost the same time, both can create a new token before either deletes the old — leaving two valid tokens and breaking the “single-use” promise. The fix is to do both writes together so they can’t interleave.',
            working:
              'mint() then revoke() are two writes with a gap. Concurrent refreshes on one session can both mint before either revokes — orphaning a token and defeating single-use rotation. Wrap them in one transaction or take a row lock on session.id.',
            principal:
              'It’s a classic read-modify-write race on a hot row. Under real concurrency it WILL happen; the blast is silent (an extra live token, not an error). Options: one transaction, a SELECT … FOR UPDATE on the session, or a version column + compare-and-swap. The token_version column this migration adds is the hook for the CAS approach.',
          },
          read: ['src/auth/refresh.ts', 'src/auth/session.ts'],
          concepts: ['Non-atomic writes', 'Row locks / single transaction'],
          caution:
            'This race is SILENT — the blast is an extra valid token, not an error or a log line — so it never shows up in testing and only bites under real concurrency, where it WILL happen. Don’t ship rotation without making mint+revoke atomic (one transaction, SELECT … FOR UPDATE, or the token_version CAS this migration sets up).',
          checkpoint: {
            question: 'Sketch two concurrent refreshes that orphan a token.',
            answer:
              'R1 mints T2; R2 (same session, overlapping) reads the old refresh and mints T3; R1 revokes the old; R2 revokes the old (already gone). Now T2 and T3 are both valid — single-use is broken.',
          },
        },
        {
          title: 'The migration strategy',
          minutes: 25,
          goal: 'Understand expand/contract and why a NOT NULL add is risky at scale.',
          explainFor: {
            newgrad:
              'Adding a column that can’t be empty (NOT NULL) forces the database to fill in every existing row, which on a big table can lock it and block other writes for a while. The safe pattern is “expand/contract”: first add the column allowing empty values (instant), fill it in slowly in the background, then finally require it. The diff can’t tell you the table size — you have to check.',
            working:
              'ALTER TABLE … ADD COLUMN NOT NULL DEFAULT rewrites every row under a lock. Expand/contract: add nullable (instant), backfill in batches off-peak, then SET NOT NULL (a fast validate). Confirm the real row count before running.',
            principal:
              'The lock cost is a function of table size, which is NOT in the diff — so the honest read is “verify before running.” At scale, also watch replica lag during the backfill and prefer CREATE INDEX CONCURRENTLY (already used here) to avoid a build-time lock.',
          },
          read: ['migrations/0042.sql'],
          concepts: ['Table-rewrite locks', 'Expand → backfill → contract'],
          checkpoint: {
            question: 'Why add the column nullable first?',
            answer:
              'A nullable ADD COLUMN is a metadata-only change — instant, no row rewrite, no lock. You then backfill in batches and only tighten to NOT NULL once every row has a value, avoiding the table-rewrite lock.',
          },
        },
        {
          title: 'Failure modes + the missing signal',
          minutes: 25,
          goal: 'Find what would break on rollout and what you can’t see today.',
          explainFor: {
            newgrad:
              'Two things can go wrong at deploy time. First, for ~15 minutes after shipping, tokens made the old way are still floating around — if the new code rejects them, users get logged out. Second, there’s no metric for “how often is refresh failing?”, so if something breaks, you’ll hear it from users, not a dashboard. Look at guard.ts and refresh.ts and notice there’s no counter being emitted.',
            working:
              'v1/v2 overlap: in-flight old tokens are valid for one TTL window; if validateToken(v2) rejects the old shape, you get a self-inflicted 401 spike at rollout. And there’s no refresh_success/refresh_fail metric in the diff — no early-warning signal.',
            principal:
              'Sequence the rollout to dual-accept claim shapes for one TTL window, then drop v1 behind a flag. The deeper gap is observability: changing the auth hot path with no new signal means MTTD is “user reports.” Ship the metric + alert before enabling, and decide explicitly whether the guard fails open or closed when validation is unavailable.',
          },
          read: ['src/api/guard.ts', 'src/auth/refresh.ts'],
          concepts: ['v1/v2 token overlap', 'No refresh-failure metric in the diff'],
          checkpoint: {
            question: 'What metric would catch a bad rollout in seconds?',
            answer:
              'A refresh-failure rate (refresh_fail / refresh_total) plus the guard’s 401/5xx rate, alerted on a threshold — so a spike shows on a dashboard immediately instead of arriving as support tickets.',
          },
        },
      ],
      quiz: [
        {
          question: 'Why can mint-then-revoke leave two valid refresh tokens?',
          answer:
            'They are two writes with a gap; two concurrent refreshes on one session can both mint before either revokes. Make them atomic — one transaction or a row lock on session.id.',
        },
        {
          question: 'Why add a NOT NULL column nullable-first on a large table?',
          answer:
            'A NOT NULL add rewrites every row under a lock; expand/contract (add nullable → backfill in batches → SET NOT NULL) avoids the table-rewrite lock.',
        },
        {
          question: 'What is the most dangerous thing the diff CAN’T show you here?',
          answer:
            'There is no refresh-failure metric — changing the auth hot path with no signal means the first sign of a bad rollout is user reports, not a dashboard. Ship the metric + alert before enabling.',
        },
      ],
    },
  ],

  // ── the humans + agents gate — computed from the change ──
  gate: {
    decision: 'block',
    shipSafe: false,
    unackedP0: 1,
    requires: [],
    deployOrder: 'enforced',
    conditions: [
      {
        id: 'guard',
        label: 'route guard updated to the new signature',
        status: 'failed',
        actor: 'agent',
      },
      {
        id: 'reaper',
        label: 'reaper migrated off parseLegacyJWT',
        status: 'pending',
        actor: 'agent',
      },
      {
        id: 'mig',
        label: 'migration run as expand/contract in a window',
        status: 'pending',
        actor: 'human',
      },
      { id: 'test', label: 'a test covers the guard path', status: 'pending', actor: 'human' },
    ],
    rationale:
      'A breaking in-repo caller gates this change: src/api/guard.ts:21 calls validateToken the old way and throws at runtime, and the reaper imports a function this PR deletes. Fix both callers (and run the migration expand/contract) before merge.',
  },

  // ── Incident mode (reverse): the same picture run backwards from the page this PR causes if the
  //    guard ships unfixed. In-repo cause; who-to-wake points at the area, since GitHub alone doesn't
  //    tell us the owner (check CODEOWNERS / git blame). ──
  incident: {
    symptom: '5xx on every protected route after the auth deploy',
    severity: 'P0',
    chain: [
      { label: 'Every guarded route 500s', context: 'NOW · since the deploy' },
      { label: 'src/api/guard.ts:21 calls validateToken the old way', context: 'in-repo caller' },
      { label: 'src/auth/token.ts:42 changed validateToken’s signature', context: 'this PR' },
    ],
    rootCause:
      'The new validateToken(opts) shipped while guard.ts still calls it without opts — a TypeError at runtime on every protected route. A missed in-repo caller, not bad logic.',
    rollback: [
      'Revert the auth deploy (or hotfix guard.ts to pass the new opts).',
      'Confirm protected routes return to 200 before standing down.',
    ],
    whoToWake: [
      {
        name: 'Owner of src/auth',
        team: 'src/auth',
        why: 'changed validateToken — check CODEOWNERS / git blame',
      },
      { name: 'Owner of src/api', team: 'src/api', why: 'owns the guard that calls it' },
    ],
    timeline: [
      { time: 'deploy', label: 'auth-service #482 (short-lived tokens) goes out' },
      { time: '+1 min', label: 'guarded routes start returning 500' },
      { time: 'now', label: 'Ripple traces it to the missed guard.ts caller' },
    ],
    evidence:
      'Grounded in the diff + the in-repo caller search. Connect deploys/traces to confirm the exact deploy time.',
  },

  provenance: {
    source: 'github',
    example: true,
    notes: [
      'A worked example of a GitHub-connected analysis — built from a PR’s diff, file contents, the in-repo callers a search finds, and CODEOWNERS for who owns what.',
      'It shows only what GitHub gives us: no production traffic, no cross-repo services, no incident history — those need connectors Ripple doesn’t have.',
      'Connect a repo or paste a diff to run Ripple on a real change.',
    ],
  },
};
