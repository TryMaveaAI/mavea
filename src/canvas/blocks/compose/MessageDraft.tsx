import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MessageDraftProps } from './types';
import { CopyButton } from '../../lib';
import { richInnerHtml } from '../../../lib/richText';

type Props = MessageDraftProps & { delay?: number };

// Detect whether a string contains HTML tags so we can use dangerouslySetInnerHTML
// only when the body is actual markup rather than plain prose.
function containsHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

// Assemble the copy-to-clipboard text from all draft parts; omits absent sections.
function buildCopyText(props: MessageDraftProps): string {
  const parts: string[] = [];
  if (props.subject) parts.push(props.subject);
  parts.push('');
  if (props.greeting) parts.push(props.greeting);
  parts.push('');
  // Strip HTML tags for clipboard text so the user gets clean plain text.
  const bodyPlain = props.body.replace(/<[^>]+>/g, '');
  parts.push(bodyPlain);
  if (props.closing || props.signature) {
    parts.push('');
    if (props.closing) parts.push(props.closing);
    if (props.signature) parts.push(props.signature);
  }
  return parts.join('\n');
}

export function MessageDraft({
  title,
  icon = 'mail',
  iconColor = 'var(--presence)',
  subject,
  to,
  from,
  greeting,
  body,
  closing,
  signature,
  tone,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.mail;
  const isHtml = containsHtml(body);
  const copyText = buildCopyText({
    title,
    icon,
    iconColor,
    subject,
    to,
    from,
    greeting,
    body,
    closing,
    signature,
    tone,
    footer,
  });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="md-draft">
        {/* Header: recipient, sender, and greeting metadata */}
        {(to || from || greeting) && (
          <div className="md-header">
            {to && (
              <div className="md-field">
                <span className="md-field-label">To</span>
                <span className="md-field-value">{to}</span>
              </div>
            )}
            {from && (
              <div className="md-field">
                <span className="md-field-label">From</span>
                <span className="md-field-value">{from}</span>
              </div>
            )}
            {greeting && (
              <div className="md-field">
                <span className="md-field-label">Opens</span>
                <span className="md-field-value">{greeting}</span>
              </div>
            )}
          </div>
        )}

        {/* Subject displayed prominently above the body — the called-out text figure for the draft */}
        <div className="md-subject" data-mark="underline">
          {subject}
        </div>

        {/* Body: a message draft may carry rich markup (bold, lists). It is a RAW_TEXT prop,
            so unlike most model output it is NOT tag-neutralized upstream — sanitize it here
            (the render boundary) so model/authored markup stays safe but rich. */}
        {isHtml ? (
          <div className="md-body" dangerouslySetInnerHTML={richInnerHtml(body)} />
        ) : (
          <div className="md-body">{body}</div>
        )}

        {/* Sign-off and sender signature */}
        {(closing || signature) && (
          <div className="md-closing">
            {closing && <div>{closing}</div>}
            {signature && <div>{signature}</div>}
          </div>
        )}

        {/* Tone badge and copy action sit in the footer row */}
        <div className="md-copy-row">
          {tone && <span className="md-tone-chip">{tone}</span>}
          <CopyButton text={copyText} label="Copy draft" />
        </div>
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
