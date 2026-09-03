// PrismApp — standalone surface for Prism at #/prism. Upload-first with a staging step:
// files are collected and shown (add more, remove any) before you confirm and open the map.
// The hero and drop zone stay visible throughout — staged files appear inline below the zone.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { homeTarget } from '../../lib/homeTarget';
import { applyTheme, readTheme } from '../../lib/theme';
import {
  fileToPrismAttachment,
  attachmentFileError,
  attachmentLabel,
  ACCEPTED_TYPES,
  type Attachment,
  type AttachmentError,
} from '../attachments';
import { Icon } from '../../icons/icons';
import { AsyncSurface } from '../../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../../lib/preloadableLazy';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import './prism-app.css';

const prismWorkbench = createPreloadableLazy(() =>
  import('./PrismWorkbench').then((m) => ({ default: m.PrismWorkbench })),
);
const PrismWorkbench = prismWorkbench.Component;

/** Identity of a staged file: two picked from different folders can share a basename. */
const fileKey = (file: File): string => `${file.name}:${file.size}`;

const ERROR_LABEL: Record<AttachmentError, string> = {
  'too-large': 'File is too large. Documents up to 40 MB, images up to 10 MB.',
  unsupported: 'Unsupported file type. Try a PDF, Word doc, spreadsheet, image, or text file.',
  'legacy-office':
    'That’s the old binary Office format. Re-save it as .docx, .pptx or .xlsx and drop it again.',
};

export function PrismApp(): ReactElement {
  // Back goes where you came from — Live if you have a session, the front door otherwise.
  const home = homeTarget();
  useEffect(() => applyTheme(readTheme()), []);

  const [staged, setStaged] = useState<File[]>([]);
  const [docs, setDocs] = useState<Attachment[] | null>(null);
  const [opening, setOpening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stageFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      void prismWorkbench.preload().catch(() => {});
      // Keyed by name+size, not name alone: a second report.pdf picked from another folder is a
      // different document, and matching on the basename dropped it with nothing on screen saying
      // so — while two same-named files in ONE drop both staged, under the same React key, and
      // then removed each other.
      const seen = new Set(staged.map(fileKey));
      const fresh: File[] = [];
      let refused: File | null = null;
      let duplicates = 0;
      for (const file of Array.from(files)) {
        if (attachmentFileError(file)) {
          refused ??= file;
        } else if (seen.has(fileKey(file))) {
          duplicates += 1;
        } else {
          seen.add(fileKey(file));
          fresh.push(file);
        }
      }
      // One note per drop, and the loudest thing that happened. A refusal names the file it
      // refused, so a mixed drop no longer reports only whatever came last.
      const problem = refused ? attachmentFileError(refused) : null;
      setError(
        refused && problem
          ? `“${refused.name}” — ${ERROR_LABEL[problem]}`
          : duplicates > 0
            ? 'Already added — files are matched by name and size.'
            : null,
      );
      if (fresh.length > 0) setStaged((prev) => [...prev, ...fresh]);
      if (inputRef.current) inputRef.current.value = '';
    },
    [staged],
  );

  // By index, not name: two staged files can legitimately share a basename, and removing "by name"
  // deleted every one of them while their rows stayed on screen.
  const removeStaged = useCallback((index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const confirm = useCallback(async () => {
    if (staged.length === 0 || opening) return;
    setOpening(true);
    setError(null);
    void prismWorkbench.preload().catch(() => {});
    const results = await Promise.all(staged.map(fileToPrismAttachment));
    const attachments = results.flatMap((result) => (result.attachment ? [result.attachment] : []));
    if (attachments.length === staged.length) setDocs(attachments);
    else setError(ERROR_LABEL[results.find((result) => result.error)?.error ?? 'unsupported']);
    setOpening(false);
  }, [staged, opening]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      stageFiles(e.dataTransfer.files);
    },
    [stageFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragging(false);
  }, []);

  if (docs) {
    return (
      <AsyncSurface label="Prism workbench" overlay>
        <PrismWorkbench pdf={docs} onClose={() => setDocs(null)} />
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
        <span className="prism-app-brand">Prism</span>
      </header>

      <main className="prism-app-main">
        {/* Hero — always visible */}
        <div className="prism-app-hero">
          <h1 className="prism-app-title">Understand any document</h1>
          <p className="prism-app-lede">
            Drop a PDF, Word doc, slide deck, spreadsheet, image, or text file. Prism maps every
            claim, finding, and risk — every card cites its exact source.
          </p>
          <FeatureUseNotice kind="upload" />
        </div>

        {/* Drop zone — always full-size */}
        <div
          className={`prism-dropzone${dragging ? ' prism-dropzone--over' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload a document"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          {...preloadIntentProps(prismWorkbench.preload)}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            hidden
            onChange={(e) => stageFiles(e.target.files)}
          />
          <Icon.upload />
          <span className="prism-dropzone-label">
            {dragging
              ? 'Drop to add'
              : staged.length > 0
                ? 'Drop more files or click to add'
                : 'Drop files or click to browse'}
          </span>
          <span className="prism-dropzone-hint">
            PDF · Word · Excel · PowerPoint · Image · Text
          </span>
        </div>

        {error && (
          <p className="prism-app-error" role="alert">
            {error}
          </p>
        )}

        {/* Staged files — appear inline below the drop zone, page stays intact */}
        {staged.length > 0 && (
          <div className="prism-staged">
            <p className="prism-staged-label">
              {staged.length === 1 ? '1 document ready' : `${staged.length} documents ready`}
            </p>
            <ul className="prism-staged-list">
              {staged.map((file, index) => (
                <li key={fileKey(file)} className="prism-staged-item">
                  <Icon.doc />
                  <span className="prism-staged-name">
                    {attachmentLabel({
                      name: file.name,
                      mime: file.type,
                      data: '',
                      size: file.size,
                    })}
                  </span>
                  <button
                    type="button"
                    className="prism-staged-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStaged(index);
                    }}
                    aria-label={`Remove ${file.name}`}
                  >
                    <Icon.x />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="prism-confirm-btn"
              onClick={() => void confirm()}
              disabled={opening}
              {...preloadIntentProps(prismWorkbench.preload)}
            >
              {opening ? 'Preparing documents…' : 'Open in Prism'}
              <Icon.chevR />
            </button>
          </div>
        )}

        {/* Feature bullets — always visible */}
        <ul className="prism-app-features">
          <li>
            <strong>Maps claims spatially</strong> — regions, findings, and risks laid out so you
            can see the whole shape at once.
          </li>
          <li>
            <strong>Every card cites its source</strong> — verbatim quote + page number, always. If
            Mavéa can't cite it, the card doesn't exist.
          </li>
          <li>
            <strong>Ask the whole document</strong> — put a question to it and the answer lights up
            the exact lines it came from.
          </li>
        </ul>
      </main>
    </div>
  );
}
