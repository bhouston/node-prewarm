import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseArgv, prewarm } from "../src/prewarm.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testDir);
const tsxCli = join(repoRoot, "node_modules/tsx/dist/cli.mjs");

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPort(new Error("unexpected server address"));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

describe("prewarm", () => {
  it("starts a toy express server, waits for port, shuts down cleanly", async () => {
    const port = await getFreePort();
    const cacheDir = await mkdtemp(join(tmpdir(), "node-prewarm-"));
    const fixturePath = join(testDir, "fixtures", "mini-server.ts");

    try {
      const { exitCode } = await prewarm({
        command: `${JSON.stringify(process.execPath)} ${JSON.stringify(tsxCli)} ${JSON.stringify(fixturePath)}`,
        port,
        host: "127.0.0.1",
        listenTimeout: 15,
        shutdownTimeout: 5,
        stdio: "ignore",
        verifyCache: false,
        skipVersionCheck: false,
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      });

      expect(exitCode).toBe(0);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("parseArgv throws without --port", () => {
    expect(() => parseArgv(["node dummy.js"])).toThrow(/port/);
  });
});
