import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { CreativeTestProps, CreativeVariant, CreativeMetric } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';

type Props = CreativeTestProps & { delay?: number };

// A deterministic wash for a variant whose creative hasn't loaded (or wasn't given a src) —
// the same "never a blank hole" idea BeforeAfter/Carousel cover with an authored from/to, except
// this shape carries only a real `src`, so the fallback is cycled from the variant's own index
// rather than invented per-item colors.
const PLACEHOLDER_WASH: readonly [string, string][] = [
  ['var(--presence-deep)', 'var(--presence-soft)'],
  ['var(--insight)', 'var(--presence)'],
  ['var(--warning)', 'var(--presence-deep)'],
  ['var(--text-muted)', 'var(--insight-soft)'],
];

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// One metric chip. A metric with no usable value is dropped rather than shown blank — the same
// call GeoMap makes for a marker with no usable coordinate: a loose model reply (or, here, a
// synonym-only item the generic coercer couldn't fully repair) must never render "undefined".
function MetricChip({ metric }: { metric: CreativeMetric }) {
  const value = asStr(metric?.value);
  if (!value) return null;
  const label = asStr(metric?.label);
  const delta = asStr(metric?.delta);
  const dir = metric?.deltaDir === 'good' || metric?.deltaDir === 'bad' ? metric.deltaDir : '';
  return (
    <span className="crt-metric">
      {label && <span className="crt-metric-label">{label}</span>}
      <span className="crt-metric-value tab-num">{value}</span>
      {delta && <span className={'crt-metric-delta' + (dir ? ' ' + dir : '')}>{delta}</span>}
    </span>
  );
}

function VariantCard({
  variant,
  index,
  isWinner,
}: {
  variant: CreativeVariant;
  index: number;
  isWinner: boolean;
}) {
  const label = asStr(variant?.label) || `Variant ${index + 1}`;
  const headline = asStr(variant?.headline);
  // untrusted model URL — a rejected src leaves the placeholder wash, same as a 404
  const src = safeBlockImageSrc(asStr(variant?.src));
  const metrics = Array.isArray(variant?.metrics) ? variant.metrics : [];
  const [from, to] = PLACEHOLDER_WASH[index % PLACEHOLDER_WASH.length];

  return (
    <div
      className={'crt-card m-stagger-item m-fade-rise' + (isWinner ? ' winner' : '')}
      style={{ ['--i' as string]: index } as CSSProperties}
    >
      {isWinner && (
        <span className="crt-ribbon">
          <Icon.check className="ic" /> Winner
        </span>
      )}
      <div className="crt-media" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
        {src && (
          <img
            className="me-img-fill"
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            // a 404'd model URL hides itself so the wash + label show, not a broken icon
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {headline && <span className="crt-headline">{headline}</span>}
      </div>
      <div className="crt-cardlabel">{label}</div>
      {metrics.length > 0 && (
        <div className="crt-metrics">
          {metrics.map((m, i) => (
            <MetricChip metric={m} key={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// A marketing A/B creative comparison: real ad/post images side by side, each carrying its own
// headline and a row of performance metric chips, with the winning variant ribboned. Any number
// of variants lays out in a responsive grid so the common two-up case reads as a clean split and
// a longer test wraps rather than overflows.
export function CreativeTest({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  variants,
  winner,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  const list = Array.isArray(variants) ? variants : [];
  const winnerIndex =
    Number.isInteger(winner) && (winner as number) >= 0 && (winner as number) < list.length
      ? (winner as number)
      : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {list.length ? (
        <div className="crt-grid">
          {list.map((v, i) => (
            <VariantCard variant={v} index={i} isWinner={i === winnerIndex} key={i} />
          ))}
        </div>
      ) : (
        <BlockEmpty message="No creative variants to compare" />
      )}

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
