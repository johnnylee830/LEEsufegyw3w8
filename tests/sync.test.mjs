import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { planSync } from '../scripts/sync-plan.mjs';

test('actual Git histories synchronize in both directions and preserve divergence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etf-sync-test-'));
  const executable = process.env.ETF_TEST_GIT || 'git';
  const git = (...args) => execFileSync(executable, ['-C',dir,...args], { encoding:'utf8' }).trim();
  const ancestor = (a,b) => spawnSync(executable, ['-C',dir,'merge-base','--is-ancestor',a,b]).status === 0;
  const commit = (name) => { writeFileSync(join(dir, name+'.txt'),name);git('add','--',name+'.txt');git('-c','user.name=Sync Test','-c','user.email=sync@example.invalid','commit','-m',name);return git('rev-parse','HEAD'); };
  try {
    git('init','-b','main');
    const base = commit('base');
    const gh = commit('github-change');
    assert.deepEqual(planSync(base,base,ancestor),{direction:'none',sha:base});
    assert.equal(planSync(gh,base,ancestor).direction,'to-huggingface');
    assert.equal(planSync(base,gh,ancestor).direction,'to-github');
    git('checkout','-b','hf',base);
    const hf = commit('hf-change');
    const before = git('rev-parse','HEAD');
    assert.deepEqual(planSync(gh,hf,ancestor),{direction:'conflict',githubSha:gh,hfSha:hf});
    assert.equal(git('rev-parse','HEAD'),before,'conflict planning must not alter either history');
  } finally {
    const checked=resolve(dir);
    if(checked.startsWith(resolve(tmpdir())+sep)&&basename(checked).startsWith('etf-sync-test-'))rmSync(checked,{recursive:true,force:true});
  }
});
