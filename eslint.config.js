import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'src/canvas/blocks/catalog/details/**',
      'src/canvas/blocks/catalog/facts.generated.ts',
      'dist',
      'coverage',
      'node_modules',
      '.claude/worktrees/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React's stable hooks rules. eslint-plugin-react-hooks v7's `recommended` preset also
      // turns on the React Compiler rules (refs / immutability / set-state-in-effect /
      // static-components); adopt those together with the React Compiler in a focused
      // follow-up rather than mass-rewriting the timing-sensitive orchestration here.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Let an underscore mark a deliberately-unused binding (event handlers, generics).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // These legitimately export non-components — the app entry, the icon library (a const map +
    // its factory), and the toast module (a hook + its host). They are not Fast Refresh
    // boundaries, so the component-only-export rule doesn't apply.
    files: ['src/main.tsx', 'src/icons/icons.tsx', 'src/components/Toast.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
