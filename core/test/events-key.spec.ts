import { describe, expect, it } from 'vitest';
import { createEventBus, createHarness } from '../src/index.js';
import type { Plugin, PluginContext, PluginEvent } from '../src/index.js';

/** 构造一个 register 时执行给定逻辑的插件 */
function makePlugin(id: string, register: (ctx: PluginContext) => void): Plugin {
  return {
    manifest: { id, version: '1.0.0' },
    register,
  };
}

function makeEmitter(id: string, action: string, target?: string): Plugin {
  return makePlugin(id, (ctx) => {
    ctx.emit({ action, target, payload: { from: id } });
  });
}

describe('ctx.on（按 action key 订阅，key-based 通信侧）', () => {
  it('只收到 action 精确匹配的事件，收不到其它 action', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const got: PluginEvent[] = [];
    const other: PluginEvent[] = [];
    await harness.registry.register(makePlugin('listener', (ctx) => {
      ctx.on('ping', (e) => got.push(e));
      ctx.on('pong', (e) => other.push(e));
    }));
    await harness.registry.register(makeEmitter('sender', 'ping', 'world'));

    expect(got).toHaveLength(1);
    expect(got[0].action).toBe('ping');
    expect(got[0].target).toBe('world');
    expect(other).toHaveLength(0);
  });

  it('同 action 多个订阅者都收到，互不干扰', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const a: string[] = [];
    const b: string[] = [];
    await harness.registry.register(makePlugin('listener', (ctx) => {
      ctx.on('ping', (e) => a.push(e.target ?? ''));
      ctx.on('ping', (e) => b.push(e.target ?? ''));
    }));
    await harness.registry.register(makeEmitter('sender', 'ping', 'x'));
    expect(a).toEqual(['x']);
    expect(b).toEqual(['x']);
  });

  it('手动取消订阅后不再收到', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const got: string[] = [];
    let off: () => void = () => {};
    await harness.registry.register(makePlugin('listener', (ctx) => {
      off = ctx.on('ping', () => got.push('hit'));
    }));
    await harness.registry.register(makeEmitter('s1', 'ping'));
    off();
    await harness.registry.register(makeEmitter('s2', 'ping'));
    expect(got).toEqual(['hit']);
  });

  it('插件卸载后监听器自动取消（零残留），重注册不重复收到', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const got: string[] = [];
    await harness.registry.register(
      makePlugin('listener', (ctx) => {
        ctx.on('ping', () => got.push('hit'));
      }),
    );
    await harness.registry.register(makeEmitter('s1', 'ping'));
    await harness.registry.unregister('listener');
    // 卸载后事件不再触发该监听器
    await harness.registry.register(makeEmitter('s2', 'ping'));
    expect(got).toEqual(['hit']);
    // 重注册后是新监听器，且只收到之后的事件
    await harness.registry.register(
      makePlugin('listener', (ctx) => {
        ctx.on('ping', () => got.push('again'));
      }),
    );
    await harness.registry.register(makeEmitter('s3', 'ping'));
    expect(got).toEqual(['hit', 'again']);
  });

  it('与 ctx.events.subscribe 全量观测流并存：on 按 key、subscribe 全收', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const keyed: string[] = [];
    const all: string[] = [];
    await harness.registry.register(makePlugin('listener', (ctx) => {
      ctx.on('ping', (e) => keyed.push(e.action));
      ctx.events.subscribe((e) => all.push(e.action));
    }));
    await harness.registry.register(makeEmitter('sender', 'pong'));
    expect(keyed).toEqual([]);
    expect(all).toContain('pong'); // 全量流能观测到其它 action
  });

  it('监听器抛错被隔离，不打断同 action 其它监听器', async () => {
    const harness = createHarness({ bus: createEventBus() });
    const got: string[] = [];
    await harness.registry.register(makePlugin('listener', (ctx) => {
      ctx.on('ping', () => {
        throw new Error('boom');
      });
      ctx.on('ping', () => got.push('ok'));
    }));
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => errs.push(args);
    try {
      await harness.registry.register(makeEmitter('sender', 'ping'));
    } finally {
      console.error = orig;
    }
    expect(got).toEqual(['ok']);
    expect(errs.length).toBeGreaterThan(0);
  });
});
