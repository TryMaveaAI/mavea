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
  // Dependabot writes its own subject ("Bump the dev-dependencies group across…") and offers no
  // setting for its capitalisation — only the prefix. Rather than relax subject-case for everyone,
  // skip exactly the machine-authored bump, so a human subject is still held to the convention.
  ignores: [(message) => /^(chore|ci|build)\(deps(-dev)?\): Bump /.test(message)],
};
