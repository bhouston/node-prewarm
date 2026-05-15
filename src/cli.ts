#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import { parseArgv, prewarm } from "./prewarm.js";

interface CliRuntime {
  error: typeof console.error;
  exit: typeof process.exit;
  setExitCode: (code: number) => void;
  parseArgv: typeof parseArgv;
  prewarm: typeof prewarm;
}

function isExecutedDirectly(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

export async function main(
  argvInput: string[] = process.argv.slice(2),
  runtime: CliRuntime = {
    error: console.error,
    exit: process.exit.bind(process),
    setExitCode: (code) => {
      process.exitCode = code;
    },
    parseArgv,
    prewarm,
  },
): Promise<void> {
  let argv: ReturnType<typeof parseArgv>;
  try {
    argv = runtime.parseArgv(argvInput);
  } catch (error) {
    runtime.error(error instanceof Error ? error.message : error);
    runtime.setExitCode(2);
    return;
  }

  const { exitCode } = await runtime.prewarm({
    ...argv.options,
    command: argv.command,
    stdio: "inherit",
  });
  runtime.exit(exitCode);
}

if (isExecutedDirectly()) {
  void main();
}
