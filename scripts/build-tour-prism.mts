// build-tour-prism.mts — bake REAL public documents of VARIOUS types into Prism analyses the
// first-run tour replays key-free. Sources are either reviewed remote documents or reviewed assets
// already bundled in public/. PDFs are extracted with poppler's pdftotext; text-native docs
// (CSV/JSON/Markdown/TXT) ARE their own text, so we page them directly. Each doc is mapped once with the
// Gemini key via mapClaims(pagesOverride) — bypassing browser pdf.js — and written, WITH its
// bytes, to an ARRAY fixture the tour flips through (proving "drop in anything").
//
// The bytes ship so the tour's drill-in shows the REAL page render + quote highlight — which is
// why every source here must have verified redistribution rights and a matching THIRD-PARTY notice.
//
//   GEMINI_API_KEY=… npx vite-node scripts/build-tour-prism.mts
//   ONLY=fomc,react-readme … to bake a subset
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mapClaims } from '../src/live/prism/mapClaims';
import type { Attachment } from '../src/live/attachments';
import type { ModelConfig } from '../src/types/mavea';

const MODEL = process.env.TOUR_MODEL ?? 'gemini-3.1-flash-lite';
const OUT = new URL('../src/tour/corpus/prism.generated.json', import.meta.url);
const MAXPAGES = Number(process.env.MAXPAGES ?? 6);
const DELAY = Number(process.env.DELAY ?? 6500);

interface DocSpec {
  id: string;
  name: string;
  type: 'pdf' | 'csv' | 'json' | 'md' | 'txt';
  url: string;
  localPath?: URL;
}

// Freely redistributable sources only (their bytes ship in the fixture): NASA and Federal Reserve
// works whose individual records confirm public use, plus reviewed BSD/MIT data and documentation.
const BATTERY: DocSpec[] = [
  // Scanned/OCR documents (e.g. the 1906 Wright patent, patentimages …/US821393.pdf) ground via
  // the quote-snapping recovery (ground/verbatim.ts) — 8/12 on that two-column scan. Not shipped:
  // its bytes would triple the fixture; tests/ground-snap.test.ts pins the recovery with real OCR.
  // ── PDF (public-domain NASA technical report; the tour circles its figures) ──
  {
    id: 'nasa-cfd',
    name: 'Computational Fluid Dynamics Uses in Fluid Dynamics-Aerodynamics Education.pdf',
    type: 'pdf',
    url: 'https://ntrs.nasa.gov/citations/19950004435',
    localPath: new URL('../public/demo-assets/pdf/cfd-primer.pdf', import.meta.url),
  },
  // ── PDF (single-column, claim-rich, public domain) ──
  {
    id: 'fomc',
    name: 'FOMC Statement April 2026.pdf',
    type: 'pdf',
    url: 'https://www.federalreserve.gov/monetarypolicy/files/monetary20260429a1.pdf',
  },
  // ── CSV (data tables → stat cards + reconcile) ──
  {
    id: 'weather',
    name: 'seattle-weather.csv',
    type: 'csv',
    url: 'https://raw.githubusercontent.com/vega/vega-datasets/main/data/seattle-weather.csv',
  },
  // ── JSON (structured data) ──
  {
    id: 'cars',
    name: 'cars.json',
    type: 'json',
    url: 'https://raw.githubusercontent.com/vega/vega-datasets/main/data/cars.json',
  },
  // ── Markdown (prose docs) ──
  {
    id: 'react-readme',
    name: 'react/README.md',
    type: 'md',
    url: 'https://raw.githubusercontent.com/facebook/react/main/README.md',
  },
];

const MIME: Record<DocSpec['type'], string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
};

function readKey(): string {
  const fromEnv = process.env.GEMINI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  for (const rel of ['../../.env', '../../../.env', '../.env']) {
    try {
      const line = readFileSync(new URL(rel, import.meta.url), 'utf8')
        .split('\n')
        .find((l) => l.startsWith('GEMINI_API_KEY='));
      if (line) {
        const v = line.slice('GEMINI_API_KEY='.length).trim();
        if (v) return v;
      }
    } catch {
      /* next */
    }
  }
  throw new Error('GEMINI_API_KEY not found');
}

/** PDF → per-page text via poppler (no pdf.js). */
function extractPdf(tmp: string, maxPages: number): string[] {
  let count = maxPages;
  try {
    const n = Number(
      execFileSync('pdfinfo', [tmp])
        .toString()
        .match(/Pages:\s+(\d+)/)?.[1] ?? maxPages,
    );
    count = Math.min(maxPages, n);
  } catch {
    /* default */
  }
  const pages: string[] = [];
  for (let p = 1; p <= count; p++) {
    try {
      pages.push(
        execFileSync('pdftotext', [
          '-layout',
          '-f',
          String(p),
          '-l',
          String(p),
          tmp,
          '-',
        ]).toString(),
      );
    } catch {
      pages.push('');
    }
  }
  return pages;
}

