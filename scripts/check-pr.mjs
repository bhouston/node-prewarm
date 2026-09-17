import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
requireCondition(pr.base.ref === "main", "Contribution PRs must target main.");
const branch =
  /^(?:feat|fix|docs|chore|refactor|test|style|perf|build|ci)\/(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(
    pr.head.ref,
  );
requireCondition(branch, "Use a branch such as feat/42-batch-export.");
requireCondition(
  new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${branch[1]}\\b`, "i").test(
    pr.body ?? "",
  ),
  `PR body must include Closes #${branch[1]}.`,
);
const result = spawnSync("pnpm", ["exec", "commitlint"], { input: pr.title, encoding: "utf8" });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exit(result.status ?? 1);
