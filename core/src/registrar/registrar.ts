import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import { createRpc } from '../events/rpc.js';
import type { Rpc } from '../events/rpc.js';
import type { PluginEvent } from '../events/types.js';
import { createServiceRegistry } from './service-registry.js';
import type { ServiceRegistryBundle } from './service-registry.js';
import { createLifecycle } from './lifecycle.js';
import { makePluginContext } from './context.js';
import {
  attachScopeFork,
  eventSubjectOf,
  scopeAdmits,
  scopeOf,
  setEventSubject,
  tagContext,
} from '../scope/index.js';
import type { ScopeKey } from '../scope/index.js';
import type { Plugin, PluginContext, Registrar } from './types.js';

export interface CreateRegistrarOptions {
  bus: EventBus;
  /** 全局配置：按插件 id 分片注入（如 { logger: { level: 'debug' } }），覆盖插件默认值 */
  config?: Readonly<Record<string, unknown>>;
  /** 事件历史缓冲上限（ctx.events.history 可查；默认 500） */
  historyLimit?: number;
}

/**
 * 注册器：把独立子模块装配成统一的插件注册器。
 * 职责划分：
 * - 服务注册表     → service-registry.ts（一名多提供方、可见性、懒加载）
 * - 事件化 RPC    → events/rpc.ts（传输层：路由/协议/超时）
 * - 插件生命周期   → lifecycle.ts（register/unregister/reload/级联）
 * - 插件上下文     → context.ts（PluginContext 工厂）
 * 本文件只做：持有状态、装配子模块、配置管理（合并/热更新）。
 */
