#!/usr/bin/env node

import process from "node:process";

import { parseArgv, prewarm } from "./prewarm.js";

async function main(): Promise<void> {
  let argv: ReturnType<typeof parseArgv>;
  try {
    argv = parseArgv(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
    return;
  }

  const { exitCode } = await prewarm({ ...argv.options, command: argv.command, stdio: "inherit" });
  process.exit(exitCode);
}

void main();
