import { describe, expect, it, vi } from 'vitest';
import { createDispatcher } from '../src/events/dispatcher.js';
import type { Dispatcher, DispatcherEvents } from '../src/events/dispatcher.js';

/** 类型化演示：action → 处理器签名 */
interface DemoEvents extends DispatcherEvents {
  'notify': (msg: string, level?: number) => void;
  'transform': (n: number) => number;
  'pipeline': () => number;
  'init': () => string | undefined;
  'fetch': () => Promise<string>;
  'check': () => string | undefined;
}

function make(): Dispatcher<DemoEvents> {
  return createDispatcher<DemoEvents>();
}

describe('dispatcher 注册管理', () => {
  it('on 返回取消函数；取消后不再触发', () => {
    const d = make();
    const fn = vi.fn();
    const off = d.on('notify', fn);
    d.emit('notify', 'hi');
    off();
    d.emit('notify', 'bye');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('off / clear / has', () => {
    const d = make();
    const a = vi.fn();
    const b = vi.fn();
    d.on('notify', a);
    d.on('notify', b);
    expect(d.has('notify')).toBe(true);
    d.off('notify', a);
    d.emit('notify', 'x');
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    d.clear('notify');
    expect(d.has('notify')).toBe(false);
    d.clear();
    expect(d.has('notify')).toBe(false);
  });

  it('同一 handler 重复注册只保留一份', () => {
    const d = make();
    const fn = vi.fn();
    d.on('notify', fn);
    d.on('notify', fn);
    d.emit('notify', 'x');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('emit：同步按序广播，无返回值，异常隔离', () => {
  it('按注册顺序同步调用，参数透传', () => {
    const d = make();
    const order: string[] = [];
    d.on('notify', (msg) => order.push(`a:${msg}`));
    d.on('notify', (msg) => order.push(`b:${msg}`));
    d.emit('notify', 'hi', 1);
    expect(order).toEqual(['a:hi', 'b:hi']);
  });

  it('handler 抛错被隔离：不影响后续，也不向调用方抛出', () => {
    const d = make();
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    const after = vi.fn();
    d.on('notify', boom);
    d.on('notify', after);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => d.emit('notify', 'hi')).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe('waterfall：同步链式，返回值逐环传递', () => {
  it('每个 handler 的返回值作为下一环输入，返回最终值', () => {
    const d = make();
    d.on('transform', (n) => n + 1);
    d.on('transform', (n) => n * 10);
    expect(d.waterfall('transform', 1)).toBe(20);
  });

  it('返回 undefined 的环节不修改 value', () => {
    const d = make();
    d.on('transform', () => undefined);
    d.on('transform', (n) => n + 5);
    expect(d.waterfall('transform', 1)).toBe(6);
  });

  it('next 为显式透传钩子，等价于 return value', () => {
    const d = make();
    d.on('transform', (n, next) => (n === 0 ? next(100) : n));
    d.on('transform', (n) => n + 1);
    expect(d.waterfall('transform', 0)).toBe(101);
  });

  it('无 handler 时原样返回 value', () => {
    const d = make();
    expect(d.waterfall('pipeline', 42)).toBe(42);
  });

  it('handler 抛错向上传播（管道语义，不隔离）', () => {
    const d = make();
    d.on('transform', () => {
      throw new Error('pipe');
    });
    expect(() => d.waterfall('transform', 1)).toThrow('pipe');
  });
});

describe('serial：异步按序，第一个非空结果短路', () => {
  it('await 每个 handler；遇到非空立即返回，后续不执行', async () => {
    const d = make();
    const order: string[] = [];
    d.on('init', async () => {
      order.push('a');
      return undefined;
    });
    d.on('init', async () => {
      order.push('b');
      return 'ready';
    });
    d.on('init', async () => {
      order.push('c');
      return 'late';
    });
    await expect(d.serial('init')).resolves.toBe('ready');
    expect(order).toEqual(['a', 'b']);
  });

  it('null 视为空不短路；全部为空返回 undefined', async () => {
    const d = make();
    d.on('init', () => undefined);
    await expect(d.serial('init')).resolves.toBeUndefined();
    const d2 = make();
    d2.on('init', () => null);
    d2.on('init', () => 'x');
    await expect(d2.serial('init')).resolves.toBe('x');
  });

  it('严格按序：a 完成后 b 才启动', async () => {
    const d = make();
    const order: string[] = [];
    d.on('init', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('slow');
      return undefined;
    });
    d.on('init', async () => {
      order.push('fast');
      return undefined;
    });
    await d.serial('init');
    expect(order).toEqual(['slow', 'fast']);
  });
});

describe('parallel：异步并行，等待全部完成，无返回值', () => {
  it('并发启动所有 handler 并等待；顺序不影响结果', async () => {
    const d = make();
    const started: string[] = [];
    const done: string[] = [];
    d.on('fetch', async () => {
      started.push('a');
      await new Promise((r) => setTimeout(r, 20));
      done.push('a');
      return 'A';
    });
    d.on('fetch', async () => {
      started.push('b');
      await new Promise((r) => setTimeout(r, 5));
      done.push('b');
      return 'B';
    });
    await d.parallel('fetch');
    // 并发：两个都在任一完成前已启动
    expect(started).toEqual(['a', 'b']);
    expect(done).toEqual(['b', 'a']);
  });

  it('任一 reject 则整体 reject', async () => {
    const d = make();
    d.on('fetch', async () => {
      throw new Error('fetch-fail');
    });
    d.on('fetch', async () => 'ok');
    await expect(d.parallel('fetch')).rejects.toThrow('fetch-fail');
  });
});

describe('bail：同步按序，第一个 truthy 结果短路', () => {
  it('返回第一个 truthy，后续不执行', () => {
    const d = make();
    const order: string[] = [];
    d.on('check', () => {
      order.push('a');
      return undefined;
    });
    d.on('check', () => {
      order.push('b');
      return 'allowed';
    });
    d.on('check', () => {
      order.push('c');
      return 'late';
    });
    expect(d.bail('check')).toBe('allowed');
    expect(order).toEqual(['a', 'b']);
  });

  it('假值（0/""/false/null）不短路；全部假值返回 undefined', () => {
    const d = make();
    d.on('check', () => 0);
    d.on('check', () => '');
    d.on('check', () => false);
    expect(d.bail('check')).toBeUndefined();
  });

  it('handler 抛错向上传播', () => {
    const d = make();
    d.on('check', () => {
      throw new Error('bail-fail');
    });
    expect(() => d.bail('check')).toThrow('bail-fail');
  });
});
