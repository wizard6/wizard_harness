import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyEntryPatches, composeLayers, loadProfile, parsePatchList } from '../src/profile/index.js';
import { assembleRuntime, createEventBus } from '../src/index.js';
import type { Plugin } from '../src/index.js';

function writeJson(file: string, data: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

describe('profile patch 代数', () => {
  it('insert 到空树，后层整份替换 config', () => {
    const { entries, warnings } = composeLayers([
      [{ insert: [{ id: 'logger', name: 'logger', config: { level: 'info', keep: true } }] }],
      [{ id: 'logger', config: { level: 'debug' } }],
    ]);
    expect(warnings).toEqual([]);
    expect(entries).toEqual([{ id: 'logger', name: 'logger', config: { level: 'debug' } }]);
  });

  it('目标 id 不存在只警告', () => {
    const { entries, warnings } = applyEntryPatches(
      [{ id: 'logger', name: 'logger' }],
      [{ id: 'nope', disabled: true }],
    );
    expect(entries).toHaveLength(1);
    expect(warnings).toEqual(['patch 目标 id 不存在：nope']);
  });

  it('insert 重复 id 失败', () => {
    expect(() =>
      applyEntryPatches([{ id: 'a', name: 'a' }], [{ insert: [{ id: 'a', name: 'a' }] }]),
    ).toThrow(/重复 entry id/);
  });

  it('非数组 patch fail-loud', () => {
    expect(() => parsePatchList({}, 'f')).toThrow(/必须是顶层数组/);
  });
});

describe('loadProfile + assembleRuntime', () => {
  let root: string;
  const byName: Record<string, Plugin> = {};

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'wh-profile-'));
    const plugins = join(root, 'plugins');
    const bundles = join(root, 'bundles', 'base');
    const profile = join(root, 'profiles', 'default');
    for (const id of ['logger', 'hello', 'extra']) {
      byName[id] = { manifest: { id, version: '1.0.0' }, register() {} };
      mkdirSync(join(plugins, id, 'dist'), { recursive: true });
      writeJson(join(plugins, id, 'package.json'), { name: id, wizardHarness: { plugin: true } });
      writeFileSync(join(plugins, id, 'dist', 'index.js'), '');
    }
    writeJson(join(bundles, 'package.json'), {
      name: 'base',
      wizardHarness: { bundle: { patch: './wizard.patch.json' } },
    });
    writeJson(join(bundles, 'wizard.patch.json'), [
      { insert: [{ id: 'logger', name: 'logger' }, { id: 'hello', name: 'hello' }] },
    ]);
    writeJson(join(profile, 'package.json'), {
      name: 'wh-profile-default',
      wizardHarness: { profile: { bundles: ['base'] } },
    });
    writeJson(join(profile, 'wizard.patch.json'), [{ id: 'hello', disabled: true }]);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('按 bundles 序组合，profile patch 覆盖', () => {
    const snap = loadProfile({
      profileDir: join(root, 'profiles', 'default'),
      bundlesDir: join(root, 'bundles'),
    });
    expect(snap.bundles).toEqual(['base']);
    expect(snap.entries.map((e) => e.id)).toEqual(['logger', 'hello']);
    expect(snap.entries[1].disabled).toBe(true);
  });

  it('listed bundle 不是 bundle 则抛错', () => {
    const bad = join(root, 'profiles', 'bad');
    writeJson(join(bad, 'package.json'), {
      name: 'bad',
      wizardHarness: { profile: { bundles: ['nope'] } },
    });
    expect(() =>
      loadProfile({ profileDir: bad, bundlesDir: join(root, 'bundles') }),
    ).toThrow(/找不到 bundle：nope/);
  });

  it('assembleRuntime 只加载组合树内启用插件，overlay 整份替换 config', async () => {
    const rt = await assembleRuntime({
      bus: createEventBus(),
      pluginsDir: join(root, 'plugins'),
      profileDir: join(root, 'profiles', 'default'),
      bundlesDir: join(root, 'bundles'),
      overlays: [[{ id: 'logger', config: { level: 'debug' } }]],
      discover: { load: (name) => ({ default: byName[name] }) },
    });
    expect(rt.plugins.map((p) => p.manifest.id)).toEqual(['logger']);
    expect(rt.harness.config.logger).toEqual({ level: 'debug' });
    expect(rt.skipped).toContainEqual({ id: 'hello', reason: 'disabled' });
    expect(rt.skipped).toContainEqual({ id: 'extra', reason: 'not-in-profile' });
    expect(rt.composition?.bundles).toEqual(['base']);
  });

  it('home patch 后于 profile 层生效', () => {
    const home = join(root, 'home');
    writeJson(join(home, 'wizard.patch.json'), [{ id: 'hello', disabled: false }]);
    const snap = loadProfile({
      profileDir: join(root, 'profiles', 'default'),
      bundlesDir: join(root, 'bundles'),
      homeDir: home,
    });
    expect(snap.entries.find((e) => e.id === 'hello')?.disabled).toBe(false);
  });
});
