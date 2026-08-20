import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import type { PluginEvent } from '../events/types.js';
import { DuplicatePluginError, InvalidPluginError, PluginNotFoundError } from './errors.js';
import { validateManifest } from './validate.js';
import type {
  Plugin,
  PluginContext,
  RegisterOptions,
  RegisteredPlugin,
  Registrar,
  ReloadResult,
  ServiceAccess,
  ServiceBinding,
  ServiceLifetime,
  ServiceRegistry,
  ServiceScope,
} from './types.js';
import { isBindingVisible, normalizeInject, normalizeProvides } from './types.js';

export interface CreateRegistrarOptions {
  bus: EventBus;
  /** 全局配置：按插件 id 分片注入（如 { logger: { level: 'debug' } }），覆盖插件默认值 */
  config?: Readonly<Record<string, unknown>>;
  /** 事件历史缓冲上限（ctx.events.history 可查；默认 500） */
  historyLimit?: number;
}

type BindingEntry = {
  /** 预建对象（api 即服务形态）；提供 factory 时可为 undefined */
  service: unknown;
  /** 懒加载工厂（可选）：首次 get 创建并缓存单例 */
  factory?: (ctx: PluginContext) => unknown;
  /** factory 创建的实例缓存 */
  instance?: unknown;
  access: ServiceAccess;
  scope: ServiceScope;
  lifetime: ServiceLifetime;
  providerId: string;
};

const CTX_OWN = new Set(['config', 'effect', 'emit', 'get', 'services', 'events']);

/** 顺序执行一个插件的全部副作用撤销（LIFO）；单个失败隔离，保证全部执行 */
function runDisposers(list: Array<() => void>, pluginId: string): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const dispose = list[i];
    if (!dispose) continue;
    try {
      dispose();
    } catch (err) {
      console.error(`[registrar] effect dispose 失败（${pluginId}）:`, err);
    }
  }
}

