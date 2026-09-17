import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import config from "../release.config.js";

const event = {
  repository: { full_name: "bhouston/node-prewarm" },
  pull_request: {
    base: { ref: "main" },
    head: { ref: "chore/1-example", repo: { full_name: "bhouston/node-prewarm" } },
    body: "Closes #1",
    title: "ci: automate contribution workflow",
  },
};

for (const [name, modify, valid] of [
  ["accepts linked contribution", () => {}, true],
  [
    "rejects missing issue",
    (pr) => {
      pr.body = "";
    },
    false,
  ],
  [
    "rejects different issue",
    (pr) => {
      pr.body = "Closes #12";
    },
    false,
  ],
  [
    "rejects nonconventional title",
    (pr) => {
      pr.title = "random message";
    },
    false,
  ],
  [
    "rejects untracked branch",
    (pr) => {
      pr.head.ref = "topic";
    },
    false,
  ],
  [
    "rejects wrong target branch",
    (pr) => {
      pr.base.ref = "dev";
    },
    false,
  ],
]) {
  test(name, () => {
    const dir = mkdtempSync(join(tmpdir(), "prewarm-policy-"));
    try {
      const input = structuredClone(event);
      modify(input.pull_request);
      const path = join(dir, "event.json");
      writeFileSync(path, JSON.stringify(input));
      const result = spawnSync(process.execPath, ["scripts/check-pr.mjs"], {
        env: { ...process.env, GITHUB_EVENT_PATH: path },
        encoding: "utf8",
      });
      assert.equal(result.status === 0, valid, result.stderr);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
}

const [, analyzerOptions] = config.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/commit-analyzer",
);
for (const [message, expected] of [
  ["feat: example", "minor"],
  ["fix: example", "patch"],
  ["perf: example", "patch"],
  ["feat!: remove api", "major"],
  ["fix(api)!: remove api", "major"],
  ["refactor: replace api\n\nBREAKING CHANGE: migrate to the new API", "major"],
  ["ci: automate contribution workflow", null],
]) {
  test(`release classification: ${message}`, async () => {
    assert.equal(
      await analyzeCommits(analyzerOptions, {
        cwd: process.cwd(),
        commits: [{ hash: "abc", message }],
        logger: { log() {} },
      }),
      expected,
    );
  });
}
