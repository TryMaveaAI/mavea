// ThreatModel — a STRIDE cybersecurity diagram. Dashed trust-boundary rects host their
// contained assets as small labeled chips (a left-edge glyph tells process / datastore /
// external-entity apart, the DFD convention way); an asset no boundary claims renders in its
// own unboundaried lane. Every threat that resolves to a real asset drops a small marker dot
// on that asset's chip — red for an open threat, muted insight for a mitigated one — and the
// full list appears in the threat register below, so nothing is only visible as a tiny dot.
// Lanes flow left-to-right and wrap onto new rows once there are more than a handful, so a
// system with many boundaries never stretches into an unreadable ribbon.
import { useMemo, type CSSProperties } from 'react';
import { richInnerHtml } from '../../../lib/richText';
import { Icon } from '../../../icons/icons';
import type {
  ThreatModelProps,
  ThreatAsset,
  ThreatAssetKind,
  ThreatBoundary,
  ThreatEntry,
  StrideKind,
  ThreatStatus,
} from './types';

type Props = ThreatModelProps & { delay?: number };

const CHIP_W = 156;
const CHIP_H = 40;
const CHIP_GAP = 10;
const LANE_PAD = 14;
const LANE_HEADER_H = 20;
const LANE_GAP = 22;
const PAD = 20;
const MAX_COLS = 4;
const MARKER_CAP = 4;

const KIND_SET = new Set<ThreatAssetKind>(['process', 'datastore', 'external-entity']);
function safeKind(k: unknown): ThreatAssetKind {
  return KIND_SET.has(k as ThreatAssetKind) ? (k as ThreatAssetKind) : 'process';
}

const STRIDE_SET = new Set<StrideKind>([
  'spoofing',
  'tampering',
  'repudiation',
  'info-disclosure',
  'dos',
  'elevation',
]);
const STRIDE_LABEL: Record<StrideKind, string> = {
  spoofing: 'Spoofing',
  tampering: 'Tampering',
  repudiation: 'Repudiation',
  'info-disclosure': 'Info disclosure',
  dos: 'Denial of service',
  elevation: 'Elevation of privilege',
};
const STRIDE_SHORT: Record<StrideKind, string> = {
  spoofing: 'S',
  tampering: 'T',
  repudiation: 'R',
  'info-disclosure': 'I',
  dos: 'D',
  elevation: 'E',
};

