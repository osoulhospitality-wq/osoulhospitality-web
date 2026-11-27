import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENTS } from './registry.mjs';
import { profile, renderProfiles } from './claude-profiles.mjs';

test('every registered role renders a distinct tool-disabled Claude profile', () => {
  const names = new Set();
  for (const agent of AGENTS) {
    const [[name, spec]] = Object.entries(profile(agent.id));
    assert.match(name, /^draqon-[a-z0-9-]+$/);
    assert.ok(spec.prompt.includes(agent.systemPrompt));
    assert.deepEqual(spec.tools, []);
    assert.deepEqual(spec.disallowedTools, ['*']);
    assert.equal(spec.permissionMode, 'dontAsk');
    assert.equal('mcpServers' in spec || 'hooks' in spec, false);
    names.add(name);
  }
  assert.equal(names.size, AGENTS.length);
});

test('only selected registered cards are written to fresh private directories', async () => {
  const directories = [];
  try {
    for (let i = 0; i < 2; i++) directories.push(await renderProfiles(['M06', 'M22']));
    assert.notEqual(...directories);
    for (const directory of directories) {
      assert.deepEqual((await readdir(directory)).sort(), ['m06.json', 'm22.json']);
      if (process.platform !== 'win32') assert.equal((await stat(directory)).mode & 0o077, 0);
      const path = join(directory, 'm22.json');
      if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o077, 0);
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), profile('M22'));
    }
  } finally {
    await Promise.all(directories.map(d => rm(d, { recursive: true, force: true })));
  }
});

test('empty, unknown, duplicate and path-like role selectors fail', async () => {
  for (const ids of [[], ['M99'], ['M22','M22'], ['M01','../M22']]) {
    await assert.rejects(renderProfiles(ids));
  }
});
