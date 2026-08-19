import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '../src/index.js';
import type { Plugin, PluginContext, PluginEvent } from '../src/index.js';

function plugin(id: string, extra?: Partial<Plugin>): Plugin {
  return { manifest: { id, version: '1.0.0' }, async register() {}, ...extra };
}

describe('两阶段生命周期（boot：全部 register → 按拓扑序统一 start）', () => {
  it('S2 修复：提供方 onStart 可拿到其它插件的服务', async () => {
    const h = createHarness({ bus: createEventBus(), name: 't' });
    let found = '';
    const A = plugin('A', {
      manifest: { id: 'A', version: '1.0.0', provides: ['a-svc'] },
      api: { a: 1 },
      async onStart(ctx: PluginContext) {
        found = ctx.get('b-svc') ? 'found' : 'MISSING';
      },
    });
    const B = plugin('B', {
      manifest: { id: 'B', version: '1.0.0', provides: ['b-svc'] },
      api: { b: 1 },
    });
    await h.boot([A, B]);
    expect(found).toBe('found');
  });

  it('阶段二按拓扑序 start：依赖方 start 时提供方已 start 且服务可取', async () => {
    const h = createHarness({ bus: createEventBus(), name: 't' });
    const order: string[] = [];
    const logger = plugin('logger', {
      manifest: { id: 'logger', version: '1.0.0', provides: ['logger'] },
      api: { info: () => '' },
      async onStart() {
        order.push('logger.start');
      },
    });
    const needy = plugin('needy', {
      manifest: { id: 'needy', version: '1.0.0', inject: ['logger'] },
      async onStart(ctx: PluginContext) {
        order.push('needy.start');
        expect(ctx.get('logger')).toBeDefined();
      },
    });
    await h.boot([needy, logger]); // 故意乱序传入，验证拓扑排序
    expect(order).toEqual(['logger.start', 'needy.start']);
  });

  it('直接 register（非 boot）：onStart 仍立即执行（行为不变）', async () => {
    const h = createHarness({ bus: createEventBus(), name: 't' });
    const calls: string[] = [];
    const p = plugin('p', {
      async register() {
        calls.push('register');
      },
      async onStart() {
        calls.push('start');
      },
    });
    await h.registry.register(p);
    expect(calls).toEqual(['register', 'start']);
  });

  it('deferStart：register 不启动，手动 start() 执行 onStart 并发 start 事件', async () => {
    const bus = createEventBus();
    const h = createHarness({ bus, name: 't' });
    const events: PluginEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const calls: string[] = [];
    const p = plugin('p', {
      async register() {
        calls.push('register');
      },
      async onStart() {
        calls.push('start');
      },
    });
    const r = await h.registry.register(p, { deferStart: true });
    expect(calls).toEqual(['register']);
    expect(events.some((e) => e.action === 'start')).toBe(false);

    await r.start?.();
    expect(calls).toEqual(['register', 'start']);
    expect(events.some((e) => e.action === 'start' && e.target === 'p')).toBe(true);
  });

  it('boot 事件顺序：全部 register 事件先于任何 start 事件', async () => {
    const bus = createEventBus();
    const h = createHarness({ bus, name: 't' });
    const events: PluginEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const a = plugin('a', {
      manifest: { id: 'a', version: '1.0.0', provides: ['x'] },
      api: { x: 1 },
      async onStart() {},
    });
    const b = plugin('b', { async onStart() {} });
    await h.boot([a, b]);

    const actions = events.map((e) => e.action);
    const lastRegister = actions.lastIndexOf('register');
    const firstStart = actions.indexOf('start');
    expect(lastRegister).toBeGreaterThanOrEqual(0);
    expect(firstStart).toBeGreaterThanOrEqual(0);
    expect(lastRegister).toBeLessThan(firstStart);
  });

  it('boot 中 onStart 失败：回滚该插件、发 start-failed、已启动的保持', async () => {
    const bus = createEventBus();
    const h = createHarness({ bus, name: 't' });
    const events: PluginEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const ok = plugin('ok');
    const bad = plugin('bad', {
      async onStart() {
        throw new Error('boom');
      },
    });
    await expect(h.boot([ok, bad])).rejects.toThrow('boom');
    expect(h.registry.has('bad')).toBe(false);
    expect(h.registry.has('ok')).toBe(true);
    expect(events.some((e) => e.action === 'start-failed' && e.target === 'bad')).toBe(true);
  });
});
