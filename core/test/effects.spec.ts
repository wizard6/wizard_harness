import { describe, expect, it, vi } from 'vitest';
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

describe('ctx.effect（可逆副作用）', () => {
  it('卸载时自动撤销 effect 注册的订阅（总线不再收到该插件回调）', async () => {
    const { bus, harness } = makeHarness();
    const seen: string[] = [];
    const p = plugin('p', (ctx) => {
      ctx.effect(() => ctx.events.subscribe((e) => seen.push(e.actor)));
    });
    await harness.registry.register(p);

    bus.emit({ id: '1', ts: 1, actor: 'x', action: 'a' });
    const before = seen.length;
    expect(seen).toContain('x'); // 订阅生效（此前 register 事件已被捕获，故用长度+包含断言）

    await harness.registry.unregister('p');
    bus.emit({ id: '2', ts: 2, actor: 'y', action: 'b' });
    expect(seen).toHaveLength(before); // 卸载后订阅已撤销，不再收到新事件
    expect(seen).not.toContain('y');
  });

  it('dispose 按注册逆序（LIFO）执行', async () => {
    const { harness } = makeHarness();
    const order: string[] = [];
    const p = plugin('p', (ctx) => {
      ctx.effect(() => {
        order.push('effect-a');
        return () => order.push('dispose-a');
      });
      ctx.effect(() => {
        order.push('effect-b');
        return () => order.push('dispose-b');
      });
    });
    await harness.registry.register(p);
    await harness.registry.unregister('p');
    expect(order).toEqual(['effect-a', 'effect-b', 'dispose-b', 'dispose-a']);
  });

  it('onStop 抛错时 dispose 仍执行（finally 兜底）', async () => {
    const { harness } = makeHarness();
    const disposed: string[] = [];
    const p = plugin(
      'p',
      (ctx) => {
        ctx.effect(() => () => disposed.push('d'));
      },
      {
        async onStop() {
          throw new Error('stop-fail');
        },
      },
    );
    await harness.registry.register(p);
    await expect(harness.registry.unregister('p')).rejects.toThrow('stop-fail');
    expect(disposed).toEqual(['d']);
  });

  it('单个 dispose 抛错不影响其它 dispose 执行（隔离）', async () => {
    const { harness } = makeHarness();
    const done: string[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const p = plugin('p', (ctx) => {
        ctx.effect(() => () => {
          throw new Error('bad-dispose');
        });
        ctx.effect(() => () => done.push('ok'));
      });
      await harness.registry.register(p);
      await harness.registry.unregister('p');
      expect(done).toEqual(['ok']);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('effect 回调收到的是插件自己的 ctx', async () => {
    const { harness } = makeHarness();
    const got: string[] = [];
    const p = plugin('p', (ctx) => {
      ctx.effect((c) => {
        got.push(c === ctx ? 'same' : 'diff');
      });
    });
    await harness.registry.register(p);
    expect(got).toEqual(['same']);
    await harness.registry.unregister('p');
  });

  it('onStart 失败回滚时 dispose 也执行，且不留半注册状态', async () => {
    const { harness } = makeHarness();
    const disposed: string[] = [];
    const p = plugin(
      'p',
      (ctx) => {
        ctx.effect(() => () => disposed.push('d'));
      },
      {
        async onStart() {
          throw new Error('start-fail');
        },
      },
    );
    await expect(harness.registry.register(p)).rejects.toThrow('start-fail');
    expect(disposed).toEqual(['d']);
    expect(harness.registry.has('p')).toBe(false);
  });

  it('卸载后重注册同 id，旧 effect 链不残留', async () => {
    const { harness } = makeHarness();
    let count = 0;
    const mk = () =>
      plugin('p', (ctx) => {
        ctx.effect(() => () => count++);
      });
    await harness.registry.register(mk());
    await harness.registry.unregister('p');
    await harness.registry.register(mk());
    await harness.registry.unregister('p');
    expect(count).toBe(2); // 每轮恰好一次 dispose
  });
});
