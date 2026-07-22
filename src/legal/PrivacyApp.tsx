import type { ReactElement } from 'react';
import privacyMarkdown from '../../PRIVACY.md?raw';
import { LegalMarkdownDocument } from './LegalMarkdownDocument';

export function PrivacyApp(): ReactElement {
  return (
    <LegalMarkdownDocument markdown={privacyMarkdown} page="privacy" kicker="What goes where" />
  );
}
