# Contributing

This is the single workflow standard for human contributors, Claude, and Codex.
Read it before changing code. AGENTS.md and CLAUDE.md point here intentionally.

## Issue → branch → PR

1. Before implementing a feature or other scoped change, open a GitHub issue using
   the feature template (or reuse the issue already tracking the request). Include
   a description, motivation, acceptance criteria, and constraints. CLI-created
   issues must include the same information. Do not include credentials.
2. Fetch `origin`, branch from `origin/dev`, and name the branch
   `<type>/<issue-number>-<short-description>`, for example `feat/42-batch-export`.
   Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`, `ci`.
   Never commit directly to `main` or `dev`. Preserve unrelated local changes.
3. Implement the issue and run `pnpm check`. Add meaningful tests for behavior
   changes. Every commit must use Conventional Commits. Husky checks staged files
   and commit messages after `pnpm install`; do not bypass hooks.
4. Push the branch and open a PR **against `dev`**. Use a Conventional Commit title,
   describe the resulting behavior and validation, and include `Closes #42`
   matching the branch's issue. CI validates the title, commits, branch, and link.
5. Squash-merge feature PRs into `dev`, retaining the Conventional Commit title
   and any `BREAKING CHANGE:` footer. Integration merges do not publish.
6. When ready to release, open a PR from this repository's `dev` to `main`, titled
   `chore: release dev`. Use **Create a merge commit** for this PR, preserving all
   feature commits. Never squash or rebase the release PR. CI rejects other source
   branches for `main`. Keep working from `dev` after release; release automation
   does not commit generated files, so no version commits need to be synced back.

GitHub closes linked issues when their closing commits reach the default branch,
currently `main`; merging a feature PR to `dev` does not immediately close its issue.
Agents may create issues and PRs as part of an authorized task. Publishing a release
requires the maintainer's deliberate `dev` → `main` merge.

## Commit format

Use `<type>(optional-scope): short description`, for example:

```text
feat(cli): add batch prewarming

Closes #42
```

`feat` triggers a minor release; `fix` and `perf` trigger a patch release.
A `!` after the type/scope or a `BREAKING CHANGE:` footer triggers a major release.
`docs`, `chore`, `refactor`, `test`, `style`, `build`, `ci`, and `revert` are accepted
by the conventional preset; ordinary non-feature/non-fix maintenance does not
trigger releases (recognized reverts are handled by the release analyzer).
A breaking change must describe the migration in the commit body or footer.
Do not manually change the version or write release changelog entries.

## Local checks

Use Node from `.nvmrc` and the pnpm version in `package.json`.

```sh
pnpm install
pnpm check
```

`pnpm check` checks formatting, lint, TypeScript build/declarations, tests with
coverage, compiled JavaScript size, and a high-severity dependency audit, including
build/test dependencies. Coverage floors are 95% statements/lines/functions and
85% branches. `pnpm test` always enforces these floors. Size-limit allows 5 kB of
compressed compiled JavaScript; this measures our output, excluding dependencies.
CI displays size/coverage in its job summary and retains coverage artifacts.
Update thresholds only with an explicit rationale in the PR.

## Releases and repository setup

See [release setup](docs/releasing.md) for npm trusted publishing and GitHub settings.
Only pushes to `main` run semantic-release, after the same quality checks pass.
It derives versions from commits since the last `v*` tag, publishes to npm, creates
release notes and a GitHub release, and attaches a generated `CHANGELOG.md`.
The changelog attachment covers commits in that release; the GitHub Releases page
is the cumulative changelog. The package version is updated in CI for publication,
not committed back. This avoids release-bot commits and branch-protection bypasses.

For other repositories, see [rollout guidance](docs/workflow-rollout.md).
