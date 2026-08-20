import type {
  PluginContext,
  ServiceAccess,
  ServiceBinding,
  ServiceLifetime,
  ServiceRegistry,
} from './types.js';
import { scopeChainOf, scopeOf, ScopedLayers } from '../scope/index.js';
import type { ScopeKey, ScopeLayer } from '../scope/index.js';

/** 一条服务绑定（一名多提供方、一提供方多名） */
export interface BindingEntry {
  service: unknown;
  factory?: (ctx: PluginContext) => unknown;
  instance?: unknown;
  access: ServiceAccess;
  lifetime: ServiceLifetime;
  providerId: string;
}

class ServiceLayer implements ScopeLayer {
  readonly buckets = new Map<string, Map<string, BindingEntry>>();

  isEmpty(): boolean {
    return this.buckets.size === 0;
  }
}

export interface ServiceRegistryDeps {
  emit(action: string, target?: string, payload?: unknown): void;
  getContext(providerId: string): PluginContext | undefined;
  isTrusted(pluginId: string): boolean;
  onBind?(name: string, providerId: string): void;
  onUnbind?(name: string, providerId: string): void;
}

export interface ServiceRegistryBundle {
  services: ServiceRegistry;
  visibleEntries(name: string, viewerPluginId: string, trusted: boolean, scope?: ScopeKey): BindingEntry[];
  pickVisible(name: string, viewerPluginId: string, trusted: boolean, scope?: ScopeKey): unknown;
  pickTarget(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
    scope?: ScopeKey,
  ): { providerId: string } | undefined;
  authorizeCall(service: string, providerId: string, actor: string, scope?: ScopeKey): boolean;
  dropServices(providerId: string): void;
  listInScope(scope?: ScopeKey): string[];
  resolveInstance(name: string, providerId: string, scope?: ScopeKey): unknown;
}

function accessOk(e: BindingEntry, viewerPluginId: string, trusted: boolean): boolean {
  if (e.providerId === viewerPluginId) return true;
  if (e.access === 'high' && !trusted) return false;
  return true;
}