const LABEL_MAX = 16;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface Asset {
  id: string;
  name: string;
  kind: ThreatAssetKind;
}
interface Threat {
  key: number;
  assetId: string;
  stride?: StrideKind;
  mitigation: string;
  status: ThreatStatus;
}
interface Lane {
  key: string;
  label: string | null;
  dashed: boolean;
  assets: Asset[];
}
interface PlacedLane extends Lane {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PlacedChip {
  asset: Asset;
  x: number;
  y: number;
}

function laneContentHeight(count: number): number {
  return count > 0 ? count * CHIP_H + (count - 1) * CHIP_GAP : CHIP_H;
}

/** Small left-edge glyph telling the three asset kinds apart at chip scale — a circle for a
 *  process, two parallel bars for a data store (the classic DFD "data at rest" mark), a
 *  sharp-cornered square for an external entity. */
function KindGlyph({ kind }: { kind: ThreatAssetKind }) {
  switch (kind) {
    case 'datastore':
      return (
        <g className="tm-glyph">
          <line x1={-6} y1={-4} x2={6} y2={-4} />
          <line x1={-6} y1={4} x2={6} y2={4} />
        </g>
      );
    case 'external-entity':
      return (
        <g className="tm-glyph">
          <rect x={-6} y={-6} width={12} height={12} />
        </g>
      );
    default:
      return (
        <g className="tm-glyph">
          <circle r={6} />
        </g>
      );
  }
}

export function ThreatModel({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  assets,
  boundaries,
  threats,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;

  // A missing/blank id doesn't drop the asset — it just can never be referenced by a
  // boundary or a threat, so it surfaces in the unboundaried lane with no threat markers
  // rather than vanishing from the diagram entirely.
  const safeAssets: Asset[] = useMemo(
    () =>
      (Array.isArray(assets) ? assets : [])
        .map((raw, i): Asset | null => {
          if (!raw || typeof raw !== 'object') return null;
          const a = raw as ThreatAsset;
          const name = typeof a.name === 'string' ? a.name.trim() : '';
          if (!name) return null;
          const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : `asset-${i}`;
          return { id, name, kind: safeKind(a.kind) };
        })
        .filter((a): a is Asset => a !== null),
    [assets],
  );

  const safeThreats: Threat[] = useMemo(
    () =>
      (Array.isArray(threats) ? threats : [])
        .map((raw, i): Threat | null => {
          if (!raw || typeof raw !== 'object') return null;
          const t = raw as ThreatEntry;
          const assetId = typeof t.assetId === 'string' ? t.assetId.trim() : '';
          if (!assetId) return null;
          const stride = STRIDE_SET.has(t.stride) ? t.stride : undefined;
          return {
            key: i,
            assetId,
            stride,
            mitigation: typeof t.mitigation === 'string' ? t.mitigation.trim() : '',
            status: t.status === 'mitigated' ? 'mitigated' : 'open',
          };
        })
        .filter((t): t is Threat => t !== null),
    [threats],
  );

  const assetById = useMemo(() => new Map(safeAssets.map((a) => [a.id, a])), [safeAssets]);

  const safeBoundaries = useMemo(() => {
    const idSet = new Set(safeAssets.map((a) => a.id));
    return (Array.isArray(boundaries) ? boundaries : [])
      .map((raw, i): (ThreatBoundary & { key: number }) | null => {
        if (!raw || typeof raw !== 'object') return null;
        const label = typeof raw.label === 'string' ? raw.label.trim() : '';
        if (!label) return null;
        const contains = (Array.isArray(raw.contains) ? raw.contains : []).filter(
          (id): id is string => typeof id === 'string' && idSet.has(id),
        );
        return { label, contains, key: i };
      })
      .filter((b): b is ThreatBoundary & { key: number } => b !== null);
  }, [boundaries, safeAssets]);

  const lanes: Lane[] = useMemo(() => {
    if (safeBoundaries.length === 0) {
      return safeAssets.length > 0
        ? [{ key: 'all', label: null, dashed: false, assets: safeAssets }]
        : [];
    }
    // Which lanes claim each asset, so the roster is walked once rather than re-scanned per
    // boundary. A boundary naming the same asset twice still lists it once; an asset named by
    // two boundaries deliberately appears inside both, and lanes keep the roster's order.
    const claimedBy = new Map<string, number[]>();
    safeBoundaries.forEach((b, bi) => {
      for (const id of new Set(b.contains)) {
        const lanes = claimedBy.get(id);
        if (lanes) lanes.push(bi);
        else claimedBy.set(id, [bi]);
      }
    });
    const built: Lane[] = safeBoundaries.map((b) => ({
      key: `b-${b.key}`,
      label: b.label,
      dashed: true,
      assets: [],
    }));
    for (const a of safeAssets) {
      for (const bi of claimedBy.get(a.id) ?? []) built[bi].assets.push(a);
    }
    const unassigned = safeAssets.filter((a) => !claimedBy.has(a.id));
    if (unassigned.length > 0) {
      built.push({ key: 'unassigned', label: 'Unboundaried', dashed: false, assets: unassigned });
    }
    return built;
  }, [safeBoundaries, safeAssets]);

  // Grid-wrap the lanes so a system with many boundaries grows in both directions instead
  // of stretching into one impossibly wide row.
  const { placedLanes, chips, vbW, vbH } = useMemo(() => {
    const cols = Math.max(1, Math.min(MAX_COLS, lanes.length));
    const laneW = CHIP_W + LANE_PAD * 2;
    const rows: Lane[][] = [];
    for (let i = 0; i < lanes.length; i += cols) rows.push(lanes.slice(i, i + cols));

    const placed: PlacedLane[] = [];
    const chipList: PlacedChip[] = [];
    let y = PAD;
    for (const row of rows) {
      let rowH = 0;
      for (const lane of row) {
        const headerH = lane.label ? LANE_HEADER_H : 0;
        const h = headerH + LANE_PAD * 2 + laneContentHeight(lane.assets.length);
        rowH = Math.max(rowH, h);
      }
      row.forEach((lane, ci) => {
        const headerH = lane.label ? LANE_HEADER_H : 0;
        const h = headerH + LANE_PAD * 2 + laneContentHeight(lane.assets.length);
        const x = PAD + ci * (laneW + LANE_GAP);
        placed.push({ ...lane, x, y, w: laneW, h });
        lane.assets.forEach((asset, ai) => {
          chipList.push({
            asset,
            x: x + LANE_PAD,
            y: y + headerH + LANE_PAD + ai * (CHIP_H + CHIP_GAP),
          });
        });
      });
      y += rowH + LANE_GAP;
    }
    const width = PAD * 2 + cols * laneW + Math.max(0, cols - 1) * LANE_GAP;
    const height = Math.max(140, y - LANE_GAP + PAD);
    return { placedLanes: placed, chips: chipList, vbW: width, vbH: height };
  }, [lanes]);

  const threatsByAsset = useMemo(() => {
    const m = new Map<string, Threat[]>();
    for (const t of safeThreats) {
      if (!assetById.has(t.assetId)) continue;
      const arr = m.get(t.assetId) ?? [];
      arr.push(t);
      m.set(t.assetId, arr);
    }
    return m;
  }, [safeThreats, assetById]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {chips.length === 0 ? (
        <p className="tm-empty">No assets to diagram.</p>
      ) : (
        <div className="dg-stage tm-stage">
          <svg
            viewBox={`0 0 ${vbW} ${vbH}`}
            className="dg-svg"
            role="img"
            aria-label={title}
            preserveAspectRatio="xMidYMid meet"
          >
            {placedLanes.map((lane) => (
              <g key={lane.key}>
                <rect
                  x={lane.x}
                  y={lane.y}
                  width={lane.w}
                  height={lane.h}
                  rx={12}
                  className={lane.dashed ? 'tm-boundary' : 'tm-lane-plain'}
                />
                {lane.label && (
                  <text x={lane.x + LANE_PAD} y={lane.y + 15} className="tm-lane-lbl">
                    {truncate(lane.label, 22)}
                  </text>
                )}
                {lane.assets.length === 0 && (
                  <text
                    x={lane.x + lane.w / 2}
                    y={lane.y + lane.h / 2 + 4}
                    textAnchor="middle"
                    className="tm-lane-empty"
                  >
                    No assets
                  </text>
                )}
              </g>
            ))}

            {chips.map((c) => {
              const cx = c.x;
              const cy = c.y;
              const chipThreats = threatsByAsset.get(c.asset.id) ?? [];
              const shown = chipThreats.slice(0, MARKER_CAP);
              const extra = chipThreats.length - shown.length;
              return (
                <g key={c.asset.id}>
                  <rect x={cx} y={cy} width={CHIP_W} height={CHIP_H} rx={9} className="tm-chip" />
                  <g transform={`translate(${cx + 17} ${cy + CHIP_H / 2})`}>
                    <KindGlyph kind={c.asset.kind} />
                  </g>
                  <text x={cx + 32} y={cy + CHIP_H / 2 + 4} className="tm-chip-lbl">
                    {c.asset.name.length > LABEL_MAX && <title>{c.asset.name}</title>}
                    {truncate(c.asset.name, LABEL_MAX)}
                  </text>
                  {shown.map((t, i) => (
                    <circle
                      key={t.key}
                      cx={cx + CHIP_W - 9 - i * 10}
                      cy={cy + 8}
                      r={3.4}
                      className={t.status === 'open' ? 'tm-mark tm-mark--open' : 'tm-mark'}
                    >
                      <title>
                        {(t.stride ? STRIDE_LABEL[t.stride] : 'Threat') +
                          (t.status === 'open' ? ' · open' : ' · mitigated')}
                      </title>
                    </circle>
                  ))}
                  {extra > 0 && (
                    <text
                      x={cx + CHIP_W - 9 - shown.length * 10}
                      y={cy + 11}
                      textAnchor="end"
                      className="tm-mark-more"
                    >
                      +{extra}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {safeThreats.length > 0 && (
        <div className="tm-register">
          {safeThreats.map((t) => {
            const asset = assetById.get(t.assetId);
            return (
              <div key={t.key} className="tm-row">
                <div className="tm-row-head">
                  <span
                    className="tm-row-stride"
                    title={t.stride ? STRIDE_LABEL[t.stride] : undefined}
                  >
                    {t.stride ? STRIDE_SHORT[t.stride] : '?'}
                  </span>
                  <span className="tm-row-asset">{asset ? asset.name : 'Unknown asset'}</span>
                  <span className="tm-row-cat">
                    {t.stride ? STRIDE_LABEL[t.stride] : 'Unspecified'}
                  </span>
                  <span
                    className={
                      t.status === 'open'
                        ? 'tm-row-status tm-row-status--open'
                        : 'tm-row-status tm-row-status--mitigated'
                    }
                  >
                    {t.status === 'open' ? 'Open' : 'Mitigated'}
                  </span>
                </div>
                <span className="tm-row-mitigation">{t.mitigation || '—'}</span>
              </div>
            );
          })}
        </div>
      )}

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
