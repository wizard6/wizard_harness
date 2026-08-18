import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import type { PluginEvent } from '../events/types.js';
import { DuplicatePluginError, InvalidPluginError, PluginNotFoundError } from './errors.js';
import type {
  Plugin,
  PluginContext,
  RegisteredPlugin,
  Registrar,
  ServiceAccess,
  ServiceRegistry,
} from './types.js';

export interface CreateRegistrarOptions {
  bus: EventBus;
  /** 全局配置：按插件 id 分片注入（如 { logger: { level: 'debug' } }），覆盖插件默认值 */
  config?: Readonly<Record<string, unknown>>;
  /** 事件历史缓冲上限（ctx.events.history 可查；默认 500） */
  historyLimit?: number;
}

/** 注册器的标准实现。依赖向内：core 不依赖插件，只持有 Plugin 契约。 */
export function createRegistrar(opts: CreateRegistrarOptions): Registrar {
  const { bus, config = {}, historyLimit = 500 } = opts;
  const registry = new Map<string, Plugin>();
  const contexts = new Map<string, PluginContext>();
  const servicesMap = new Map<string, { service: unknown; access: ServiceAccess }>();
  // 事件历史缓冲（ctx.events.history 可查，最近 historyLimit 条）
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

  const services: ServiceRegistry = {
    register(name, service, opts = {}) {
      if (servicesMap.has(name)) {
        throw new Error(`服务已存在：${name}`);
      }
      servicesMap.set(name, { service, access: opts.access ?? 'low' });
      emit('service-register', name, { access: opts.access ?? 'low' });
    },
    get<T = unknown>(name: string): T | undefined {
      return servicesMap.get(name)?.service as T | undefined;
    },
    list() {
      return [...servicesMap.keys()];
    },
    unregister(name) {
      if (servicesMap.delete(name)) {
        emit('service-unregister', name);
      }
    },
  };

  /** 合并配置：插件默认值 < 全局按 id 分片覆盖 */
  function mergedConfig(plugin: Plugin): Readonly<Record<string, unknown>> {
    const globalPart = (config[plugin.manifest.id] ?? {}) as Record<string, unknown>;
    return { ...(plugin.manifest.config ?? {}), ...globalPart };
  }

  function makeContext(plugin: Plugin): PluginContext {
    const trusted = plugin.manifest.trusted === true;
    const ctx: PluginContext = {
      config: mergedConfig(plugin),
      emit(event) {
        bus.emit({
          id: randomUUID(),
          ts: Date.now(),
          actor: `plugin:${plugin.manifest.id}`,
          action: event.action,
          target: event.target,
          payload: event.payload,
        });
      },
      services: {
        // 高权限服务门槛：仅 trusted 插件可获取
        get<T = unknown>(name: string): T | undefined {
          const entry = servicesMap.get(name);
          if (!entry) return undefined;
          if (entry.access === 'high' && !trusted) return undefined;
          return entry.service as T;
        },
        list: services.list,
        async waitFor<T = unknown>(name: string, timeoutMs = 5000): Promise<T | undefined> {
          const deadline = Date.now() + timeoutMs;
          for (;;) {
            const svc = servicesMap.get(name);
            if (svc && (svc.access !== 'high' || trusted)) return svc.service as T;
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
    return ctx;
  }

  async function register(plugin: Plugin): Promise<RegisteredPlugin> {
    if (!plugin || !plugin.manifest || !plugin.manifest.id) {
      throw new InvalidPluginError('缺少有效 manifest（含唯一 id）');
    }
    if (typeof plugin.register !== 'function') {
      throw new InvalidPluginError(`插件缺少 register 函数（${plugin.manifest.id}）`);
    }
    if (registry.has(plugin.manifest.id)) {
      throw new DuplicatePluginError(plugin.manifest.id);
    }
    const ctx = makeContext(plugin);
    await plugin.register(ctx);
    registry.set(plugin.manifest.id, plugin);
    contexts.set(plugin.manifest.id, ctx);
    const registeredAt = Date.now();
    emit('register', plugin.manifest.id, { version: plugin.manifest.version });
    // api 即服务：插件注册后其 api 自动成为同名服务（高权限由 manifest.highAccessServices 声明）
    if (plugin.api !== undefined) {
      const high = plugin.manifest.highAccessServices?.includes(plugin.manifest.id);
      services.register(plugin.manifest.id, plugin.api, { access: high ? 'high' : 'low' });
    }
    // dependencies 只声明不阻断：缺失时发警告事件（草稿约定：初版仅警告，不强报错）
    const missing = (plugin.manifest.dependencies ?? []).filter((d) => !registry.has(d));
    if (missing.length > 0) {
      emit('dep-missing', plugin.manifest.id, { dependencies: missing });
    }
    // 服务依赖：缺失的服务名同样只警告（消费方可 waitFor / 运行时降级）
    const missingSvcs = (plugin.manifest.services ?? []).filter((s) => !servicesMap.has(s));
    if (missingSvcs.length > 0) {
      emit('dep-missing', plugin.manifest.id, { services: missingSvcs });
    }
    if (plugin.onStart) {
      try {
        await plugin.onStart(ctx);
      } catch (err) {
        // onStart 失败：回滚半注册状态，避免插件留在注册表且无 start 事件
        registry.delete(plugin.manifest.id);
        contexts.delete(plugin.manifest.id);
        if (plugin.api !== undefined) services.unregister(plugin.manifest.id);
        emit('start-failed', plugin.manifest.id, { error: String(err) });
        throw err;
      }
      emit('start', plugin.manifest.id);
    }
    return { plugin, registeredAt, ctx };
  }

  async function unregister(id: string): Promise<void> {
    const plugin = registry.get(id);
    if (!plugin) {
      throw new PluginNotFoundError(id);
    }
    if (plugin.onStop) {
      await plugin.onStop(contexts.get(id) ?? makeContext(plugin));
      emit('stop', id);
    }
    registry.delete(id);
    contexts.delete(id);
    if (plugin.api !== undefined) services.unregister(id);
    emit('unregister', id);
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

  const registrar: Registrar = { register, unregister, get, list, has, contextOf, services };
  return registrar;
}
