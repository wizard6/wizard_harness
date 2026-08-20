import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '../src/index.js';
import type { Plugin, PluginContext } from '../src/index.js';

/** 提供一个 high 权限服务（console）的 trusted 插件 */
function makeHighServicePlugin(): Plugin {
  return {
    manifest: {
      id: 'console',
      version: '1.0.0',
      provides: ['console'],
      trusted: true,
      highAccessServices: ['console'],
    },
    api: {
      exec(): string {
        return 'executed';
      },
    },
    async register() {},
  };
}

/** untrusted 插件：register 时向总线伪造一条 service-call 事件 */
function makeForgingPlugin(id: string, emit: (ctx: PluginContext) => void): Plugin {
  return {
    manifest: { id, version: '1.0.0' },
    register(ctx) {
      emit(ctx);
    },
  };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50));

describe('事件化 RPC 执行侧权限（P0）', () => {
  it('untrusted 插件伪造 service-call 事件调用 high 服务被拒（不执行）', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let executed = 0;
    const consolePlugin: Plugin = {
      manifest: {
        id: 'console',
        version: '1.0.0',
        provides: ['console'],
        trusted: true,
        highAccessServices: ['console'],
      },
      api: {
        exec() {
          executed++;
          return 'ok';
        },
      },
      async register() {},
    };
    await harness.registry.register(consolePlugin);

    await harness.registry.register(
      makeForgingPlugin('evil', (ctx) => {
        // 直接伪造 service-call：untrusted 插件拿不到 console，但可以往总线发事件
        ctx.emit({
          action: 'service-call',
          target: 'console',
          payload: { method: 'exec', args: ['rm -rf /'], requestId: 'forged-1', providerId: 'console' },
        });
      }),
    );
    await settle();
    expect(executed).toBe(0);

    // 对照：untrusted 插件经 ctx.call 路由也被拒（发起侧可见性门）
    await harness.registry.register(
      makeForgingPlugin('evil2', (ctx) => {
        ctx.call('console', 'exec', ['ls']).catch(() => {});
      }),
    );
    await settle();
    expect(executed).toBe(0);
  });

  it('trusted 插件可经事件化调用 high 服务（对照：权限门放行）', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let executed = 0;
    await harness.registry.register(makeHighServicePlugin());
    const result: string[] = [];
    await harness.registry.register({
      manifest: { id: 'trusted-consumer', version: '1.0.0', trusted: true },
      register(ctx) {
        ctx.call('console', 'exec', ['ls']).then((r) => {
          executed++;
          result.push(String(r));
        });
      },
    });
    await settle();
    expect(executed).toBe(1);
    expect(result[0]).toBe('executed');
  });

  it('提供方自身调用自己的 high 服务放行（自见豁免）', async () => {
    const harness = createHarness({ bus: createEventBus() });
    let executed = 0;
    await harness.registry.register({
      manifest: {
        id: 'console',
        version: '1.0.0',
        provides: ['console'],
        trusted: false,
        highAccessServices: ['console'],
      },
      api: {
        exec() {
          executed++;
          return 'ok';
        },
      },
      async register() {},
      async onStart(ctx) {
        // 服务在 register 后才挂载，onStart 阶段提供方调自己的 high 服务
        ctx.call('console', 'exec', []).catch(() => {});
      },
    });
    await settle();
    expect(executed).toBe(1);
  });
});
