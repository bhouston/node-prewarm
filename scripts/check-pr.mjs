import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
requireCondition(pr.base.ref === 'main', 'Contribution PRs must target main.');
requireCondition(
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i.test(pr.body ?? ''),
  'PR body must include Closes #<issue-number>.',
);
const result = spawnSync('pnpm', ['exec', 'commitlint'], { input: pr.title, encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
process.exit(result.status ?? 1);
