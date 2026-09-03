// The export modal: pick a format (presentation deck or document), choose a template, tweak the
// accent, pick which answers to include, and preview the real output live before exporting. Both
// previews render through the same components as their PDFs, so what you see is what you get.
// Download rasterizes a fresh, natural-size mount into a pixel-perfect PDF; Print uses the vector
// fallback (selectable text).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ConversationSpec } from '../data/conversation';
import { useFocusTrap } from '../live/useFocusTrap';
import { downloadClip } from '../clip/share';
import { composeDeck, SlideStage } from '../slides';
import type { Slide } from '../slides/model/Slide';
import { SLIDE_SKIN_ORDER, SLIDE_SKINS, suggestSlideSkin } from '../slides/skins/registry';
import type { SlideSkinId } from '../slides/skins/types';
import { PAGE_W, pageSize, type PageFormat } from './paginate/geometry';
import { buildExportDoc } from './render/buildDoc';
import { DOC_PAGE_GAP, ExportDocView } from './render/ExportDoc';
import type { ExportDoc } from './model/ExportDoc';
import { pdfProperties } from './model/normalize';
import { SKINS, SKIN_ORDER, suggestSkin } from './skins/registry';
import type { SkinId } from './skins/types';
import {
  ExportCancelledError,
  ExportTimeoutError,
  ExportUnavailableError,
  exportSupported,
  type RasterScale,
} from './pipeline/raster';
import { exportDocToPdf } from './pipeline/exportPdf';
import { exportDeckToPdf, printDeck, printDeckWithNotes } from './pipeline/exportDeck';
import { exportDeckToPptx } from './pipeline/exportPptx';
import { printDoc } from './pipeline/printFallback';
import { FeatureUseNotice } from '../legal/FeatureUseNotice';

type ExportFormat = 'presentation' | 'document';

/** One selectable answer (an entry from the live session's frames). */
export interface ExportAnswer {
  index: number;
  label: string;
  spec: ConversationSpec;
}

/** Letter's holdout regions — everywhere else defaults to A4, the world's actual standard. A
 *  deliberately simple region check (not a full paper-size database): the user can always
 *  override it with the segmented control. */
const LETTER_REGIONS = new Set(['US', 'CA', 'PH']);

function defaultPageFormat(): PageFormat {
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  const region = lang.split('-')[1]?.toUpperCase();
  return region && LETTER_REGIONS.has(region) ? 'letter' : 'a4';
}

/** Accent presets offered alongside each skin's signature colour. Named, because the chip's only
 *  accessible text is its label and a hex code is read out digit by digit. */
const ACCENT_PRESETS: readonly { name: string; value: string }[] = [
  { name: 'Teal', value: '#1C6E8C' },
  { name: 'Navy', value: '#1C3D5A' },
  { name: 'Brick', value: '#7A2E33' },
  { name: 'Pine', value: '#0F766E' },
  { name: 'Forest', value: '#1B4332' },
  { name: 'Indigo', value: '#43388E' },
  { name: 'Amber', value: '#B45309' },
  { name: 'Ink', value: '#111111' },
];

