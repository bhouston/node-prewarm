import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseArgv, prewarm, type PrewarmOptions } from "../src/prewarm.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testDir);
const tsxCli = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const miniServerFixture = join(testDir, "fixtures", "mini-server.ts");

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

function tsxCommand(entryPath: string): string {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(tsxCli)} ${JSON.stringify(entryPath)}`;
}

function nodeEvalCommand(source: string): string {
  const normalizedSource = source.replace(/\s+/gu, " ").trim();
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(normalizedSource)}`;
}

async function withCacheDir<T>(run: (cacheDir: string) => Promise<T>): Promise<T> {
  const cacheDir = await mkdtemp(join(tmpdir(), "node-prewarm-"));
  try {
    return await run(cacheDir);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

async function runPrewarm(
  overrides: Partial<PrewarmOptions> & Pick<PrewarmOptions, "command">,
): Promise<{ exitCode: number }> {
  return withCacheDir(async (cacheDir) =>
    prewarm({
      command: overrides.command,
      port: overrides.port ?? (await getFreePort()),
      host: overrides.host ?? "127.0.0.1",
      listenTimeout: overrides.listenTimeout ?? 0.25,
      shutdownTimeout: overrides.shutdownTimeout ?? 0.25,
      clearCache: overrides.clearCache ?? false,
      verifyCache: overrides.verifyCache ?? false,
      skipVersionCheck: overrides.skipVersionCheck ?? true,
      ignoreShutdownTimeout: overrides.ignoreShutdownTimeout ?? false,
      ignoreCrash: overrides.ignoreCrash ?? false,
      stdio: overrides.stdio ?? "ignore",
      cwd: overrides.cwd,
      env:
        overrides.env === undefined
          ? { ...process.env, NODE_COMPILE_CACHE: cacheDir }
          : overrides.env,
    }),
  );
}

describe("prewarm", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the command line and all supported flags", () => {
    expect(
      parseArgv([
        "node server.js",
        "--port",
        "8080",
        "--host",
        "0.0.0.0",
        "--listen-timeout",
        "61",
        "--shutdown-timeout",
        "7.5",
        "--clear-cache",
        "--verify-cache",
        "--skip-version-check",
        "--ignore-shutdown-timeout",
        "--ignore-crash",
      ]),
    ).toEqual({
      command: "node server.js",
      options: {
        port: 8080,
        host: "0.0.0.0",
        listenTimeout: 61,
        shutdownTimeout: 7.5,
        clearCache: true,
        verifyCache: true,
        skipVersionCheck: true,
        ignoreShutdownTimeout: true,
        ignoreCrash: true,
      },
    });
  });

  it.each([
    { argv: [], message: /Usage/ },
    { argv: ["node server.js"], message: /port/ },
    {
      argv: ["node server.js", "--port", "8080", "unexpected"],
      message: /Unknown argument/,
    },
    { argv: ["node server.js", "--port", "8080", "--wat"], message: /Unknown argument/ },
    { argv: ["node server.js", "--port", "wat"], message: /port/ },
    {
      argv: ["node server.js", "--port", "8080", "--listen-timeout", "0"],
      message: /listen-timeout/,
    },
    {
      argv: ["node server.js", "--port", "8080", "--shutdown-timeout", "-1"],
      message: /shutdown-timeout/,
    },
  ])("rejects invalid argv: $argv", ({ argv, message }) => {
    expect(() => parseArgv(argv)).toThrow(message);
  });

  it("starts a server, waits for the port, and shuts it down cleanly", async () => {
    await withCacheDir(async (cacheDir) => {
      const port = await getFreePort();
      const { exitCode } = await prewarm({
        command: tsxCommand(miniServerFixture),
        port,
        host: "127.0.0.1",
        listenTimeout: 61,
        shutdownTimeout: 5,
        stdio: "ignore",
        verifyCache: false,
        skipVersionCheck: false,
        clearCache: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      });

      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1m 1s"));
    });
  });

  it("fails when NODE_COMPILE_CACHE is not set", async () => {
    const { exitCode } = await prewarm({
      command: nodeEvalCommand("process.exit(0)"),
      port: await getFreePort(),
      host: "127.0.0.1",
      listenTimeout: 0.25,
      shutdownTimeout: 0.25,
      skipVersionCheck: true,
      clearCache: false,
      verifyCache: false,
      ignoreShutdownTimeout: false,
      ignoreCrash: false,
      stdio: "ignore",
    });

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: NODE_COMPILE_CACHE environment variable is required.",
    );
  });

  it("fails the version check on Node versions below 25", async () => {
    const originalVersions = process.versions;

    try {
      Object.defineProperty(process, "versions", {
        value: { ...originalVersions, node: "24.9.0" },
        configurable: true,
      });

      const { exitCode } = await runPrewarm({
        command: nodeEvalCommand("process.exit(0)"),
        skipVersionCheck: false,
      });

      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        "Error: Node.js 25+ is required for Stable Module Compile Cache.",
      );
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Current version:"));
    } finally {
      Object.defineProperty(process, "versions", {
        value: originalVersions,
        configurable: true,
      });
    }
  });

  it("fails when the provided port is invalid", async () => {
    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand("process.exit(0)"),
      port: Number.NaN,
    });

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: port is required.");
  });

  it("uses PORT from the environment when provided", async () => {
    await withCacheDir(async (cacheDir) => {
      const actualPort = await getFreePort();
      const ignoredPort = await getFreePort();
      const { exitCode } = await prewarm({
        command: tsxCommand(miniServerFixture),
        port: ignoredPort,
        host: "127.0.0.1",
        listenTimeout: 0.5,
        shutdownTimeout: 0.5,
        skipVersionCheck: true,
        clearCache: false,
        verifyCache: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
          PORT: String(actualPort),
        },
      });

      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(`Overriding --port with PORT=${actualPort}`);
    });
  });

  it("fails when PORT from the environment is not a number", async () => {
    const { exitCode } = await withCacheDir((cacheDir) =>
      prewarm({
        command: nodeEvalCommand("setInterval(() => {}, 1_000)"),
        port: 1234,
        host: "127.0.0.1",
        listenTimeout: 0.25,
        shutdownTimeout: 0.25,
        skipVersionCheck: true,
        clearCache: false,
        verifyCache: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
          PORT: "not-a-number",
        },
      }),
    );

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: Invalid port value: not-a-number");
  });

  it("clears an existing cache directory before prewarming", async () => {
    await withCacheDir(async (cacheDir) => {
      const staleFile = join(cacheDir, "stale-cache.bin");
      await writeFile(staleFile, "old-cache");

      const { exitCode } = await prewarm({
        command: tsxCommand(miniServerFixture),
        port: await getFreePort(),
        host: "127.0.0.1",
        listenTimeout: 0.5,
        shutdownTimeout: 0.5,
        skipVersionCheck: true,
        clearCache: true,
        verifyCache: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      });

      expect(exitCode).toBe(0);
      expect(fs.existsSync(staleFile)).toBe(false);
    });
  });

  it("fails when the process exits before opening the port", async () => {
    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand("process.exit(3)"),
    });

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Process exited before port"),
    );
  });

  it("can ignore an early crash after the cache grows", async () => {
    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand(`
        const fs = require("node:fs");
        const path = require("node:path");
        fs.mkdirSync(process.env.NODE_COMPILE_CACHE, { recursive: true });
        fs.writeFileSync(path.join(process.env.NODE_COMPILE_CACHE, "cache.bin"), Buffer.alloc(1536));
        process.exit(3);
      `),
      ignoreCrash: true,
    });

    expect(exitCode).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^NODE_COMPILE_CACHE size: (?!0 B).+ delta\)$/),
    );
  });

  it("reports a negative cache delta when a crashing process removes cache files", async () => {
    await withCacheDir(async (cacheDir) => {
      await writeFile(join(cacheDir, "cache.bin"), Buffer.alloc(12 * 1024));

      const port = await getFreePort();
      const { exitCode } = await prewarm({
        command: nodeEvalCommand(`
          const fs = require("node:fs");
          fs.rmSync(process.env.NODE_COMPILE_CACHE, { recursive: true, force: true });
          process.exit(2);
        `),
        port,
        host: "127.0.0.1",
        listenTimeout: 0.25,
        shutdownTimeout: 0.25,
        skipVersionCheck: true,
        clearCache: false,
        verifyCache: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: true,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      });

      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("(-12 KB delta)"));
    });
  });

  it("treats directory size read failures as an empty cache", async () => {
    vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw new Error("boom");
    });

    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand("process.exit(3)"),
      ignoreCrash: true,
    });

    expect(exitCode).toBe(0);
    expect(console.log).toHaveBeenCalledWith("NODE_COMPILE_CACHE size: 0 B (0 B delta)");
  });

  it("fails when the port never becomes available", async () => {
    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand("setInterval(() => {}, 1_000)"),
      listenTimeout: 0.1,
    });

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Timeout waiting for port"));
  });

  it("fails when graceful shutdown times out", async () => {
    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand(`
        const net = require("node:net");
        const port = Number(process.env.PORT);
        const server = net.createServer((socket) => socket.end("ok"));
        server.listen(port, "127.0.0.1");
        process.on("SIGTERM", () => {});
        setInterval(() => {}, 1_000);
      `),
      shutdownTimeout: 0.1,
    });

    expect(exitCode).toBe(1);
    expect(console.warn).toHaveBeenCalledWith("Graceful timeout exceeded, forcing SIGKILL...");
  });

  it("can ignore a graceful shutdown timeout", async () => {
    const { exitCode } = await runPrewarm({
      command: nodeEvalCommand(`
        const net = require("node:net");
        const port = Number(process.env.PORT);
        const server = net.createServer((socket) => socket.end("ok"));
        server.listen(port, "127.0.0.1");
        process.on("SIGTERM", () => {});
        setInterval(() => {}, 1_000);
      `),
      shutdownTimeout: 0.1,
      ignoreShutdownTimeout: true,
    });

    expect(exitCode).toBe(0);
  });

  it("fails cache verification when the cache directory stays empty", async () => {
    await withCacheDir(async (cacheDir) => {
      const { exitCode } = await prewarm({
        command: nodeEvalCommand(`
          const fs = require("node:fs");
          const net = require("node:net");
          const port = Number(process.env.PORT);
          const server = net.createServer((socket) => socket.end("ok"));
          server.listen(port, "127.0.0.1");
          process.on("SIGTERM", () => {
            server.close(() => {
              fs.rmSync(process.env.NODE_COMPILE_CACHE, { recursive: true, force: true });
              process.exit(0);
            });
          });
        `),
        port: await getFreePort(),
        host: "127.0.0.1",
        listenTimeout: 0.5,
        shutdownTimeout: 0.5,
        skipVersionCheck: true,
        clearCache: false,
        verifyCache: true,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      });

      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith("Error: Cache directory is empty after pre-warm.");
    });
  });

  it("returns an error when an unexpected runtime failure occurs", async () => {
    const log = vi.spyOn(console, "log");

    log.mockImplementation((message: string) => {
      if (message.startsWith("Response detected on")) {
        throw new Error("unexpected log failure");
      }
    });

    const { exitCode } = await withCacheDir(async (cacheDir) =>
      prewarm({
        command: tsxCommand(miniServerFixture),
        port: await getFreePort(),
        host: "127.0.0.1",
        listenTimeout: 0.5,
        shutdownTimeout: 0.5,
        skipVersionCheck: true,
        clearCache: false,
        verifyCache: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      }),
    );

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error during pre-warm:", expect.any(Error));
  });
});
