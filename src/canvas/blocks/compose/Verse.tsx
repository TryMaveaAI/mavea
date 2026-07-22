import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VerseProps } from './types';
import { CopyButton } from '../../lib';
import './styles.css';
import { richInnerHtml } from '../../../lib/richText';

type Props = VerseProps & { delay?: number };

// Flatten all stanza lines into plain text for clipboard — stanzas separated by
// a blank line, per-line indent preserved with spaces so the poem reads correctly.
function buildCopyText(stanzas: VerseProps['stanzas']): string {
  return stanzas
    .map((s) => {
      const header = s.label ? `[${s.label}]\n` : '';
      const lines = s.lines.map((l) => ' '.repeat((l.indent ?? 0) * 2) + l.text).join('\n');
      return header + lines;
    })
    .join('\n\n');
}

// Map a numeric indent level to a paddingLeft value (16 px per level).
function indentStyle(indent: number | undefined): CSSProperties | undefined {
  const level = indent ?? 0;
  return level > 0 ? { paddingLeft: `${level * 16}px` } : undefined;
}

export function Verse({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  stanzas,
  form,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.edit;
  const copyText = buildCopyText(stanzas ?? []);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Form chip — e.g. "Sonnet", "Haiku", "Free verse" */}
      {form && <div className="vs-form">{form}</div>}

      {/* Stanza list — each stanza is a .vt-list column; gaps separate them visually */}
      <div className="vs-stanzas">
        {(stanzas ?? []).map((stanza, si) => (
          <div key={si}>
            {stanza.label && <div className="vs-stanza-label">{stanza.label}</div>}
            <div className="vs-lines vt-list">
              {(stanza.lines ?? []).map((line, li) => (
                <div key={li} className="vs-line" style={indentStyle(line.indent)}>
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Copy action aligned to the trailing edge */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <CopyButton text={copyText} label="Copy poem" />
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
