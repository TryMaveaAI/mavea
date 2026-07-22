// #/slidelab — a QA gallery for the presentation skins, in the spirit of #/reel. It composes one
// representative deck that exercises every slide layout, then renders it in any of the ten skins so
// fit/overflow and fidelity can be checked at a glance. A "torture" deck pushes every slot to its
// worst-case length, and an overflow audit flags any slide whose content is being clipped — the
// human proof that the fit system holds. Not part of the product surface; a dev tool.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationSpec } from '../../data/conversation';
import { downloadClip } from '../../clip/share';
import { PresentationDeck } from '../../live/present/PresentationDeck';
import '../../live/present/present.css';
import { SlideStage } from '../SlideStage';
import { SLIDE_SKIN_ORDER, SLIDE_SKINS } from '../skins/registry';
import type { SlideSkinId } from '../skins/types';
import { SurfaceNav } from '../../components/SurfaceNav';
import { auditDeck, auditPage, type SlideAuditFailure } from './audit';
import { buildDeck, buildTortureDeck } from './fixtures';

/** Read `?gate=1` from the hash query (`#/slidelab?gate=1`) — the automated-gate escape hatch
 *  scripts/slide-gate.mts opts into; the interactive lab ignores it and behaves exactly as before. */
function readGateMode(): boolean {
  if (typeof window === 'undefined') return false;
  const q = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q).get('gate') === '1';
}

type GateCombo = { skinId: SlideSkinId; torture: boolean };
/** Every skin × both decks, in the order the gate walks them. */
const GATE_COMBOS: GateCombo[] = SLIDE_SKIN_ORDER.flatMap((skinId) => [
  { skinId, torture: false },
  { skinId, torture: true },
]);

export type SlideGateFailure = SlideAuditFailure & {
  skin: SlideSkinId;
  deck: 'representative' | 'torture';
};

export interface SlideGateResult {
  failures: SlideGateFailure[];
  done: boolean;
}

// A small real answer so the lab can also preview full-screen Present mode (same deck as export).
const SAMPLE_SPEC = {
  id: 'live',
  workspace: 'Live',
  title: 'The State of Urban Mobility',
  sub: 'A field study across twelve cities',
  opener: '',
  context: [],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [],
  keywords: [],
  topic: 'Strategy',
  sources: [
    { title: 'City Atlas', url: '#' },
    { title: 'OECD', url: '#' },
  ],
  blocks: [
    {
      type: 'insight',
      id: 'i1',
      col: 12,
      props: {
        title: 'Density drives ridership',
        summary: 'The densest quartile of neighbourhoods generated 58% of all transit trips.',
        confidence: 'inferred',
      },
    },
    {
      type: 'insight',
      id: 'i2',
      col: 12,
      props: {
        title: 'Frequency is the network',
        summary: 'Below ten-minute headways, riders stop checking the schedule and simply show up.',
      },
    },
    {
      type: 'insight',
      id: 'i3',
      col: 12,
      props: {
        title: 'Build versus expand',
        summary: 'Bus rapid transit launches in 18 months versus six years for new rail.',
      },
    },
    {
      type: 'insight',
      id: 'i4',
      col: 12,
      props: {
        title: 'Equity follows access',
        summary: 'Corridors scoring highest on demand also scored highest on equity.',
      },
    },
    {
      type: 'insight',
      id: 'i5',
      col: 12,
      props: {
        title: 'The funding gap',
        summary: 'A $1.2B programme needs a 40% federal match to close on schedule.',
      },
    },
  ],
} as unknown as ConversationSpec;

