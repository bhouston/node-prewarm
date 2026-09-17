# Reusing this workflow

This repository is the pilot. Validate the issue → branch → PR checks and the first
trusted-publishing release before extracting a separate GitHub template repository.

Copy CONTRIBUTING.md, AGENTS.md, CLAUDE.md, commitlint.config.js,
release.config.js, .husky/, .github/, scripts/check-pr.mjs, and these docs. Adapt:

- Repository/package names, security contact, badge URLs, and license ownership.
- Node/pnpm versions, build/test commands, coverage and size thresholds.
- The scripts, devDependencies, publishConfig, and size-limit settings in package.json.
- Test coverage settings and the npm trusted publisher for each package separately.
- GitHub branches, protection rules, environment restrictions, and optional Codecov token.

Install dependencies to regenerate the target lockfile; do not copy this lockfile
into a different project. For existing packages, tag the exact source commit of
the latest npm version before enabling automation. New packages need an initial
npm publication before package-level trusted publishing can be configured.

Once the pilot is verified, put the shared files in a dedicated repository and mark
it as a template in GitHub settings. Automate copying only after separating the
repository-specific settings above; never overwrite another repository's existing
license, instructions, or workflow configuration blindly.