export function createServiceRegistry(deps: ServiceRegistryDeps): ServiceRegistryBundle {
  const { emit, getContext, isTrusted, onBind, onUnbind } = deps;
  const layers = new ScopedLayers(() => new ServiceLayer(), () => {});

  function toMeta(entry: BindingEntry, name: string, scoped: boolean): ServiceBinding {
    return {
      name,
      providerId: entry.providerId,
      access: entry.access,
      lifetime: entry.lifetime,
      scoped,
    };
  }

  function ensureInstance(entry: BindingEntry): unknown {
    if (entry.factory) {
      if (entry.instance === undefined) {
        entry.instance = entry.factory(getContext(entry.providerId) as PluginContext);
      }
      return entry.instance;
    }
    return entry.service;
  }

  /** 近的 overlay 盖同名全局；无 overlay 则全局 */
  function bucketFor(name: string, scope: ScopeKey | undefined): Map<string, BindingEntry> | undefined {
    for (const key of scopeChainOf(scope)) {
      const b = layers.peek(key)?.buckets.get(name);
      if (b && b.size > 0) return b;
    }
    return layers.global.buckets.get(name);
  }

  function insert(layer: ServiceLayer, name: string, entry: BindingEntry): () => void {
    let bucket = layer.buckets.get(name);
    if (!bucket) {
      bucket = new Map();
      layer.buckets.set(name, bucket);
    }
    if (bucket.has(entry.providerId)) {
      throw new Error(`服务已存在：${name}（提供者 ${entry.providerId}）`);
    }
    bucket.set(entry.providerId, entry);
    onBind?.(name, entry.providerId);
    emit('service-register', name, {
      access: entry.access,
      lifetime: entry.lifetime,
      providerId: entry.providerId,
    });
    return () => {
      const b = layer.buckets.get(name);
      if (!b?.delete(entry.providerId)) return;
      onUnbind?.(name, entry.providerId);
      emit('service-unregister', name, { providerId: entry.providerId });
      if (b.size === 0) layer.buckets.delete(name);
    };
  }

  const services: ServiceRegistry = {
    register(name, service, opts = {}) {
      const providerId = opts.providerId ?? opts.pluginId ?? name;
      const entry: BindingEntry = {
        service,
        access: opts.access ?? 'low',
        lifetime: opts.lifetime ?? 'plugin',
        providerId,
        ...(opts.factory ? { factory: opts.factory } : {}),
      };
      const ctx = opts.ctx;
      if (ctx) {
        layers.effect(ctx, (layer) => insert(layer, name, entry), { label: `service:${name}` });
        return;
      }
      insert(layers.global, name, entry);
    },
    get<T = unknown>(name: string, providerId?: string): T | undefined {
      const bucket = layers.global.buckets.get(name);
      if (!bucket || bucket.size === 0) return undefined;
      if (providerId) {
        const entry = bucket.get(providerId);
        return entry ? (ensureInstance(entry) as T) : undefined;
      }
      const first = bucket.values().next().value;
      return first ? (ensureInstance(first) as T) : undefined;
    },
    getAll<T = unknown>(name: string): T[] {
      const bucket = layers.global.buckets.get(name);
      if (!bucket) return [];
      return [...bucket.values()].map((e) => ensureInstance(e) as T);
    },
    providers(name) {
      const bucket = layers.global.buckets.get(name);
      return bucket ? [...bucket.keys()] : [];
    },
    providedBy(providerId) {
      const names: string[] = [];
      layers.visit((_scope, layer) => {
        for (const [name, bucket] of layer.buckets) {
          if (bucket.has(providerId)) names.push(name);
        }
      });
      return names;
    },
    bindings(name) {
      const all: ServiceBinding[] = [];
      layers.visit((scope, layer) => {
        const scoped = scope !== undefined;
        const names = name !== undefined ? [name] : [...layer.buckets.keys()];
        for (const n of names) {
          const bucket = layer.buckets.get(n);
          if (!bucket) continue;
          for (const e of bucket.values()) all.push(toMeta(e, n, scoped));
        }
      });
      return all;
    },
    list() {
      return [...layers.global.buckets.keys()].filter((n) => (layers.global.buckets.get(n)?.size ?? 0) > 0);
    },
    unregister(name, providerId) {
      layers.visit((_scope, layer) => {
        const bucket = layer.buckets.get(name);
        if (!bucket) return;
        const ids = providerId ? [providerId] : [...bucket.keys()];
        for (const pid of ids) {
          if (!bucket.delete(pid)) continue;
          onUnbind?.(name, pid);
          emit('service-unregister', name, { providerId: pid });
        }
        if (bucket.size === 0) layer.buckets.delete(name);
      });
    },
  };

  function visibleEntries(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
    scope?: ScopeKey,
  ): BindingEntry[] {
    const bucket = bucketFor(name, scope);
    if (!bucket) return [];
    return [...bucket.values()].filter((e) => accessOk(e, viewerPluginId, trusted));
  }

  function pickVisible(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
    scope?: ScopeKey,
  ): unknown {
    const first = visibleEntries(name, viewerPluginId, trusted, scope)[0];
    return first ? ensureInstance(first) : undefined;
  }

  function pickTarget(
    name: string,
    viewerPluginId: string,
    trusted: boolean,
    scope?: ScopeKey,
  ): { providerId: string } | undefined {
    const first = visibleEntries(name, viewerPluginId, trusted, scope)[0];
    return first ? { providerId: first.providerId } : undefined;
  }

  function authorizeCall(service: string, providerId: string, actor: string, scope?: ScopeKey): boolean {
    const viewerId = actor.startsWith('plugin:') ? actor.slice('plugin:'.length) : 'shell';
    const entry = bucketFor(service, scope)?.get(providerId);
    if (!entry) return false;
    if (viewerId === providerId) return true;
    const trusted = viewerId === 'shell' || isTrusted(viewerId);
    if (entry.access === 'high' && !trusted) return false;
    return true;
  }

  function dropServices(providerId: string): void {
    for (const name of [...new Set(services.providedBy(providerId))]) {
      services.unregister(name, providerId);
    }
  }

  function listInScope(scope?: ScopeKey): string[] {
    const names = new Set(layers.global.buckets.keys());
    for (const layer of layers.chainLayers(scope)) {
      for (const n of layer.buckets.keys()) names.add(n);
    }
    return [...names];
  }

  function resolveInstance(name: string, providerId: string, scope?: ScopeKey): unknown {
    const entry = bucketFor(name, scope)?.get(providerId);
    return entry ? ensureInstance(entry) : undefined;
  }

  return {
    services,
    visibleEntries,
    pickVisible,
    pickTarget,
    authorizeCall,
    dropServices,
    listInScope,
    resolveInstance,
  };
}
