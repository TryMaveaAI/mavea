> Maintainer-only: this repository does not accept external code, patch, or documentation pull
> requests. Please use an issue for a bug report or feature suggestion without attaching code.

## What & why

<!-- A clear summary of the change and the problem it solves. Link any issue: Closes #123 -->

## Type of change

- [ ] ✨ Feature
- [ ] 🐛 Bug fix
- [ ] ♻️ Refactor
- [ ] 📝 Docs
- [ ] 🧰 Tooling / CI

## Checklist

Reviewed against [`docs/ENGINEERING.md`](../docs/ENGINEERING.md):

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass locally
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org)
- [ ] **Correctness** — edge cases and empty / loading / error paths handled; tests added
- [ ] **Security** — untrusted input validated/escaped; no secrets; keys stay client-side
- [ ] **Scalability / perf** — no needless re-renders, O(n²), or leaks; no unjustified new deps
- [ ] **Architecture** — fits the existing seams; extends by data, not by widening core switches
- [ ] **Readability** — clear names; comments say _why_; matches the surrounding style
- [ ] Out-of-scope files untouched (the Mavéa face / `Presence.tsx` is off-limits)
- [ ] Docs updated if behaviour or commands changed
- [ ] Licensing, legal notices, package contents, and third-party provenance remain accurate
- [ ] PR author is one of the two authorized maintainers

## Screenshots / notes

<!-- For UI changes, a before/after helps a lot. -->
