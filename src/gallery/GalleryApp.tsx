// GalleryApp — a browsable index of every visual Mavéa can render, at #/gallery.
//
// The point: see the whole library at a glance (and, as it grows toward 1000+, still
// find anything fast). It reuses the REAL render path — one representative block per
// type pulled from the source-checked examples used by the Live model menu, each mounted through the same
// TopicCanvas the app uses — so a tile looks exactly like the block looks in a live
// answer, and the page can never drift from what actually ships. The generated fixture shards also
// include the generative `composite` primitive, which Live teaches through its synthesis prompt.
//
// Find-fast affordances for a large library: free-text search, family "theme" filter
// chips, and a sticky toolbar. Light/dark follows the same `data-theme` switch the demo
// uses (persisted to the shared `mavea-theme` key), with an in-page toggle.
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { homeTarget } from '../lib/homeTarget';
import { TopicCanvas } from '../canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../data/conversation';
import { CATALOG_FACTS, catalogFacts, familyOf as catalogFamilyOf } from '../canvas/blocks/catalog';
import { useInView } from '../hooks/useInView';
import { Icon } from '../icons/icons';
import { readTheme, writeTheme, applyTheme, type Theme } from '../lib/theme';
import {
  auditGallery,
  auditGalleryOverlap,
  auditGalleryTruncation,
  type OverflowHit,
} from './overflowAudit';
import { loadGalleryFixture } from './fixtures.generated';
import './gallery.css';

/** Labels are metadata only. Renderer registries stay behind loader.ts's per-family imports. */
const FAMILY_LABELS: Record<string, string> = {
  charts1: 'Charts · hierarchy & flow',
  charts2: 'Charts · trends & ranges',
  diagrams: 'Diagrams & schematics',
  learn: 'Learn · math & assessment',
  stats: 'Stats & KPIs',
  tables: 'Tables & matrices',
  flows: 'Flows & plans',
  media: 'Media & maps',
  docs: 'Documents & evidence',
  reference: 'Reference & language',
  ai: 'AI & reasoning',
  layout: 'Layout & content',
  compose: 'Compose & messages',
  everyday: 'Everyday & utilities',
  nav: 'Navigation',
  overlays: 'Overlays',
  forms: 'Forms & inputs',
  pickers: 'Pickers',
  status: 'Status & feedback',
  display: 'Display',
  code: 'Code & syntax',
  dashboard: 'Living dashboards',
  finance: 'Finance & Fundraising',
  core: 'Core blocks',
};

const FAMILY_ORDER = Object.keys(FAMILY_LABELS);
// Every catalog type, with nothing held back: the gallery's whole claim is that it shows what
// ships, and a type it quietly skips is one nobody ever looks at. `preview` renders a whole app
// frame and `composite` nests other blocks recursively — the two that most need a human to check
// them in a real tile, and the two that were exempt from ever being checked.
const ALL_TYPES = CATALOG_FACTS.map((fact) => fact.type);

/** Wrap one block in the smallest spec TopicCanvas needs, forced to fill the tile and
 *  reveal immediately. Title/sub/context are blank (the tile head names the block); the
 *  gallery CSS hides TopicCanvas's own header + "Reading" row inside a tile. */
function tileSpec(block: Block): ConversationSpec {
  return {
    id: 'money', // any valid TopicId; the canvas never reads it
    workspace: '',
    title: '',
    sub: '',
    opener: '',
    context: [],
    blocks: [{ ...block, col: 12, delay: 0 }],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

interface Section {
  id: string;
  label: string;
  types: string[];
}

/** Build the family sections in display order, plus a trailing 'core' section for the
 *  built-in renderers. Only includes types we actually have a representative block for.
 *  One group-by pass over the catalog, not a per-family rescan of every type. */
function buildSections(): Section[] {
  const byFamily = new Map<string, string[]>();
  for (const type of ALL_TYPES) {
    const family = catalogFamilyOf(type) ?? 'core';
    const types = byFamily.get(family);
    if (types) types.push(type);
    else byFamily.set(family, [type]);
  }
  return FAMILY_ORDER.flatMap((id) => {
    const types = byFamily.get(id);
    return types ? [{ id, label: FAMILY_LABELS[id] ?? id, types: types.sort() }] : [];
  });
}

const ALL_SECTIONS = buildSections();
const TOTAL = ALL_TYPES.length;

class GalleryRenderBoundary extends Component<
  { children: ReactNode; type: string },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Preserve the rest of the library if one renderer regresses. The automated UI audit treats
    // this marker as a hard failure, so resilience cannot accidentally become a false green gate.
    if (import.meta.env.DEV)
      console.error(`[gallery] ${this.props.type} failed to render`, error, info);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="vlib-render-error" role="alert" data-block-type={this.props.type}>
          This preview could not be rendered.
        </div>
      );
    }
    return this.props.children;
  }
}

/** Read the `?mountall=1` escape hatch from the hash query (`#/gallery?mountall=1`). It forces
 *  every tile to mount at once so the overflow audit can sweep the whole library — otherwise
 *  windowed mounting keeps most tiles out of the DOM and the audit would only see what's on screen. */
