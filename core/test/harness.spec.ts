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

  it('服务依赖缺失时注册成功并发 dep-missing 警告（services 字段）', async () => {
    const bus = createEventBus();
    const events: unknown[] = [];
    bus.subscribe((e) => events.push(e));
    const harness = createHarness({ bus });
    const plugin: Plugin = {
      manifest: { id: 'needs-svc', version: '1.0.0', services: ['logger', 'missing-svc'] },
      async register() {},
    };
    await harness.registry.register(plugin);
    expect(harness.registry.has('needs-svc')).toBe(true);
    const warn = events.filter(
      (e: { action?: string; payload?: { services?: string[] } }) =>
        e.action === 'dep-missing' && e.payload?.services,
    );
    expect(warn).toHaveLength(1);
    expect(warn[0].payload.services).toEqual(['logger', 'missing-svc']);
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
});
