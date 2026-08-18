import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createEventBus,
  createFileSink,
  createRegistrar,
  DuplicatePluginError,
  InvalidPluginError,
  PluginNotFoundError,
} from '../src/index.js';
import type { Plugin, PluginEvent } from '../src/index.js';
import { makeEmittingPlugin, makeTrackedPlugin } from './fixtures.js';

function setup() {
  const bus = createEventBus();
  const events: PluginEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const registrar = createRegistrar({ bus });
  return { bus, events, registrar };
}

describe('registrar', () => {
  it('注册后可被 get / list / has 找到', async () => {
    const { registrar } = setup();
    const tp = makeTrackedPlugin();
    await registrar.register(tp.plugin);
    expect(registrar.get('demo')).toBe(tp.plugin);
    expect(registrar.list()).toContain(tp.plugin);
    expect(registrar.has('demo')).toBe(true);
    expect(registrar.has('nope')).toBe(false);
  });

  it('插件 api（对外接口）与 ui（弹窗页）在注册后原样可访问', async () => {
    const { registrar } = setup();
    const api = { greet: () => 'hi' };
    const ui = { title: 'Demo', content: '<p>hello</p>', width: 320, height: 200 };
    const tp = makeTrackedPlugin({ api, ui });
    await registrar.register(tp.plugin);
    const found = registrar.get('demo');
    expect(found?.api).toBe(api);
    expect(found?.ui).toEqual(ui);
  });

  it('重复 id 抛 DuplicatePluginError', async () => {
    const { registrar } = setup();
    const tp = makeTrackedPlugin();
    await registrar.register(tp.plugin);
    await expect(registrar.register(tp.plugin)).rejects.toBeInstanceOf(DuplicatePluginError);
  });

  it('非法插件（缺 manifest / 缺 register）抛 InvalidPluginError', async () => {
    const { registrar } = setup();
    await expect(registrar.register({} as never)).rejects.toBeInstanceOf(InvalidPluginError);
    await expect(
      registrar.register({ manifest: { id: 'x', version: '1' } } as never),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('unregister 后 get 为 undefined；未注册卸载抛 PluginNotFoundError', async () => {
    const { registrar } = setup();
    const tp = makeTrackedPlugin();
    await registrar.register(tp.plugin);
    await registrar.unregister('demo');
    expect(registrar.get('demo')).toBeUndefined();
    await expect(registrar.unregister('demo')).rejects.toBeInstanceOf(PluginNotFoundError);
  });

  it('注册 / 注销会发统一格式观测事件，查询（get/list/has）不发事件', async () => {
    const { registrar, events } = setup();
    const tp = makeTrackedPlugin();
    await registrar.register(tp.plugin);
    registrar.get('demo');
    registrar.list();
    registrar.has('demo');
    await registrar.unregister('demo');
    const actions = events.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['register', 'stop', 'unregister']));
    expect(actions).not.toContain('get');
    expect(actions).not.toContain('list');
    expect(actions).not.toContain('has');
    for (const e of events) {
      expect(e.actor).toBe('core.registrar');
      expect(e.id).toBeTruthy();
      expect(e.ts).toBeGreaterThan(0);
    }
  });

  it('生命周期钩子按序调用 register → start；unregister 触发 stop', async () => {
    const { registrar } = setup();
    const tp = makeTrackedPlugin();
    await registrar.register(tp.plugin);
    expect(tp.calls).toEqual(['register', 'start']);
    await registrar.unregister('demo');
    expect(tp.calls).toEqual(['register', 'start', 'stop']);
  });

  it('插件通过 ctx.emit 产生插件事件并进入总线', async () => {
    const bus = createEventBus();
    const events: PluginEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const registrar = createRegistrar({ bus });
    const plugin = makeEmittingPlugin({ id: 'emitter', version: '1.0.0' }, (ctx) => {
      ctx.emit({ action: 'hello', target: 'world' });
    });
    await registrar.register(plugin);
    const pluginEvents = events.filter((e) => e.actor === 'plugin:emitter');
    expect(pluginEvents).toHaveLength(1);
    expect(pluginEvents[0]).toMatchObject({ action: 'hello', target: 'world' });
  });

  it('onStart 抛错时回滚注册并发出 start-failed 事件', async () => {
    const { registrar, events } = setup();
    const failing: Plugin = {
      manifest: { id: 'boom', version: '1.0.0' },
      async register() {},
      async onStart() {
        throw new Error('start exploded');
      },
    };
    await expect(registrar.register(failing)).rejects.toThrow('start exploded');
    expect(registrar.has('boom')).toBe(false);
    expect(registrar.get('boom')).toBeUndefined();
    const actions = events.map((e) => e.action);
    expect(actions).toContain('register');
    expect(actions).toContain('start-failed');
    expect(actions).not.toContain('start');
  });

  it('依赖缺失时注册成功并发 dep-missing 警告事件；依赖满足时无警告', async () => {
    const { registrar, events } = setup();
    const withMissing: Plugin = {
      manifest: { id: 'with-dep', version: '1.0.0', dependencies: ['nope'] },
      async register() {},
    };
    await registrar.register(withMissing);
    expect(registrar.has('with-dep')).toBe(true);
    const warn = events.filter((e) => e.action === 'dep-missing');
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ target: 'with-dep', payload: { dependencies: ['nope'] } });

    const base = makeTrackedPlugin();
    await registrar.register(base.plugin); // id: demo
    const withOk: Plugin = {
      manifest: { id: 'with-ok', version: '1.0.0', dependencies: ['demo'] },
      async register() {},
    };
    await registrar.register(withOk);
    const warnOk = events.filter((e) => e.action === 'dep-missing' && e.target === 'with-ok');
    expect(warnOk).toHaveLength(0);
  });

  it('事件总线：单个 sink 抛错不打断其它订阅者，emit 不抛出', () => {
    const bus = createEventBus();
    const seen: PluginEvent[] = [];
    bus.subscribe(() => {
      throw new Error('sink boom');
    });
    bus.subscribe((e) => seen.push(e));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const event: PluginEvent = { id: '1', ts: 1, actor: 'a', action: 'x' };
    expect(() => bus.emit(event)).not.toThrow();
    expect(seen).toHaveLength(1);
    spy.mockRestore();
  });

  it('文件持久化把事件写入 events.jsonl', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-'));
    const file = join(dir, 'events.jsonl');
    const bus = createEventBus();
    bus.subscribe(createFileSink(file));
    const registrar = createRegistrar({ bus });
    await registrar.register(makeTrackedPlugin().plugin);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ actor: 'core.registrar', action: 'register' });
  });
});
