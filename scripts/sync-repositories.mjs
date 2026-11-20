import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { planSync } from './sync-plan.mjs';
import { normalizeHfToken, verifyHfIdentity } from './hf-auth.mjs';

const repository = 'johnnylee830/LEEsufegyw3w8';
const hfRepository = 'LEEsufegyw3w8/Taiwan-ETF-Planner';
const workflow = '.github/workflows/sync-huggingface.yml';
const conflictTitle = '[Auto-sync conflict] GitHub and Hugging Face need a merge';
const marker = '<!-- etf-bidirectional-sync -->';
const summary = text => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
};
function git(args, allowFailure = false) {
  const result = spawnSync('git', args, { encoding: 'utf8', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`Git command failed (${args[0]}): ${result.stderr.trim()}`);
  return result;
}
async function githubApi(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub notification API returned HTTP ${response.status}`);
  return response.json();
}
async function reportConflict(plan, reason) {
  const runUrl = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const body = `${marker}\n@johnnylee830 自動同步已暫停，兩邊的提交都已保留，沒有強制覆寫。\n\n原因：${reason}\n\n- GitHub main: \`${plan.githubSha}\`\n- Hugging Face main: \`${plan.hfSha}\`\n- [查看同步紀錄](${runUrl})\n\n請在本機 fetch 兩個遠端，保留雙方變更並合併衝突，再將合併後的同一提交推送到兩邊。完成後可重新執行 workflow 並關閉此 issue。\n\n同步工作每次只更新這份通知，不會每五分鐘重複建立 issue。`;
  const openIssues = await githubApi('/issues?state=open&per_page=100');
  const existing = openIssues.find(issue => !issue.pull_request && issue.title === conflictTitle && issue.body?.includes(marker));
  if (!existing) {
    const issue = await githubApi('/issues', { method: 'POST', body: JSON.stringify({ title: conflictTitle, body }) });
    summary(`已建立衝突通知：[Issue #${issue.number}](${issue.html_url})`);
  } else if (!existing.body.includes(plan.githubSha) || !existing.body.includes(plan.hfSha)) {
    await githubApi(`/issues/${existing.number}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    summary(`已更新衝突通知：[Issue #${existing.number}](${existing.html_url})`);
  } else summary(`既有衝突通知：[Issue #${existing.number}](${existing.html_url})`);
}
function validateCandidate(sha) {
  git(['checkout', '--detach', sha]);
  const tests = spawnSync(process.execPath, ['--test', 'tests/math.test.mjs', 'tests/data.test.mjs', 'tests/sync.test.mjs'], { encoding: 'utf8', env: { ...process.env, HF_TOKEN: '', GITHUB_TOKEN: '' } });
  process.stdout.write(tests.stdout || '');
  process.stderr.write(tests.stderr || '');
  if (tests.status !== 0) throw new Error('Candidate tests failed; no remote branch was changed.');
}

if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('This sync is restricted to the configured repository main branch.');
if (!process.env.HF_TOKEN) throw new Error(`Missing HF_TOKEN. Add the Hugging Face write token at https://github.com/${repository}/settings/secrets/actions`);
if (!process.env.GITHUB_TOKEN) throw new Error('Missing GitHub Actions token.');
process.env.HF_TOKEN = normalizeHfToken(process.env.HF_TOKEN);
await verifyHfIdentity(process.env.HF_TOKEN);
summary('Hugging Face Token 格式與帳號驗證通過。');

const temp = mkdtempSync(join(tmpdir(), 'etf-sync-'));
try {
  const askpass = join(temp, 'askpass.sh');
  writeFileSync(askpass, '#!/bin/sh\ncase "$1" in\n  *huggingface.co*) ;;\n  *) exit 1 ;;\nesac\ncase "$1" in\n  *Username*) printf "%s\\n" "LEEsufegyw3w8" ;;\n  *Password*) printf "%s\\n" "$HF_TOKEN" ;;\n  *) exit 1 ;;\nesac\n', { mode: 0o700 });
  process.env.GIT_ASKPASS = askpass;
  process.env.GIT_TERMINAL_PROMPT = '0';
  // Tokens never appear in remote URLs, process arguments or generated helper contents.
  git(['remote', 'add', 'hf-sync', `https://huggingface.co/spaces/${hfRepository}`]);
  git(['fetch', '--no-tags', 'origin', 'main']);
  git(['-c', 'credential.helper=', 'fetch', '--no-tags', 'hf-sync', 'main']);
  const githubSha = git(['rev-parse', 'refs/remotes/origin/main']).stdout.trim();
  const hfSha = git(['rev-parse', 'refs/remotes/hf-sync/main']).stdout.trim();
  const plan = planSync(githubSha, hfSha, (a, b) => {
    const result = git(['merge-base', '--is-ancestor', a, b], true);
    if (result.status !== 0 && result.status !== 1) throw new Error('Could not compare commit ancestry.');
    return result.status === 0;
  });
  summary(`GitHub main: \`${githubSha}\`\n\nHugging Face main: \`${hfSha}\``);
  if (plan.direction === 'none') summary('兩邊版本相同，無需同步。');
  else {
    // The automation itself is maintained on GitHub. Never let an HF-only edit disable it.
    const changedAutomation = plan.direction === 'to-github' && [workflow, 'scripts/sync-repositories.mjs', 'scripts/sync-plan.mjs', 'scripts/hf-auth.mjs', 'tests/sync.test.mjs'].some(path => {
      const ghFile = git(['rev-parse', `${githubSha}:${path}`], true);
      const hfFile = git(['rev-parse', `${hfSha}:${path}`], true);
      return hfFile.status !== 0 || ghFile.status !== 0 || hfFile.stdout.trim() !== ghFile.stdout.trim();
    });
    if (plan.direction === 'conflict' || changedAutomation) {
      await reportConflict({ githubSha, hfSha }, changedAutomation ? 'Hugging Face 修改或移除了自動同步設定，請手動確認。' : '兩邊各自新增提交，版本歷史已分岔。');
      throw new Error('Synchronization paused: both histories are preserved. See the conflict issue.');
    }
    validateCandidate(plan.sha);
    if (plan.direction === 'to-huggingface') git(['-c', 'credential.helper=', 'push', 'hf-sync', `${plan.sha}:refs/heads/main`]);
    else git(['push', 'origin', `${plan.sha}:refs/heads/main`]);
    const ghAfter = git(['ls-remote', 'origin', 'refs/heads/main']).stdout.trim().split(/\s+/)[0];
    const hfAfter = git(['-c', 'credential.helper=', 'ls-remote', 'hf-sync', 'refs/heads/main']).stdout.trim().split(/\s+/)[0];
    if (ghAfter !== hfAfter) throw new Error('Another change arrived during synchronization; the next run will recheck.');
    summary(`同步完成：**${plan.direction === 'to-huggingface' ? 'GitHub → Hugging Face' : 'Hugging Face → GitHub'}**\n\n共同版本：\`${ghAfter}\``);
  }
} finally {
  const checked = resolve(temp);
  if (checked.startsWith(resolve(tmpdir()) + sep) && basename(checked).startsWith('etf-sync-')) rmSync(checked, { recursive: true, force: true });
}