function readMountAll(): boolean {
  if (typeof window === 'undefined') return false;
  const q = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q).get('mountall') === '1';
}

function GalleryTile({
  type,
  flag,
  mountAll,
}: {
  type: string;
  flag?: OverflowHit;
  mountAll: boolean;
}) {
  const fact = catalogFacts(type);
  const [block, setBlock] = useState<Block | null>(null);
  const [fixtureFailed, setFixtureFailed] = useState(false);
  // Size the tile to the block's natural width so wide components (flows, wide charts, tables)
  // aren't squished into a narrow cell where headers wrap to one letter per line.
  const col = fact?.colDefault ?? 6;
  const span = col >= 10 ? ' vlib-full' : col >= 7 ? ' vlib-wide' : '';
  const flagged = flag ? ` vlib-tile--${flag.kind}` : '';
  // Windowed mounting: the whole library is ~450 real block renders, so mounting them all at once
  // janks the first paint on a weak CPU. Keep the (heavy) TopicCanvas out of the DOM until the tile
  // scrolls within a screen of the viewport; a reserved-height skeleton holds its place so the
  // scroll never jumps. `mountAll` (?mountall=1) forces every tile in for the overflow audit.
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '900px 0px', threshold: 0 });
  const mounted = mountAll || inView;
  useEffect(() => {
    const rendererFamily = fact?.family;
    if (!mounted || !fact || !rendererFamily) return;
    let live = true;
    setFixtureFailed(false);
    void loadGalleryFixture(rendererFamily, type)
      .then((props) => {
        if (!live) return;
        if (!props || typeof props !== 'object' || Array.isArray(props)) {
          setFixtureFailed(true);
          return;
        }
        setBlock({ type, props, col: fact.colDefault, delay: 0 } as Block);
      })
      .catch(() => {
        if (live) setFixtureFailed(true);
      });
    return () => {
      live = false;
    };
  }, [mounted, type, fact]);
  return (
    <div ref={ref} className={'vlib-tile' + span + flagged}>
      <div className="vlib-tile-head">
        <span className="vlib-type">{type}</span>
        {flag ? (
          <span
            className={`vlib-flag vlib-flag--${flag.kind}`}
            title={`${flag.el} → ${flag.clipper}`}
          >
            {flag.kind === 'clip' ? 'clipped' : 'scroll'} {flag.px}px
          </span>
        ) : (
          <span className="vlib-fam">{catalogFamilyOf(type) ?? 'core'}</span>
        )}
      </div>
      {mounted && fixtureFailed ? (
        <div className="vlib-render">
          <div className="vlib-render-error" role="alert" data-block-type={type}>
            This preview could not be loaded.
          </div>
        </div>
      ) : mounted && block ? (
        <div className="vlib-render">
          <GalleryRenderBoundary type={type}>
            <TopicCanvas data={tileSpec(block)} spot={null} built={{}} onProve={() => {}} />
          </GalleryRenderBoundary>
        </div>
      ) : (
        <div className="vlib-render vlib-render--pending" aria-hidden="true" />
      )}
    </div>
  );
}

