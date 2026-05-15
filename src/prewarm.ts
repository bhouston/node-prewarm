import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import yargs, { type Argv } from "yargs";

export type StdioChoice = "inherit" | "ignore" | "pipe";

export interface PrewarmCliOptions {
  port: number;
  host: string;
  listenTimeout: number;
  shutdownTimeout: number;
  clearCache: boolean;
  verifyCache: boolean;
  skipVersionCheck: boolean;
  ignoreShutdownTimeout: boolean;
  ignoreCrash: boolean;
}

export interface PrewarmOptions extends PrewarmCliOptions {
  command: string;
  stdio?: StdioChoice;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface PrewarmResult {
  exitCode: number;
}

interface RawCliArguments {
  command: string;
  port: number;
  host: string;
  "listen-timeout": number;
  "shutdown-timeout": number;
  "clear-cache": boolean;
  "verify-cache": boolean;
  "skip-version-check": boolean;
  "ignore-shutdown-timeout": boolean;
  "ignore-crash": boolean;
}

/** CLI parser; throws on invalid invocation. */
export function parseArgv(argv: string[]): { command: string; options: PrewarmCliOptions } {
  if (argv.length === 0) {
    throw new Error("Usage: node-prewarm <command> --port <port> [options]");
  }

  const parsed = yargs(argv)
    .scriptName("node-prewarm")
    .usage("Usage: $0 <command> --port <port> [options]")
    .exitProcess(false)
    .help(false)
    .version(false)
    .strict()
    .parserConfiguration({
      "camel-case-expansion": false,
      "short-option-groups": false,
    })
    .command("$0 <command>", "Start a process, wait for a port, then shut it down", (cli: Argv) =>
      cli
        .positional("command", {
          type: "string",
          describe: "Shell command to start and prewarm",
        })
        .option("port", {
          type: "number",
          demandOption: true,
          describe: "TCP port to wait for",
        })
        .option("host", {
          type: "string",
          default: "127.0.0.1",
          describe: "Host to probe while waiting for readiness",
        })
        .option("listen-timeout", {
          type: "number",
          default: 10,
          describe: "Seconds to wait for the port to accept connections",
        })
        .option("shutdown-timeout", {
          type: "number",
          default: 5,
          describe: "Seconds to wait after SIGTERM before forcing SIGKILL",
        })
        .option("clear-cache", {
          type: "boolean",
          default: false,
          describe: "Remove the compile cache directory before prewarming",
        })
        .option("verify-cache", {
          type: "boolean",
          default: false,
          describe: "Fail if the compile cache directory is still empty afterward",
        })
        .option("skip-version-check", {
          type: "boolean",
          default: false,
          describe: "Skip the Node.js 25+ check",
        })
        .option("ignore-shutdown-timeout", {
          type: "boolean",
          default: false,
          describe: "Treat forced shutdown after timeout as success",
        })
        .option("ignore-crash", {
          type: "boolean",
          default: false,
          describe: "Treat an early process exit as success",
        })
        .check((options: Pick<RawCliArguments, "port" | "listen-timeout" | "shutdown-timeout">) => {
          if (!Number.isFinite(options.port)) {
            throw new Error("The --port option is required.");
          }
          if (!Number.isFinite(options["listen-timeout"]) || options["listen-timeout"] <= 0) {
            throw new Error("The --listen-timeout option must be a positive number.");
          }
          if (!Number.isFinite(options["shutdown-timeout"]) || options["shutdown-timeout"] <= 0) {
            throw new Error("The --shutdown-timeout option must be a positive number.");
          }
          return true;
        }),
    )
    .fail((message: string | undefined, error: Error | undefined) => {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(message ?? "Invalid command line arguments.");
    })
    .parseSync() as unknown as RawCliArguments;

  const command = parsed.command;
  const port = parsed.port;
  const listenTimeout = parsed["listen-timeout"];
  const shutdownTimeout = parsed["shutdown-timeout"];
  const cli: PrewarmCliOptions = {
    port,
    host: parsed.host,
    listenTimeout,
    shutdownTimeout,
    clearCache: parsed["clear-cache"],
    verifyCache: parsed["verify-cache"],
    skipVersionCheck: parsed["skip-version-check"],
    ignoreShutdownTimeout: parsed["ignore-shutdown-timeout"],
    ignoreCrash: parsed["ignore-crash"],
  };

  return { command, options: cli };
}

function checkNodeVersion(): boolean {
  const majorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

  if (majorVersion < 25) {
    console.error("Error: Node.js 25+ is required for Stable Module Compile Cache.");
    console.error(`Current version: ${process.version}`);
    return false;
  }
  return true;
}

async function removeDirectory(dirPath: string): Promise<void> {
  await fs.promises.rm(dirPath, { recursive: true, force: true });
}

function getDirectorySize(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let totalSize = 0;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirectorySize(entryPath);
      } else {
        totalSize += fs.statSync(entryPath).size;
      }
    }
    return totalSize;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.abs(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const sign = bytes < 0 ? "-" : "";
  const precision = unitIndex === 0 ? 0 : value < 10 ? 1 : 0;
  return `${sign}${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForPort(port: number, host: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      await new Promise<void>((resolveConnect, rejectConnect) => {
        const socket = net.createConnection(port, host, () => {
          socket.end();
          resolveConnect();
        });
        socket.on("error", rejectConnect);
      });
      return true;
    } catch {
      await delay(25);
    }
  }
  return false;
}

function pickStdio(option: StdioChoice | undefined): StdioChoice {
  return option ?? "inherit";
}

/** Pre-warm the Node Stable Module Compile cache. */
export async function prewarm(options: PrewarmOptions): Promise<PrewarmResult> {
  const listenTimeoutSec = options.listenTimeout;
  const shutdownTimeoutSec = options.shutdownTimeout;

  const baseEnv: NodeJS.ProcessEnv =
    typeof options.env === "object" && options.env !== null
      ? { ...process.env, ...options.env }
      : { ...process.env };

  if (!options.skipVersionCheck) {
    const okVersion = checkNodeVersion();
    if (!okVersion) {
      return { exitCode: 1 };
    }
  }

  const cacheDir = baseEnv.NODE_COMPILE_CACHE;
  if (!cacheDir) {
    console.error("Error: NODE_COMPILE_CACHE environment variable is required.");
    return { exitCode: 1 };
  }

  if (!Number.isFinite(options.port)) {
    console.error("Error: port is required.");
    return { exitCode: 1 };
  }

  let targetPort = options.port;
  if (baseEnv.PORT) {
    targetPort = Number.parseInt(baseEnv.PORT, 10);
    console.log(`Overriding --port with PORT=${baseEnv.PORT}`);
  }

  if (!Number.isFinite(targetPort)) {
    console.error(`Error: Invalid port value: ${baseEnv.PORT ? baseEnv.PORT : options.port}`);
    return { exitCode: 1 };
  }

  const host = options.host;
  const listenTimeoutMs = listenTimeoutSec * 1000;
  const shutdownTimeoutMs = shutdownTimeoutSec * 1000;

  console.log(`NODE_COMPILE_CACHE: ${cacheDir}`);
  if (options.clearCache && fs.existsSync(cacheDir)) {
    console.log("Clearing compile cache directory...");
    await removeDirectory(cacheDir);
  }

  const initialCacheSize = getDirectorySize(cacheDir);

  console.log(`Starting: "${options.command}"`);
  console.log(
    `Waiting for response on ${host}:${targetPort} with a timeout of ${formatDuration(listenTimeoutSec)}...`,
  );

  const stdioOption = pickStdio(options.stdio);
  const startTime = Date.now();
  const child: ChildProcess = spawn(options.command, {
    shell: true,
    stdio: stdioOption,
    cwd: options.cwd,
    env: {
      ...baseEnv,
      PORT: baseEnv.PORT ?? String(targetPort),
      NITRO_PORT: baseEnv.NITRO_PORT ?? baseEnv.PORT ?? String(targetPort),
      PREWARM: "true",
    },
  });

  let processExitedEarly = false;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;

  const exitHandler = (code: number | null, signal: NodeJS.Signals | null): void => {
    processExitedEarly = true;
    exitCode = code;
    exitSignal = signal;
  };
  child.on("exit", exitHandler);

  try {
    const portReady = await waitForPort(targetPort, host, listenTimeoutMs);

    if (processExitedEarly && !portReady) {
      child.removeListener("exit", exitHandler);

      const exitReason = exitSignal
        ? `signal ${exitSignal}`
        : exitCode !== null
          ? `exit code ${exitCode}`
          : "unknown reason";

      console.error(
        `Error: Process exited before port ${targetPort} became available (${exitReason})`,
      );

      if (options.ignoreCrash) {
        const finalCacheSize = getDirectorySize(cacheDir);
        const deltaCacheSize = finalCacheSize - initialCacheSize;
        console.log(
          `NODE_COMPILE_CACHE size: ${formatBytes(finalCacheSize)} (${formatBytes(deltaCacheSize)} delta)`,
        );
        return { exitCode: 0 };
      }

      return { exitCode: 1 };
    }

    if (portReady) {
      child.removeListener("exit", exitHandler);
    }

    if (!portReady) {
      console.error(`Timeout waiting for port ${targetPort} after ${listenTimeoutSec}s`);
      child.kill("SIGKILL");
      return { exitCode: 1 };
    }

    const listenDurationSeconds = (Date.now() - startTime) / 1000;
    console.log(
      `Response detected on ${host}:${targetPort} after ${formatDuration(listenDurationSeconds)}, shutting down with timeout of ${formatDuration(shutdownTimeoutSec)}...`,
    );

    child.kill("SIGTERM");

    let shutdownComplete = false;
    const shutdownPromise = new Promise<void>((resolveShutdown) => {
      child.once("exit", () => {
        shutdownComplete = true;
        resolveShutdown();
      });
    });
    const timeoutPromise = delay(shutdownTimeoutMs);

    const shutdownStart = Date.now();
    await Promise.race([shutdownPromise, timeoutPromise]);

    if (!shutdownComplete) {
      console.warn("Graceful timeout exceeded, forcing SIGKILL...");
      child.kill("SIGKILL");

      if (!options.ignoreShutdownTimeout) {
        return { exitCode: 1 };
      }

      await delay(100);
    } else {
      const shutdownDurationSeconds = (Date.now() - shutdownStart) / 1000;
      console.log(`Graceful shutdown after ${formatDuration(shutdownDurationSeconds)}`);
    }

    await delay(500);

    const finalCacheSize = getDirectorySize(cacheDir);
    const deltaCacheSize = finalCacheSize - initialCacheSize;
    console.log(
      `NODE_COMPILE_CACHE size: ${formatBytes(finalCacheSize)} (${formatBytes(deltaCacheSize)} delta)`,
    );

    if (options.verifyCache && finalCacheSize === 0) {
      console.error("Error: Cache directory is empty after pre-warm.");
      return { exitCode: 1 };
    }

    return { exitCode: 0 };
  } catch (error) {
    child.kill("SIGKILL");
    console.error("Error during pre-warm:", error);
    return { exitCode: 1 };
  }
}
