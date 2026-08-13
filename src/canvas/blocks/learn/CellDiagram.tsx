import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { CellDiagramProps, CellPart } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CellDiagramProps & { delay?: number };

// One schematic biological cell on a fixed 320×230 unit canvas. Every organelle is a preset
// glyph placed at a hand-tuned, biologically-plausible location inside the membrane (centre of
// the cell for the nucleus, scattered cytoplasm for mitochondria/ribosomes, the nucleus-hugging
// folds for the ER, a stacked sac for Golgi). The model never positions anything — it lists which
// organelles to show and which to highlight, and the component owns the layout and the leader
// lines. The plant view swaps in a rectangular cell-wall frame and adds the chloroplast, the large
// central vacuole, and a wider cell wall; the animal view is the rounded membrane blob.

const W = 320;
const H = 230;
// Left/right gutters revealed in the viewBox so the right-aligned gutter labels (e.g. the
// left-side "Golgi apparatus") and the longest right-side labels render in full instead of
// clipping at the card edge. They only widen the visible canvas — every glyph/label keeps its
// existing coordinates, so the cell is not rescaled or moved. Each is sized for a full
// LABEL_MAX_CHARS label at .cel-label's size reading outward from the outermost anchor.
const GUT_L = 60;
const GUT_R = 24;

// Labels are drawn at fixed anchor coordinates (see GLYPHS below) with no width check — a
// model-authored override longer than the preset names ("Nucleus", "Golgi apparatus") or an
// organelle list crowded with many labels runs past the gutter/card edge or collides with a
// neighbouring leader line. Cap to a conservative character budget sized for .cel-label and the
// gutter width, keeping the full text as a native <title> tooltip — same idiom as
// EtymTree/ParseTree/WaveDiagram/TeachDiagram.
const LABEL_MAX_CHARS = 20;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Where a label sits and which way its leader line reads. `side:'left'` anchors the text at the
// left gutter (text-anchor:end) with the leader running rightward to the glyph; `'right'` mirrors.
interface Anchor {
  /** Glyph attachment point (SVG coords) — the leader line starts here. */
  gx: number;
  gy: number;
  /** Label text position (SVG coords). */
  lx: number;
  ly: number;
  side: 'left' | 'right';
}

interface Glyph {
  /** Default human-readable name (used when the part gives no `label`). */
  name: string;
  /** Which cell types this organelle legitimately belongs to. */
  in: 'both' | 'animal' | 'plant';
  /** Leader-line + label anchor. */
  anchor: Anchor;
  /** The organelle shape, parameterised only by its highlight colour. */
  draw: (color: string, on: boolean) => ReactNode;
}

// Soft default fill for an un-highlighted organelle so the cell reads as a calm schematic; a
// highlighted organelle takes the part's accent colour. Tokens only → themes in light + dark.
const baseFill = (on: boolean, color: string) =>
  on
    ? `color-mix(in oklab, ${color} 26%, transparent)`
    : 'color-mix(in oklab, var(--text-secondary) 12%, transparent)';
const baseStroke = (on: boolean, color: string) => (on ? color : 'var(--line-strong)');