/** Text-native doc → paged into ~2400-char chunks on line boundaries (consistent, so quotes ground). */
function pageText(text: string, maxPages: number): string[] {
  const lines = text.split('\n');
  const pages: string[] = [];
  let buf = '';
  for (const line of lines) {
    if (buf.length + line.length > 2400 && buf) {
      pages.push(buf);
      buf = '';
      if (pages.length >= maxPages) break;
    }
    buf += line + '\n';
  }
  if (buf && pages.length < maxPages) pages.push(buf);
  return pages;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function bakeOne(spec: DocSpec, cfg: ModelConfig): Promise<unknown | null> {
  try {
    const bytes = spec.localPath
      ? Buffer.from(readFileSync(spec.localPath))
      : Buffer.from(
          await fetch(spec.url, {
            // Some .gov CDNs reject non-browser agents; a plain browser UA passes.
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
          }).then((r) => r.arrayBuffer()),
        );
    let pages: string[];
    if (spec.type === 'pdf') {
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
      const tmp = `/tmp/mavea-prism-${spec.id}.pdf`;
      writeFileSync(tmp, bytes);
      pages = extractPdf(tmp, MAXPAGES);
    } else {
      const text = bytes.toString('utf8');
      if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
        throw new Error('got HTML (bad URL?)');
      }
      pages = pageText(text, MAXPAGES);
    }
    const doc: Attachment = {
      name: spec.name,
      mime: MIME[spec.type],
      data: bytes.toString('base64'),
      size: bytes.length,
    };
    const res = await mapClaims(doc, cfg, undefined, [pages]);
    if (!res.spec) throw new Error(res.error ?? 'no spec');
    const grounded = res.spec.claims.length;
    console.log(
      `  ✓ ${spec.type.padEnd(4)} ${spec.id.padEnd(14)} ${grounded}/${res.proposed} claims · ${res.spec.regions.length} regions · ${res.spec.threads.length} threads · ${(bytes.length / 1024).toFixed(0)}kB`,
    );
    if (grounded < 3) {
      console.log(`     ⚠ only ${grounded} grounded — excluding from the tour set`);
      return null;
    }
    // Ship the grounded map AND the document bytes (all sources above are freely redistributable),
    // so the tour's drill-in renders the real page with the quote highlighted — the same thing a
    // user sees exploding their own document. Strip page-render images; PageView re-renders live.
    const cleanSpec = {
      ...res.spec,
      documents: res.spec.documents.map((d) => ({ ...d, slideImages: undefined })),
    };
    return {
      id: spec.id,
      type: spec.type,
      name: spec.name,
      mime: MIME[spec.type],
      url: spec.url,
      proposed: res.proposed,
      data: doc.data,
      size: bytes.length,
      spec: cleanSpec,
    };
  } catch (e) {
    console.log(
      `  ✗ ${spec.type.padEnd(4)} ${spec.id.padEnd(14)} ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}

async function main(): Promise<void> {
  const only = process.env.ONLY?.split(',').map((s) => s.trim());
  const battery = only ? BATTERY.filter((d) => only.includes(d.id)) : BATTERY;
  const cfg: ModelConfig = {
    provider: 'gemini',
    model: MODEL,
    apiKey: readKey(),
    baseUrl: 'https://generativelanguage.googleapis.com',
  };
  console.log(`baking ${battery.length} documents (various types) against ${MODEL}\n`);

  const docs: unknown[] = [];
  for (let i = 0; i < battery.length; i++) {
    const baked = await bakeOne(battery[i], cfg);
    if (baked) docs.push(baked);
    if (i < battery.length - 1) await sleep(DELAY);
  }

  if (!docs.length) {
    console.error('\nno documents baked');
    process.exit(1);
  }
  writeFileSync(OUT, JSON.stringify({ v: 2, docs }, null, 2) + '\n', 'utf8');
  const kb = (Buffer.byteLength(JSON.stringify({ v: 2, docs })) / 1024).toFixed(0);
  const types = [...new Set(docs.map((d) => (d as { type: string }).type))].join(', ');
  console.log(`\nwrote ${docs.length} docs (${types}) → ${OUT.pathname} (${kb} kB)`);
}

main().catch((e) => {
  console.error('error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
