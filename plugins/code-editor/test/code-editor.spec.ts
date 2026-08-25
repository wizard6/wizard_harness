import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { CODE_EDITOR_SERVICE } from '@wizard-harness/contracts';
import type { CodeEditorService } from '@wizard-harness/contracts';
import codeEditorPlugin from '../src/index.js';
import { mergeLineRange } from '../src/workspace.js';

describe('mergeLineRange', () => {
  it('替换中间行范围', () => {
    const full = 'a\nb\nc\nd\ne';
    expect(mergeLineRange(full, 2, 4, 'X\nY')).toBe('a\nX\nY\ne');
  });

  it('首行与末行', () => {
    const full = 'one\ntwo\nthree';
    expect(mergeLineRange(full, 1, 1, 'ONE')).toBe('ONE\ntwo\nthree');
    expect(mergeLineRange(full, 3, 3, 'THREE')).toBe('one\ntwo\nTHREE');
  });
});

describe('code-editor 插件', () => {
  it('read / write / takePendingOpen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-ce-'));
    writeFileSync(join(root, 'a.txt'), 'hello');
    const harness = createHarness({ bus: createEventBus(), config: { 'code-editor': { root } } });
    await harness.registry.register({ ...codeEditorPlugin, manifest: { ...codeEditorPlugin.manifest, config: { root } } });
    const ed = harness.services.get<CodeEditorService>(CODE_EDITOR_SERVICE)!;
    ed.queueOpen('a.txt');
    expect(ed.takePendingOpen()).toEqual({ path: 'a.txt' });
    expect(ed.takePendingOpen()).toBeUndefined();
    const got = ed.read('a.txt');
    expect(got.content).toBe('hello');
    ed.write('a.txt', 'world');
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('world');
  });

  it('patch 写回局部行', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-ce-'));
    writeFileSync(join(root, 'b.ts'), 'line1\nline2\nline3\nline4');
    const bus = createEventBus();
    const seen: { action: string; payload?: unknown }[] = [];
    bus.subscribe((e) => seen.push(e));
    const harness = createHarness({ bus, config: { 'code-editor': { root } } });
    await harness.registry.register({ ...codeEditorPlugin, manifest: { ...codeEditorPlugin.manifest, config: { root } } });
    const ed = harness.services.get<CodeEditorService>(CODE_EDITOR_SERVICE)!;
    ed.queueOpen({ path: 'b.ts', startLine: 2, endLine: 3 });
    expect(ed.takePendingOpen()).toEqual({ path: 'b.ts', startLine: 2, endLine: 3 });
    ed.patch('b.ts', 2, 3, 'new2\nnew3');
    expect(readFileSync(join(root, 'b.ts'), 'utf8')).toBe('line1\nnew2\nnew3\nline4');
    expect(seen.some((e) => e.action === 'code-editor/changed' && (e.payload as { path: string }).path === 'b.ts')).toBe(
      true,
    );
  });
});
