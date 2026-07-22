// Trust primitives: source citations, confidence badges, and context pills.
import { Icon } from '../icons/icons';
import type { Conf, ContextPillSpec } from '../data/conversation';

/* ---------- trust primitives ---------- */
interface SourceChipProps {
  file: string;
  loc?: string;
  color?: string;
  onClick?: () => void;
}
export function SourceChip({
  file,
  loc,
  color = 'var(--presence-soft)',
  onClick,
}: SourceChipProps) {
  return (
    <button className="source-chip" onClick={onClick} style={{ color }}>
      <Icon.doc style={{ width: 12, height: 12 }} />
      <span>{file}</span>
      {loc && <span className="mono">· {loc}</span>}
    </button>
  );
}

const CONF_LABEL: Record<Conf, string> = {
  strong: 'Strong evidence',
  partial: 'Partial evidence',
  inferred: 'Inferred',
  unverified: 'Unverified',
};
/** Tooltip when nothing real backs the badge — no files, no sources. Honest, not fake rigor. */
export const CONF_TITLE_UNVERIFIED = "Best estimate from the model's knowledge — not verified";

interface ConfidenceBadgeProps {
  level?: Conf;
  /** Context-aware tooltip — callers with no files/sources behind the answer pass
   *  `CONF_TITLE_UNVERIFIED` so the badge never claims grounding it doesn't have. */
  title?: string;
}
export function ConfidenceBadge({
  level = 'strong',
  title = 'How sure Mavéa is, based on your files',
}: ConfidenceBadgeProps) {
  return (
    <span className={'conf ' + level} title={title}>
      <span className="bars">
        <i style={{ height: 5 }}></i>
        <i style={{ height: 8 }}></i>
        <i style={{ height: 11 }}></i>
      </span>
      {CONF_LABEL[level]}
    </span>
  );
}

/* ---------- context pill ---------- */
export function ContextPill({ name, color, verb }: ContextPillSpec) {
  return (
    <span className="context-pill">
      <span className="fdot" style={{ background: color }}></span>
      {verb && <span className="using">{verb}</span>} {name}
    </span>
  );
}
