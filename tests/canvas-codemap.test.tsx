import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeMap } from '../src/canvas/CodeMap';

describe('CodeMap', () => {
  it('keeps every variable-length node label and note in the document flow', () => {
    const note =
      'This dependency remains safe after the migration because its public contract is unchanged.';
    const { container } = render(
      <CodeMap
        center="ThemeContextWithAnUnusuallyLongFilename.tsx"
        nodes={[
          { label: 'SettingsPageWithRegionalOverrides.tsx', note, hot: true },
          { label: 'NavigationThemeCompatibilityLayer.ts', note },
        ]}
      />,
    );

    expect(container.querySelectorAll('.codemap-node')).toHaveLength(2);
    expect(container.textContent).toContain('ThemeContextWithAnUnusuallyLongFilename.tsx');
    expect(container.textContent?.match(new RegExp(note, 'g'))).toHaveLength(2);
    expect(container.querySelector('.codemap svg')).toBeNull();
  });
});
