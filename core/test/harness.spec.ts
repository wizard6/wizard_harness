import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '../src/index.js';
import type { Plugin, PluginContext } from '../src/index.js';

function makeApiPlugin(id: string, config?: Record<string, unknown>): Plugin {
  return {
    manifest: { id, version: '1.0.0', config },
    api: { ping: () => `${id}:pong` },
    async register() {},
  };
}

describe('createHarness', () => {
  it('返回代表系统的 SystemContext（身份 + 注册表 + 服务 + 状态）', () => {
    const bus = createEventBus();
    const harness = createHarness({ bus, name: 'test-harness' });
    expect(harness.name).toBe('test-harness');
    expect(harness.id).toBeTruthy();
    expect(harness.startedAt).toBeGreaterThan(0);
    expect(harness.registry).toBeDefined();
    expect(harness.services).toBeDefined();
    const st = harness.status();
    expect(st.plugins).toEqual([]);
    expect(st.services).toEqual([]);
    expect(st.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('api 即服务：插件注册后 api 自动成为同名服务，注销后移除', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const plugin = makeApiPlugin('greeter');
    await harness.registry.register(plugin);
    expect(harness.services.list()).toContain('greeter');
    const svc = harness.services.get<{ ping: () => string }>('greeter');
    expect(svc?.ping()).toBe('greeter:pong');
    await harness.registry.unregister('greeter');
    expect(harness.services.list()).not.toContain('greeter');
    expect(harness.services.get('greeter')).toBeUndefined();
  });

  it('无 api 的插件不注册服务', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const plugin: Plugin = { manifest: { id: 'no-api', version: '1.0.0' }, async register() {} };
    await harness.registry.register(plugin);
    expect(harness.services.list()).toEqual([]);
  });

  it('配置合并：插件默认值 < 全局按 id 覆盖', async () => {
    const harness = createHarness({
      bus: createEventBus(),
      config: { logger: { level: 'debug', extra: 1 } },
    });
    const plugin = makeApiPlugin('logger', { level: 'info', file: '/tmp/a.log' });
    await harness.registry.register(plugin);
    const ctx = harness.pluginContext('logger');
    expect(ctx?.config).toEqual({ level: 'debug', file: '/tmp/a.log', extra: 1 });
  });

  it('pluginContext 返回已注册插件的受限视角；未注册返回 undefined', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const plugin = makeApiPlugin('demo');
    await harness.registry.register(plugin);
    const ctx = harness.pluginContext('demo');
    expect(ctx).toBeDefined();
    expect(ctx?.services.list()).toEqual(['demo']);
    expect(() => (ctx as { config: unknown }).config).not.toThrow();
    expect(harness.pluginContext('missing')).toBeUndefined();
  });

  it('status() 汇总当前插件与服务', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(makeApiPlugin('a'));
    await harness.registry.register(makeApiPlugin('b'));
    const st = harness.status();
    expect(st.plugins.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(st.services.sort()).toEqual(['a', 'b']);
  });

  it('高权限服务仅 trusted 插件可获取', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const provider: Plugin = {
      manifest: { id: 'provider', version: '1.0.0', trusted: true, highAccessServices: ['provider'] },
      api: { secret: () => 's3cret' },
      async register() {},
    };
    await harness.registry.register(provider);

    let untrustedCtx: PluginContext | undefined;
    const untrusted: Plugin = {
      manifest: { id: 'untrusted', version: '1.0.0' },
      async register(c) {
        untrustedCtx = c;
      },
    };
    await harness.registry.register(untrusted);
    // 非可信插件拿不到高权限服务
    expect(untrustedCtx?.services.get('provider')).toBeUndefined();

    let trustedCtx: PluginContext | undefined;
    const trusted: Plugin = {
      manifest: { id: 'trusted-consumer', version: '1.0.0', trusted: true },
      async register(c) {
        trustedCtx = c;
      },
    };
    await harness.registry.register(trusted);
    // 可信插件可以拿到并调用
    expect(trustedCtx?.services.get<{ secret: () => string }>('provider')?.secret()).toBe('s3cret');
  });

  it('S4：untrusted 提供方自见自己的 high 服务（high 门槛只拦他方）', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let ownerCtx: PluginContext | undefined;
    const owner: Plugin = {
      manifest: {
        id: 'owner',
        version: '1.0.0',
        provides: ['secret-store'],
        highAccessServices: ['secret-store'], // 不设 trusted
      },
      api: { secret: () => 'top' },
      async register(c) {
        ownerCtx = c;
      },
    };
    await harness.registry.register(owner);

    // 提供方自己可见：get / 属性（括号访问，服务名含连字符）/ 显式 providerId 三条路径都拿得到
    expect(ownerCtx?.services.get<{ secret: () => string }>('secret-store')?.secret()).toBe('top');
    expect((ownerCtx as unknown as Record<string, unknown>)['secret-store']).toBeDefined();
    expect(ownerCtx?.services.get('secret-store', 'owner')).toBeDefined();

    // 其它 untrusted 插件仍被拦
    let peerCtx: PluginContext | undefined;
    const peer: Plugin = {
      manifest: { id: 'peer', version: '1.0.0' },
      async register(c) {
        peerCtx = c;
      },
    };
    await harness.registry.register(peer);
    expect(peerCtx?.services.get('secret-store')).toBeUndefined();
    expect(peerCtx?.services.providers('secret-store')).toEqual([]);
  });

  it('Cordis inject：boot 按依赖排序并注入；缺必选则 pending', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let seen: string | undefined;
    const logger: Plugin = {
      manifest: { id: 'logger', version: '1.0.0', provides: ['logger'] },
      api: {
        info(msg: string) {
          return msg;
        },
      },
      async register() {},
    };
    const greeter: Plugin = {
      manifest: { id: 'greeter', version: '1.0.0' },
      inject: ['logger'],
      async register(ctx) {
        // Cordis：ctx.get 或属性访问
        seen = ctx.get<{ info: (m: string) => string }>('logger')?.info('hi');
        expect((ctx as { logger?: { info: (m: string) => string } }).logger?.info('via-prop')).toBe(
          'via-prop',
        );
      },
    };
    const orphan: Plugin = {
      manifest: { id: 'orphan', version: '1.0.0' },
      inject: ['nope'],
      async register() {},
    };
    const result = await harness.boot([greeter, orphan, logger]);
    expect(result.loaded.map((r) => r.plugin.manifest.id)).toEqual(['logger', 'greeter']);
    expect(result.pending).toEqual([{ plugin: orphan, missing: ['nope'] }]);
    expect(seen).toBe('hi');
    expect(harness.registry.has('orphan')).toBe(false);
  });

  it('boot：inject 依赖成环时抛错，不静默装配', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const a: Plugin = {
      manifest: { id: 'a', version: '1.0.0', provides: ['a-svc'] },
      inject: ['b-svc'],
      api: { a: () => 'a' },
      async register() {},
    };
    const b: Plugin = {
      manifest: { id: 'b', version: '1.0.0', provides: ['b-svc'] },
      inject: ['a-svc'],
      api: { b: () => 'b' },
      async register() {},
    };
    // 两个插件互相依赖对方提供的服务 → 拓扑排序检测成环
    await expect(harness.boot([a, b])).rejects.toThrow(/依赖成环/);
    expect(harness.registry.has('a')).toBe(false);
    expect(harness.registry.has('b')).toBe(false);
  });

  it('Cordis：卸载提供方时级联卸载 inject 依赖方', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.boot([
      {
        manifest: { id: 'logger', version: '1.0.0', provides: ['logger'] },
        api: { info: () => '' },
        async register() {},
      },
      {
        manifest: { id: 'greeter', version: '1.0.0' },
        inject: ['logger'],
        async register() {},
      },
    ]);
    expect(harness.registry.has('greeter')).toBe(true);
    await harness.registry.unregister('logger');
    expect(harness.registry.has('logger')).toBe(false);
    expect(harness.registry.has('greeter')).toBe(false);
  });

  it('inject 未就绪时直接 register 会失败（应走 boot）', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const plugin: Plugin = {
      manifest: { id: 'needs-svc', version: '1.0.0', inject: ['logger'] },
      async register() {},
    };
    await expect(harness.registry.register(plugin)).rejects.toThrow(/inject 未就绪/);
    expect(harness.registry.has('needs-svc')).toBe(false);
  });

  it('waitFor 等到服务出现；超时返回 undefined', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let consumerCtx: PluginContext | undefined;
    const consumer: Plugin = {
      manifest: { id: 'consumer', version: '1.0.0' },
      async register(c) {
        consumerCtx = c;
      },
    };
    await harness.registry.register(consumer);
    // 服务尚未注册：等 200ms 内由注册动作补上
    const waiter = consumerCtx!.services.waitFor('late', 2000);
    setTimeout(() => {
      void harness.services.register('late', { ok: 1 });
    }, 150);
    expect(await waiter).toEqual({ ok: 1 });
    // 永不出现的服务：超时返回 undefined
    const gone = await consumerCtx!.services.waitFor('never', 150);
    expect(gone).toBeUndefined();
  });

  it('服务与插件多对多：一插件多名、多名提供同一服务', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const alpha: Plugin = {
      manifest: { id: 'alpha', version: '1.0.0', provides: ['clock', 'tick'] },
      api: { kind: 'alpha' },
      async register() {},
    };
    const beta: Plugin = {
      manifest: { id: 'beta', version: '1.0.0', provides: ['clock'] },
      api: { kind: 'beta' },
      async register() {},
    };
    await harness.registry.register(alpha);
    await harness.registry.register(beta);
    expect(harness.services.list().sort()).toEqual(['clock', 'tick']);
    expect(harness.services.providers('clock').sort()).toEqual(['alpha', 'beta']);
    expect(harness.services.providedBy('alpha').sort()).toEqual(['clock', 'tick']);
    expect(harness.services.get('clock', 'beta')).toEqual({ kind: 'beta' });
    expect(harness.services.getAll('clock')).toEqual([{ kind: 'alpha' }, { kind: 'beta' }]);
    expect(harness.services.get('tick')).toEqual({ kind: 'alpha' });
    await harness.registry.unregister('alpha');
    expect(harness.services.providers('clock')).toEqual(['beta']);
    expect(harness.services.get('tick')).toBeUndefined();
    expect(harness.services.get('clock')).toEqual({ kind: 'beta' });
  });

  it('服务作用域：plugin 私有对它人不可见；壳全表可见；注销撕绑定', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const owner: Plugin = {
      manifest: {
        id: 'owner',
        version: '1.0.0',
        provides: [{ name: 'secret-store', scope: 'plugin' }, 'public-api'],
      },
      api: { kind: 'owner' },
      async register() {},
    };
    let peerCtx: PluginContext | undefined;
    const peer: Plugin = {
      manifest: { id: 'peer', version: '1.0.0' },
      async register(c) {
        peerCtx = c;
      },
    };
    await harness.registry.register(owner);
    await harness.registry.register(peer);

    const metas = harness.services.bindings('secret-store');
    expect(metas).toEqual([
      { name: 'secret-store', providerId: 'owner', scope: 'plugin', access: 'low', lifetime: 'plugin' },
    ]);
    expect(harness.services.bindings('public-api')[0]?.scope).toBe('harness');

    // 壳全表：两种都能取到
    expect(harness.services.get('secret-store')).toEqual({ kind: 'owner' });
    expect(harness.services.get('public-api')).toEqual({ kind: 'owner' });

    // 同插件可见私有；其它插件看不见私有，仍看得见 harness
    const ownerCtx = harness.pluginContext('owner');
    expect(ownerCtx?.services.get('secret-store')).toEqual({ kind: 'owner' });
    expect(peerCtx?.services.get('secret-store')).toBeUndefined();
    expect(peerCtx?.services.list()).toContain('public-api');
    expect(peerCtx?.services.list()).not.toContain('secret-store');
    expect(peerCtx?.services.providers('secret-store')).toEqual([]);

    await harness.registry.unregister('owner');
    expect(harness.services.get('secret-store')).toBeUndefined();
    expect(harness.services.get('public-api')).toBeUndefined();
    expect(harness.services.bindings()).toEqual([]);
  });

  it('服务支持懒加载 factory：首次 get 创建并缓存单例，未 get 不创建', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const provider: Plugin = {
      manifest: { id: 'lazy-provider', version: '1.0.0' },
      async register() {},
    };
    await harness.registry.register(provider);
    let calls = 0;
    harness.services.register('lazy-svc', undefined, {
      providerId: 'lazy-provider',
      factory: (ctx) => {
        calls += 1;
        return { hasConfig: typeof ctx?.config === 'object' };
      },
    });
    expect(calls).toBe(0); // 未 get 不创建
    const a = harness.services.get<{ hasConfig: boolean }>('lazy-svc');
    expect(calls).toBe(1); // 首次 get 创建
    expect(a?.hasConfig).toBe(true); // factory 拿到提供方插件的 ctx
    const b = harness.services.get('lazy-svc');
    expect(calls).toBe(1); // 单例缓存，不再创建
    expect(a).toBe(b);
    // 插件 ctx 视角也能取到（可见链同样触发实例化）
    const viaCtx = harness.pluginContext('lazy-provider')?.services.get('lazy-svc');
    expect(viaCtx).toBe(a);
  });

  it('配置热更新：updateConfig 替换 ctx.config 并触发 onConfig 通知', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const seen: { next: unknown; prev: unknown; patch: unknown }[] = [];
    let unsub: (() => void) | undefined;
    const plugin: Plugin = {
      manifest: { id: 'hot', version: '1.0.0', config: { level: 'info', file: '/a.log' } },
      async register(c) {
        unsub = c.onConfig((next, prev, patch) => seen.push({ next, prev, patch }));
      },
    };
    await harness.registry.register(plugin);
    harness.updateConfig('hot', { level: 'debug' });
    // ctx.config 引用已更新
    expect(harness.pluginContext('hot')?.config).toEqual({ level: 'debug', file: '/a.log' });
    // onConfig 收到通知（新/旧/补丁）
    expect(seen).toHaveLength(1);
    expect(seen[0].patch).toEqual({ level: 'debug' });
    expect(seen[0].next).toEqual({ level: 'debug', file: '/a.log' });
    expect(seen[0].prev).toEqual({ level: 'info', file: '/a.log' });
    // 取消订阅后不再通知
    unsub?.();
    harness.updateConfig('hot', { level: 'error' });
    expect(seen).toHaveLength(1);
  });

  it('基于事件的服务调用：call 成功并全程可观测（service-call/service-result）', async () => {
    const bus = createEventBus();
    const events: unknown[] = [];
    bus.subscribe((e) => events.push(e));
    const harness = createHarness({ bus });
    let consumerCtx: PluginContext | undefined;
    const provider: Plugin = {
      manifest: { id: 'calc', version: '1.0.0' },
      api: {
        add(a: number, b: number) {
          return a + b;
        },
        async slow() {
          return 'done';
        },
      },
      async register() {},
    };
    await harness.registry.register(provider);
    const consumer: Plugin = {
      manifest: { id: 'user', version: '1.0.0' },
      async register(c) {
        consumerCtx = c;
      },
    };
    await harness.registry.register(consumer);
    const result = await consumerCtx!.call<number>('calc', 'add', [2, 3]);
    expect(result).toBe(5);
    const actions = events.map((e: { action?: string }) => e.action);
    expect(actions).toContain('service-call');
    expect(actions).toContain('service-result');
  });

  it('基于事件的服务调用：方法不存在 / 服务不可用 / 超时均 reject', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let consumerCtx: PluginContext | undefined;
    const provider: Plugin = {
      manifest: { id: 's1', version: '1.0.0' },
      api: { ok() { return 1; }, hang() { return new Promise(() => {}); } },
      async register() {},
    };
    await harness.registry.register(provider);
    const consumer: Plugin = {
      manifest: { id: 'u1', version: '1.0.0' },
      async register(c) {
        consumerCtx = c;
      },
    };
    await harness.registry.register(consumer);
    await expect(consumerCtx!.call('s1', 'missing')).rejects.toThrow('无方法');
    await expect(consumerCtx!.call('ghost', 'x')).rejects.toThrow('服务不可用');
    await expect(consumerCtx!.call('s1', 'hang', undefined, { timeoutMs: 100 })).rejects.toThrow('超时');
  });

  it('热重载：新 api 生效、onStop 执行、其它插件不受影响、服务替换', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let stopCalls = 0;
    const oldVersion: Plugin = {
      manifest: { id: 'hot', version: '1.0.0', provides: ['hot'] },
      api: { greet: () => 'old' },
      async register() {},
      async onStop() {
        stopCalls += 1;
      },
    };
    const bystander: Plugin = {
      manifest: { id: 'bystander', version: '1.0.0' },
      async register() {},
    };
    await harness.registry.register(oldVersion);
    await harness.registry.register(bystander);

    const newVersion: Plugin = {
      manifest: { id: 'hot', version: '2.0.0', provides: ['hot'] },
      api: { greet: () => 'new' },
      async register() {},
    };
    const result = await harness.registry.reload('hot', newVersion);

    expect(stopCalls).toBe(1); // 旧插件 onStop 执行
    expect(result.replaced.version).toBe('1.0.0');
    // 新 api 生效（事件化调用走新实现）
    const svc = harness.services.get<{ greet: () => string }>('hot');
    expect(svc?.greet()).toBe('new');
    // 其它插件不受影响
    expect(harness.registry.has('bystander')).toBe(true);
    expect(harness.registry.has('hot')).toBe(true);
  });

  it('热重载：不存在抛错、id 不一致抛错、级联卸载依赖方', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const provider: Plugin = {
      manifest: { id: 'p', version: '1.0.0', provides: ['svc'] },
      api: { ok: () => 1 },
      async register() {},
    };
    const consumer: Plugin = {
      manifest: { id: 'c', version: '1.0.0', inject: { svc: true } },
      async register() {},
    };
    await harness.registry.register(provider);
    await harness.registry.register(consumer);
    // 不存在
    await expect(harness.registry.reload('ghost', provider)).rejects.toThrow();
    // id 不一致
    const wrong: Plugin = { manifest: { id: 'other', version: '1.0.0' }, async register() {} };
    await expect(harness.registry.reload('p', wrong)).rejects.toThrow('id 不一致');
    // 正常 reload：级联卸载依赖方 c
    const next: Plugin = { manifest: { id: 'p', version: '2.0.0', provides: ['svc'] }, api: { ok: () => 2 }, async register() {} };
    const r = await harness.registry.reload('p', next);
    expect(r.cascaded).toContain('c');
    expect(harness.registry.has('c')).toBe(false);
    expect(harness.registry.has('p')).toBe(true);
  });

  it('热重载：新插件 onStart 失败时回滚旧版本', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const oldVersion: Plugin = {
      manifest: { id: 'rollback', version: '1.0.0', provides: ['rb'] },
      api: { v: () => 'v1' },
      async register() {},
    };
    await harness.registry.register(oldVersion);
    const broken: Plugin = {
      manifest: { id: 'rollback', version: '2.0.0', provides: ['rb'] },
      api: { v: () => 'v2' },
      async register() {},
      async onStart() {
        throw new Error('start exploded');
      },
    };
    await expect(harness.registry.reload('rollback', broken)).rejects.toThrow('回滚');
    // 旧版本被重新注册，服务仍可用
    expect(harness.registry.has('rollback')).toBe(true);
    expect(harness.services.get<{ v: () => string }>('rb')?.v()).toBe('v1');
  });
});
