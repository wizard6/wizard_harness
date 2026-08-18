import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverPlugins } from '../src/index.js';
import type { Plugin } from '../src/index.js';

function makePlugin(id: string): Plugin {
  return { manifest: { id, version: '1.0.0' }, async register() {} };
}

function setupDir(files: Record<string, Record<string, unknown> | string>): string {
  const dir = join(tmpdir(), `wh-disc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    if (typeof content === 'string') {
      mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
      writeFileSync(full, content, 'utf8');
    } else {
      mkdirSync(full, { recursive: true });
    }
  }
  return dir;
}

describe('discoverPlugins', () => {
  it('扫描标记插件并跳过非插件与 _disabled 目录', async () => {
    const dir = setupDir({
      'hello/package.json': JSON.stringify({ name: '@wizard-harness/plugin-hello', wizardHarness: { plugin: true } }),
      'hello/dist/index.js': 'export default {};',
      'other/package.json': JSON.stringify({ name: '@wizard-harness/plugin-other', wizardHarness: { plugin: true } }),
      'other/dist/index.js': 'export default {};',
      'not-a-plugin/package.json': JSON.stringify({ name: 'some-lib' }),
      '_disabled/beta/package.json': JSON.stringify({ name: '@wizard-harness/plugin-beta', wizardHarness: { plugin: true } }),
      'plain-dir/': {},
      'no-pkg-dir/': {},
    });

    const load = async (name: string): Promise<{ default: Plugin }> => ({
      default: makePlugin(name.includes('hello') ? 'hello' : 'other'),
    });

    const { plugins, warnings } = await discoverPlugins(dir, { load });
    expect(plugins.map((p) => p.manifest.id).sort()).toEqual(['hello', 'other']);
    expect(warnings).toEqual([]);
  });

  it('非法插件包记入 warnings 而不中断其它插件', async () => {
    const dir = setupDir({
      'good/package.json': JSON.stringify({ name: '@wizard-harness/plugin-good', wizardHarness: { plugin: true } }),
      'good/dist/index.js': 'export default {};',
      'bad/package.json': JSON.stringify({ name: '@wizard-harness/plugin-bad', wizardHarness: { plugin: true } }),
      'bad/dist/index.js': 'export default {};',
      'boom/package.json': JSON.stringify({ name: '@wizard-harness/plugin-boom', wizardHarness: { plugin: true } }),
      'boom/dist/index.js': 'export default {};',
    });

    const load = async (name: string): Promise<{ default?: unknown }> => {
      if (name.includes('boom')) throw new Error('import exploded');
      if (name.includes('bad')) return { default: { manifest: { id: 'bad' } } }; // 缺 register
      return { default: makePlugin('good') };
    };

    const { plugins, warnings } = await discoverPlugins(dir, { load });
    expect(plugins.map((p) => p.manifest.id)).toEqual(['good']);
    expect(warnings.length).toBe(2);
    expect(warnings.some((w) => w.includes('bad'))).toBe(true);
    expect(warnings.some((w) => w.includes('boom'))).toBe(true);
  });

  it('目录不存在时返回空结果与警告', async () => {
    const { plugins, warnings } = await discoverPlugins(join(tmpdir(), 'wh-missing-' + Date.now()));
    expect(plugins).toEqual([]);
    expect(warnings.length).toBe(1);
  });
});
