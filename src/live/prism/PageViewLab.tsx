// PageViewLab (#/pageviewlab) — isolated repro harness for the PDF page viewer, to chase the
// "shaking / blurry on page change" bug without needing a model or an explode. Loads a real bundled
// PDF and mounts DocPageView with paging, in the same flex/scroll context Prism uses.
import { useEffect, useState } from 'react';
import { DocPageView } from './DocPageView';
import type { Attachment } from '../attachments';
import './prism.css';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function PageViewLab(): React.ReactElement | null {
  const [pdf, setPdf] = useState<Attachment | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    void fetch('/demo-assets/pdf/cfd-primer.pdf')
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        setPdf({
          name: 'cfd-primer.pdf',
          mime: 'application/pdf',
          data: bytesToBase64(bytes),
          size: bytes.length,
        });
      })
      .catch(() => undefined);
  }, []);
  if (!pdf) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, display: 'flex', background: 'var(--surface-deep)' }}
    >
      <div style={{ flex: 1 }} />
      <div className="prism-page-wrap" style={{ width: '46%', height: '100vh' }}>
        <DocPageView
          pdf={pdf}
          source={0}
          page={page}
          quote=""
          color="var(--presence)"
          kindLabel="TEST"
          title="CFD primer"
          onClose={() => undefined}
          pageCount={10}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
