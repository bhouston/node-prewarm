# node-prewarm

[![NPM Package][npm]][npm-url]
[![NPM Downloads][npm-downloads]][npmtrends-url]
[![Tests][tests-badge]][tests-url]
[![Coverage][coverage-badge]][coverage-url]

Start a Node process (typically your HTTP server entrypoint), wait until a TCP port accepts connections, then send **SIGTERM** so the process exits gracefully. Intended for Docker builds alongside [`NODE_COMPILE_CACHE`](https://nodejs.org/api/environment_variables.html) (Node.js 25+) to preload the stable module compile cache before deployment.

Requires **Node.js 25 or later**.

## Install

```bash
pnpm add -D node-prewarm
# or
npm install --save-dev node-prewarm
```

## CLI

```bash
export NODE_COMPILE_CACHE=/app/.node_compile_cache

node-prewarm "node .output/server/index.mjs" --port 8080 --ignore-crash
```

Environment variable **`NODE_COMPILE_CACHE`** must be set. If **`PORT`** is set (e.g. in Docker `ENV`), it overrides `--port`.

If you only want to measure startup time until the server listens, use `--dry-run`:

```bash
node-prewarm "node .output/server/index.mjs" --port 8080 --dry-run
```

In `--dry-run` mode, `NODE_COMPILE_CACHE` is not required and no cache size information is reported.

## Programmatic usage

```js
import { prewarm } from "node-prewarm";

await prewarm({
  command: `node "${entry}"`,
  port: 8080,
  env: {
    NODE_COMPILE_CACHE: "/app/.node_compile_cache",
  },
});
```

See `vitest.config.ts` and `test/prewarm.test.ts` for a minimal Express-based integration test.

## Development

Uses `pnpm`. Pin Node with `.nvmrc` (`nvm use`).

```bash
pnpm install
pnpm run build
pnpm run format
pnpm run lint
pnpm test
```

## License

MIT

[npm]: https://img.shields.io/npm/v/node-prewarm
[npm-url]: https://www.npmjs.com/package/node-prewarm
[npm-downloads]: https://img.shields.io/npm/dw/node-prewarm
[npmtrends-url]: https://www.npmtrends.com/node-prewarm
[tests-badge]: https://github.com/bhouston/node-prewarm/actions/workflows/coverage.yml/badge.svg
[tests-url]: https://github.com/bhouston/node-prewarm/actions/workflows/coverage.yml
[coverage-badge]: https://codecov.io/gh/bhouston/node-prewarm/branch/main/graph/badge.svg
[coverage-url]: https://codecov.io/gh/bhouston/node-prewarm
