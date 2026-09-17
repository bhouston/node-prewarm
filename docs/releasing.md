# Release setup

## npm trusted publisher

For the existing `node-prewarm` package, open npm → package Settings → Trusted
publishing and add GitHub Actions with these exact values:

| Field                    | Value                   |
| ------------------------ | ----------------------- |
| Organization or user     | `bhouston`              |
| Repository               | `node-prewarm`          |
| Workflow filename        | `release.yml`           |
| Environment              | `npm`                   |
| Allowed action, if shown | Publish (`npm publish`) |

The workflow uses GitHub-hosted runners, Node 26 (which includes npm newer than
11.5.1), and `id-token: write`. It deliberately does not set `registry-url`,
`NODE_AUTH_TOKEN`, or `NPM_TOKEN`. npm generates provenance automatically for trusted
publishing. Configure this trust before merging the first release PR into `main`.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [semantic-release GitHub Actions](https://semantic-release.org/recipes/ci-configurations/github-actions/).

## GitHub settings

- Keep `main` as the default branch. `dev` is the integration branch.
- Create an environment named `npm`, restricting deployments to `main`.
- Protect `dev` and `main`: require a PR and the `Quality` and `Contribution policy`
  checks; block force pushes and deletion. The maintainer can configure reviews
  appropriate for a solo or team repository.
- Enable squash merges for feature PRs and merge commits for release PRs. Disable
  rebase merges. Select the correct merge method per CONTRIBUTING.md.
- Optionally configure `CODECOV_TOKEN` for the existing Codecov badge. Coverage
  thresholds and artifact uploads work independently of the reporting service.

## Existing release baseline

npm records version `0.3.0` at commit
`1470936307e3e545d956511ba98c0db09c0c400a`. The `v0.3.0` tag points there, so
semantic-release starts from that version rather than treating this as a new
package. Older non-conventional commits will not produce release entries.

## Release and recovery

Merge tested work into `dev`. Open `dev` → `main` and merge with a merge commit.
The release workflow reruns quality checks, computes the version, updates the
package manifest in its checkout, publishes npm, and creates the GitHub release
with generated notes and a changelog attachment. Maintenance-only changes may
produce no release. This workflow setup itself uses a `ci:` commit and does not
force a new package version.

`pnpm release:dry-run` previews from `main` with GitHub authentication, but can still
perform remote authentication checks. It does not prove OIDC publishing works
outside GitHub Actions. The first real release after configuring npm validates
that final connection. No local publish command is provided.

If a run fails before publication, fix the configuration and rerun the failed
workflow. If npm publication succeeded but GitHub release creation failed, inspect
the existing npm version and git tag and repair the GitHub release; do not delete
published versions or move release tags to retry.
