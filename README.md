<p align="center">
  <a href="https://npmjs.com/package/node-prewarm"><img src="https://img.shields.io/npm/v/node-prewarm.svg" alt="npm package"></a>
  <a href="https://www.npmtrends.com/node-prewarm"><img src="https://img.shields.io/npm/dw/node-prewarm.svg" alt="npm downloads"></a>
  <a href="https://codecov.io/gh/bhouston/node-prewarm"><img src="https://codecov.io/gh/bhouston/node-prewarm/branch/main/graph/badge.svg" alt="coverage"></a>
  <a href="https://discord.gg/fwupDN493R"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat&logo=discord" alt="discord chat"></a>
</p>
<br/>

# node-prewarm

> Warm Node's module compile cache during your Docker build.

- 🔥 Pre-Warms Node Compile Cache
- 🐳 Built for Docker Builds
- 🔌 Waits for a TCP Port
- 🛑 Graceful SIGTERM Shutdown
- ⏱️ Dry-Run Startup Timing
- 📄 OpenCLI Docs Generation

Starts a Node process (typically your HTTP server entrypoint), waits until a TCP port accepts connections, then sends **SIGTERM** so the process exits gracefully. Intended for Docker builds alongside [`NODE_COMPILE_CACHE`](https://nodejs.org/api/environment_variables.html) (Node.js 25+) to preload the stable module compile cache before deployment.

Requires **Node.js 25 or later**.

## Install

```bash
pnpm add -D node-prewarm
# or
npm install --save-dev node-prewarm
```

## CLI

```bash
export NODE_COMPILE_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/node-compile"

node-prewarm "node .output/server/index.mjs" --port 8080 --ignore-crash
```

Environment variable **`NODE_COMPILE_CACHE`** must be set. On Linux and macOS we recommend
`~/.cache/node-compile` (honoring `XDG_CACHE_HOME`); on Windows, use
`%LOCALAPPDATA%\node-compile\Cache`. If **`PORT`** is set (e.g. in Docker `ENV`), it overrides `--port`.

If you only want to measure startup time until the server listens, use `--dry-run`:

```bash
node-prewarm "node .output/server/index.mjs" --port 8080 --dry-run
```

In `--dry-run` mode, `NODE_COMPILE_CACHE` is not required and no cache size information is reported.

### Generate an OpenCLI document

```bash
node-prewarm docgen --output opencli.json
```

Writes an [OpenCLI](https://github.com/bcdxn/opencli) specification of this CLI to stdout,
or a file with `--output`/`-o`. Use `--format markdown` for a rendered reference. Validate
the result with [clidoc](https://clidoc.dev): `npx @clidoc/cli validate opencli.json`.

## Programmatic usage

```js
import { homedir } from 'node:os';
import { join } from 'node:path';
import { prewarm } from 'node-prewarm';

await prewarm({
  command: `node "${entry}"`,
  port: 8080,
  env: {
    NODE_COMPILE_CACHE: join(homedir(), '.cache', 'node-compile'),
  },
});
```

See `vitest.config.ts` and `test/prewarm.test.ts` for a minimal Express-based integration test.

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the issue → branch → PR workflow.

Uses `pnpm`. Pin Node with `.nvmrc` (`nvm use`).

```bash
pnpm install
pnpm run build
pnpm run format
pnpm run lint
pnpm test
```

`pnpm check` runs formatting, lint, the TypeScript build, tests with coverage,
compiled JavaScript size, and a high-severity dependency audit. Coverage floors
are 95% statements/lines/functions and 85% branches (`pnpm test` always enforces
these). Size-limit allows 5 kB of compressed compiled JavaScript, excluding
dependencies. CI reports size/coverage in its job summary and retains coverage
artifacts. Update either threshold only with an explicit rationale in the PR.

## Releases

See [RELEASING.md](RELEASING.md) for how releases are published and [GitHub Releases](https://github.com/bhouston/node-prewarm/releases) for changes.

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com).