// ── The preset organelle library ──
// Positions assume the membrane interior roughly spans x∈[40,250] (animal) with the legend gutter
// on the right; the nucleus sits centre-left so the ER/Golgi/ribosomes have room around it.
const GLYPHS: Record<string, Glyph> = {
  nucleus: {
    name: 'Nucleus',
    in: 'both',
    anchor: { gx: 118, gy: 96, lx: 150, ly: 40, side: 'right' },
    draw: (color, on) => (
      <g>
        <circle
          cx={118}
          cy={108}
          r={34}
          fill={baseFill(on, color)}
          stroke={baseStroke(on, color)}
          strokeWidth={1.6}
        />
        {/* Nucleolus — a denser inner body. */}
        <circle
          cx={126}
          cy={114}
          r={11}
          fill={`color-mix(in oklab, ${on ? color : 'var(--text-secondary)'} 40%, transparent)`}
        />
      </g>
    ),
  },
  nucleolus: {
    name: 'Nucleolus',
    in: 'both',
    anchor: { gx: 126, gy: 114, lx: 158, ly: 150, side: 'right' },
    draw: () => null, // drawn inside the nucleus glyph; label-only entry
  },
  mitochondria: {
    name: 'Mitochondria',
    in: 'both',
    anchor: { gx: 196, gy: 70, lx: 226, ly: 56, side: 'right' },
    draw: (color, on) => (
      <g transform="translate(196 70) rotate(-18)">
        <ellipse
          cx={0}
          cy={0}
          rx={24}
          ry={12}
          fill={baseFill(on, color)}
          stroke={baseStroke(on, color)}
          strokeWidth={1.6}
        />
        {/* Cristae — the inner folded membrane. */}
        <path
          d="M-17,-2 q4,-7 8,0 q4,7 8,0 q4,-7 8,0 q4,7 8,0"
          fill="none"
          stroke={baseStroke(on, color)}
          strokeWidth={1}
          opacity={0.85}
        />
      </g>
    ),
  },
  er: {
    name: 'Endoplasmic reticulum',
    in: 'both',
    anchor: { gx: 96, gy: 158, lx: 150, ly: 200, side: 'right' },
    draw: (color, on) => (
      // Folded membrane ribbon hugging the lower edge of the nucleus.
      <path
        d="M78,150 q14,-14 30,-2 q16,12 30,-2 q12,-12 26,-2"
        fill="none"
        stroke={baseStroke(on, color)}
        strokeWidth={on ? 3 : 2.2}
        strokeLinecap="round"
      />
    ),
  },
  golgi: {
    name: 'Golgi apparatus',
    in: 'both',
    anchor: { gx: 70, gy: 70, lx: 36, ly: 50, side: 'left' },
    draw: (color, on) => (
      // Stack of flattened, progressively shorter cisternae.
      <g
        stroke={baseStroke(on, color)}
        strokeWidth={on ? 2.4 : 1.8}
        fill="none"
        strokeLinecap="round"
      >
        <path d="M52,62 q22,-9 44,0" />
        <path d="M55,69 q19,-8 38,0" />
        <path d="M58,76 q16,-7 32,0" />
      </g>
    ),
  },
  ribosomes: {
    name: 'Ribosomes',
    in: 'both',
    anchor: { gx: 168, gy: 150, lx: 222, ly: 176, side: 'right' },
    draw: (color, on) => {
      // A scatter of small dots — fixed offsets so they never wander between renders.
      const dots: Array<[number, number]> = [
        [160, 146],
        [172, 152],
        [166, 158],
        [180, 148],
        [176, 160],
      ];
      const fill = on ? color : 'var(--text-secondary)';
      return (
        <g>
          {dots.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={3} fill={fill} opacity={on ? 0.9 : 0.6} />
          ))}
        </g>
      );
    },
  },
  vacuole: {
    name: 'Vacuole',
    // Small storage vacuoles exist in animal cells; the LARGE central vacuole is the plant one.
    in: 'both',
    anchor: { gx: 208, gy: 150, lx: 240, ly: 150, side: 'right' },
    draw: (color, on) => (
      <circle
        cx={208}
        cy={150}
        r={20}
        fill={baseFill(on, color)}
        stroke={baseStroke(on, color)}
        strokeWidth={1.6}
      />
    ),
  },
  lysosome: {
    name: 'Lysosome',
    in: 'animal',
    anchor: { gx: 96, gy: 188, lx: 60, ly: 200, side: 'left' },
    draw: (color, on) => (
      <circle
        cx={96}
        cy={186}
        r={10}
        fill={baseFill(on, color)}
        stroke={baseStroke(on, color)}
        strokeWidth={1.6}
      />
    ),
  },
  centrosome: {
    name: 'Centrosome',
    in: 'animal',
    anchor: { gx: 150, gy: 96, lx: 184, ly: 96, side: 'right' },
    draw: (color, on) => (
      // Two perpendicular centrioles.
      <g stroke={baseStroke(on, color)} strokeWidth={on ? 3 : 2.2} strokeLinecap="round">
        <line x1={146} y1={88} x2={146} y2={104} />
        <line x1={138} y1={96} x2={154} y2={96} />
      </g>
    ),
  },
  cytoplasm: {
    name: 'Cytoplasm',
    in: 'both',
    anchor: { gx: 150, gy: 120, lx: 150, ly: 120, side: 'right' },
    draw: () => null, // the interior fill IS the cytoplasm — label-only entry
  },
  membrane: {
    name: 'Cell membrane',
    in: 'both',
    anchor: { gx: 150, gy: 30, lx: 150, ly: 18, side: 'right' },
    draw: () => null, // the outline IS the membrane — label-only entry
  },
  // ── plant-only ──
  chloroplast: {
    name: 'Chloroplast',
    in: 'plant',
    anchor: { gx: 196, gy: 96, lx: 232, ly: 88, side: 'right' },
    draw: (color, on) => (
      <g transform="translate(196 96) rotate(24)">
        <ellipse
          cx={0}
          cy={0}
          rx={24}
          ry={13}
          fill={baseFill(on, color || 'var(--insight)')}
          stroke={baseStroke(on, color || 'var(--insight)')}
          strokeWidth={1.6}
        />
        {/* Grana — stacks of thylakoids. */}
        {[-12, -2, 8].map((dx) => (
          <line
            key={dx}
            x1={dx}
            y1={-6}
            x2={dx}
            y2={6}
            stroke={baseStroke(on, color || 'var(--insight)')}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}
      </g>
    ),
  },
  'cell wall': {
    name: 'Cell wall',
    in: 'plant',
    anchor: { gx: 150, gy: 14, lx: 150, ly: 14, side: 'right' },
    draw: () => null, // the rigid outer frame IS the wall — drawn by the shell, label-only here
  },
};

// Aliases so a model's near-miss key still resolves to the right glyph.
const ALIAS: Record<string, string> = {
  mitochondrion: 'mitochondria',
  'endoplasmic reticulum': 'er',
  'rough er': 'er',
  'smooth er': 'er',
  'golgi apparatus': 'golgi',
  'golgi body': 'golgi',
  ribosome: 'ribosomes',
  'central vacuole': 'vacuole',
  'plasma membrane': 'membrane',
  'cell membrane': 'membrane',
  wall: 'cell wall',
  cellwall: 'cell wall',
};

function resolveKey(raw: string): string | undefined {
  const k = raw.trim().toLowerCase();
  if (GLYPHS[k]) return k;
  if (ALIAS[k]) return ALIAS[k];
  return undefined;
}

// Default organelle set per cell type, used when the answer lists none (so the diagram is never
// an empty membrane). Drawn in this order — back-to-front so leader lines read cleanly.
const DEFAULT_ANIMAL = [
  'membrane',
  'cytoplasm',
  'nucleus',
  'mitochondria',
  'er',
  'golgi',
  'ribosomes',
];
const DEFAULT_PLANT = [
  'cell wall',
  'membrane',
  'cytoplasm',
  'nucleus',
  'chloroplast',
  'mitochondria',
  'vacuole',
  'er',
];

export function CellDiagram({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  cellType = 'animal',
  parts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const isPlant = cellType === 'plant';

  // Resolve the requested parts (or the sensible default set) to known glyphs, dropping any that
  // don't belong to this cell type (a chloroplast asked for in an animal cell is silently skipped
  // rather than drawn wrongly — accuracy over completeness).
  const requested: CellPart[] =
    parts && parts.length
      ? parts
      : (isPlant ? DEFAULT_PLANT : DEFAULT_ANIMAL).map((key) => ({ key }));

  type Resolved = {
    key: string;
    glyph: Glyph;
    label: string;
    note?: string;
    on: boolean;
    color: string;
  };
  const seen = new Set<string>();
  const resolved: Resolved[] = [];
  for (const p of requested) {
    const key = resolveKey(p.key);
    if (!key || seen.has(key)) continue;
    const glyph = GLYPHS[key];
    if (glyph.in !== 'both' && glyph.in !== cellType) continue; // wrong cell type → skip
    seen.add(key);
    resolved.push({
      key,
      glyph,
      label: p.label ?? glyph.name,
      note: p.note,
      on: p.highlight === true,
      color: p.color ?? 'var(--presence)',
    });
  }

  // The cell shell. Animal = rounded membrane blob; plant = rounded-rect membrane inside a thicker,
  // squarer cell-wall frame. The interior fill is the cytoplasm.
  const cytoFill = 'color-mix(in oklab, var(--presence) 6%, transparent)';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        <span className="cel-type-tag">{isPlant ? 'plant' : 'animal'}</span>
      </div>

      <div className="cel-wrap">
        <svg
          viewBox={`${-GUT_L} 0 ${W + GUT_L + GUT_R} ${H}`}
          className="cel-svg"
          role="img"
          aria-label={`${isPlant ? 'Plant' : 'Animal'} cell diagram — ${title}`}
        >
          {/* ── Shell ── */}
          {isPlant ? (
            <>
              {/* Cell wall — rigid outer frame. */}
              <rect
                x={22}
                y={20}
                width={236}
                height={190}
                rx={18}
                fill="color-mix(in oklab, var(--insight) 7%, transparent)"
                stroke="var(--line-strong)"
                strokeWidth={5}
              />
              {/* Plasma membrane, just inside the wall. */}
              <rect
                x={32}
                y={30}
                width={216}
                height={170}
                rx={12}
                fill={cytoFill}
                stroke="var(--text-secondary)"
                strokeWidth={1.6}
              />
            </>
          ) : (
            // Animal membrane — a soft rounded blob.
            <path
              d="M150,28 C214,28 252,62 252,116 C252,172 210,206 150,206 C92,206 40,176 40,116 C40,60 88,28 150,28 Z"
              fill={cytoFill}
              stroke="var(--text-secondary)"
              strokeWidth={1.8}
            />
          )}

          {/* ── Organelle glyphs ── */}
          {resolved.map((r) => (
            <g key={r.key}>{r.glyph.draw(r.color, r.on)}</g>
          ))}

          {/* ── Leader lines + labels ── (drawn last so they sit above the glyphs) */}
          {resolved.map((r) => {
            const a = r.glyph.anchor;
            const labelColor = r.on ? r.color : 'var(--text-secondary)';
            // Elbow leader: from the glyph out to the label baseline.
            const tx = a.side === 'left' ? a.lx + 2 : a.lx - 2;
            return (
              <g key={`l-${r.key}`}>
                <line
                  x1={a.gx}
                  y1={a.gy}
                  x2={tx}
                  y2={a.ly}
                  stroke="var(--line-strong)"
                  strokeWidth={0.8}
                  className="cel-leader"
                />
                <circle cx={a.gx} cy={a.gy} r={1.6} fill="var(--line-strong)" />
                <text
                  x={a.lx}
                  y={a.ly}
                  textAnchor={a.side === 'left' ? 'end' : 'start'}
                  dominantBaseline="middle"
                  className={'cel-label' + (r.on ? ' cel-label--on' : '')}
                  fill={labelColor}
                >
                  {r.label.length > LABEL_MAX_CHARS && <title>{r.label}</title>}
                  {truncate(r.label, LABEL_MAX_CHARS)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend — only parts that carry a note (so it stays clean when there's nothing to add). */}
        {resolved.some((r) => r.note) && (
          <ul className="cel-legend" aria-label="Organelle notes">
            {resolved
              .filter((r) => r.note)
              .map((r) => (
                <li key={r.key} className="cel-legend-item">
                  <span
                    className="cel-legend-dot"
                    style={{ background: r.on ? r.color : 'var(--text-muted)' } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span className="cel-legend-body">
                    <span className="cel-legend-name">{r.label}</span>
                    <span className="cel-legend-note">{r.note}</span>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
