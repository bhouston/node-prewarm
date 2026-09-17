import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const { pull_request: pr, repository } = JSON.parse(
  readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
);
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
if (pr.base.ref === "main") {
  requireCondition(
    pr.head.ref === "dev" && pr.head.repo.full_name === repository.full_name,
    "Release PRs must come from this repository's dev branch. Merge dev into main with a merge commit.",
  );
} else {
  requireCondition(pr.base.ref === "dev", "Contribution PRs must target dev.");
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
}
const result = spawnSync("pnpm", ["exec", "commitlint"], { input: pr.title, encoding: "utf8" });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exit(result.status ?? 1);
