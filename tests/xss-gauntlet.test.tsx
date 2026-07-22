import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { LiveEvidence } from '../src/live/LiveEvidence';
import { LastCheckCard } from '../src/live/dashboards/LastCheckCard';
import type { Dashboard } from '../src/live/dashboards/types';
import { Codeblock } from '../src/canvas/blocks/display/Codeblock';
import { TeX } from '../src/canvas/blocks/learn/TeX';

// This is not a re-test of any single sanitizer in isolation — those already have their own
// dedicated suites (tests/sanitizeSvg.test.ts, tests/liveSchemaRichText.test.ts). It targets the
// spots a prior audit found genuinely uncovered: the citation-URL protocol gate just added to
// buildWebSources (and its two render sites), and the CDN-fallback text paths for Codeblock/TeX,
// which is the actual code that runs in this test environment since neither Shiki nor KaTeX's
// CDN import resolves under jsdom — proving the degraded path is exactly as safe as the primary
// one matters, because "the CDN is unreachable" is a real production state, not a test artifact.

const ONERROR_PAYLOAD = '<img src=x onerror="window.__pwn=1">';

describe('citation URLs — javascript:/data: never reach a clickable href', () => {
  it('buildWebSources (via validateLiveResponse) drops a non-http(s) source entirely', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        sub: '',
        narration: 'n',
        blocks: [],
        sources: [
          { title: 'evil', url: 'javascript:alert(1)' },
          { title: 'also evil', url: 'data:text/html,<script>alert(1)</script>' },
          { title: 'fine', url: 'https://example.com/real-source' },
        ],
      },
      new Set(),
    );
    const urls = (r!.sources ?? []).map((s) => s.url);
    expect(urls).toEqual(['https://example.com/real-source']);
  });

  it('LiveEvidence never renders an anchor for an unsafe source URL', () => {
    const { container } = render(
      <LiveEvidence
        open
        onClose={() => {}}
        claim="test claim"
        sources={[
          { title: 'evil', url: 'javascript:alert(1)' },
          { title: 'fine', url: 'https://example.com/real-source' },
        ]}
      />,
    );
    const hrefs = Array.from(container.querySelectorAll('a[href]')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.some((h) => h?.startsWith('javascript:'))).toBe(false);
    expect(hrefs).toContain('https://example.com/real-source');
  });

  it('LastCheckCard never renders an anchor for an unsafe source URL', () => {
    const dashboard = {
      id: 'd1',
      tripwires: [],
      lastVerdict: {
        text: 'the read',
        at: Date.now(),
        sources: [
          { title: 'evil', url: 'javascript:alert(1)' },
          { title: 'fine', url: 'https://example.com/real-source' },
        ],
      },
    } as unknown as Dashboard;
    const { container } = render(<LastCheckCard dashboard={dashboard} now={Date.now()} />);
    const hrefs = Array.from(container.querySelectorAll('a[href]')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.some((h) => h?.startsWith('javascript:'))).toBe(false);
    expect(hrefs).toContain('https://example.com/real-source');
  });
});

describe('Codeblock — hostile source stays inert on the CDN-unreachable fallback', () => {
  it('never executes an onerror handler and shows the payload as literal text', async () => {
    const { container } = render(<Codeblock title="Snippet" lang="html" code={ONERROR_PAYLOAD} />);
    await waitFor(() => expect(container.querySelector('.cb-plain')).toBeInTheDocument());
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect((window as unknown as { __pwn?: unknown }).__pwn).toBeUndefined();
    expect(container.textContent).toContain(ONERROR_PAYLOAD);
  });
});

describe('TeX — hostile input stays inert on the CDN-unreachable fallback', () => {
  it('never executes an onerror handler and shows the payload as literal text', async () => {
    const { container } = render(<TeX tex={ONERROR_PAYLOAD} />);
    await waitFor(() => expect(container.querySelector('.lr-tex')).toBeInTheDocument());
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect((window as unknown as { __pwn?: unknown }).__pwn).toBeUndefined();
    expect(container.textContent).toContain(ONERROR_PAYLOAD);
  });
});
