// HashTable — a separate-chaining hash table diagram: bucket array on the left, linked-list
// chains extending rightward. The model supplies keys/values and optionally an explicit bucket
// assignment; if omitted the component auto-hashes via a deterministic djb2-style function.
// Geometry is computed from the data; never hard-coded coordinates.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';
import type { AccentVar } from '../../../data/conversation';
import { richInnerHtml } from '../../../lib/richText';

// ── layout constants ────────────────────────────────────────────────────────
const BUCKET_W = 68;
const BUCKET_H = 36;
const BUCKET_GAP = 4;
const NODE_W = 96;
const NODE_H = 32;
const CHAIN_GAP = 8; // horizontal gap between bucket edge and first node, and between nodes
const NULL_W = 28;
const PAD = 16;
const MAX_BUCKETS = 8;
const MAX_CHAIN = 6;

export interface HashEntry {
  key: string | number;
  value?: string | number;
  /** Optional explicit bucket override; otherwise auto-hashed. */
  bucket?: number;
}

export interface HashTableProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Number of buckets (clamped to 1..MAX_BUCKETS). */
  size: number;
  entries: HashEntry[];
  /** Display string for the hash function, e.g. "h(k) = k mod 7". */
  hashFn?: string;
  /** Key to highlight (presence accent). */
  highlight?: string | number;
  footer?: string;
  delay?: number;
}

type Props = HashTableProps & { delay?: number };

function computeBucket(key: string | number, size: number): number {
  if (size <= 0) return 0;
  if (typeof key === 'number') return ((key % size) + size) % size;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return ((h % size) + size) % size;
}

export function HashTable({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  size,
  entries,
  hashFn,
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.layers;
  const arrowId = `ht-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${arrowId})`;

  const numBuckets = Math.min(Math.max(1, Math.floor(size)), MAX_BUCKETS);

  const chains = useMemo(() => {
    const buckets: { key: string | number; value?: string | number }[][] = Array.from(
      { length: numBuckets },
      () => [],
    );
    for (const entry of entries) {
      const b =
        entry.bucket !== undefined
          ? Math.max(0, Math.min(numBuckets - 1, entry.bucket))
          : computeBucket(entry.key, numBuckets);
      if (buckets[b].length < MAX_CHAIN) {
        buckets[b].push({ key: entry.key, value: entry.value });
      }
    }
    return buckets;
  }, [entries, numBuckets]);

  const maxChainLen = Math.max(0, ...chains.map((c) => c.length));

  // viewBox
  const vbW =
    PAD + BUCKET_W + CHAIN_GAP + maxChainLen * (NODE_W + CHAIN_GAP) + NULL_W + CHAIN_GAP + PAD;
  const vbH = PAD + numBuckets * (BUCKET_H + BUCKET_GAP) - BUCKET_GAP + PAD;

  const bucketY = (b: number) => PAD + b * (BUCKET_H + BUCKET_GAP);
  const bucketCY = (b: number) => bucketY(b) + BUCKET_H / 2;

  const nodeX = (chainIdx: number) => PAD + BUCKET_W + CHAIN_GAP + chainIdx * (NODE_W + CHAIN_GAP);
  const nodeY = (b: number) => bucketY(b) + (BUCKET_H - NODE_H) / 2;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {hashFn && <div className="ht-hashfn">{hashFn}</div>}

      <div className="ht-wrap">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="ht-svg"
          role="img"
          aria-label={title ?? 'Hash table'}
        >
          <defs>
            <marker id={arrowId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" className="ht-arrowhead" />
            </marker>
          </defs>

          {/* bucket column */}
          {chains.map((chain, b) => {
            const bx = PAD;
            const by = bucketY(b);
            const cy = bucketCY(b);

            return (
              <g key={`bucket-${b}`}>
                {/* bucket rect */}
                <rect x={bx} y={by} width={BUCKET_W} height={BUCKET_H} className="ht-bucket" />
                {/* index label */}
                <text
                  x={bx + BUCKET_W / 2}
                  y={by + BUCKET_H / 2 + 5}
                  textAnchor="middle"
                  className="ht-bucket-idx"
                >
                  [{b}]
                </text>

                {/* chain nodes */}
                {chain.map((entry, k) => {
                  const nx = nodeX(k);
                  const ny = nodeY(b);
                  const ncy = ny + NODE_H / 2;
                  const isHl = highlight !== undefined && String(entry.key) === String(highlight);
                  const nodeClass = 'ht-node' + (isHl ? ' ht-active' : '');
                  const lbl =
                    entry.value !== undefined ? `${entry.key}: ${entry.value}` : String(entry.key);
                  // Long labels ("14: Christopher") would otherwise bleed past the fixed
                  // NODE_W box — shrink the font as the label grows, then hard-clamp very
                  // long ones to the inner width so they can never spill past the node.
                  const lblFontSize = lbl.length > 10 ? 10 : 12;
                  const lblLong = lbl.length > 13;

                  // Connector from left (bucket or previous node)
                  const fromX = k === 0 ? bx + BUCKET_W : nodeX(k - 1) + NODE_W;
                  const fromCY = cy;

                  return (
                    <g key={`node-${b}-${k}`}>
                      {/* arrow to this node */}
                      <line
                        x1={fromX}
                        y1={fromCY}
                        x2={nx - 2}
                        y2={ncy}
                        className="ht-chain"
                        markerEnd={arrow}
                      />
                      {/* node box */}
                      <rect
                        x={nx}
                        y={ny}
                        width={NODE_W}
                        height={NODE_H}
                        rx={4}
                        className={nodeClass}
                      />
                      <text
                        x={nx + NODE_W / 2}
                        y={ny + NODE_H / 2 + 5}
                        textAnchor="middle"
                        className="ht-node-text"
                        style={{ fontSize: lblFontSize }}
                        {...(lblLong
                          ? { textLength: NODE_W - 12, lengthAdjust: 'spacingAndGlyphs' }
                          : {})}
                      >
                        {lbl}
                      </text>
                    </g>
                  );
                })}

                {/* null terminator */}
                {(() => {
                  const nullX =
                    chain.length === 0
                      ? PAD + BUCKET_W + CHAIN_GAP
                      : nodeX(chain.length - 1) + NODE_W + CHAIN_GAP;
                  const nullY = bucketCY(b) - 9;
                  const fromX =
                    chain.length === 0 ? PAD + BUCKET_W : nodeX(chain.length - 1) + NODE_W;
                  return (
                    <g key={`null-${b}`}>
                      <line
                        x1={fromX}
                        y1={cy}
                        x2={nullX - 2}
                        y2={cy}
                        className="ht-chain"
                        markerEnd={arrow}
                      />
                      <rect
                        x={nullX}
                        y={nullY}
                        width={NULL_W}
                        height={18}
                        rx={3}
                        className="ht-null"
                      />
                      <text
                        x={nullX + NULL_W / 2}
                        y={nullY + 13}
                        textAnchor="middle"
                        className="ht-null-text"
                      >
                        ∅
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      </div>

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