export function GalleryApp() {
  // Back goes where you came from — Live if you have a session, the front door otherwise.
  const home = homeTarget();
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [theme, setTheme] = useState<Theme>(readTheme);
  // Map of block type → its worst overflow hit, set by the audit button (null = not yet run).
  const [flags, setFlags] = useState<Map<string, OverflowHit> | null>(null);
  const [overlapN, setOverlapN] = useState<number | null>(null);
  const [truncN, setTruncN] = useState<number | null>(null);
  // The ?mountall=1 audit hatch, kept in sync with the hash so appending it takes effect live.
  const [mountAll, setMountAll] = useState(readMountAll);

  // Focus the search box on load — imperative (not the `autoFocus` prop) so it fires once, after
  // mount, under our control rather than the browser's own often-surprising autofocus timing.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Reflect the theme onto :root so the token overrides apply, and persist the choice.
  useEffect(() => {
    if (typeof document !== 'undefined') applyTheme(theme);
    writeTheme(theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => setMountAll(readMountAll());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Sweep the currently-rendered tiles for clipped/scrolled content, badge the offenders, and log
  // a full report. Audits only what's mounted, so filtering by family keeps the DOM bounded on a
  // huge library. Also exposed as window.__overflowAudit() for console/automation use.
  const runAudit = useMemo(() => {
    return () => {
      const report = auditGallery();
      const map = new Map<string, OverflowHit>();
      for (const h of report.clip) if (!map.has(h.type)) map.set(h.type, h);
      for (const h of report.scroll) if (!map.has(h.type)) map.set(h.type, h);
      setFlags(map);

      // The console dump is a dev-only affordance — a production gallery stays silent.
      if (import.meta.env.DEV) {
        console.log(
          `[overflow audit] ${report.scanned} tiles, ${report.ms}ms — ${report.clip.length} clipped, ${report.scroll.length} scroll`,
        );
        console.table([...report.clip, ...report.scroll]);
      }
      return report;
    };
  }, []);

  // Overlapping-text and truncated-label sweeps — the other two ways a label becomes unreadable
  // inside a card. Console.table is the actionable output (type · family · text); the button label
  // carries the count. Also exposed as window.__overlapAudit() / __truncationAudit().
  const runOverlapAudit = useMemo(() => {
    return () => {
      const report = auditGalleryOverlap();
      setOverlapN(report.overlaps.length);
      if (import.meta.env.DEV) {
        console.log(
          `[overlap audit] ${report.scanned} tiles, ${report.ms}ms — ${report.overlaps.length} with overlapping text`,
        );
        console.table(report.overlaps);
      }
      return report;
    };
  }, []);

  const runTruncationAudit = useMemo(() => {
    return () => {
      const report = auditGalleryTruncation();
      setTruncN(report.truncations.length);
      if (import.meta.env.DEV) {
        console.log(
          `[truncation audit] ${report.scanned} tiles, ${report.ms}ms — ${report.truncations.length} truncated labels`,
        );
        console.table(report.truncations);
      }
      return report;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as {
      __overflowAudit?: typeof runAudit;
      __overlapAudit?: typeof runOverlapAudit;
      __truncationAudit?: typeof runTruncationAudit;
    };
    w.__overflowAudit = runAudit;
    w.__overlapAudit = runOverlapAudit;
    w.__truncationAudit = runTruncationAudit;
  }, [runAudit, runOverlapAudit, runTruncationAudit]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_SECTIONS.filter((s) => family === 'all' || s.id === family)
      .map((s) => ({
        ...s,
        types: q
          ? s.types.filter(
              (t) => t.includes(q) || s.label.toLowerCase().includes(q) || s.id.includes(q),
            )
          : s.types,
      }))
      .filter((s) => s.types.length);
  }, [query, family]);

  const shown = sections.reduce((n, s) => n + s.types.length, 0);

  return (
    <div className={'vlib' + (mountAll ? ' vlib--mountall' : '')}>
      <div className="vlib-bar">
        <div className="vlib-bar-top">
          <button
            className="vlib-back"
            type="button"
            onClick={() => {
              window.location.hash = home.href;
            }}
          >
            ← Back to {home.label}
          </button>
          <div className="vlib-headline">
            <h1>Visual library</h1>
            <p className="vlib-subtitle">
              Production-rendered library. {shown} of {TOTAL} browsable types shown. Every card is
              fixed demonstration data, not advice.
            </p>
          </div>
          <div className="vlib-controls">
            <input
              ref={searchRef}
              className="vlib-search"
              type="search"
              placeholder="Search visuals…  (e.g. funnel, modal, kanban)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search visuals"
            />
            {import.meta.env.DEV && (
              <>
                <button
                  className={`vlib-audit ${flags ? 'active' : ''}`}
                  type="button"
                  onClick={() => (flags ? setFlags(null) : runAudit())}
                  title="Measure every rendered tile for clipped / scrolled content"
                >
                  {flags ? `Audit: ${flags.size} flagged` : 'Run overflow audit'}
                </button>
                <button
                  className={`vlib-audit ${overlapN != null ? 'active' : ''}`}
                  type="button"
                  onClick={() => (overlapN != null ? setOverlapN(null) : runOverlapAudit())}
                  title="Measure every rendered tile for overlapping text labels"
                >
                  {overlapN != null ? `Overlap: ${overlapN}` : 'Run overlap audit'}
                </button>
                <button
                  className={`vlib-audit ${truncN != null ? 'active' : ''}`}
                  type="button"
                  onClick={() => (truncN != null ? setTruncN(null) : runTruncationAudit())}
                  title="Measure every rendered tile for truncated (…) labels"
                >
                  {truncN != null ? `Truncated: ${truncN}` : 'Run truncation audit'}
                </button>
              </>
            )}
            <button
              className="vlib-theme"
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
            </button>
          </div>
        </div>
        <div className="vlib-chips" role="tablist" aria-label="Filter by family">
          <button
            type="button"
            role="tab"
            aria-selected={family === 'all'}
            className={`vlib-chip ${family === 'all' ? 'active' : ''}`}
            onClick={() => setFamily('all')}
          >
            All <span className="vlib-chip-n">{TOTAL}</span>
          </button>
          {ALL_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={family === s.id}
              className={`vlib-chip ${family === s.id ? 'active' : ''}`}
              onClick={() => setFamily(s.id)}
            >
              {s.label} <span className="vlib-chip-n">{s.types.length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="vlib-body">
        {sections.length === 0 ? (
          <p className="vlib-empty">No visuals match “{query}”.</p>
        ) : (
          sections.map((s) => (
            <section className="vlib-section" key={s.id}>
              <div className="vlib-section-head">
                <h2>{s.label}</h2>
                <span className="vlib-count">{s.types.length}</span>
              </div>
              <div className="vlib-grid">
                {s.types.map((t) => (
                  <GalleryTile type={t} key={t} flag={flags?.get(t)} mountAll={mountAll} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
