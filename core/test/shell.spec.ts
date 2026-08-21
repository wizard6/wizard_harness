import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleRuntime, createEventBus, syncRuntime } from '../src/index.js';
import type { Plugin, PluginEvent } from '../src/index.js';

/** 生成最小插件 */
function makePlugin(id: string, extra?: Partial<Plugin>): Plugin {
  return { manifest: { id, version: '1.0.0' }, register() {}, ...extra };
}

/** 写一个符合 discoverPlugins 约定的插件包目录（package.json + dist/index.js） */
function writePluginDir(dir: string, id: string): void {
  const p = join(dir, id);
  mkdirSync(join(p, 'dist'), { recursive: true });
  writeFileSync(
    join(p, 'package.json'),
    JSON.stringify({ name: id, wizardHarness: { plugin: true } }),
  );
  writeFileSync(join(p, 'dist', 'index.js'), '');
}

describe('assembleRuntime（运行时壳装配助手）', () => {
  let dir: string;
  const byName: Record<string, Plugin> = {};

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wh-shell-'));
    const logger = makePlugin('logger', {
      manifest: { id: 'logger', version: '1.0.0', provides: ['logger'] },
      api: { info: () => 'ok' },
    });
    const needy = makePlugin('needy', {
      manifest: { id: 'needy', version: '1.0.0', inject: ['logger'] },
    });
    const orphan = makePlugin('orphan', {
      manifest: { id: 'orphan', version: '1.0.0', inject: ['nope'] },
    });
    const disabledOne = makePlugin('disabled-one');
    const expPlug = makePlugin('exp-plug', {
      manifest: { id: 'exp-plug', version: '1.0.0', tier: 'experimental' },
    });
    const expOn = makePlugin('exp-on', {
      manifest: { id: 'exp-on', version: '1.0.0', tier: 'experimental' },
    });
    const depWarn = makePlugin('dep-warn', {
      manifest: { id: 'dep-warn', version: '1.0.0', dependencies: ['nope'] },
    });
    for (const p of [logger, needy, orphan, disabledOne, expPlug, expOn, depWarn]) {
      byName[p.manifest.id] = p;
      writePluginDir(dir, p.manifest.id);
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function load(name: string): { default: Plugin } {
    return { default: byName[name] };
  }

  it('装配：按 inject 拓扑加载、服务可用、dep-missing 不阻断', async () => {
    const bus = createEventBus();
    const events: PluginEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const rt = await assembleRuntime({
      bus,
      config: {},
      pluginsDir: dir,
      discover: { load },
    });

    // 全部可加载插件已装配（扫描序不定，用集合断言；disabled-one 无 tier 且未禁用 → 加载）
    expect(rt.plugins.map((p) => p.manifest.id)).toEqual(
      expect.arrayContaining(['logger', 'needy', 'dep-warn', 'disabled-one']),
    );
    // 拓扑约束：提供方 logger 必须先于消费方 needy
    const ids = rt.plugins.map((p) => p.manifest.id);
    expect(ids.indexOf('logger')).toBeLessThan(ids.indexOf('needy'));
    expect(rt.pending).toHaveLength(1);
    expect(rt.pending[0]).toMatchObject({ plugin: { manifest: { id: 'orphan' } }, missing: ['nope'] });
    // 仅 experimental tier 且未显式启用的插件被跳过
    expect(rt.skipped).toEqual(
      expect.arrayContaining([
        { id: 'exp-plug', reason: 'experimental' },
        { id: 'exp-on', reason: 'experimental' },
      ]),
    );
    expect(rt.skipped).toHaveLength(2);
    expect(rt.warnings).toEqual([]);
    // 注入的服务可用
    expect(rt.harness.services.get('logger')).toBeDefined();
    // 事件总线上有 pending / skipped / dep-missing
    expect(events.some((e) => e.action === 'inject-pending' && e.target === 'orphan')).toBe(true);
    expect(events.some((e) => e.action === 'skipped' && e.target === 'exp-plug')).toBe(true);
    expect(events.some((e) => e.action === 'dep-missing' && e.target === 'dep-warn')).toBe(true);
  });

  it('disabled / experimental 过滤受配置控制', async () => {
    const rt = await assembleRuntime({
      bus: createEventBus(),
      config: { disabledPlugins: ['logger'], enableExperimental: ['exp-on'] },
      pluginsDir: dir,
      discover: { load },
    });

    expect(rt.plugins.map((p) => p.manifest.id)).toContain('exp-on');
    expect(rt.plugins.map((p) => p.manifest.id)).not.toContain('logger');
    expect(rt.skipped).toContainEqual({ id: 'logger', reason: 'disabled' });
    expect(rt.skipped).toContainEqual({ id: 'exp-plug', reason: 'experimental' });
    expect(rt.skipped).not.toContainEqual({ id: 'exp-on', reason: 'experimental' });
  });

  it('dep-missing 事件触发壳侧 console.warn 警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await assembleRuntime({
        bus: createEventBus(),
        config: {},
        pluginsDir: dir,
        discover: { load },
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dep-warn'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dependencies 未满足'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('syncRuntime 把后来才出现的插件装进已运行的 harness', async () => {
    const rt = await assembleRuntime({
      bus: createEventBus(),
      config: {},
      pluginsDir: dir,
      discover: { load },
    });
    expect(rt.harness.registry.has('late')).toBe(false);

    byName.late = makePlugin('late', { manifest: { id: 'late', version: '0.1.0', provides: ['late'] }, api: { ok: () => 1 } });
    writePluginDir(dir, 'late');

    const sync = await syncRuntime({
      harness: rt.harness,
      pluginsDir: dir,
      discover: { load },
    });
    expect(sync.loaded.map((p) => p.manifest.id)).toContain('late');
    expect(rt.harness.registry.has('late')).toBe(true);
    expect(rt.harness.services.get('late')).toBeDefined();

    const again = await syncRuntime({
      harness: rt.harness,
      pluginsDir: dir,
      discover: { load },
    });
    expect(again.loaded).toEqual([]);
    expect(again.already).toContain('late');
  });
});
