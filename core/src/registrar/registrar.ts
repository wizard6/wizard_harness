import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import type { PluginEvent } from '../events/types.js';
import { DuplicatePluginError, InvalidPluginError, PluginNotFoundError } from './errors.js';
import type { Plugin, PluginContext, RegisteredPlugin, Registrar } from './types.js';

export interface CreateRegistrarOptions {
  bus: EventBus;
  config?: Readonly<Record<string, unknown>>;
  /** 生成 trace_id 的函数；默认每次取新 id */
  traceId?: () => string;
}

/** 注册器的标准实现。依赖向内：core 不依赖插件，只持有 Plugin 契约。 */
export function createRegistrar(opts: CreateRegistrarOptions): Registrar {
  const { bus, config = {}, traceId = () => randomUUID() } = opts;
  const registry = new Map<string, Plugin>();

  function emit(action: string, target?: string, payload?: unknown): void {
    const event: PluginEvent = {
      id: randomUUID(),
      ts: Date.now(),
      actor: 'core.registrar',
      action,
      target,
      payload,
      trace_id: traceId(),
    };
    bus.emit(event);
  }

  function makeContext(plugin: Plugin): PluginContext {
    return {
      registrar,
      config,
      emit(event) {
        bus.emit({
          id: randomUUID(),
          ts: Date.now(),
          actor: `plugin:${plugin.manifest.id}`,
          action: event.action,
          target: event.target,
          payload: event.payload,
          trace_id: event.trace_id,
        });
      },
    };
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
    const registeredAt = Date.now();
    emit('register', plugin.manifest.id, { version: plugin.manifest.version });
    if (plugin.onStart) {
      await plugin.onStart(ctx);
      emit('start', plugin.manifest.id);
    }
    return { plugin, registeredAt };
  }

  async function unregister(id: string): Promise<void> {
    const plugin = registry.get(id);
    if (!plugin) {
      throw new PluginNotFoundError(id);
    }
    if (plugin.onStop) {
      await plugin.onStop(makeContext(plugin));
      emit('stop', id);
    }
    registry.delete(id);
    emit('unregister', id);
  }

  function get(id: string): Plugin | undefined {
    const found = registry.get(id);
    if (found) emit('get', id);
    return found;
  }

  function list(): Plugin[] {
    emit('list');
    return [...registry.values()];
  }

  function has(id: string): boolean {
    const result = registry.has(id);
    if (result) emit('has', id);
    return result;
  }

  const registrar: Registrar = { register, unregister, get, list, has };
  return registrar;
}
