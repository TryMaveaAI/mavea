// SynthesisApp — the standalone Synthesis World surface at #/synthesis, a sibling of PrismApp. Where
// Prism takes one document (or a few), this takes a whole PILE: drop a folder, a .zip data room, or a
// stack of files, and it fuses them into one navigable map of themes, contradictions, and gaps. Upload
// is staged (add more / remove any) before you open the world. Reuses Prism's drop-zone styling; the
// folder and archive expansion reuse the tested ingest utilities. Staging/extraction is local;
// analysis may send relevant content to the selected model, disclosed at the intake itself.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { homeTarget } from '../../lib/homeTarget';
import { applyTheme, readTheme } from '../../lib/theme';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { attachmentLabel, MAX_DOCUMENT_BYTES, type Attachment } from '../attachments';
import { Icon } from '../../icons/icons';
import { filesToCorpus, MAX_CORPUS_SOURCES } from './synthesis/ingest';
import { expandZip, isZip } from './synthesis/ingestZip';
import { DEMO_SPEC, DEMO_CORPUS } from './synthesis/demoSpec';
import './prism-app.css';
import { AsyncSurface } from '../../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../../lib/preloadableLazy';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';

const prismWorkbench = createPreloadableLazy(() =>
  import('./PrismOverlay').then((m) => ({ default: m.PrismOverlay })),
);
const synthesisWorkbench = createPreloadableLazy(() =>
  import('./SynthesisOverlay').then((m) => ({ default: m.SynthesisOverlay })),
);
const PrismOverlay = prismWorkbench.Component;
const SynthesisOverlay = synthesisWorkbench.Component;

/** The archive cap, in MB, for the "too large" note — the same ceiling every other document gets. */
const ARCHIVE_MB = Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024));

/** Read a raw File into an Attachment WITHOUT the type guard (used only to hand a .zip to the archive
 *  reader — the members inside are then type-guarded normally by expandZip). The caller enforces the
 *  size gate first: this reads the whole file into memory, so an ungated archive is a tab-killer. */
async function rawAttachment(file: File): Promise<Attachment> {
  return {
    name: file.name,
    mime: file.type || 'application/zip',
    data: '',
    size: file.size,
    file,
  };
}

