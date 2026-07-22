/**
 * Conventional Commits, lightly relaxed for descriptive, professional messages:
 * allow a slightly longer subject and an unconstrained body.
 * https://www.conventionalcommits.org
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always'],
  },
};
