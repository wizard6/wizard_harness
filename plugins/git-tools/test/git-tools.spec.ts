import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { createEventBus, createHarness, PLUGIN_TAG_TOOLKIT } from '@wizard-harness/core';
import { GIT_TOOLS_SERVICE, gitToolName } from '../src/names.js';
import type { GitToolsService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import { findGitRoot, isGitRepo, probeGit, resetGitProbeCache, runGit } from '../src/exec.js';
import { createGitHost } from '../src/git-host.js';
import gitToolsPlugin from '../src/index.js';

const HAS_GIT = probeGit(true).available;

function initRepo(dir: string): void {
  execFileSync('git', ['init'], { cwd: dir, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, windowsHide: true });
  writeFileSync(join(dir, 'a.txt'), 'hello');
  execFileSync('git', ['add', 'a.txt'], { cwd: dir, windowsHide: true });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, windowsHide: true });
}

describe('git-tools exec', () => {
  it('探测 git 可用性', () => {
    resetGitProbeCache();
    const p = probeGit(true);
    expect(typeof p.available).toBe('boolean');
    if (p.available) expect(p.version).toMatch(/git version/i);
  });

  it('向上查找 git 根', () => {
    const root = findGitRoot(process.cwd());
    expect(root === undefined || isGitRepo(root!)).toBe(true);
  });

  it.skipIf(!HAS_GIT)('工作区内 status', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-git-'));
    initRepo(root);
    writeFileSync(join(root, 'a.txt'), 'changed');
    const r = await runGit(root, ['status', '-sb']);
    expect(r.ok).toBe(true);
    expect(r.stdout).toMatch(/a\.txt/);
  });
});

describe('git-tools host', () => {
  it.skipIf(!HAS_GIT)('status / diff / 保护分支 push', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-git-host-'));
    initRepo(root);
    const host = createGitHost(root);
    const info = await host.infoAsync();
    expect(info.isRepo).toBe(true);
    expect(info.root).toBe(root);
    const st = await host.run('status');
    expect(st.ok).toBe(true);
    writeFileSync(join(root, 'a.txt'), 'changed');
    const diff = await host.run('diff');
    expect(diff.stdout).toContain('a.txt');
    await expect(host.run('push')).rejects.toThrow(/保护分支/);
  });
});

describe('git-tools 插件', () => {
  beforeAll(() => resetGitProbeCache());

  it('manifest 标签与 dev-tools 同类', () => {
    expect(gitToolsPlugin.manifest.tags).toEqual([PLUGIN_TAG_TOOLKIT]);
    expect(gitToolsPlugin.manifest.id).toBe('git-tools');
    expect(gitToolsPlugin.inject).toEqual({ tools: true, logger: false, promptContext: false, session: false });
  });

  it.skipIf(!HAS_GIT)('注册 git.* 工具', async () => {
    const h = createHarness({ bus: createEventBus(), config: { 'git-tools': { root: process.cwd() } } });
    await h.registry.register(sessionPlugin);
    await h.registry.register(promptContextPlugin);
    await h.registry.register(toolsPlugin);
    await h.registry.register(gitToolsPlugin);
    const git = h.services.get<GitToolsService>(GIT_TOOLS_SERVICE)!;
    expect(git.probe().available).toBe(true);
    const tools = h.services.get<ToolsService>('tools')!;
    expect(tools.list().some((t) => t.name === gitToolName('status'))).toBe(true);
  });
});