export function SynthesisApp(): ReactElement {
  // Back goes where you came from — Live if you have a session, the front door otherwise.
  const home = homeTarget();
  useEffect(() => applyTheme(readTheme()), []);

  const [staged, setStaged] = useState<Attachment[]>([]);
  // What's open, and how: Prism (a single doc, or a 2-3 compare) vs the Synthesis World. At 3 sources
  // the user picks; below/above that it's decided by count.
  const [opened, setOpened] = useState<{ sources: Attachment[]; mode: 'prism' | 'synth' } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // The folder picker needs non-standard attributes React won't type — set them imperatively.
  useEffect(() => {
    const el = folderRef.current;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

  // Use the Live config as-is (default Gemini). We do NOT gate on a browser-side key: the same-origin
  // /llm proxy injects the dev key, so Synthesis works keyless in dev exactly like Ripple; a user key,
  // when present, is used. (An earlier key-gate here fell back to Anthropic and 401'd.)
  const cfg = useMemo(() => toModelConfig(getLiveConfigV2()), []);

  // `?demo=1` (the walkthrough's "See how") shows the Synthesis World from a canned settled corpus —
  // the real overlay, no upload and no model call, so a keyless visitor still sees synthesis work.
  const [demoMode] = useState(
    () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('demo') === '1',
  );

  const stageFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      void synthesisWorkbench.preload().catch(() => {});
      setBusy(true);
      setNote(null);
      const files = Array.from(fileList);
      // An archive is read whole into memory (and again as base64) before a single member is seen, so
      // it needs the size gate every other file already gets — fileToAttachment's cap can't apply here
      // because a .zip is deliberately read raw. Without this, dropping a multi-gigabyte archive took
      // the tab down with no message at all; the ZIP reader's own inflate budget assumes this gate.
      const zips = files.filter((f) => isZipFile(f) && f.size <= MAX_DOCUMENT_BYTES);
      const oversized = files.filter((f) => isZipFile(f) && f.size > MAX_DOCUMENT_BYTES);
      const rest = files.filter((f) => !isZipFile(f));

      // A read that blows up mid-stage must still hand the surface back: without this, an unreadable
      // file left the spinner up forever and the file inputs holding their old value, so re-picking
      // the same folder fired no change event and the upload looked permanently wedged.
      try {
        const incoming: Attachment[] = [];
        // Folders / loose files → the tested corpus encoder (filters images + junk, caps the count).
        const fromFiles = await filesToCorpus(rest);
        incoming.push(...fromFiles.sources);
        // Archives → expand each into its explodable members.
        for (const zip of zips) {
          try {
            incoming.push(...(await expandZip(await rawAttachment(zip))));
          } catch {
            /* a bad archive is skipped, not fatal */
          }
        }

        setStaged((prev) => {
          // Dedup by name+size, not name alone — a data room routinely has same-named files in
          // different subfolders (Attachment carries no path), and name-only matching silently dropped
          // a genuinely different second "report.pdf" as if it were already staged.
          const seen = new Set(prev.map(attKey));
          const merged = [...prev, ...incoming.filter((a) => !seen.has(attKey(a)))];
          return merged.length > MAX_CORPUS_SOURCES ? merged.slice(0, MAX_CORPUS_SOURCES) : merged;
        });
        // One note, decided here rather than inside the state updater (which React may run twice):
        // the loudest thing that happened to this drop.
        if (oversized.length > 0)
          setNote(`Archive is too large — up to ${ARCHIVE_MB} MB per .zip.`);
        else if (incoming.length === 0)
          setNote('No readable sources found. Add PDFs, docs, or text/data files.');
        else if (staged.length + incoming.length > MAX_CORPUS_SOURCES)
          setNote(`Capped at ${MAX_CORPUS_SOURCES} sources.`);
      } catch {
        setNote("Those files couldn't be read. Try PDFs, docs, or text/data files.");
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
        if (folderRef.current) folderRef.current.value = '';
      }
    },
    [staged.length],
  );

  const removeStaged = useCallback((index: number) => {
    // By index, not name — two staged files can legitimately share a basename (different subfolders
    // of a dropped data room), and removing "by name" would delete every one of them at once.
    setStaged((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void stageFiles(e.dataTransfer.files);
    },
    [stageFiles],
  );

  if (demoMode) {
    // The key-free walkthrough: the settled Synthesis World straight away, no pile to drop.
    return (
      <AsyncSurface label="Synthesis world" overlay>
        <SynthesisOverlay
          cfg={cfg}
          demo={{ spec: DEMO_SPEC, corpus: DEMO_CORPUS }}
          onClose={() => {
            window.location.hash = home.href;
          }}
        />
      </AsyncSurface>
    );
  }

  if (opened) {
    // Prism (single doc or a 2-3 compare) and the Synthesis World are the same rich overlay.
    return (
      <AsyncSurface label={opened.mode === 'prism' ? 'Prism workbench' : 'Synthesis world'} overlay>
        {opened.mode === 'prism' ? (
          <PrismOverlay pdf={opened.sources} cfg={cfg} onClose={() => setOpened(null)} />
        ) : (
          <SynthesisOverlay sources={opened.sources} cfg={cfg} onClose={() => setOpened(null)} />
        )}
      </AsyncSurface>
    );
  }

  return (
    <div className="prism-app">
      <header className="prism-app-header">
        <button
          type="button"
          className="prism-app-back"
          onClick={() => {
            window.location.hash = home.href;
          }}
          aria-label={`Back to ${home.label}`}
          title={`Back to ${home.label}`}
        >
          <Icon.chevL />
        </button>
        <span className="prism-app-brand">Synthesis</span>
      </header>

      <main className="prism-app-main">
        <div className="prism-app-hero">
          <h1 className="prism-app-title">Drop in 100 sources. Walk the one result.</h1>
          <p className="prism-app-lede">
            Point Mavéa at a whole topic — a folder of papers, a data room, a quarter of notes — and
            it fuses them into one map: where they agree, where they fight, and where they’re
            silent.
          </p>
          <FeatureUseNotice kind="upload" />
        </div>

        <div
          className={`prism-dropzone${dragging ? ' prism-dropzone--over' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
              setDragging(false);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Add sources"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
          {...preloadIntentProps(synthesisWorkbench.preload)}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            className="prism-dropzone-input"
            onChange={(e) => void stageFiles(e.target.files)}
            aria-hidden="true"
          />
          <input
            ref={folderRef}
            type="file"
            className="prism-dropzone-input"
            onChange={(e) => void stageFiles(e.target.files)}
            aria-hidden="true"
          />
          <Icon.upload />
          <span className="prism-dropzone-label">
            {dragging ? 'Drop to add' : busy ? 'Reading…' : 'Drop a folder, a .zip, or files'}
          </span>
          <span className="prism-dropzone-hint">
            PDF · Word · Excel · PowerPoint · Text · CSV — or a whole folder / archive
          </span>
          <button
            type="button"
            style={{
              marginTop: 12,
              padding: '7px 16px',
              whiteSpace: 'nowrap',
              borderRadius: 'var(--r-full, 999px)',
              border: '1px solid var(--line)',
              background: 'var(--surface-elevated)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              folderRef.current?.click();
            }}
          >
            Choose a folder…
          </button>
        </div>

        {note && (
          <p className="prism-app-error" role="status">
            {note}
          </p>
        )}

        {staged.length > 0 && (
          <div className="prism-staged">
            <p className="prism-staged-label">
              {staged.length === 1 ? '1 source ready' : `${staged.length} sources ready`}
            </p>
            <ul className="prism-staged-list">
              {staged.slice(0, 60).map((a, i) => (
                <li key={`${attKey(a)}-${i}`} className="prism-staged-item">
                  <Icon.doc />
                  <span className="prism-staged-name">{attachmentLabel(a)}</span>
                  <button
                    type="button"
                    className="prism-staged-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStaged(i);
                    }}
                    aria-label={`Remove ${a.name}`}
                  >
                    <Icon.x />
                  </button>
                </li>
              ))}
            </ul>
            {staged.length > 60 && (
              <p className="prism-staged-label">+ {staged.length - 60} more</p>
            )}
            {(() => {
              const open = (mode: 'prism' | 'synth') => {
                void (
                  mode === 'prism' ? prismWorkbench.preload() : synthesisWorkbench.preload()
                ).catch(() => {});
                setOpened({ sources: staged, mode });
              };
              const n = staged.length;
              // 1 → Prism (single); 2 → Prism compare; 3 → pick either; 4+ → Synthesize.
              if (n <= 2)
                return (
                  <button
                    type="button"
                    className="prism-confirm-btn"
                    onClick={() => open('prism')}
                    {...preloadIntentProps(prismWorkbench.preload)}
                  >
                    {n === 1 ? 'Open in Prism' : 'Compare 2 documents'}
                    <Icon.chevR />
                  </button>
                );
              if (n === 3)
                return (
                  <div className="prism-confirm-row">
                    <button
                      type="button"
                      className="prism-confirm-btn prism-confirm-alt"
                      onClick={() => open('prism')}
                      {...preloadIntentProps(prismWorkbench.preload)}
                    >
                      Compare 3
                    </button>
                    <button
                      type="button"
                      className="prism-confirm-btn"
                      onClick={() => open('synth')}
                      {...preloadIntentProps(synthesisWorkbench.preload)}
                    >
                      Synthesize 3 sources
                      <Icon.chevR />
                    </button>
                  </div>
                );
              return (
                <button
                  type="button"
                  className="prism-confirm-btn"
                  onClick={() => open('synth')}
                  {...preloadIntentProps(synthesisWorkbench.preload)}
                >
                  Synthesize {n} sources
                  <Icon.chevR />
                </button>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}

function isZipFile(f: File): boolean {
  return isZip({ name: f.name, mime: f.type, data: '', size: f.size });
}

/** An Attachment carries no path/id, only a bare filename — key on name+size so two different files
 *  that happen to share a basename (common across a data room's subfolders) aren't treated as one. */
function attKey(a: Attachment): string {
  return `${a.name}:${a.size}`;
}
