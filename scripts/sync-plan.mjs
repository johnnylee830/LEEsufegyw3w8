export function planSync(githubSha, hfSha, isAncestor) {
  if (githubSha === hfSha) return { direction: 'none', sha: githubSha };
  if (isAncestor(hfSha, githubSha)) return { direction: 'to-huggingface', sha: githubSha };
  if (isAncestor(githubSha, hfSha)) return { direction: 'to-github', sha: hfSha };
  return { direction: 'conflict', githubSha, hfSha };
}
