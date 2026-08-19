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
});
