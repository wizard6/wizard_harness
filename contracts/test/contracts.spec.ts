import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '@wizard-harness/core';
import type { Plugin, PluginContext } from '@wizard-harness/core';
import { LOGGER_SERVICE } from '../src/index.js';

describe('服务契约层（@wizard-harness/contracts）', () => {
  it('服务名常量绑定 + ctx.<key> 属性注入（ctx.logger ≡ ctx.get）', async () => {
    // 服务名常量：契约层把名字与接口绑定，插件实现、消费方类型安全
    expect(LOGGER_SERVICE).toBe('logger');

    const harness = createHarness({ bus: createEventBus() });
    const provider: Plugin = {
      manifest: { id: 'logger', version: '1.0.0', provides: ['logger'] },
      api: { info: (m: string) => `[info] ${m}` },
      async register() {},
    };
    let consumerCtx: PluginContext | undefined;
    const consumer: Plugin = {
      manifest: { id: 'consumer', version: '1.0.0' },
      inject: ['logger'],
      async register(c) {
        consumerCtx = c;
      },
    };
    await harness.registry.register(provider);
    await harness.registry.register(consumer);

    // 属性访问（Cordis 风格）：ctx.logger ≡ ctx.get('logger')，同一对象引用
    expect(consumerCtx?.logger).toBeDefined();
    expect(consumerCtx?.logger).toBe(harness.services.get('logger'));
    expect(consumerCtx?.get('logger')).toBe(harness.services.get('logger'));
    expect((consumerCtx?.logger as { info: (m: string) => string }).info('契约层')).toBe('[info] 契约层');
  });
});
