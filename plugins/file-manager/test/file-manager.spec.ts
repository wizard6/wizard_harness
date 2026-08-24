import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { FILE_MANAGER_SERVICE } from '@wizard-harness/contracts';
import type { FileManagerService } from '@wizard-harness/contracts';
import fileManagerPlugin from '../src/index.js';

describe('file-manager 插件', () => {
  it('list 列出工作区目录', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-fm-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.ts'), 'export {}');
    const harness = createHarness({ bus: createEventBus(), config: { 'file-manager': { root } } });
    await harness.registry.register({ ...fileManagerPlugin, manifest: { ...fileManagerPlugin.manifest, config: { root } } });
    const fm = harness.services.get<FileManagerService>(FILE_MANAGER_SERVICE)!;
    expect(resolve(fm.info().root)).toBe(resolve(root));
    const listed = fm.list('.');
    expect(listed.entries.some((e) => e.name === 'src' && e.kind === 'dir')).toBe(true);
    const inner = fm.list('src');
    expect(inner.entries.some((e) => e.name === 'a.ts' && e.kind === 'file')).toBe(true);
  });
});
