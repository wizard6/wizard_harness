/**
 * 中间件式事件分发器（Cordis 五种分发模式）。
 *
 * 与观察者式 EventBus（subscribe(sink) 广播 PluginEvent）并列：
 * - EventBus：一条事件对象广播给所有 sink，落盘观测用。
 * - Dispatcher：按 action 注册中间件，触发时按模式决定调用与返回值语义。
 *
 * 五种模式一句话：
 * - emit      想通知 → 同步按序广播，忽略返回值（一坏不坏全部，异常隔离）。
 * - waterfall 想改数据 → 同步链式，返回值逐环传递，返回最终值。
 * - serial    想排队 → 异步按序，await 每个，第一个非空结果短路返回。
 * - parallel  想并发 → 异步并行，等待全部完成，无返回值。
 * - bail      想抢答 → 同步按序，第一个 truthy 结果短路返回。
 *
 * 类型化：createDispatcher<Events>()，Events 为 action → 处理器签名映射，
 * on/emit/serial/parallel/bail 均按签名检查参数。
 */
export type DispatcherEvents = Record<string, (...args: never[]) => unknown>;

/** 一个 action 下按注册顺序排列的处理器集合 */
type HandlerSet = Set<(...args: never[]) => unknown>;

export interface Dispatcher<E extends DispatcherEvents = DispatcherEvents> {
  /** 注册中间件，返回取消订阅函数（幂等：同一 handler 重复注册只保留一份） */
  on<K extends keyof E>(action: K, handler: E[K]): () => void;
  /** 显式移除一个已注册的中间件 */
  off<K extends keyof E>(action: K, handler: E[K]): void;
  /** 清空全部（或不传 action 时的所有）中间件 */
  clear(action?: keyof E): void;
  /** 该 action 是否已有中间件 */
  has<K extends keyof E>(action: K): boolean;

  /**
   * emit：同步按序执行，无返回值。单个 handler 抛错隔离（记 console.error），
   * 不打断后续 handler，也不向调用方抛出。
   */
  emit<K extends keyof E>(action: K, ...args: Parameters<E[K]>): void;
  /**
   * waterfall：同步链式，有返回值。
   * 第一个参数为初始 value；每个 handler 以 (value, next, ...args) 调用，
   * 返回值（若 !== undefined）作为下一环的 value；next 为显式透传（等价 return value）。
   * 返回最后一个 handler 之后的最终 value；无 handler 时原样返回 value。
   * 与 emit 不同：抛错向上传播（管道语义，调用方需要知道中断）。
   */
  waterfall<K extends keyof E, V>(
    action: K,
    value: V,
    ...args: Parameters<E[K]>
  ): V;
  /**
   * serial：异步按序执行，有返回值。
   * 逐个 await，遇到第一个「非空」（!= null）结果立即短路返回；全部为空返回 undefined。
   */
  serial<K extends keyof E>(
    action: K,
    ...args: Parameters<E[K]>
  ): Promise<Awaited<ReturnType<E[K]>> | undefined>;
  /**
   * parallel：异步并行执行，无返回值。
   * 所有 handler 并发启动，等待全部完成；任一 reject 则整体 reject。
   */
  parallel<K extends keyof E>(action: K, ...args: Parameters<E[K]>): Promise<void>;
  /**
   * bail：同步按序执行，有返回值。
   * 遇到第一个 truthy 结果立即短路返回；全部为假值返回 undefined。
   */
  bail<K extends keyof E>(
    action: K,
    ...args: Parameters<E[K]>
  ): ReturnType<E[K]> | undefined;
}

/** 创建中间件式分发器。Events 为 action → 处理器签名映射（默认宽松）。 */
export function createDispatcher<E extends DispatcherEvents = DispatcherEvents>(): Dispatcher<E> {
  const listeners = new Map<keyof E, HandlerSet>();

  function setOf<K extends keyof E>(action: K): HandlerSet {
    let set = listeners.get(action);
    if (!set) {
      set = new Set();
      listeners.set(action, set);
    }
    return set;
  }

  /** 快照遍历：handler 在遍历中 on/off 不影响本轮 */
  function snapshot<K extends keyof E>(action: K): Array<E[K]> {
    return [...(listeners.get(action) ?? [])] as unknown as Array<E[K]>;
  }

  return {
    on(action, handler) {
      setOf(action).add(handler as (...args: never[]) => unknown);
      return () => {
        listeners.get(action)?.delete(handler as (...args: never[]) => unknown);
      };
    },
    off(action, handler) {
      listeners.get(action)?.delete(handler as (...args: never[]) => unknown);
    },
    clear(action) {
      if (action === undefined) listeners.clear();
      else listeners.delete(action);
    },
    has(action) {
      return (listeners.get(action)?.size ?? 0) > 0;
    },

    emit(action, ...args) {
      for (const handler of snapshot(action)) {
        try {
          (handler as (...a: never[]) => unknown)(...args);
        } catch (err) {
          // 通知语义：单个中间件异常不打断后续，也不向调用方抛出；错误留痕
          console.error(`[dispatcher] emit '${String(action)}' handler error:`, err);
        }
      }
    },

    waterfall<K extends keyof E, V>(
      action: K,
      value: V,
      ...args: Parameters<E[K]>
    ): V {
      let current = value;
      // next：显式透传钩子（等价于 return value）
      const next = (v: typeof current): typeof current => v;
      for (const handler of snapshot(action)) {
        const out = (
          handler as unknown as (v: unknown, n: typeof next, ...a: never[]) => unknown
        )(current, next, ...args);
        if (out !== undefined) current = out as V;
      }
      return current;
    },

    async serial<K extends keyof E>(
      action: K,
      ...args: Parameters<E[K]>
    ): Promise<Awaited<ReturnType<E[K]>> | undefined> {
      for (const handler of snapshot(action)) {
        const out = await (handler as (...a: never[]) => unknown)(...args);
        if (out != null) return out as Awaited<ReturnType<E[K]>>;
      }
      return undefined;
    },

    async parallel<K extends keyof E>(action: K, ...args: Parameters<E[K]>): Promise<void> {
      const pending = snapshot(action).map((handler) =>
        (handler as (...a: never[]) => unknown)(...args),
      );
      await Promise.all(pending);
    },

    bail<K extends keyof E>(
      action: K,
      ...args: Parameters<E[K]>
    ): ReturnType<E[K]> | undefined {
      for (const handler of snapshot(action)) {
        const out = (handler as (...a: never[]) => unknown)(...args);
        if (out) return out as ReturnType<E[K]>;
      }
      return undefined;
    },
  };
}
