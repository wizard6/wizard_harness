import type { PluginEvent } from '../events/types.js';
import type { PluginContext, ServiceRegisterOptions } from './types.js';

/**
 * 插件上下文工厂：把 registrar 的状态（配置/事件/服务视图/副作用）组装成
 * 单个插件的受限上下文（PluginContext）。与生命周期解耦，依赖经 deps 注入。
 */
export interface ContextDeps {
  /** 当前合并配置（默认值 + 全局分片 + 运行时覆盖） */
  config(): Readonly<Record<string, unknown>>;
  /** 配置热更新订阅（返回取消函数） */
  onConfig(
    listener: (
      next: Readonly<Record<string, unknown>>,
      prev: Readonly<Record<string, unknown>>,
      patch: Record<string, unknown>,
    ) => void,
  ): () => void;
  /** 以本插件身份发事件（actor=plugin:<id>） */
  emit(event: Omit<PluginEvent, 'id' | 'ts' | 'actor'>): void;
  /** 把 disposer 压入插件可逆链（卸载/回滚时 LIFO 执行） */
  pushEffect(dispose: () => void): void;
  /** 按 action key 注册事件监听（返回取消函数） */
  subscribeAction(action: string, handler: (event: PluginEvent) => void): () => void;
  /** 取当前视图内服务（Proxy 属性访问与 ctx.get 共用） */
  get<T = unknown>(name: string): T | undefined;
  provide(name: string, service: unknown, opts?: ServiceRegisterOptions): void;
  /** 事件化服务调用 */
  call<T = unknown>(
    service: string,
    method: string,
    args?: unknown,
    opts?: { timeoutMs?: number },
  ): Promise<T>;
  /** 服务消费视图（按本 ctx 的 scope 合并） */
  services: PluginContext['services'];
  /** 全量事件流订阅（观测侧） */
  subscribe(listener: (event: PluginEvent) => void): () => void;
  /** 事件历史快照 */
  history(): PluginEvent[];
  /** 清空内存事件缓冲 */
  clearHistory(): void;
}

/** 构造插件上下文。Cordis：ctx.logger 等同 ctx.get('logger')（Proxy 属性注入）。 */
export function makePluginContext(pluginId: string, deps: ContextDeps): PluginContext {
  let self: PluginContext;
  const base: PluginContext = {
    config: deps.config(),
    onConfig: deps.onConfig,
    emit: deps.emit,
    effect(callback) {
      const dispose = callback(self!) ?? (() => {});
      deps.pushEffect(dispose);
    },
    on(action, handler) {
      const off = deps.subscribeAction(action, handler);
      // 卸载/回滚自动取消：复用 effect 可逆链（LIFO），与手动取消幂等
      self!.effect(() => off);
      return off;
    },
    get: deps.get,
    provide: deps.provide,
    call: deps.call,
    services: deps.services,
    events: {
      subscribe: deps.subscribe,
      history: deps.history,
      clear: deps.clearHistory,
    },
  };
  self = new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target)) {
        const svc = deps.get(prop);
        if (svc !== undefined) return svc;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return self;
}