export function SlidesLab() {
  const [id, setId] = useState<SlideSkinId>('folio');
  const [busy, setBusy] = useState(false);
  const [pptxBusy, setPptxBusy] = useState(false);
  const [presentOn, setPresentOn] = useState(false);
  const [torture, setTorture] = useState(false);
  const [audit, setAudit] = useState(false);
  const [flags, setFlags] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const deck = useMemo(() => (torture ? buildTortureDeck() : buildDeck()), [torture]);
  const skin = SLIDE_SKINS[id];

  // Gate mode (#/slidelab?gate=1): drive `id`/`torture` through every skin × both decks in turn,
  // reusing the exact same gallery render below, and accumulate the overflow audit's findings
  // instead of badging them on screen. `id`/`torture` double as the gate's own cursor, so a human
  // opening the lab without `gate=1` sees no difference at all.
  const gateMode = useMemo(readGateMode, []);
  const gateStepRef = useRef(0);
  const gateFailuresRef = useRef<SlideGateFailure[]>([]);
  const [gateDone, setGateDone] = useState(false);

  useEffect(() => {
    if (!gateMode || gateDone) return;
    let cancelled = false;
    let rafA = 0;
    let rafB = 0;
    const run = (): void => {
      rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(() => {
          if (cancelled || !galleryRef.current) return;
          const combo = GATE_COMBOS[gateStepRef.current];
          const hits = auditDeck(galleryRef.current, deck);
          for (const hit of hits) {
            gateFailuresRef.current.push({
              ...hit,
              skin: combo.skinId,
              deck: combo.torture ? 'torture' : 'representative',
            });
          }
          const nextStep = gateStepRef.current + 1;
          if (nextStep >= GATE_COMBOS.length) {
            (window as unknown as { __slideGateResult?: SlideGateResult }).__slideGateResult = {
              failures: gateFailuresRef.current,
              done: true,
            };
            setGateDone(true);
            return;
          }
          gateStepRef.current = nextStep;
          setId(GATE_COMBOS[nextStep].skinId);
          setTorture(GATE_COMBOS[nextStep].torture);
        });
      });
    };
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) run();
      });
    } else {
      run();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
    };
  }, [gateMode, gateDone, id, torture, deck]);

  // Overflow audit — measure each rendered slide once the fonts settle and badge any real clipping.
  useEffect(() => {
    if (!audit) {
      setFlags({});
      return;
    }
    let cancelled = false;
    let rafA = 0;
    let rafB = 0;
    const run = (): void => {
      rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(() => {
          if (cancelled || !galleryRef.current) return;
          const pages = Array.from(galleryRef.current.querySelectorAll<HTMLElement>('.slide-page'));
          const next: Record<number, string> = {};
          pages.forEach((page, i) => {
            const reason = auditPage(page);
            if (reason) next[i] = reason;
          });
          setFlags(next);
        });
      });
    };
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) run();
      });
    } else {
      run();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
    };
  }, [audit, deck, id]);

  // Exercises the real landscape-PDF pipeline (font settle → offscreen render → raster → jsPDF).
  const onExport = async () => {
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: deck.length });
    try {
      const { exportDeckToPdf } = await import('../../export/pipeline/exportDeck');
      const blob = await exportDeckToPdf(deck, skin, {
        scale: 2,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      downloadClip(blob, `slidelab-${id}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // Same real pipeline, the pptx assembly instead of jsPDF — exercises exportDeckToPptx (and its
  // shared rasterizeDeckImages step) directly from the lab.
  const onExportPptx = async () => {
    setPptxBusy(true);
    setError(null);
    setProgress({ done: 0, total: deck.length });
    try {
      const { exportDeckToPptx } = await import('../../export/pipeline/exportPptx');
      const blob = await exportDeckToPptx(deck, skin, {
        scale: 2,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      downloadClip(blob, `slidelab-${id}.pptx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setPptxBusy(false);
      setProgress(null);
    }
  };

  const flagCount = Object.keys(flags).length;

  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        background: '#1B1E24',
        color: '#E8EAF0',
        fontFamily: '-apple-system, system-ui, sans-serif',
        padding: '0 24px 80px',
        boxSizing: 'border-box',
      }}
    >
      <SurfaceNav title="Slide lab" />
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: '#1B1E24',
          paddingTop: 20,
          paddingBottom: 14,
          marginBottom: 18,
          borderBottom: '1px solid rgba(255,255,255,.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 650 }}>
            Slide lab — {deck.length} slides · {skin.label}
          </div>
          <button type="button" onClick={onExport} disabled={busy || pptxBusy} style={btn(!busy)}>
            {busy && progress ? `Exporting ${progress.done}/${progress.total}…` : '⬇ Export PDF'}
          </button>
          <button
            type="button"
            onClick={onExportPptx}
            disabled={busy || pptxBusy}
            style={btn(!pptxBusy)}
          >
            {pptxBusy && progress
              ? `Exporting ${progress.done}/${progress.total}…`
              : '⬇ Export PPTX'}
          </button>
          <button type="button" onClick={() => setPresentOn(true)} style={btn(false)}>
            ▶ Present
          </button>
          <button type="button" onClick={() => setTorture((v) => !v)} style={btn(torture)}>
            {torture ? '✓ Max content' : 'Max content'}
          </button>
          <button type="button" onClick={() => setAudit((v) => !v)} style={btn(audit)}>
            {audit ? `Overflow audit · ${flagCount}` : 'Overflow audit'}
          </button>
          {audit ? (
            <span style={{ fontSize: 12, color: flagCount ? '#FF6B6B' : '#5BE5A0' }}>
              {flagCount ? `${flagCount} slide(s) clipping` : 'no overflow ✓'}
            </span>
          ) : null}
          {error ? <span style={{ fontSize: 12, color: '#FF6B6B' }}>{error}</span> : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SLIDE_SKIN_ORDER.map((sid) => {
            const s = SLIDE_SKINS[sid];
            const on = sid === id;
            return (
              <button
                key={sid}
                type="button"
                onClick={() => setId(sid)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 11px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: `1px solid ${on ? '#5B8CFF' : 'rgba(255,255,255,.12)'}`,
                  background: on ? 'rgba(91,140,255,.16)' : 'rgba(255,255,255,.05)',
                  color: '#E8EAF0',
                  fontSize: 12.5,
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    background: s.tokens.accent,
                  }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        ref={galleryRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          maxWidth: 1180,
          margin: '0 auto',
        }}
      >
        {deck.map((slide, i) => (
          <div key={slide.id}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: flags[i] ? '#FF6B6B' : '#9AA0AD',
                marginBottom: 7,
                display: 'flex',
                gap: 10,
              }}
            >
              <span>
                {String(i + 1).padStart(2, '0')} · {slide.kind}
              </span>
              {flags[i] ? <span>⚠ {flags[i]}</span> : null}
            </div>
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 14px 40px rgba(0,0,0,.4)',
                outline: flags[i] ? '2px solid #FF6B6B' : 'none',
                outlineOffset: 2,
              }}
            >
              <SlideStage slide={slide} skin={skin} ctx={{ index: i, total: deck.length }} />
            </div>
          </div>
        ))}
      </div>
      {presentOn && (
        <PresentationDeck
          spec={SAMPLE_SPEC}
          question="What is the state of urban mobility?"
          narration="Twelve cities, one question — here's what the data says."
          skinId={id}
          onExit={() => setPresentOn(false)}
        />
      )}
      {gateMode && (
        // scripts/slide-gate.mts reads window.__slideGateResult directly; this sentinel is a
        // DOM-visible fallback for any driver that would rather poll an attribute than eval JS.
        <div data-gate-done={gateDone ? 'true' : 'false'} style={{ display: 'none' }} />
      )}
    </div>
  );
}

const btn = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.16)',
  background: active ? '#5B8CFF' : 'rgba(255,255,255,.06)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});
