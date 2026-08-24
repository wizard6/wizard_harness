import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness, InvalidPluginError } from '../src/index.js';
import type { Plugin } from '../src/index.js';

function makePlugin(overrides: Partial<Plugin['manifest']> = {}): Plugin {
  return {
    manifest: { id: 'demo', version: '1.0.0', ...overrides },
    async register() {},
  };
}

describe('manifest schema 校验', () => {
  it('合法 manifest 注册成功', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await harness.registry.register(makePlugin());
    expect(harness.registry.has('demo')).toBe(true);
  });

  it('缺 version 抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register(makePlugin({ version: undefined as unknown as string })),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('非法 tier 抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register(makePlugin({ tier: 'coree' as never })),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('provides 含非法元素抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register(makePlugin({ provides: ['ok', 42 as never] })),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('config 为数组抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register(makePlugin({ config: [] as never })),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('dependencies 含非字符串抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register(makePlugin({ dependencies: [1 as never] })),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('inject 含非布尔值抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register({
        manifest: { id: 'bad-inject', version: '1.0.0' },
        inject: { logger: 'yes' as never },
        register() {},
      }),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('ui.rpc 非法抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register({
        manifest: { id: 'bad-rpc', version: '1.0.0' },
        ui: { content: 'x', rpc: { svc: ['ok', 1 as never] } },
        register() {},
      }),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });

  it('name 非字符串抛 InvalidPluginError', async () => {
    const harness = createHarness({ bus: createEventBus() });
    await expect(
      harness.registry.register(makePlugin({ name: 123 as never })),
    ).rejects.toBeInstanceOf(InvalidPluginError);
  });
});
