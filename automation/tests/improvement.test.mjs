import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { regressionProposal } from '../enterprise/improvement.mjs';

const success = { install: 0, node: 0, memory: 0 };
const green = 'TAP version 13\n# fail 0\n';
const memory = { cases: [{ id: 'K03', status: 'PASS' }] };
const bad = { cases: [{ id: 'K03', status: 'FAIL' }] };
const tap = 'not ok 1 - CTL-001\n';
const proposal = regressionProposal(tap, memory, { ...success, node: 1 });

test('Green Node and knowledge suites create no proposal', () => {
  assert.equal(regressionProposal(green, memory, success), null);
});
test('Malformed green evidence cannot pass', () => {
  assert.throws(() => regressionProposal('partial', memory, success));
  assert.throws(() => regressionProposal(green, null, success));
  assert.throws(() => regressionProposal(green, bad, success));
});
test('Stable signature deduplicates duplicate failures and retains distinct suites', () => {
  const a = regressionProposal(tap + tap, memory, { ...success, node: 1 });
  assert.equal(a.digest, proposal.digest);
  assert.equal(a.markdown.match(/- node: CTL-001/g).length, 1);
  const both = regressionProposal(tap, bad, { install: 0, node: 1, memory: 1 });
  assert.match(both.markdown, /memory: K03/);
  assert.match(both.markdown, /node: CTL-001/);
  assert.notEqual(a.digest, both.digest);
});
test('Memory-only failure and crashed runner produce actionable proposals', () => {
  assert.match(regressionProposal(green,bad,{...success,memory:1}).markdown,/memory: K03/);
  assert.match(regressionProposal(green,null,{...success,memory:1}).markdown,/memory: runner failed/);
  assert.match(regressionProposal('',memory,{...success,node:1}).markdown,/node: runner failed/);
  assert.match(regressionProposal(green,memory,{...success,install:1}).markdown,/install: npm ci failed/);
});

test('Recover after pushing a proposal branch without a PR and avoid repeating a reviewed PR', t => {
  const dir=mkdtempSync(join(tmpdir(),'draqon-ci-'));
  t.after(() => rmSync(dir, {force:true,recursive:true}));
  const work=join(dir,'local'), remote=join(dir,'remote.git'), bin=join(dir,'bin');
  mkdirSync(work); mkdirSync(bin);
  const git=(...args)=>execFileSync('git',args,{cwd:work,stdio:'pipe',encoding:'utf8'}).trim();
  git('init','--bare',remote); git('init','-b','main');
  git('config','user.name','Synthetic'); git('config','user.email','fixture@example.invalid');
  writeFileSync(join(work,'README.md'),'Synthetic local fixture.'); git('add','.'); git('commit','-m','base');
  git('remote','add','origin',remote); git('push','origin','main');
  const report=join(dir,'fixture.md');writeFileSync(report,proposal.markdown);
  const cli=join(bin,'gh'), log=join(dir,'calls');
  writeFileSync(cli,'#!/bin/sh\ncase "$2" in\nlist) echo "$MOCK_EXISTING" ;;\ncreate) echo "$*" >> "$MOCK_LOG"; exit "$MOCK_CREATE_STATUS" ;;\n*) exit 64 ;;\nesac\n');
  chmodSync(cli,0o755);
  const script=fileURLToPath(new URL('../enterprise/propose-improvement.sh',import.meta.url));
  function attempt(existing, createStatus) {
    return spawnSync('bash',[script,proposal.digest,report,'main'],{cwd:work,encoding:'utf8',
      env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_LOG:log,MOCK_EXISTING:String(existing),MOCK_CREATE_STATUS:String(createStatus)}});
  }
  const branch='draqon/regression-'+proposal.digest;
  assert.equal(attempt(0,37).status,37);
  const remoteHead=git('rev-parse','HEAD');
  git('switch','main');
  const recovered=attempt(0,0); assert.equal(recovered.status,0,recovered.stderr);
  assert.equal(git('rev-parse','FETCH_HEAD'),remoteHead);
  assert.equal(attempt(1,37).status,0);
  const calls=readFileSync(log,'utf8').trim().split('\n');
  assert.equal(calls.length,2); assert.ok(calls.every(line=>line.includes('--draft')));
  git('switch',branch);
  const tracked=join(work,'docs','draqon','proposals',proposal.digest+'.md');
  writeFileSync(tracked,proposal.markdown+'unexpected proposal text');git('add',tracked);git('commit','-m','tampered proposal');git('push','origin',branch);
  git('switch','main');assert.notEqual(attempt(0,0).status,0);git('switch',branch);
  writeFileSync(join(work,'unexpected.txt'),'not a proposal');git('add','unexpected.txt');git('commit','-m','unrelated');git('push','origin',branch);
  git('switch','main');assert.notEqual(attempt(0,0).status,0);
  assert.equal(readFileSync(log,'utf8').trim().split('\n').length,2);
});
