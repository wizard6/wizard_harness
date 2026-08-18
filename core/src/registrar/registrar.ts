import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import type { PluginEvent } from '../events/types.js';
import { DuplicatePluginError, InvalidPluginError, PluginNotFoundError } from './errors.js';
import type { Plugin, PluginContext, RegisteredPlugin, Registrar } from './types.js';

export interface CreateRegistrarOptions {
  bus: EventBus;
  config?: Readonly<Record<string, unknown>>;
}

/** 注册器的标准实现。依赖向内：core 不依赖插件，只持有 Plugin 契约。 */
export function createRegistrar(opts: CreateRegistrarOptions): Registrar {
  const { bus, config = {} } = opts;
  const registry = new Map<string, Plugin>();

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

  function makeContext(plugin: Plugin): PluginContext {
    return {
      config,
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
    // dependencies 只声明不阻断：缺失时发警告事件（草稿约定：初版仅警告，不强报错）
    const missing = (plugin.manifest.dependencies ?? []).filter((d) => !registry.has(d));
    if (missing.length > 0) {
      emit('dep-missing', plugin.manifest.id, { dependencies: missing });
    }
    if (plugin.onStart) {
      try {
        await plugin.onStart(ctx);
      } catch (err) {
        // onStart 失败：回滚半注册状态，避免插件留在注册表且无 start 事件
        registry.delete(plugin.manifest.id);
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
      await plugin.onStop(makeContext(plugin));
      emit('stop', id);
    }
    registry.delete(id);
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

  const registrar: Registrar = { register, unregister, get, list, has };
  return registrar;
}
