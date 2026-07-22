import { useRef, useState } from 'react';
import type { CSSProperties, DragEvent as RDragEvent } from 'react';
import { Icon } from '../../../icons/icons';
import { useInterval } from '../../../hooks/useInterval';
import type { FileuploadProps, UploadFile } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FileuploadProps & { delay?: number };

const KIND_ICON: Record<string, keyof typeof Icon> = {
  doc: 'doc',
  pdf: 'doc',
  image: 'image',
  slides: 'slides',
  table: 'table',
  file: 'paperclip',
};

const DEFAULT_FILES: UploadFile[] = [
  { name: 'Q3-financials.pdf', size: '2.4 MB', progress: 100, kind: 'pdf' },
  { name: 'board-deck.key', size: '18.1 MB', progress: 64, kind: 'slides' },
  { name: 'cohorts.csv', size: '840 KB', progress: 100, kind: 'table' },
];

const NEW_NAMES = [
  'retention-2026.xlsx',
  'pricing-v3.fig',
  'demo-clip.mov',
  'notes.md',
  'logo-marks.png',
];
const NEW_SIZES = ['1.2 MB', '4.7 MB', '12.0 MB', '36 KB', '320 KB'];
const NEW_KINDS: UploadFile['kind'][] = ['table', 'image', 'image', 'doc', 'image'];

export function Fileupload({
  title,
  icon = 'upload',
  iconColor = 'var(--presence)',
  prompt = 'Drag & drop files here',
  hint = 'PDF, CSV, PNG up to 25 MB',
  files = DEFAULT_FILES,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.upload;
  const [list, setList] = useState<UploadFile[]>(files);
  const [over, setOver] = useState(false);
  const addRef = useRef(0);

  // Drive the simulated upload from one self-cancelling interval: while any file is still
  // below 100%, advance it each tick; the interval pauses (and is cleared) once all finish.
  const uploading = list.some((x) => (x.progress ?? 100) < 100);
  useInterval(
    () => {
      setList((l) =>
        l.map((x) =>
          (x.progress ?? 100) < 100 ? { ...x, progress: Math.min(100, (x.progress ?? 0) + 17) } : x,
        ),
      );
    },
    uploading ? 280 : null,
  );

  const addFile = () => {
    const i = addRef.current % NEW_NAMES.length;
    addRef.current += 1;
    const f: UploadFile = {
      name: NEW_NAMES[i],
      size: NEW_SIZES[i],
      progress: 8,
      kind: NEW_KINDS[i],
    };
    setList((l) => [...l, f]);
  };

  const onDrop = (e: RDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    addFile();
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pk-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className={`fu-zone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={addFile}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            addFile();
          }
        }}
      >
        <span className="fu-icon">
          <Icon.upload className="fu-icon-ic" />
        </span>
        <div className="fu-prompt">{prompt}</div>
        <div className="fu-hint faint">{hint}</div>
        <span className="fu-browse">Browse files</span>
      </div>

      {list.length > 0 && (
        <div className="fu-list">
          {list.map((f, i) => {
            const FIc = Icon[KIND_ICON[f.kind || 'file'] || 'paperclip'] || Icon.paperclip;
            const pct = f.progress ?? 100;
            const done = pct >= 100;
            return (
              <div className={`fu-file ${done ? 'done' : ''}`} key={f.name + i}>
                <span className="fu-file-ic">
                  <FIc className="ic" />
                </span>
                <div className="fu-file-body">
                  <div className="fu-file-top">
                    <span className="fu-file-name">{f.name}</span>
                    <span className="fu-file-size faint">{f.size}</span>
                  </div>
                  {done ? (
                    <div className="fu-file-status">
                      <Icon.check className="fu-file-check" /> Uploaded
                    </div>
                  ) : (
                    <div className="fu-file-bar">
                      <span className="fu-file-fill" style={{ width: pct + '%' }} />
                      <span className="fu-file-pct tab-num">{pct}%</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="fu-file-x"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setList((l) => l.filter((_, j) => j !== i))}
                >
                  <Icon.x className="ic" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
