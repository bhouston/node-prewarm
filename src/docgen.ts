import { readFileSync } from "node:fs";

import { infoFromPackageJson, type OpenCliDocument } from "@clidoc/core";
import { createDocgenCommand, fromYargs } from "@clidoc/yargs";
import yargs from "yargs";

import { mainCommandModule } from "./prewarm.js";

/** Generates and writes the OpenCLI document for the `docgen` subcommand. */
export async function runDocgen(argv: string[]): Promise<void> {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const info = infoFromPackageJson(pkg);

  let document: OpenCliDocument;
  const docgenCommand = createDocgenCommand(() => document);
  document = fromYargs([mainCommandModule, docgenCommand], info);

  await yargs(argv).command(docgenCommand).demandCommand().parseAsync();
}
