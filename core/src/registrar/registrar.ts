import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import type { PluginEvent } from '../events/types.js';
import { DuplicatePluginError, InvalidPluginError, PluginNotFoundError } from './errors.js';
import type {
  Plugin,
  PluginContext,
  RegisterOptions,
  RegisteredPlugin,
  Registrar,
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
  service: unknown;
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
  const history: PluginEvent[] = [];
  bus.subscribe((e) => {
    history.push(e);
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit);
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
      bucket.set(providerId, { service, access, scope, lifetime, providerId });
      emit('service-register', name, { access, lifetime, providerId, scope });
    },
    get<T = unknown>(name: string, providerId?: string): T | undefined {
      const bucket = bindings.get(name);
      if (!bucket || bucket.size === 0) return undefined;
      if (providerId) return bucket.get(providerId)?.service as T | undefined;
      return bucket.values().next().value?.service as T | undefined;
    },
    getAll<T = unknown>(name: string): T[] {
      const bucket = bindings.get(name);
      if (!bucket) return [];
      return [...bucket.values()].map((e) => e.service as T);
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
        emit('service-unregister', name, { providerId });
        if (bucket.size === 0) bindings.delete(name);
        return;
      }
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

  function pickVisible(name: string, viewerPluginId: string, trusted: boolean): unknown {
    return visibleEntries(name, viewerPluginId, trusted)[0]?.service;
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
    return { ...(plugin.manifest.config ?? {}), ...globalPart };
  }

  function makeContext(plugin: Plugin): PluginContext {
    const trusted = plugin.manifest.trusted === true;
    const viewerId = plugin.manifest.id;
    let self: PluginContext;
    const base: PluginContext = {
      config: mergedConfig(plugin),
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
            return entry.service as T;
          }
          return pickVisible(name, viewerId, trusted) as T | undefined;
        },
        getAll<T = unknown>(name: string): T[] {
          return visibleEntries(name, viewerId, trusted).map((e) => e.service as T);
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
            const svc = pickVisible(name, viewerId, trusted);
            if (svc !== undefined) return svc as T;
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
    if (!plugin || !plugin.manifest || !plugin.manifest.id) {
      throw new InvalidPluginError('缺少有效 manifest（含唯一 id）');
    }
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
    await plugin.register(ctx);
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
    const victims: string[] = [];
    for (const [pid, names] of requiredInject) {
      const broken = names.filter((n) => {
        if (!provided.includes(n)) return false;
        // 仍有其它提供方则保留
        return (bindings.get(n)?.size ?? 0) === 0;
      });
      if (broken.length > 0) victims.push(pid);
    }
    for (const vid of victims) {
      if (registry.has(vid)) {
        emit('inject-cascade', vid, { because: id, services: provided });
        await unregister(vid);
      }
    }
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

  return { register, unregister, get, list, has, contextOf, services };
}