export function createRegistrar(opts: CreateRegistrarOptions): Registrar {
  const { bus, config = {}, historyLimit = 500 } = opts;
  const registry = new Map<string, Plugin>();
  const contexts = new Map<string, PluginContext>();
  /** 插件 trusted 标记（独立于 registry：插件在 register 阶段发起的调用也要能正确鉴权） */
  const trustedMap = new Map<string, boolean>();
  /** 已加载插件的必选 inject 名（Cordis：卸载提供方时级联） */
  const requiredInject = new Map<string, string[]>();
  /** 可逆副作用：插件 id → 撤销函数栈（LIFO）。存 registrar 层而非 ctx，
   *  保证 onStop 的 fallback ctx 也不会丢 effect 链。 */
  const effects = new Map<string, Array<() => void>>();
  /** 运行时配置覆盖：pluginId → patch（优先级最高，热更新入口） */
  const configOverrides = new Map<string, Record<string, unknown>>();
  /** 配置热更新监听器：pluginId → Set<listener> */
  const configListeners = new Map<
    string,
    Set<(next: Readonly<Record<string, unknown>>, prev: Readonly<Record<string, unknown>>, patch: Record<string, unknown>) => void>
  >();
  const history: PluginEvent[] = [];
  /** 按 action key 路由的插件事件订阅（通信侧）；events.subscribe 是全量观测流 */
  const actionListeners = new Map<string, Set<{ handler: (e: PluginEvent) => void; tag?: ScopeKey }>>();
  bus.subscribe((e) => {
    history.push(e);
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit);
    const set = actionListeners.get(e.action);
    if (!set || set.size === 0) return;
    const subject = eventSubjectOf(e);
    for (const sub of [...set]) {
      if (!scopeAdmits(sub.tag, subject)) continue;
      try {
        sub.handler(e);
      } catch (err) {
        console.error(`[registrar] on('${e.action}') 监听器抛错:`, err);
      }
    }
  });

  function emit(action: string, target?: string, payload?: unknown): void {
    bus.emit({
      id: randomUUID(),
      ts: Date.now(),
      actor: 'core.registrar',
      action,
      target,
      payload,
    });
  }

  // 事件化 RPC：executor 委托给服务注册表（实例解析 + 执行侧权限校验）。
  // rpc 与 service-registry 通过 onBind/onUnbind 与 resolve/authorize 双向解耦，不互相依赖。
  let rpc: Rpc;
  const sreg: ServiceRegistryBundle = createServiceRegistry({
    emit,
    getContext: (providerId) => contexts.get(providerId),
    isTrusted: (pluginId) => trustedMap.get(pluginId) === true,
    onBind: (name, providerId) => rpc.attach(name, providerId),
    onUnbind: (name, providerId) => rpc.detach(name, providerId),
  });
  rpc = createRpc(bus, {
    resolve: (service, providerId, scope) => sreg.resolveInstance(service, providerId, scope),
    authorize: (service, providerId, actor, scope) => sreg.authorizeCall(service, providerId, actor, scope),
  });

  /** 事件化服务调用（请求-响应，全程走事件总线）。路由决策 + 权限门在发起侧完成。 */
  function wrapCall<T = unknown>(
    viewerId: string,
    trusted: boolean,
    service: string,
    method: string,
    args?: unknown,
    opts?: { timeoutMs?: number },
    scope?: ScopeKey,
  ): Promise<T> {
    const target = sreg.pickTarget(service, viewerId, trusted, scope);
    if (!target) {
      return Promise.reject(new Error(`服务不可用：${service}`));
    }
    return rpc.call<T>(viewerId, service, method, args, {
      ...opts,
      providerId: target.providerId,
      scope,
    });
  }

  /** 配置合并：插件默认值 < 全局分片 < 运行时热更新覆盖 */
  function mergedConfig(plugin: Plugin): Readonly<Record<string, unknown>> {
    const globalPart = (config[plugin.manifest.id] ?? {}) as Record<string, unknown>;
    const override = configOverrides.get(plugin.manifest.id) ?? {};
    return { ...(plugin.manifest.config ?? {}), ...globalPart, ...override };
  }

  /** 配置热更新：合并补丁到运行时覆盖层，替换 ctx.config 引用并通知订阅者 */
  function updateConfig(pluginId: string, patch: Record<string, unknown>): void {
    const ctx = contexts.get(pluginId);
    const plugin = registry.get(pluginId);
    if (!ctx || !plugin) return;
    const prev = ctx.config;
    const overridden = { ...(configOverrides.get(pluginId) ?? {}), ...patch };
    configOverrides.set(pluginId, overridden);
    const next = mergedConfig(plugin);
    (ctx as { config: Readonly<Record<string, unknown>> }).config = next;
    for (const cb of configListeners.get(pluginId) ?? []) {
      try {
        cb(next, prev, patch);
      } catch (err) {
        console.error(`[registrar] config 监听器抛错（${pluginId}）:`, err);
      }
    }
    emit('config-update', pluginId, { patch });
  }

  /** 构造插件上下文；key 存在则为 createScope 派生的打标 ctx */
  function bindContext(
    plugin: Plugin,
    pushEffect: (dispose: () => void) => void,
    key?: ScopeKey,
  ): PluginContext {
    const trusted = plugin.manifest.trusted === true;
    const viewerId = plugin.manifest.id;
    let self!: PluginContext;
    const currentScope = (): ScopeKey | undefined => scopeOf(self);

    const servicesView: PluginContext['services'] = {
      get<T = unknown>(name: string, providerId?: string): T | undefined {
        const scope = currentScope();
        if (providerId) {
          if (!sreg.authorizeCall(name, providerId, `plugin:${viewerId}`, scope)) return undefined;
          return sreg.resolveInstance(name, providerId, scope) as T | undefined;
        }
        return sreg.pickVisible(name, viewerId, trusted, scope) as T | undefined;
      },
      getAll<T = unknown>(name: string): T[] {
        const scope = currentScope();
        return sreg.visibleEntries(name, viewerId, trusted, scope).map((e) =>
          sreg.resolveInstance(name, e.providerId, scope),
        ) as T[];
      },
      providers(name) {
        return sreg.visibleEntries(name, viewerId, trusted, currentScope()).map((e) => e.providerId);
      },
      list() {
        return sreg
          .listInScope(currentScope())
          .filter((name) => sreg.visibleEntries(name, viewerId, trusted, currentScope()).length > 0);
      },
      async waitFor<T = unknown>(name: string, timeoutMs = 5000): Promise<T | undefined> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const scope = currentScope();
          if (sreg.visibleEntries(name, viewerId, trusted, scope).length > 0) {
            return sreg.pickVisible(name, viewerId, trusted, scope) as T | undefined;
          }
          if (Date.now() >= deadline) return undefined;
          await new Promise((r) => setTimeout(r, 100));
        }
      },
    };

    self = makePluginContext(viewerId, {
      config: () => mergedConfig(plugin),
      onConfig(listener) {
        let set = configListeners.get(viewerId);
        if (!set) {
          set = new Set();
          configListeners.set(viewerId, set);
        }
        set.add(listener);
        return () => set.delete(listener);
      },
      emit(event) {
        const rec = {
          id: randomUUID(),
          ts: Date.now(),
          actor: `plugin:${viewerId}`,
          action: event.action,
          target: event.target,
          payload: event.payload,
        };
        setEventSubject(rec, currentScope());
        bus.emit(rec);
      },
      pushEffect,
      subscribeAction(action, handler) {
        let set = actionListeners.get(action);
        if (!set) {
          set = new Set();
          actionListeners.set(action, set);
        }
        const sub = { handler, tag: currentScope() };
        set.add(sub);
        return () => {
          set.delete(sub);
        };
      },
      get: <T = unknown>(name: string) =>
        sreg.pickVisible(name, viewerId, trusted, currentScope()) as T | undefined,
      provide(name, service, opts) {
        sreg.services.register(name, service, { providerId: viewerId, ...opts, ctx: self });
      },
      call: (service, method, args, opts) =>
        wrapCall(viewerId, trusted, service, method, args, opts, currentScope()),
      services: servicesView,
      subscribe: (listener) => bus.subscribe(listener),
      history: () => [...history],
    });
    if (key) tagContext(self, key);
    attachScopeFork(self, (nextKey, pe) => bindContext(plugin, pe, nextKey));
    return self;
  }

  function makeContext(plugin: Plugin): PluginContext {
    return bindContext(plugin, (dispose) => {
      let list = effects.get(plugin.manifest.id);
      if (!list) {
        list = [];
        effects.set(plugin.manifest.id, list);
      }
      list.push(dispose);
    });
  }

  const lifecycle = createLifecycle({
    registry,
    contexts,
    trustedMap,
    requiredInject,
    effects,
    emit,
    services: sreg,
    makeContext,
  });

  function get(id: string): Plugin | undefined {
    return registry.get(id);
  }

  function list(): Plugin[] {
    return [...registry.values()];
  }

  function has(id: string): boolean {
    return registry.has(id);
  }

  function contextOf(id: string): PluginContext | undefined {
    return contexts.get(id);
  }

  return {
    register: lifecycle.register,
    unregister: lifecycle.unregister,
    get,
    list,
    has,
    contextOf,
    call: (service, method, args, opts) => wrapCall('shell', true, service, method, args, opts),
    updateConfig,
    reload: lifecycle.reload,
    services: sreg.services,
  };
}
