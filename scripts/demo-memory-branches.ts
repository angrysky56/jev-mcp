import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eligible } from '../src/continuity.ts';
import { root, writeJson } from '../src/io.ts';
import type { MemoryCard } from '../src/continuity.ts';

/** Real Git experiment in a disposable synthetic repository; never touches project Git. */
const temp = await mkdtemp(join(tmpdir(),'jev-memory-branches-'));
const git = (cwd: string,...args: string[]) => execFileSync('git',['-C',cwd,...args], {encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
try {
  const repo=join(temp,'memory'), a=join(temp,'branch-a'), b=join(temp,'branch-b');
  await mkdir(repo);
  git(repo,'init','-q','-b','main');
  git(repo,'config','user.name','Jev Lab Synthetic Fixture');git(repo,'config','user.email','fixture@example.invalid');
  await writeJson(join(repo,'project.json'),{goal:'Explore the pointer mechanism',scope:'project'});
  git(repo,'add','.');git(repo,'commit','-qm','Create synthetic shared starting state');
  const base=git(repo,'rev-parse','HEAD');
  git(repo,'worktree','add','-q','-b','exploration-a',a,base);
  git(repo,'worktree','add','-q','-b','exploration-b',b,base);
  const first:MemoryCard={id:'A',role:'hypothesis',scope:'branch-a',status:'active',text:'For this exploration, assume only a motor drives the pointer.',source:'synthetic://branch-a'};
  const second:MemoryCard={id:'B',role:'hypothesis',scope:'branch-b',status:'active',text:'For this exploration, assume only a magnetic coupling drives the pointer.',source:'synthetic://branch-b'};
  await writeJson(join(a,'assumption-a.json'),first);
  git(a,'add','.');git(a,'commit','-qm','Record branch A assumption');
  await writeJson(join(b,'assumption-b.json'),second);
  git(b,'add','.');git(b,'commit','-qm','Record branch B assumption');
  assert.equal(git(a,'merge-base','HEAD','exploration-b'),base);
  git(repo,'merge','--no-ff','--no-edit','exploration-a');
  git(repo,'merge','--no-ff','--no-edit','exploration-b');
  const merged=[JSON.parse(await readFile(join(repo,'assumption-a.json'),'utf8')) as MemoryCard,JSON.parse(await readFile(join(repo,'assumption-b.json'),'utf8')) as MemoryCard];
  assert.equal(merged.length,2);assert.equal(git(repo,'status','--porcelain'),'');
  assert.deepEqual(merged.filter(c=>eligible(c,'branch-a')).map(c=>c.id),['A']);
  assert.deepEqual(merged.filter(c=>eligible(c,'branch-b')).map(c=>c.id),['B']);
  const result={runAt:new Date().toISOString(),gitVersion:git(repo,'--version'),baseCommit:base,mergedCommit:git(repo,'rev-parse','HEAD'),
    cleanGitMergeContainsBothIncompatibleAssumptions:true,branchASelection:['A'],branchBSelection:['B'],sharedScopeSelection:merged.filter(c=>eligible(c,'project')).map(c=>c.id),
    conclusion:'Git merges file history, not the meaning of assumptions. Explicit scope prevents cleanly merged hypothetical records from being treated as shared conclusions. Parent-child scope relationships still require application metadata.',
    fixtureOnly:true};
  await writeJson(`${root}/studies/continuity/git-branch-demo.json`,result);
  console.log(JSON.stringify(result,null,2));
} finally { await rm(temp,{recursive:true,force:true}); }
