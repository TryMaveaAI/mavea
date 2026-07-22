import type { ReactElement } from 'react';
import termsMarkdown from '../../TERMS.md?raw';
import { LegalMarkdownDocument } from './LegalMarkdownDocument';

export function TermsApp(): ReactElement {
  return <LegalMarkdownDocument markdown={termsMarkdown} page="terms" kicker="Project terms" />;
}
