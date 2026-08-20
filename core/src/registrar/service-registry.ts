import type {
  PluginContext,
  ServiceAccess,
  ServiceBinding,
  ServiceLifetime,
  ServiceRegistry,
  ServiceScope,
} from './types.js';
import { isBindingVisible } from './types.js';

/** 一条服务绑定（一名多提供方、一提供方多名） */
export interface BindingEntry {
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
}

export interface ServiceRegistryDeps {
  /** 事件出口（服务注册/注销观测事件） */
  emit(action: string, target?: string, payload?: unknown): void;
  /** 提供方插件上下文（懒加载 factory 需要） */
  getContext(providerId: string): PluginContext | undefined;
  /** 插件是否 trusted（执行侧权限校验需要） */
  isTrusted(pluginId: string): boolean;
  /** 绑定变化时同步外部（如事件化 RPC 路由表） */
  onBind?(name: string, providerId: string): void;
  onUnbind?(name: string, providerId: string): void;
}

export interface ServiceRegistryBundle {
  services: ServiceRegistry;
  /** 消费侧可见条目（scope/access 过滤） */
  visibleEntries(name: string, viewerPluginId: string, trusted: boolean): BindingEntry[];
  /** 消费侧取服务：首个可见绑定的实例（懒加载） */
  pickVisible(name: string, viewerPluginId: string, trusted: boolean): unknown;
  /** 首个可见绑定（供事件化调用路由决策） */
  pickTarget(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
  ): { providerId: string } | undefined;
  /** 执行侧权限校验（事件化 RPC）：actor（plugin:<id> / shell）对该绑定是否可见可用 */
  authorizeCall(service: string, providerId: string, actor: string): boolean;
  /** 卸载插件：摘除其全部服务绑定（触发 onUnbind） */
  dropServices(providerId: string): void;
}

/** 服务注册表标准实现：服务名 × 提供方 多对多，每条带 scope/access/lifetime。 */
export function createServiceRegistry(deps: ServiceRegistryDeps): ServiceRegistryBundle {
  const { emit, getContext, isTrusted, onBind, onUnbind } = deps;
  /** 服务名 → (providerId → 绑定) */
  const bindings = new Map<string, Map<string, BindingEntry>>();

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
        entry.instance = entry.factory(getContext(entry.providerId) as PluginContext);
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
      bucket.set(providerId, {
        service,
        access,
        scope,
        lifetime,
        providerId,
        ...(opts.factory ? { factory: opts.factory } : {}),
      });
      onBind?.(name, providerId);
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
        onUnbind?.(name, providerId);
        emit('service-unregister', name, { providerId });
        if (bucket.size === 0) bindings.delete(name);
        return;
      }
      for (const pid of [...bucket.keys()]) onUnbind?.(name, pid);
      bindings.delete(name);
      emit('service-unregister', name);
    },
  };

  function visibleEntries(name: string, viewerPluginId: string, trusted: boolean): BindingEntry[] {
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
    const first = visibleEntries(name, viewerPluginId, trusted)[0];
    return first ? ensureInstance(first) : undefined;
  }

  function pickTarget(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
  ): { providerId: string } | undefined {
    const first = visibleEntries(name, viewerPluginId, trusted)[0];
    return first ? { providerId: first.providerId } : undefined;
  }

  function authorizeCall(service: string, providerId: string, actor: string): boolean {
    const entry = bindings.get(service)?.get(providerId);
    if (!entry) return false;
    const viewerId = actor.startsWith('plugin:') ? actor.slice('plugin:'.length) : 'shell';
    if (!isBindingVisible(entry, viewerId)) return false;
    // 提供方自见豁免：high 门槛不拦提供方自己
    if (viewerId === providerId) return true;
    const trusted = viewerId === 'shell' || isTrusted(viewerId);
    if (entry.access === 'high' && !trusted) return false;
    return true;
  }

  function dropServices(providerId: string): void {
    for (const name of [...bindings.keys()]) {
      services.unregister(name, providerId);
    }
  }

  return { services, visibleEntries, pickVisible, pickTarget, authorizeCall, dropServices };
}
