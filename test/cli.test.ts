import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { commandLine } from "vitest-command-line";

import { main } from "../src/cli.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testDir);
const tsxCli = join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const cliEntry = join(repoRoot, "src/cli.ts");
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

async function withCacheDir<T>(run: (cacheDir: string) => Promise<T>): Promise<T> {
  const cacheDir = await mkdtemp(join(tmpdir(), "node-prewarm-cli-"));
  try {
    return await run(cacheDir);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

describe("cli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cli = commandLine({
    command: [process.execPath, tsxCli, cliEntry],
    cwd: repoRoot,
    env: { ...process.env },
    name: "node-prewarm",
  });

  it("prints usage errors and exits with code 2", async () => {
    const result = await cli.run([], {
      timeout: 5_000,
      subprocessCleanup: "process-tree",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Usage: node-prewarm <command> --port <port> [options]");
  });

  it("uses the default runtime when no overrides are supplied", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalExitCode = process.exitCode;

    try {
      process.exitCode = undefined;
      await main([]);
      expect(error).toHaveBeenCalledWith("Usage: node-prewarm <command> --port <port> [options]");
      expect(process.exitCode).toBe(2);
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("sets exitCode 2 when argument parsing fails", async () => {
    const error = vi.fn();
    const exit = vi.fn();
    const setExitCode = vi.fn();
    const parseArgv = vi.fn(() => {
      throw new Error("bad argv");
    });
    const prewarm = vi.fn();

    await main(["--bad"], {
      error,
      exit,
      setExitCode,
      parseArgv,
      prewarm,
    });

    expect(error).toHaveBeenCalledWith("bad argv");
    expect(setExitCode).toHaveBeenCalledWith(2);
    expect(prewarm).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("logs non-Error parse failures as-is", async () => {
    const error = vi.fn();
    const exit = vi.fn();
    const setExitCode = vi.fn();
    const parseArgv = vi.fn(() => {
      throw "bad argv";
    });
    const prewarm = vi.fn();

    await main(["--bad"], {
      error,
      exit,
      setExitCode,
      parseArgv,
      prewarm,
    });

    expect(error).toHaveBeenCalledWith("bad argv");
    expect(setExitCode).toHaveBeenCalledWith(2);
  });

  it("passes parsed options to prewarm and exits with its code", async () => {
    const error = vi.fn();
    const exit = vi.fn();
    const setExitCode = vi.fn();
    const parseArgv = vi.fn(() => ({
      command: "node server.js",
      options: {
        port: 8080,
        host: "127.0.0.1",
        listenTimeout: 10,
        shutdownTimeout: 5,
        clearCache: false,
        verifyCache: false,
        skipVersionCheck: false,
        ignoreShutdownTimeout: false,
        ignoreCrash: false,
      },
    }));
    const prewarm = vi.fn(async () => ({ exitCode: 7 }));

    await main(["node server.js", "--port", "8080"], {
      error,
      exit,
      setExitCode,
      parseArgv,
      prewarm,
    });

    expect(prewarm).toHaveBeenCalledWith({
      command: "node server.js",
      port: 8080,
      host: "127.0.0.1",
      listenTimeout: 10,
      shutdownTimeout: 5,
      clearCache: false,
      verifyCache: false,
      skipVersionCheck: false,
      ignoreShutdownTimeout: false,
      ignoreCrash: false,
      stdio: "inherit",
    });
    expect(exit).toHaveBeenCalledWith(7);
    expect(error).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("runs the CLI successfully against the fixture server", async () => {
    await withCacheDir(async (cacheDir) => {
      const port = await getFreePort();
      const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(tsxCli)} ${JSON.stringify(miniServerFixture)}`;
      const result = await cli.run([command, "--port", String(port), "--host", "127.0.0.1"], {
        timeout: 10_000,
        subprocessCleanup: "process-tree",
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cacheDir,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`NODE_COMPILE_CACHE: ${cacheDir}`);
      expect(result.stdout).toContain(`Waiting for response on 127.0.0.1:${port}`);
      expect(result.stdout).toContain(`Response detected on 127.0.0.1:${port}`);
    });
  });
});
