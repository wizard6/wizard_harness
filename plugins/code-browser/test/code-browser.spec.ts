import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createEventBus, createHarness } from '@wizard-harness/core';
import { CODE_BROWSER_SERVICE } from '@wizard-harness/contracts';
import type { CodeBrowserService } from '@wizard-harness/contracts';
import codeBrowserPlugin from '../src/index.js';

describe('code-browser 插件', () => {
  it('read / queueOpen / takePendingOpen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wh-cb-'));
    writeFileSync(join(root, 'a.ts'), 'export const x = 1');
    const harness = createHarness({ bus: createEventBus(), config: { 'code-browser': { root } } });
    await harness.registry.register({ ...codeBrowserPlugin, manifest: { ...codeBrowserPlugin.manifest, config: { root } } });
    const br = harness.services.get<CodeBrowserService>(CODE_BROWSER_SERVICE)!;
    br.queueOpen('a.ts');
    expect(br.takePendingOpen()).toBe('a.ts');
    expect(resolve(br.info().root)).toBe(resolve(root));
    expect(br.read('a.ts').content).toBe('export const x = 1');
  });
});
