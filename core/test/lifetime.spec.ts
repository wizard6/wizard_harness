import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '../src/index.js';
import type { Plugin, PluginContext } from '../src/index.js';

function makeHarness() {
  const bus = createEventBus();
  const harness = createHarness({ bus, name: 'test' });
  return { bus, harness };
}

function plugin(
  id: string,
  register?: (ctx: PluginContext) => void,
  extra?: Partial<Plugin>,
): Plugin {
  return {
    manifest: { id, version: '1.0.0' },
    register(ctx) {
      register?.(ctx);
    },
    ...extra,
  };
}

describe('服务生命周期分层（host / plugin）', () => {
  it('壳注册 host 服务带 lifetime 元数据；插件服务默认 plugin', async () => {
    const { harness } = makeHarness();
    harness.services.register('bus', { emit: () => {} }, { providerId: 'shell', lifetime: 'host' });
    const p = plugin('p', undefined, {
      manifest: { id: 'p', version: '1.0.0', provides: ['svc'] },
      api: { ok: 1 },
    });
    await harness.registry.register(p);

    const bindings = harness.services.bindings();
    expect(bindings.find((b) => b.name === 'bus')).toMatchObject({
      lifetime: 'host',
      providerId: 'shell',
    });
    expect(bindings.find((b) => b.name === 'svc')).toMatchObject({
      lifetime: 'plugin',
      providerId: 'p',
    });
  });

  it('host 服务不随插件卸载消失（宿主长活，消费方可放心缓存）', async () => {
    const { harness } = makeHarness();
    harness.services.register(
      'bus',
      { ping: () => 'pong' },
      { providerId: 'shell', lifetime: 'host' },
    );
    const p = plugin('p');
    await harness.registry.register(p);
    await harness.registry.unregister('p');

    expect(harness.services.get('bus')).toBeDefined();
    expect(harness.services.get<{ ping: () => string }>('bus')?.ping()).toBe('pong');
  });

  it('boot 识别宿主服务：inject 宿主服务不误判 pending，且 ctx.get 可取到', async () => {
    const { harness } = makeHarness();
    harness.services.register('bus', { emit: () => {} }, { providerId: 'shell', lifetime: 'host' });
    const consumer = plugin(
      'consumer',
      (ctx) => {
        expect(ctx.get('bus')).toBeDefined();
      },
      { manifest: { id: 'consumer', version: '1.0.0', inject: ['bus'] } },
    );

    const result = await harness.boot([consumer]);
    expect(result.pending).toEqual([]);
    expect(result.loaded.map((r) => r.plugin.manifest.id)).toEqual(['consumer']);
  });

  it('未注册服务仍判 pending（宿主服务判定不破坏原有行为）', async () => {
    const { harness } = makeHarness();
    const orphan = plugin('orphan', undefined, {
      manifest: { id: 'orphan', version: '1.0.0', inject: ['nope'] },
    });
    const result = await harness.boot([orphan]);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].missing).toEqual(['nope']);
  });
});
