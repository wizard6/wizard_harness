import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { SANDBOX_SERVICE } from '@wizard-harness/contracts';
import type { SandboxService, ToolsService } from '@wizard-harness/contracts';
import sessionPlugin from '../../session/src/index.js';
import promptContextPlugin from '../../prompt-context/src/index.js';
import toolsPlugin from '../../tools/src/index.js';
import sandboxPlugin from '../src/index.js';
import { SANDBOX_HTML } from '../src/page.js';
import { assertInside } from '../src/jail.js';

function tmpRoot() {
  return mkdtempSync(join(tmpdir(), 'wh-sandbox-'));
}

describe('sandbox 插件', () => {
  it('服务名 + 可选 inject tools', () => {
    expect(SANDBOX_SERVICE).toBe('sandbox');
    expect(sandboxPlugin.manifest.provides).toEqual(['sandbox']);
    expect(sandboxPlugin.inject).toEqual({ tools: false, logger: false });
    expect(sandboxPlugin.ui?.rpc).toEqual({ sandbox: ['info', 'list'] });
    expect(SANDBOX_HTML).toContain('sandbox_ls');
  });

  it('读写在 root 内；越界抛错', async () => {
    const root = tmpRoot();
    const harness = createHarness({ bus: createEventBus(), config: { sandbox: { root } } });
    await harness.registry.register(sandboxPlugin);
    const box = harness.services.get<SandboxService>('sandbox')!;
    expect(box.info().root).toBe(resolve(root));
    box.write('note.txt', 'hello');
    expect(box.read('note.txt')).toBe('hello');
    expect(box.list('.').entries.map((e) => e.name)).toEqual(['note.txt']);
    expect(() => box.read('../secret')).toThrow(/越出沙箱/);
    expect(() => assertInside(root, join(root, '..', 'x'))).toThrow(/越出沙箱/);
  });

  it('有 tools 时登记 sandbox_ls / read / write', async () => {
    const root = tmpRoot();
    writeFileSync(join(root, 'a.txt'), 'A');
    const harness = createHarness({ bus: createEventBus(), config: { sandbox: { root } } });
    await harness.registry.register(sessionPlugin);
    await harness.registry.register(promptContextPlugin);
    await harness.registry.register(toolsPlugin);
    await harness.registry.register(sandboxPlugin);
    const tools = harness.services.get<ToolsService>('tools')!;
    expect(tools.list().map((t) => t.name)).toEqual(
      expect.arrayContaining(['sandbox_ls', 'sandbox_read', 'sandbox_write']),
    );
    const read = await tools.call('sandbox_read', { path: 'a.txt' });
    expect(read.ok).toBe(true);
    expect(read.content).toBe('A');
    const wr = await tools.call('sandbox_write', { path: 'b.txt', content: 'B' });
    expect(wr.ok).toBe(true);
    expect(harness.services.get<SandboxService>('sandbox')!.read('b.txt')).toBe('B');
  });
});
