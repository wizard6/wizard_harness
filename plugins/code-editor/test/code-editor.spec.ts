import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { CODE_EDITOR_SERVICE } from '@wizard-harness/contracts';
import type { CodeEditorService } from '@wizard-harness/contracts';
import codeEditorPlugin from '../src/index.js';

describe('code-editor 插件', () => {
  it('read / write / takePendingOpen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-ce-'));
    writeFileSync(join(root, 'a.txt'), 'hello');
    const harness = createHarness({ bus: createEventBus(), config: { 'code-editor': { root } } });
    await harness.registry.register({ ...codeEditorPlugin, manifest: { ...codeEditorPlugin.manifest, config: { root } } });
    const ed = harness.services.get<CodeEditorService>(CODE_EDITOR_SERVICE)!;
    ed.queueOpen('a.txt');
    expect(ed.takePendingOpen()).toBe('a.txt');
    expect(ed.takePendingOpen()).toBeUndefined();
    const got = ed.read('a.txt');
    expect(got.content).toBe('hello');
    ed.write('a.txt', 'world');
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('world');
  });
});