/** 注册器的标准实现。依赖向内：core 不依赖插件，只持有 Plugin 契约。 */
export function createRegistrar(opts: CreateRegistrarOptions): Registrar {
  const { bus, config = {}, historyLimit = 500 } = opts;
  const registry = new Map<string, Plugin>();
  const contexts = new Map<string, PluginContext>();
  /** 已加载插件的必选 inject 名（Cordis：卸载提供方时级联） */
  const requiredInject = new Map<string, string[]>();
  /** 可逆副作用：插件 id → 撤销函数栈（LIFO）。存 registrar 层而非 ctx，
   *  保证 onStop 的 fallback ctx 也不会丢 effect 链。 */
  const effects = new Map<string, Array<() => void>>();
  /** 服务名 → (providerId → 绑定)。一名多提供方、一提供方多名。 */
  const bindings = new Map<string, Map<string, BindingEntry>>();
  /** 运行时配置覆盖：pluginId → patch（优先级最高，热更新入口） */
  const configOverrides = new Map<string, Record<string, unknown>>();
  /** 配置热更新监听器：pluginId → Set<listener> */
  const configListeners = new Map<
    string,
    Set<(next: Readonly<Record<string, unknown>>, prev: Readonly<Record<string, unknown>>, patch: Record<string, unknown>) => void>
  >();
  const history: PluginEvent[] = [];
  /** 按 action key 路由的插件事件订阅（通信侧）；events.subscribe 是全量观测流 */
  const actionListeners = new Map<string, Set<(e: PluginEvent) => void>>();
  bus.subscribe((e) => {
    history.push(e);
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit);
    const set = actionListeners.get(e.action);
    if (!set || set.size === 0) return;
    for (const h of [...set]) {
      try {
        h(e);
      } catch (err) {
        // 单个监听器异常隔离：不打断同 action 的其它监听器
        console.error(`[registrar] on('${e.action}') 监听器抛错:`, err);
      }
    }
  });

  function emit(action: string, target?: string, payload?: unknown): void {
    const event: PluginEvent = {
      id: randomUUID(),
      ts: Date.now(),
      actor: 'core.registrar',
      action,
      target,
      payload,
    };
    bus.emit(event);
  }

  function toMeta(entry: BindingEntry, name: string): ServiceBinding {
    return {
      name,
      providerId: entry.providerId,
      scope: entry.scope,
      access: entry.access,
      lifetime: entry.lifetime,
    };
  }

  /** 取服务实例：factory 懒加载（首次创建并缓存），否则返回预建对象 */
  function ensureInstance(entry: BindingEntry): unknown {
    if (entry.factory) {
      if (entry.instance === undefined) {
        const providerCtx = contexts.get(entry.providerId);
        entry.instance = entry.factory(providerCtx as PluginContext);
      }
      return entry.instance;
    }
    return entry.service;
  }

  const services: ServiceRegistry = {
    register(name, service, opts = {}) {
      const providerId = opts.providerId ?? opts.pluginId ?? name;
      const scope = opts.scope ?? 'harness';
      const lifetime = opts.lifetime ?? 'plugin';
      let bucket = bindings.get(name);
      if (!bucket) {
        bucket = new Map();
        bindings.set(name, bucket);
      }
      if (bucket.has(providerId)) {
        throw new Error(`服务已存在：${name}（提供者 ${providerId}）`);
      }
      const access = opts.access ?? 'low';
      const entry: BindingEntry = {
        service,
        access,
        scope,
        lifetime,
        providerId,
        ...(opts.factory ? { factory: opts.factory } : {}),
      };
      bucket.set(providerId, entry);
      attachServiceHandler(name, providerId);
      emit('service-register', name, { access, lifetime, providerId, scope });
    },
    get<T = unknown>(name: string, providerId?: string): T | undefined {
      const bucket = bindings.get(name);
      if (!bucket || bucket.size === 0) return undefined;
      if (providerId) {
        const entry = bucket.get(providerId);
        return entry ? (ensureInstance(entry) as T) : undefined;
      }
      const first = bucket.values().next().value;
      return first ? (ensureInstance(first) as T) : undefined;
    },
    getAll<T = unknown>(name: string): T[] {
      const bucket = bindings.get(name);
      if (!bucket) return [];
      return [...bucket.values()].map((e) => ensureInstance(e) as T);
    },
    providers(name) {
      const bucket = bindings.get(name);
      return bucket ? [...bucket.keys()] : [];
    },
    providedBy(providerId) {
      const names: string[] = [];
      for (const [name, bucket] of bindings) {
        if (bucket.has(providerId)) names.push(name);
      }
      return names;
    },
    bindings(name) {
      if (name !== undefined) {
        const bucket = bindings.get(name);
        if (!bucket) return [];
        return [...bucket.values()].map((e) => toMeta(e, name));
      }
      const all: ServiceBinding[] = [];
      for (const [n, bucket] of bindings) {
        for (const e of bucket.values()) all.push(toMeta(e, n));
      }
      return all;
    },
    list() {
      return [...bindings.keys()].filter((n) => (bindings.get(n)?.size ?? 0) > 0);
    },
    unregister(name, providerId) {
      const bucket = bindings.get(name);
      if (!bucket) return;
      if (providerId) {
        if (!bucket.delete(providerId)) return;
        detachServiceHandler(name, providerId);
        emit('service-unregister', name, { providerId });
        if (bucket.size === 0) bindings.delete(name);
        return;
      }
      for (const pid of [...bucket.keys()]) detachServiceHandler(name, pid);
      bindings.delete(name);
      emit('service-unregister', name);
    },
  };

  function visibleEntries(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
  ): BindingEntry[] {
    const bucket = bindings.get(name);
    if (!bucket) return [];
    return [...bucket.values()].filter((e) => {
      if (!isBindingVisible(e, viewerPluginId)) return false;
      // 提供方对自己的服务始终可见（high 门槛只约束他方，不拦自己）
      if (e.providerId === viewerPluginId) return true;
      if (e.access === 'high' && !trusted) return false;
      return true;
    });
  }

  /** 服务订阅器（真事件驱动执行）：提供方是事件总线上的订阅者，不与被调用方直接引用 */
  const handlerUnsubs = new Map<string, () => void>();

  function attachServiceHandler(name: string, providerId: string): void {
    const key = `${name}:${providerId}`;
    if (handlerUnsubs.has(key)) return;
    const unsubscribe = bus.subscribe((e) => {
      if (e.action !== 'service-call' || e.target !== name) return;
      const { method, args, requestId, providerId: targetProvider } = e.payload as {
        method?: string;
        args?: unknown;
        requestId?: string;
        providerId?: string;
      };
      if (!requestId || typeof method !== 'string') return;
      // 精确路由：仅被指定的提供方响应（多提供方时只有路由目标执行，不广播）
      if (targetProvider !== undefined && targetProvider !== providerId) return;
      const entry = bindings.get(name)?.get(providerId);
      const svc = entry ? ensureInstance(entry) : undefined;
      const emitResult = (payload: { ok: boolean; result?: unknown; error?: string }) => {
        bus.emit({
          id: randomUUID(),
          ts: Date.now(),
          actor: `plugin:${providerId}`,
          action: 'service-result',
          target: requestId,
          payload,
        });
      };
      if (!svc || typeof (svc as Record<string, unknown>)[method] !== 'function') {
        emitResult({ ok: false, error: `服务 ${name}（${providerId}）无方法 ${method}` });
        return;
      }
      // 延迟到派发栈外执行：避免同步方法阻塞事件总线的其它订阅者
      setImmediate(() => {
        const callArgs = args === undefined ? [] : Array.isArray(args) ? args : [args];
        const fn = (svc as Record<string, unknown>)[method] as
          | ((...a: unknown[]) => unknown)
          | undefined;
        Promise.resolve(fn!.apply(svc, callArgs))
          .then((result) => emitResult({ ok: true, result }))
          .catch((err: unknown) => emitResult({ ok: false, error: String(err) }));
      });
    });
    handlerUnsubs.set(key, unsubscribe);
  }

  function detachServiceHandler(name: string, providerId: string): void {
    const key = `${name}:${providerId}`;
    handlerUnsubs.get(key)?.();
    handlerUnsubs.delete(key);
  }

  function pickVisible(name: string, viewerPluginId: string, trusted: boolean): unknown {
    const first = visibleEntries(name, viewerPluginId, trusted)[0];
    return first ? ensureInstance(first) : undefined;
  }

  /**
   * 事件化服务调用（请求-响应，全程走事件总线）。
   * viewerId=发起方（插件 id 或 'shell'）；trusted=发起方是否可信（high 门槛）。
   */
  function callService<T = unknown>(
    viewerId: string,
    trusted: boolean,
    service: string,
    method: string,
    args?: unknown,
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? 5000;
    // 路由决策：选首个可见提供方，请求精确发给它（多提供方时不广播）
    const target = visibleEntries(service, viewerId, trusted)[0];
    if (!target) {
      return Promise.reject(new Error(`服务不可用：${service}`));
    }
    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (action: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe();
        action();
      };
      const timer = setTimeout(
        () => finish(() => reject(new Error(`服务调用超时：${service}.${method}（requestId=${requestId}）`))),
        timeoutMs,
      );
      // 先订阅结果（同步总线：若先 emit 再订阅，同步响应会丢失）
      const unsubscribe = bus.subscribe((e) => {
        if (e.action !== 'service-result' || e.target !== requestId) return;
        const p = e.payload as { ok?: boolean; result?: unknown; error?: string };
        finish(() => (p.ok ? resolve(p.result as T) : reject(new Error(`${p.error ?? '调用失败'}（requestId=${requestId}）`))));
      });
      // 后发请求事件：经事件总线到达提供方订阅器执行（双方零直接引用）
      bus.emit({
        id: randomUUID(),
        ts: Date.now(),
        actor: `plugin:${viewerId}`,
        action: 'service-call',
        target: service,
        payload: { method, args, requestId, providerId: target.providerId },
      });
    });
  }

  function dropPluginServices(providerId: string): void {
    for (const name of [...bindings.keys()]) {
      services.unregister(name, providerId);
    }
  }

  function accessFor(plugin: Plugin, serviceName: string): ServiceAccess {
    const high = plugin.manifest.highAccessServices ?? [];
    if (high.includes(serviceName) || high.includes(plugin.manifest.id)) return 'high';
    return 'low';
  }

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

  function makeContext(plugin: Plugin): PluginContext {
    const trusted = plugin.manifest.trusted === true;
    const viewerId = plugin.manifest.id;
    let self: PluginContext;
    const base: PluginContext = {
      config: mergedConfig(plugin),
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
        bus.emit({
          id: randomUUID(),
          ts: Date.now(),
          actor: `plugin:${viewerId}`,
          action: event.action,
          target: event.target,
          payload: event.payload,
        });
      },
      on(action, handler) {
        let set = actionListeners.get(action);
        if (!set) {
          set = new Set();
          actionListeners.set(action, set);
        }
        set.add(handler);
        // 卸载/回滚自动取消：复用 effect 可逆链（LIFO），与手动取消幂等
        self!.effect(() => () => {
          set.delete(handler);
        });
        return () => {
          set.delete(handler);
        };
      },
      effect(callback) {
        let list = effects.get(viewerId);
        if (!list) {
          list = [];
          effects.set(viewerId, list);
        }
        const dispose = callback(self!) ?? (() => {});
        list.push(dispose);
      },
      get<T = unknown>(name: string): T | undefined {
        return pickVisible(name, viewerId, trusted) as T | undefined;
      },
      call: (service, method, args, opts) => callService(viewerId, trusted, service, method, args, opts),
      services: {
        get<T = unknown>(name: string, providerId?: string): T | undefined {
          if (providerId) {
            const entry = bindings.get(name)?.get(providerId);
            if (!entry) return undefined;
            if (!isBindingVisible(entry, viewerId)) return undefined;
            // 提供方自见豁免：high 门槛不拦提供方自己
            if (entry.providerId !== viewerId && entry.access === 'high' && !trusted) {
              return undefined;
            }
            return ensureInstance(entry) as T;
          }
          return pickVisible(name, viewerId, trusted) as T | undefined;
        },
        getAll<T = unknown>(name: string): T[] {
          return visibleEntries(name, viewerId, trusted).map((e) => ensureInstance(e) as T);
        },
        providers(name) {
          return visibleEntries(name, viewerId, trusted).map((e) => e.providerId);
        },
        list() {
          const names: string[] = [];
          for (const name of bindings.keys()) {
            if (visibleEntries(name, viewerId, trusted).length > 0) names.push(name);
          }
          return names;
        },
        async waitFor<T = unknown>(name: string, timeoutMs = 5000): Promise<T | undefined> {
          const deadline = Date.now() + timeoutMs;
          for (;;) {
            // 只查绑定存在（不触发懒加载实例化）；出现后再取实例
            if (visibleEntries(name, viewerId, trusted).length > 0) {
              return pickVisible(name, viewerId, trusted) as T | undefined;
            }
            if (Date.now() >= deadline) return undefined;
            await new Promise((r) => setTimeout(r, 100));
          }
        },
      },
      events: {
        subscribe: (listener) => bus.subscribe(listener),
        history: () => [...history],
      },
    };
    // Cordis：ctx.logger 等同 ctx.get('logger')；内置字段不转发
    self = new Proxy(base, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && !CTX_OWN.has(prop) && !(prop in target)) {
          const svc = pickVisible(prop, viewerId, trusted);
          if (svc !== undefined) return svc;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    return self;
  }

  function missingRequiredInject(plugin: Plugin): string[] {
    const trusted = plugin.manifest.trusted === true;
    const viewerId = plugin.manifest.id;
    return normalizeInject(plugin)
      .filter((i) => i.required)
      .filter((i) => pickVisible(i.name, viewerId, trusted) === undefined)
      .map((i) => i.name);
  }

  async function register(
    plugin: Plugin,
    opts: RegisterOptions = {},
  ): Promise<RegisteredPlugin> {
    // 运行时 schema 校验：manifest 畸形尽早抛错
    validateManifest(plugin);
    if (typeof plugin.register !== 'function') {
      throw new InvalidPluginError(`插件缺少 register 函数（${plugin.manifest.id}）`);
    }
    if (registry.has(plugin.manifest.id)) {
      throw new DuplicatePluginError(plugin.manifest.id);
    }
    const missing = missingRequiredInject(plugin);
    if (missing.length > 0) {
      emit('inject-pending', plugin.manifest.id, { missing });
      throw new InvalidPluginError(
        `inject 未就绪（${plugin.manifest.id}）：缺少 ${missing.join(', ')}（请用 harness.boot 按依赖装配）`,
      );
    }
    const ctx = makeContext(plugin);
    try {
      await plugin.register(ctx);
    } catch (err) {
      // register 抛错：撤销已注册的副作用，避免 effects 残留
      runDisposers(effects.get(plugin.manifest.id) ?? [], plugin.manifest.id);
      effects.delete(plugin.manifest.id);
      throw err;
    }
    registry.set(plugin.manifest.id, plugin);
    contexts.set(plugin.manifest.id, ctx);
    requiredInject.set(
      plugin.manifest.id,
      normalizeInject(plugin)
        .filter((i) => i.required)
        .map((i) => i.name),
    );
    const registeredAt = Date.now();
    emit('register', plugin.manifest.id, { version: plugin.manifest.version });
    for (const entry of normalizeProvides(plugin)) {
      services.register(entry.name, plugin.api, {
        access: accessFor(plugin, entry.name),
        providerId: plugin.manifest.id,
        scope: entry.scope,
      });
    }
    const missingDeps = (plugin.manifest.dependencies ?? []).filter((d) => !registry.has(d));
    if (missingDeps.length > 0) {
      emit('dep-missing', plugin.manifest.id, { dependencies: missingDeps });
    }
    // 启动阶段（两阶段装配时由 boot 统一调用；否则在 register 内立即执行）
    const start = async (): Promise<void> => {
      if (!plugin.onStart) return;
      try {
        await plugin.onStart(ctx);
      } catch (err) {
        registry.delete(plugin.manifest.id);
        contexts.delete(plugin.manifest.id);
        requiredInject.delete(plugin.manifest.id);
        dropPluginServices(plugin.manifest.id);
        // 回滚时同样撤销已注册的副作用
        runDisposers(effects.get(plugin.manifest.id) ?? [], plugin.manifest.id);
        effects.delete(plugin.manifest.id);
        emit('start-failed', plugin.manifest.id, { error: String(err) });
        throw err;
      }
      emit('start', plugin.manifest.id);
    };
    if (!opts.deferStart) {
      await start();
    }
    const result: RegisteredPlugin = { plugin, registeredAt, ctx };
    if (opts.deferStart) result.start = start;
    return result;
  }

  async function unregister(id: string, opts: { cascading?: boolean } = {}): Promise<void> {
    const plugin = registry.get(id);
    if (!plugin) {
      throw new PluginNotFoundError(id);
    }
    const provided = normalizeProvides(plugin).map((e) => e.name);
    try {
      if (plugin.onStop) {
        await plugin.onStop(contexts.get(id) ?? makeContext(plugin));
        emit('stop', id);
      }
    } finally {
      // 可逆副作用：onStop 无论成败，撤销函数（LIFO）都执行，保证系统清洁
      runDisposers(effects.get(id) ?? [], id);
      effects.delete(id);
    }
    registry.delete(id);
    contexts.delete(id);
    requiredInject.delete(id);
    dropPluginServices(id);
    emit('unregister', id);

    // Cordis：必选服务消失 → 依赖方一并卸载
    if (opts.cascading === false) return;
    const victims = cascadeVictims(id, provided);
    for (const vid of victims) {
      if (registry.has(vid)) {
        emit('inject-cascade', vid, { because: id, services: provided });
        await unregister(vid);
      }
    }
  }

  /** 计算：卸载提供方 id 后，哪些插件因必选服务消失而应被级联卸载 */
  function cascadeVictims(removedId: string, provided: string[]): string[] {
    const victims: string[] = [];
    for (const [pid, names] of requiredInject) {
      const broken = names.filter((n) => {
        if (!provided.includes(n)) return false;
        // 仍有其它提供方则保留
        return (bindings.get(n)?.size ?? 0) === 0;
      });
      if (broken.length > 0) victims.push(pid);
    }
    return victims;
  }

  /**
   * 热重载：卸载旧插件（含级联依赖方）→ 注册新插件。
   * next 必须与旧插件 id 一致。旧服务订阅器/绑定随卸载摘除，事件化调用自动走新实现。
   */
  async function reload(id: string, next: Plugin): Promise<ReloadResult> {
    const old = registry.get(id);
    if (!old) throw new PluginNotFoundError(id);
    if (next.manifest.id !== id) {
      throw new InvalidPluginError(`reload 插件 id 不一致：${next.manifest.id} !== ${id}`);
    }
    // 预检新插件（validate + 必选 inject），尽量在卸载前失败，减少回滚场景
    validateManifest(next);
    const missingNext = missingRequiredInject(next);
    if (missingNext.length > 0) {
      throw new InvalidPluginError(`reload 新插件 inject 未就绪（${id}）：缺少 ${missingNext.join(', ')}`);
    }
    const provided = normalizeProvides(old).map((e) => e.name);
    const fromVersion = old.manifest.version;

    // 卸载旧插件（级联手动处理，保持 reload 返回的级联列表可观测）
    await unregister(id, { cascading: false });
    // 级联计算需在卸载后（提供方绑定已摘除，服务缺失才成立）
    const victims = cascadeVictims(id, provided);
    for (const vid of victims) {
      if (registry.has(vid)) {
        emit('inject-cascade', vid, { because: id, services: provided });
        await unregister(vid);
      }
    }

    // 注册新插件；失败则回滚旧插件，避免服务图永久残缺
    let registered: RegisteredPlugin;
    try {
      registered = await register(next);
    } catch (err) {
      emit('reload-failed', id, { from: fromVersion, error: String(err), cascaded: victims });
      try {
        await register(old);
        throw new Error(`热重载失败（${id}）并已回滚旧版本 ${fromVersion}：${String(err)}`);
      } catch (rollbackErr) {
        throw new Error(
          `热重载失败（${id}）且回滚也失败：${String(err)} / ${String(rollbackErr)}`,
        );
      }
    }
    emit('reload', id, { from: fromVersion, to: next.manifest.version, cascaded: victims });
    return { plugin: registered, cascaded: victims, replaced: { id, version: fromVersion } };
  }

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
    register,
    unregister,
    get,
    list,
    has,
    contextOf,
    call: (service, method, args, opts) => callService('shell', true, service, method, args, opts),
    updateConfig,
    reload,
    services,
  };
}
