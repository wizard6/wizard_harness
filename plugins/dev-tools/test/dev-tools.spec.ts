import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { DEV_TOOLS_SERVICE } from '@wizard-harness/contracts';
import type { DevToolsService, PromptContextService, SessionService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import devToolsPlugin from '../src/index.js';
import { DEV_TOOLS_HTML } from '../src/page.js';
import { assertInside } from '../src/jail.js';

function tmpRoot() {
  return mkdtempSync(join(tmpdir(), 'wh-dev-tools-'));
}

async function boot(root: string) {
  const harness = createHarness({ bus: createEventBus(), config: { 'dev-tools': { root } } });
  await harness.registry.register(sessionPlugin);
  await harness.registry.register(toolsPlugin);
  await harness.registry.register(devToolsPlugin);
  return harness;
}

describe('dev-tools 插件', () => {
  it('服务名 + 必选 inject tools + ui.rpc', () => {
    expect(DEV_TOOLS_SERVICE).toBe('devTools');
    expect(devToolsPlugin.manifest.provides).toEqual(['devTools']);
    expect(devToolsPlugin.inject).toEqual({ tools: true, logger: false, promptContext: false, session: false });
    expect(devToolsPlugin.ui?.rpc).toEqual({ devTools: ['info'] });
    expect(DEV_TOOLS_HTML).toContain('devTools');
  });

  it('登记六件套；文件不出 root；str_replace / grep / glob / bash', async () => {
    const root = tmpRoot();
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.ts'), 'export const n = 1;\nexport const n = 1;\n');
    writeFileSync(join(root, 'readme.md'), 'hello workspace');
    const harness = await boot(root);
    const tools = harness.services.get<ToolsService>('tools')!;
    const box = harness.services.get<DevToolsService>('devTools')!;
    expect(box.info().root).toBe(resolve(root));
    expect(box.info().tools).toEqual(['bash', 'read_file', 'write_file', 'str_replace', 'grep', 'glob']);
    expect(tools.list().map((t) => t.name)).toEqual(
      expect.arrayContaining(['bash', 'read_file', 'write_file', 'str_replace', 'grep', 'glob']),
    );

    const read = await tools.call('read_file', { path: 'readme.md' });
    expect(read.ok).toBe(true);
    expect(read.content).toMatch(/hello workspace/);

    const wr = await tools.call('write_file', { path: 'src/b.ts', content: 'export const k = 2;\n' });
    expect(wr.ok).toBe(true);

    const dup = await tools.call('str_replace', {
      path: 'src/a.ts',
      old_string: 'export const n = 1;',
      new_string: 'export const n = 2;',
    });
    expect(dup.ok).toBe(false);
    expect(dup.content).toMatch(/出现 2 次/);

    const once = await tools.call('str_replace', {
      path: 'src/b.ts',
      old_string: 'k = 2',
      new_string: 'k = 3',
    });
    expect(once.ok).toBe(true);

    const grepped = await tools.call('grep', { pattern: 'workspace', glob: '**/*.md' });
    expect(grepped.ok).toBe(true);
    expect(grepped.content).toMatch(/readme\.md/);

    const globbed = await tools.call('glob', { pattern: 'src/*.ts' });
    expect(globbed.ok).toBe(true);
    expect(globbed.content).toMatch(/src\/a\.ts/);

    const sh = await tools.call('bash', { command: 'echo DEVTOOLS_OK' });
    expect(sh.ok).toBe(true);
    expect(sh.content).toMatch(/DEVTOOLS_OK/);

    await expect(tools.call('read_file', { path: '../secret' })).resolves.toMatchObject({ ok: false });
    expect(() => assertInside(root, join(root, '..', 'x'))).toThrow(/越出工作区/);
  });

  it('有 prompt-context 时写入工作区 section', async () => {
    const root = tmpRoot();
    const harness = createHarness({ bus: createEventBus(), config: { 'dev-tools': { root } } });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(devToolsPlugin);
    const inspect = harness.services.get<PromptContextService>('promptContext')!;
    expect(inspect.inspect().sources.some((s) => s.name === 'tool:dev-tools')).toBe(true);
  });

  it('tools.call 带 sessionId 时对着 session.workspace', async () => {
    const fallback = tmpRoot();
    const ws = tmpRoot();
    writeFileSync(join(ws, 'only-ws.txt'), 'here');
    const harness = await boot(fallback);
    const session = harness.services.get<SessionService>('session')!;
    const tools = harness.services.get<ToolsService>('tools')!;
    const s = session.start({ workspace: ws });
    const globbed = await tools.call('glob', { pattern: 'only-ws.txt' }, { sessionId: s.id });
    expect(globbed.ok).toBe(true);
    expect(globbed.content).toMatch(/only-ws\.txt/);
  });
});