export function ExportModal({
  answers,
  defaultIndex,
  defaultIndices,
  onClose,
  guided = false,
}: {
  answers: ExportAnswer[];
  /** Pre-selected answer (the current one). */
  defaultIndex: number;
  /** When set (opening Export right after "See this thread together"), pre-select every answer
   *  in that composed thread instead of just `defaultIndex` — the export picks up exactly what
   *  was just on screen rather than making the user re-find and re-check each one. */
  defaultIndices?: readonly number[];
  onClose: () => void;
  /** Walkthrough mode: calmly show presentation choices, then document choices. */
  guided?: boolean;
}) {
  // Stamped once when the modal mounts, so the masthead/cover date stays stable across rebuilds.
  const [generatedAt] = useState(() => Date.now());
  const primaryTopic = answers.find((a) => a.index === defaultIndex)?.spec.topic;
  const [format, setFormat] = useState<ExportFormat>('presentation');
  const [skinId, setSkinId] = useState<SkinId>(() => suggestSkin(primaryTopic));
  const [slideSkinId, setSlideSkinId] = useState<SlideSkinId>(() => suggestSlideSkin(primaryTopic));
  const [accentOverride, setAccentOverride] = useState<string | null>(null);
  const [pageFormat, setPageFormat] = useState<PageFormat>(() => defaultPageFormat());
  const [docScale, setDocScale] = useState<RasterScale>(2.5);
  // Presentation default is Standard = 2× (slides already render at 1920px, so 2× is crisp without
  // bloating the file); High bumps to 2.5× plus near-lossless JPEG.
  const [slideScale, setSlideScale] = useState<RasterScale>(2);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(defaultIndices && defaultIndices.length > 0 ? defaultIndices : [defaultIndex]),
  );
  const [doc, setDoc] = useState<ExportDoc | null>(null);
  const [building, setBuilding] = useState(true);
  const [busy, setBusy] = useState(false);
  // What is in flight, so the two download buttons (PDF/PPTX) can each show their own "Working…"
  // state instead of both flipping at once — and so the panel can tell an abortable render apart
  // from a print, which the browser owns end to end and we cannot cancel.
  const [activeFormat, setActiveFormat] = useState<'pdf' | 'pptx' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-page export progress, shown as a bar while busy; null when idle.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // The byte size of the most recent successful export, shown so the user knows what they got.
  const [lastSize, setLastSize] = useState<number | null>(null);
  // At/below 800px the fixed two-column layout crushes the preview, so the panel stacks into a
  // single scrollable column. Tracked via a media query so it follows the live viewport.
  const [narrow, setNarrow] = useState(false);
  // Lets the Cancel button abort an in-flight export, and lets the unmount cleanup abort leaked work.
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstControlRef = useRef<HTMLButtonElement | null>(null);

  // The walkthrough sequence belongs to the modal so its clock begins only after this lazy
  // surface has actually mounted. Driving these controls from outside raced the chunk load on
  // slower computers and could leave the scene stuck on its first presentation template.
  useEffect(() => {
    if (!guided) return;
    const timers = [
      window.setTimeout(() => setSlideSkinId(SLIDE_SKIN_ORDER[1]), 1800),
      window.setTimeout(() => setSlideSkinId(SLIDE_SKIN_ORDER[2]), 3600),
      window.setTimeout(() => setFormat('document'), 6200),
      window.setTimeout(() => setSkinId(SKIN_ORDER[1]), 8200),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [guided]);

  const isPres = format === 'presentation';
  const skin = SKINS[skinId];
  const slideSkin = SLIDE_SKINS[slideSkinId];
  const accent = accentOverride ?? (isPres ? slideSkin.tokens.accent : skin.tokens.accent);
  const canRaster = useMemo(() => exportSupported(), []);
  // High presentation quality (2.5×) also lifts JPEG quality so the larger raster isn't undone by
  // compression; Standard (2×) stays at the visually-lossless default.
  const slideJpegQuality = slideScale >= 2.5 ? 0.95 : 0.9;

  // The selected answers, in session order.
  const specs = useMemo(
    () =>
      answers
        .filter((a) => selected.has(a.index))
        .sort((a, b) => a.index - b.index)
        .map((a) => a.spec),
    [answers, selected],
  );

  // The masthead's issue number: the primary (lowest-index) selected answer's real position in
  // the session. Only meaningful when bundling more than one answer into one document — a solo
  // export has nothing to number itself against, so it stays undefined and the masthead falls
  // back to its plain "No. 01" exactly as it always has.
  const primaryOrdinal = useMemo(() => {
    if (selected.size <= 1) return undefined;
    const sorted = answers.filter((a) => selected.has(a.index)).sort((a, b) => a.index - b.index);
    return sorted[0].index + 1;
  }, [answers, selected]);

  // The presentation deck — pure, synchronous (no DOM measurement), so it's always ready.
  const deck = useMemo(
    () => (specs.length ? composeDeck(specs, generatedAt) : null),
    [specs, generatedAt],
  );
  const allSlides: Slide[] = useMemo(() => deck?.slides ?? [], [deck]);
  // Slides crossed out of THIS export, by stable id. The preview still walks every slide (a
  // skipped one is dimmed there, one click from coming back); only the exported file filters.
  const [skippedSlides, setSkippedSlides] = useState<ReadonlySet<string>>(new Set());
  const slides: Slide[] = useMemo(
    () => allSlides.filter((s) => !skippedSlides.has(s.id)),
    [allSlides, skippedSlides],
  );
  const toggleSlideSkip = (id: string): void => {
    setSkippedSlides((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // The file keeps at least one slide — the last survivor can't be crossed out.
      else if (allSlides.filter((s) => !prev.has(s.id)).length > 1) next.add(id);
      return next;
    });
  };
  // A different answer selection is a different deck — stale cross-outs must not silently
  // drop slides from it.
  useEffect(() => setSkippedSlides(new Set()), [specs]);

  // Rebuild the document whenever the inputs change — but only in document mode, since the
  // layout pass mounts an offscreen DOM to measure heights. The accent is deliberately NOT one of
  // those inputs: it only paints colour, never geometry, and dragging the custom-colour picker
  // fires continuously — keying the layout on it re-measured and re-paginated the whole document
  // on every pixel of the drag. The live accent still reaches the preview and the export below.
  useEffect(() => {
    if (isPres) {
      setBuilding(false);
      return;
    }
    if (!specs.length) {
      setDoc(null);
      setBuilding(false);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    setError(null);
    buildExportDoc(specs, skin, generatedAt, undefined, primaryOrdinal, pageFormat)
      .then((d) => {
        if (!cancelled) {
          setDoc(d);
          setBuilding(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBuilding(false);
          setError('Could not lay out the document.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isPres, specs, skin, generatedAt, primaryOrdinal, pageFormat]);

  // Keep the slide navigator index in range as the deck changes (it walks ALL slides, skipped
  // included, so cross-outs stay reachable and restorable).
  useEffect(() => {
    if (slideIndex >= allSlides.length) setSlideIndex(0);
  }, [allSlides.length, slideIndex]);

  // A reported size belongs to one exact configuration — once any input that affects the output
  // changes, fall back to showing the estimate again rather than a now-stale measured size. A
  // slide crossed out after an export changes the file just as surely as a template does.
  useEffect(() => {
    setLastSize(null);
  }, [format, specs, skin, slideSkin, accent, slideScale, docScale, pageFormat, skippedSlides]);

  // Escape closes the modal — but while an export is in flight it cancels that instead, so a
  // panicked Escape stops the work rather than abandoning it half-run. During a print there is
  // nothing to abort (the browser owns its dialog) and nothing safe to close under it, so Escape
  // stays inert. ← / → walk the deck in presentation mode (suppressed mid-export).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (busy) abortRef.current?.abort();
        else onClose();
        return;
      }
      if (busy) return;
      if (isPres && e.key === 'ArrowRight')
        setSlideIndex((i) => Math.min(allSlides.length - 1, i + 1));
      else if (isPres && e.key === 'ArrowLeft') setSlideIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose, isPres, allSlides.length]);

  // Closing the modal (unmount) mid-export aborts the in-flight render so no work leaks past the UI.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Collapse to a single column on small viewports; the listener keeps it in sync across resizes.
  // 800px is where the wide layout stops fitting its own preview: the panel is min(900px, 96vw)
  // and the controls column takes a fixed 300px, so at 800px the preview column is 96vw − 300 ≈
  // 468px — the last width that can still hold the 460px wide-mode page without clipping it.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 800px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Trap focus inside the panel and restore it to the trigger on close. Escape and the ←/→ deck keys
  // stay on the window handler above (which also needs to ignore them mid-export), so the trap here
  // manages only Tab cycling and focus restore. Focus opens on the Format control, not on the
  // notice's "Details" link that precedes it in DOM order — following that link navigates the SPA
  // to the legal page and takes the whole half-configured export with it.
  useFocusTrap(panelRef, { initialFocus: firstControlRef });

  const titleText = isPres ? deck?.meta.title : doc?.meta.title;
  const safeTitle = (titleText ?? (isPres ? 'Deck' : 'Document'))
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim();
  const baseFilename = `Mavéa — ${safeTitle}${isPres ? ' (slides)' : ''}`;
  const filename = `${baseFilename}.pdf`;
  const ready = isPres ? slides.length > 0 : !!doc;

  // What to tell the user about file size: the measured size after a successful export, otherwise a
  // rough up-front estimate (clearly marked "~") so they can gauge the download before committing.
  const pageCount = isPres ? slides.length : (doc?.pages.length ?? 0);
  const sizeNote =
    lastSize !== null
      ? formatBytes(lastSize)
      : ready && !busy
        ? `~ ${formatBytes(estimateExportBytes(isPres, pageCount, isPres ? slideScale : docScale))}`
        : null;

  // `format` is 'pptx' only for the presentation deck (the Format toggle keeps it unreachable for
  // Document, but the modal's own state can't shift mid-export, so this stays a plain guard rather
  // than trusting the caller).
  const onDownload = async (format: 'pdf' | 'pptx' = 'pdf') => {
    if (busy || !ready || (format === 'pptx' && !isPres)) return;
    setBusy(true);
    setActiveFormat(format);
    setError(null);
    setLastSize(null);
    // A fresh controller per run; the presentation pipeline reports per-page progress and honours
    // the signal so Cancel (or closing the modal) can abort between pages.
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let blob: Blob;
      if (format === 'pptx') {
        setProgress({ done: 0, total: slides.length });
        blob = await exportDeckToPptx(slides, slideSkin, {
          scale: slideScale,
          accent,
          jpegQuality: slideJpegQuality,
          title: deck!.meta.title,
          subject: deck!.meta.topic,
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        });
      } else if (isPres) {
        setProgress({ done: 0, total: slides.length });
        blob = await exportDeckToPdf(slides, slideSkin, {
          scale: slideScale,
          accent,
          jpegQuality: slideJpegQuality,
          properties: pdfProperties(deck!.meta),
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        });
      } else {
        setProgress({ done: 0, total: doc!.pages.length });
        blob = await exportDocToPdf(doc!, skin, {
          scale: docScale,
          accent,
          properties: pdfProperties(doc!.meta),
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        });
      }
      downloadClip(blob, format === 'pptx' ? `${baseFilename}.pptx` : filename);
      setLastSize(blob.size);
    } catch (e) {
      // A user-initiated cancel is expected, not an error — leave the panel quiet.
      if (e instanceof ExportCancelledError) return;
      const noun = format === 'pptx' ? 'PPTX' : 'PDF';
      setError(
        e instanceof ExportTimeoutError
          ? 'Export timed out — check your connection or use Print.'
          : e instanceof ExportUnavailableError
            ? `${noun} renderer unavailable — use Print instead.`
            : `Could not generate the ${noun} — try Print.`,
      );
    } finally {
      setBusy(false);
      setActiveFormat(null);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const onPrint = async (withNotes = false) => {
    if (busy || !ready) return;
    setBusy(true);
    setActiveFormat('print');
    setError(null);
    try {
      if (!isPres) await printDoc(doc!, skin, accent);
      else if (withNotes) await printDeckWithNotes(slides, slideSkin, accent);
      else await printDeck(slides, slideSkin, accent);
    } catch {
      // A print portal that never opened leaves nothing on screen to explain itself — say so
      // rather than silently returning to idle as if the user had dismissed the dialog.
      setError('Could not open the print dialog — try again.');
    } finally {
      setBusy(false);
      setActiveFormat(null);
    }
  };

  const toggleAnswer = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        if (next.size > 1) next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allSelected = selected.size === answers.length;
  // Select-all / collapse-to-just-the-default in one tap. Collapsing keeps the current answer (never
  // empty), preserving the "at least one selected" invariant the per-row toggle also enforces.
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set([defaultIndex]) : new Set(answers.map((a) => a.index)));

  // Scale the live document preview to fit its column. Stacked, the column is the full panel width,
  // so shrink the target to keep the page from overflowing a phone. The doc's own page width
  // (Letter or A4) drives the scale so an A4 preview isn't sized as if it were the wider Letter
  // sheet.
  const PREVIEW_COL = narrow ? 320 : 460;
  const previewPageW = doc ? pageSize(doc.format).width : PAGE_W;
  const previewScale = PREVIEW_COL / previewPageW;

  // One ✕, placed by layout: it belongs over the preview in the two-column panel, but stacked that
  // row sits below the fold on a phone, so it leads the controls instead — sticky, so it stays
  // reachable while the panel scrolls. Built once so both placements can never drift apart.
  const closeButton = (
    <button
      type="button"
      style={narrow ? { ...ST.close, ...ST.closeNarrow } : ST.close}
      onClick={busy ? undefined : onClose}
      aria-label="Close"
      disabled={busy}
    >
      ✕
    </button>
  );

  return (
    <div
      style={ST.scrim}
      role="presentation"
      onClick={busy ? undefined : (e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={narrow ? { ...ST.panel, ...ST.panelNarrow } : ST.panel}
        ref={panelRef}
        tabIndex={-1}
        className="ex-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Export"
      >
        {/* ── Controls ─────────────────────────────────────────── */}
        <div style={narrow ? { ...ST.controls, ...ST.controlsNarrow } : ST.controls}>
          {narrow && closeButton}
          <div style={ST.head}>
            {/* Not "Export as PDF": the same panel also writes a .pptx, and the format the
                reader picks is the control directly below. */}
            <div style={ST.title}>Export</div>
            <div style={ST.subtitle}>
              {isPres
                ? 'A polished slide deck, designed to present.'
                : 'A polished document, designed to read.'}
            </div>
          </div>

          <FeatureUseNotice kind="publishing" from="live" />

          <div style={ST.group}>
            <div style={ST.groupLabel}>Format</div>
            <div style={ST.segmented}>
              {[['Presentation', 'presentation'] as const, ['Document', 'document'] as const].map(
                ([label, val]) => (
                  <button
                    key={val}
                    ref={val === 'presentation' ? firstControlRef : undefined}
                    type="button"
                    style={segBtn(format === val)}
                    onClick={() => setFormat(val)}
                    aria-pressed={format === val}
                    data-export-format={val}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div style={ST.group}>
            <div style={ST.groupLabel}>Template</div>
            <div style={narrow ? { ...ST.gallery, ...ST.galleryNarrow } : ST.gallery}>
              {isPres
                ? SLIDE_SKIN_ORDER.map((id) => {
                    const s = SLIDE_SKINS[id];
                    const on = id === slideSkinId;
                    return (
                      <button
                        key={id}
                        type="button"
                        style={swatchBtn(on)}
                        onClick={() => setSlideSkinId(id)}
                        aria-pressed={on}
                        title={s.blurb}
                        data-export-template={id}
                      >
                        <span
                          style={{
                            ...ST.swatchDot,
                            background: `linear-gradient(135deg, ${s.tokens.paper} 0 50%, ${s.tokens.accent} 50%)`,
                          }}
                        />
                        <span style={ST.swatchLabel}>{s.label}</span>
                      </button>
                    );
                  })
                : SKIN_ORDER.map((id) => {
                    const s = SKINS[id];
                    const on = id === skinId;
                    return (
                      <button
                        key={id}
                        type="button"
                        style={swatchBtn(on)}
                        onClick={() => setSkinId(id)}
                        aria-pressed={on}
                        title={s.blurb}
                        data-export-template={id}
                      >
                        <span
                          style={{
                            ...ST.swatchDot,
                            background: `linear-gradient(135deg, ${s.tokens.pageBg} 0 50%, ${s.tokens.accent} 50%)`,
                          }}
                        />
                        <span style={ST.swatchLabel}>{s.label}</span>
                      </button>
                    );
                  })}
            </div>
          </div>

          {!isPres && (
            <div style={ST.group}>
              <div style={ST.groupLabel}>Page size</div>
              <div style={ST.segmented}>
                {(
                  [
                    ['Letter', 'letter'],
                    ['A4', 'a4'],
                  ] as const
                ).map(([label, val]) => (
                  <button
                    key={val}
                    type="button"
                    style={segBtn(pageFormat === val)}
                    onClick={() => setPageFormat(val)}
                    aria-pressed={pageFormat === val}
                    data-export-page-format={val}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={ST.group}>
            <div style={ST.groupLabel}>Accent</div>
            <div style={ST.accents}>
              <button
                type="button"
                style={accentChip(
                  accentOverride === null,
                  isPres ? slideSkin.tokens.accent : skin.tokens.accent,
                )}
                onClick={() => setAccentOverride(null)}
                title="Template default"
                aria-pressed={accentOverride === null}
              />
              {ACCENT_PRESETS.map(({ name, value }) => (
                <button
                  key={value}
                  type="button"
                  style={accentChip(accentOverride === value, value)}
                  onClick={() => setAccentOverride(value)}
                  aria-label={`Accent ${name}`}
                  title={name}
                  aria-pressed={accentOverride === value}
                />
              ))}
              <label style={ST.colorWrap} title="Custom accent">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccentOverride(e.target.value)}
                  style={ST.colorInput}
                />
                <span style={ST.colorPlus}>+</span>
              </label>
            </div>
          </div>

          {answers.length > 1 && (
            <div style={ST.group}>
              <div style={ST.groupHeadRow}>
                <div style={ST.groupLabel}>Include</div>
                <button type="button" style={ST.linkBtn} onClick={toggleSelectAll}>
                  {allSelected ? 'Just this answer' : 'Select all'}
                </button>
              </div>
              <div style={ST.answers}>
                {answers.map((a) => {
                  const on = selected.has(a.index);
                  return (
                    <button
                      key={a.index}
                      type="button"
                      style={answerRow(on)}
                      onClick={() => toggleAnswer(a.index)}
                      aria-pressed={on}
                    >
                      <span style={checkBox(on)} aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      {/* Two turns on one thread can open with the same words, and the label
                          ellipsizes long before they diverge — the position in the session is
                          what tells them apart. */}
                      <span style={ST.answerOrdinal} aria-hidden="true">
                        {String(a.index + 1).padStart(2, '0')}
                      </span>
                      <span style={ST.answerLabel}>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={ST.group}>
            <div style={ST.groupLabel}>Quality</div>
            <div style={ST.segmented}>
              {(isPres
                ? [['Standard', 2] as const, ['High', 2.5] as const]
                : [['Standard', 2.5] as const, ['High', 3] as const]
              ).map(([label, val]) => {
                const active = (isPres ? slideScale : docScale) === val;
                return (
                  <button
                    key={label}
                    type="button"
                    style={segBtn(active)}
                    onClick={() => (isPres ? setSlideScale(val) : setDocScale(val))}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={ST.footer}>
            {error && <div style={ST.error}>{error}</div>}

            {progress && (
              <div style={ST.progressWrap}>
                <div
                  style={ST.progressTrack}
                  role="progressbar"
                  aria-label={isPres ? 'Exporting slides' : 'Exporting pages'}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                >
                  <div
                    style={{
                      ...ST.progressFill,
                      width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div style={ST.progressLabel}>
                  {progress.done} / {progress.total} {isPres ? 'slides' : 'pages'}
                </div>
              </div>
            )}

            {sizeNote && !progress && <div style={ST.sizeNote}>{sizeNote}</div>}

            {/* Screen-reader-only running commentary: progress, completion, or the error text. */}
            <div aria-live="polite" style={ST.srOnly}>
              {statusMessage(isPres, busy, progress, error, lastSize)}
            </div>

            <div style={ST.actionsStack}>
              <div style={ST.actions}>
                <button
                  type="button"
                  style={ST.primary}
                  onClick={() => onDownload('pdf')}
                  disabled={busy || building || !ready || !canRaster}
                >
                  {busy && activeFormat === 'pdf' ? 'Working…' : 'Download PDF'}
                </button>
                {isPres && (
                  <button
                    type="button"
                    style={ST.secondary}
                    onClick={() => onDownload('pptx')}
                    disabled={busy || building || !ready || !canRaster}
                    title="Export as a PowerPoint file (.pptx). Each slide is a full-bleed image — the design travels exactly, but the text is not editable; speaker notes are."
                  >
                    {busy && activeFormat === 'pptx' ? 'Working…' : 'Download PPTX'}
                  </button>
                )}
              </div>
              {/* Cancel belongs only to work we can actually abort. A print is the browser's own
                dialog — offering Cancel there would be a button that does nothing. */}
              {busy && activeFormat !== 'print' ? (
                <div style={ST.actions}>
                  <button
                    type="button"
                    style={{ ...ST.cancelBtn, flex: 1 }}
                    onClick={() => abortRef.current?.abort()}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={ST.actions}>
                  <button
                    type="button"
                    style={ST.secondary}
                    onClick={() => onPrint(false)}
                    disabled={busy || building || !ready}
                  >
                    Print
                  </button>
                  {isPres && (
                    <button
                      type="button"
                      style={ST.secondary}
                      onClick={() => onPrint(true)}
                      disabled={busy || building || !ready}
                      title="Print the deck with each slide's speaker notes underneath it"
                    >
                      Print with notes
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Live preview ─────────────────────────────────────── */}
        <div style={narrow ? { ...ST.previewArea, ...ST.previewAreaNarrow } : ST.previewArea}>
          {!narrow && closeButton}
          {isPres ? (
            allSlides.length ? (
              (() => {
                const previewIdx = Math.min(slideIndex, allSlides.length - 1);
                const previewSlide = allSlides[previewIdx];
                const previewSkipped = skippedSlides.has(previewSlide.id);
                return (
                  <div style={ST.deckArea}>
                    <div
                      style={
                        previewSkipped
                          ? { ...ST.slideBox, opacity: 0.4, filter: 'saturate(0.6)' }
                          : ST.slideBox
                      }
                    >
                      {/* A stable key keeps this one SlideStage instance across skin/accent changes, so
                          switching templates only re-renders props — it never remounts and resets the
                          measured fit-scale (which read as a flash). slide/ctx still drive navigation. */}
                      <SlideStage
                        key="preso-preview"
                        slide={previewSlide}
                        skin={slideSkin}
                        ctx={{ index: previewIdx, total: allSlides.length }}
                        accent={accent}
                        style={{ borderRadius: 10, boxShadow: '0 18px 50px rgba(0,0,0,.45)' }}
                      />
                    </div>
                    <div style={ST.navbar}>
                      <button
                        type="button"
                        style={ST.navBtn}
                        onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                        disabled={previewIdx <= 0}
                        aria-label="Previous slide"
                      >
                        ‹
                      </button>
                      <span style={ST.navCount}>
                        {previewIdx + 1} / {allSlides.length}
                      </span>
                      <button
                        type="button"
                        style={ST.navBtn}
                        onClick={() => setSlideIndex((i) => Math.min(allSlides.length - 1, i + 1))}
                        disabled={previewIdx >= allSlides.length - 1}
                        aria-label="Next slide"
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        style={previewSkipped ? { ...ST.skipBtn, ...ST.skipBtnOn } : ST.skipBtn}
                        onClick={() => toggleSlideSkip(previewSlide.id)}
                        disabled={busy || (!previewSkipped && slides.length <= 1)}
                        aria-pressed={previewSkipped}
                        title={
                          previewSkipped
                            ? 'Put this slide back into the file'
                            : 'Leave this slide out of the file'
                        }
                      >
                        {previewSkipped ? 'Include slide' : 'Skip slide'}
                      </button>
                    </div>
                    {skippedSlides.size > 0 && (
                      <div style={ST.skipNote}>
                        {slides.length} of {allSlides.length} slides in the file
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div style={ST.previewNote}>Select at least one answer to export.</div>
            )
          ) : (
            <>
              {building && <div style={ST.previewNote}>Composing…</div>}
              {!building && !doc && (
                <div style={ST.previewNote}>Select at least one answer to export.</div>
              )}
              {doc && (
                <div className="ex-preview" style={ST.previewScroll}>
                  {/* A transform-scaled child keeps its UNSCALED layout box, so without an explicit
                      scaled height the scroll area ran on into empty space far below the last page.
                      Give the wrapper the flow's real scaled height and clip the overhang. */}
                  <div
                    style={{
                      width: previewPageW * previewScale,
                      height: previewFlowHeight(doc) * previewScale,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                        width: previewPageW,
                      }}
                    >
                      <ExportDocView doc={doc} skin={skin} accent={accent} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── styles (fixed light-on-dark: the scrim is always dark) ──────────────── */

const PANEL = '#14171E';
const TXT = '#E8EAF0';
const TXT_DIM = '#9AA0AD';
const LINE = 'rgba(255,255,255,.10)';
const FIELD = 'rgba(255,255,255,.06)';

const ST = {
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(8,10,16,.66)',
    backdropFilter: 'blur(10px)',
    padding: 24,
  },
  panel: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    width: 'min(900px, 96vw)',
    height: 'min(760px, 92vh)',
    background: PANEL,
    border: `1px solid ${LINE}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,.5)',
    color: TXT,
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
  // Stacked single column: controls over preview, the whole panel scrolls vertically so nothing is
  // clipped (the two-column `overflow: hidden` would otherwise crush the preview off-screen).
  panelNarrow: {
    gridTemplateColumns: '1fr',
    gridTemplateRows: 'auto auto',
    overflowY: 'auto',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    padding: 24,
    borderRight: `1px solid ${LINE}`,
    overflowY: 'auto',
  },
  // Stacked: the divider runs under the controls instead of beside them, and the panel (not this
  // column) owns the scroll so the page-length flow reads top to bottom.
  controlsNarrow: {
    borderRight: 'none',
    borderBottom: `1px solid ${LINE}`,
    overflowY: 'visible',
  },
  head: { display: 'flex', flexDirection: 'column', gap: 4 },
  title: { fontSize: 17, fontWeight: 650, letterSpacing: '-.01em' },
  subtitle: { fontSize: 12.5, color: TXT_DIM },
  group: { display: 'flex', flexDirection: 'column', gap: 9 },
  groupLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: TXT_DIM,
  },
  groupHeadRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  linkBtn: {
    border: 'none',
    background: 'transparent',
    color: '#5B8CFF',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  gallery: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 },
  // Let the swatches reflow across whatever width the stacked column has.
  galleryNarrow: { gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' },
  swatchDot: { width: 12, height: 12, borderRadius: '50%', flex: 'none' },
  swatchLabel: { fontSize: 12, fontWeight: 550 },
  accents: { display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  answers: { display: 'flex', flexDirection: 'column', gap: 6 },
  answerOrdinal: {
    flex: 'none',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '.06em',
    color: TXT_DIM,
    fontVariantNumeric: 'tabular-nums',
  },
  answerLabel: {
    fontSize: 12.5,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  segmented: { display: 'flex', gap: 6 },
  colorWrap: {
    position: 'relative',
    width: 24,
    height: 24,
    borderRadius: 6,
    border: `1px solid ${LINE}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
  },
  colorInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
  },
  colorPlus: { fontSize: 14, color: TXT_DIM, pointerEvents: 'none' },
  // Two stacked rows (download formats, then print variants/Cancel) — kept separate from `actions`
  // itself so Cancel can still swap in as one flat row when an export is running.
  //
  actionsStack: { display: 'flex', flexDirection: 'column', gap: 8 },
  // Pinned to the bottom of the scrolling column. The panel is height-capped at 760px, so a full
  // control list (template + accent + include + quality) overflows it at every desktop size and
  // the download buttons used to sit below the clipped edge — the studio opened showing no way to
  // export. The size note and the progress bar ride along: they are what you read before, and
  // while, committing to a download.
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    position: 'sticky',
    bottom: -24,
    zIndex: 1,
    marginInline: -24,
    paddingInline: 24,
    paddingTop: 12,
    paddingBottom: 24,
    background: PANEL,
    borderTop: `1px solid ${LINE}`,
  },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  primary: {
    flex: 1,
    minHeight: 44,
    padding: '11px 8px',
    borderRadius: 10,
    border: 'none',
    background: '#5B8CFF',
    color: '#fff',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondary: {
    flex: 1,
    minHeight: 44,
    padding: '11px 8px',
    borderRadius: 10,
    border: `1px solid ${LINE}`,
    background: 'transparent',
    color: TXT,
    fontSize: 13.5,
    fontWeight: 550,
    cursor: 'pointer',
  },
  error: { fontSize: 12, color: '#FF9B8A', lineHeight: 1.4 },
  cancelBtn: {
    padding: '11px 16px',
    borderRadius: 10,
    border: `1px solid ${LINE}`,
    background: 'transparent',
    color: TXT_DIM,
    fontSize: 13.5,
    fontWeight: 550,
    cursor: 'pointer',
  },
  progressWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: FIELD,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    background: '#5B8CFF',
    transition: 'width .2s ease',
  },
  progressLabel: {
    fontSize: 11.5,
    color: TXT_DIM,
    fontVariantNumeric: 'tabular-nums',
  },
  sizeNote: { fontSize: 11.5, color: TXT_DIM, fontVariantNumeric: 'tabular-nums' },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  previewArea: {
    position: 'relative',
    background: '#0C0E13',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Stacked: give the preview a real height (the grid row is `auto`, so without this it collapses).
  previewAreaNarrow: { minHeight: '52vh' },
  previewScroll: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    display: 'flex',
    justifyContent: 'center',
    padding: '28px 0',
  },
  previewNote: { color: TXT_DIM, fontSize: 13 },
  deckArea: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: '28px 32px',
    boxSizing: 'border-box',
  },
  slideBox: {
    width: '100%',
    maxWidth: 760,
    aspectRatio: '16 / 9',
    display: 'flex',
    // Without this the flex item's automatic minimum resolves against the unscaled 1920×1080
    // canvas inside, the aspect ratio loses, and the slide's own frame — the rounded corners and
    // the drop shadow that separate it from the backdrop — paints around a taller phantom box.
    minHeight: 0,
  },
  navbar: { display: 'flex', alignItems: 'center', gap: 16 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: `1px solid ${LINE}`,
    background: FIELD,
    color: TXT,
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
  },
  navCount: {
    fontSize: 12.5,
    fontWeight: 600,
    color: TXT_DIM,
    minWidth: 64,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  skipBtn: {
    padding: '9px 14px',
    borderRadius: 999,
    border: `1px solid ${LINE}`,
    background: FIELD,
    color: TXT,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
  skipBtnOn: {
    borderStyle: 'dashed',
    color: TXT_DIM,
  },
  skipNote: {
    fontSize: 12,
    fontWeight: 600,
    color: TXT_DIM,
    fontVariantNumeric: 'tabular-nums',
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `1px solid ${LINE}`,
    background: 'rgba(20,23,30,.8)',
    color: TXT,
    cursor: 'pointer',
    fontSize: 13,
  },
  // Stacked: only the positioning changes. `right: auto` is required — a sticky box treats `right`
  // as a horizontal stick offset against the scrollport, not as the corner pin `absolute` makes it.
  closeNarrow: { position: 'sticky', top: 8, right: 'auto', alignSelf: 'flex-end', zIndex: 3 },
} satisfies Record<string, CSSProperties>;

/** The unscaled height of the whole stacked page flow `ExportDocView` renders — every sheet plus
 *  the gaps between them. The preview scales that flow with a transform, which leaves the layout
 *  box at natural size, so the wrapper has to be told the scaled height explicitly. */
function previewFlowHeight(doc: ExportDoc): number {
  const n = doc.pages.length;
  return pageSize(doc.format).height * n + DOC_PAGE_GAP * Math.max(0, n - 1);
}

/** Human-friendly byte size, e.g. 2_516_582 → "2.4 MB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * A rough up-front size guess, in bytes, so the user can gauge the download before starting. JPEG
 * weight scales with the rendered pixel count, so a higher quality multiplier means a bigger file;
 * these per-page constants are deliberately approximate (real content varies) and shown with a "~".
 */
function estimateExportBytes(isPres: boolean, pages: number, scale: RasterScale): number {
  // Calibrated against real downloads (a 9-slide deck, a 3-page document, Standard quality), not
  // derived on paper — the old 120 KB/slide guess came out 3-10x under on every template measured.
  //
  // A slide's weight swings with how much ink its skin puts on the paper: 367 KB (Cobalt), 533 KB
  // (Folio), 1.26 MB (Noir) per slide. One constant can only be roughly right for all three, so
  // it sits at the geometric middle of that spread — the value whose worst case is the same
  // factor high as it is low (~1.9x either way) rather than an order of magnitude under. Document
  // pages are flat colour and text and vary far less: 280 KB/page measured.
  //
  // Both High tiers scale by rendered pixel count, i.e. the square of the quality multiplier.
  const perPage = isPres ? (scale >= 2.5 ? 1_060_000 : 680_000) : scale >= 3 ? 400_000 : 280_000;
  return Math.max(1, pages) * perPage;
}

/** The aria-live announcement: in-flight progress, the final size on success, or the error text. */
function statusMessage(
  isPres: boolean,
  busy: boolean,
  progress: { done: number; total: number } | null,
  error: string | null,
  lastSize: number | null,
): string {
  if (error) return error;
  if (busy && progress) {
    const noun = isPres ? 'slide' : 'page';
    return `Exporting ${noun} ${progress.done} of ${progress.total}`;
  }
  if (busy) return 'Preparing export…';
  if (lastSize !== null) return `Export complete, ${formatBytes(lastSize)}`;
  return '';
}

function swatchBtn(on: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 10px',
    borderRadius: 9,
    border: `1px solid ${on ? '#5B8CFF' : LINE}`,
    background: on ? 'rgba(91,140,255,.14)' : FIELD,
    color: TXT,
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function accentChip(on: boolean, color: string): CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 6,
    background: color,
    border: on ? '2px solid #fff' : `1px solid ${LINE}`,
    cursor: 'pointer',
    padding: 0,
  };
}

function answerRow(on: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${on ? 'rgba(91,140,255,.4)' : LINE}`,
    background: on ? 'rgba(91,140,255,.10)' : FIELD,
    color: TXT,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };
}

function checkBox(on: boolean): CSSProperties {
  return {
    flex: 'none',
    width: 16,
    height: 16,
    borderRadius: 4,
    border: on ? 'none' : `1.5px solid ${TXT_DIM}`,
    background: on ? '#5B8CFF' : 'transparent',
    color: '#fff',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function segBtn(on: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${on ? '#5B8CFF' : LINE}`,
    background: on ? 'rgba(91,140,255,.14)' : FIELD,
    color: TXT,
    fontSize: 12.5,
    fontWeight: 550,
    cursor: 'pointer',
  };
}
