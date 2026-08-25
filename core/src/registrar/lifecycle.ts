import { DuplicatePluginError, InvalidPluginError, PluginNotFoundError } from './errors.js';
import { validatePlugin } from './validate.js';
import type { ServiceRegistryBundle } from './service-registry.js';
import type {
  Plugin,
  PluginContext,
  RegisterOptions,
  RegisteredPlugin,
  ReloadResult,
  UnregisterResult,
  ServiceAccess,
} from './types.js';
import { normalizeInject, normalizeProvides } from './types.js';

/** 顺序执行一个插件的全部副作用撤销（LIFO）；单个失败隔离，保证全部执行 */
export function runDisposers(list: Array<() => void>, pluginId: string): void {
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

/**
 * 插件生命周期：register / unregister / reload（含级联卸载与失败回滚）。
 * 状态经 deps 注入（registrar 持有），本模块只表达"插件的生与死"的规则。
 */
export interface LifecycleDeps {
  registry: Map<string, Plugin>;
  contexts: Map<string, PluginContext>;
  trustedMap: Map<string, boolean>;
  requiredInject: Map<string, string[]>;
  effects: Map<string, Array<() => void>>;
  emit(action: string, target?: string, payload?: unknown): void;
  services: ServiceRegistryBundle;
  makeContext(plugin: Plugin): PluginContext;
}

export interface Lifecycle {
  register(plugin: Plugin, opts?: RegisterOptions): Promise<RegisteredPlugin>;
  unregister(id: string): Promise<UnregisterResult>;
  reload(id: string, next: Plugin): Promise<ReloadResult>;
}

/** 该插件的哪些服务是高权限（仅 trusted 插件可调用） */
function accessFor(plugin: Plugin, serviceName: string): ServiceAccess {
  const high = plugin.manifest.highAccessServices ?? [];
  if (high.includes(serviceName) || high.includes(plugin.manifest.id)) return 'high';
  return 'low';
}

export function createLifecycle(deps: LifecycleDeps): Lifecycle {
  const { registry, contexts, trustedMap, requiredInject, effects, emit, services, makeContext } = deps;

  function missingRequiredInject(plugin: Plugin): string[] {
    const trusted = plugin.manifest.trusted === true;
    const viewerId = plugin.manifest.id;
    return normalizeInject(plugin)
      .filter((i) => i.required)
      .filter((i) => services.pickVisible(i.name, viewerId, trusted) === undefined)
      .map((i) => i.name);
  }

  async function register(plugin: Plugin, opts: RegisterOptions = {}): Promise<RegisteredPlugin> {
    // 运行时 schema 校验：manifest 畸形尽早抛错
    validatePlugin(plugin);
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
    // 先登记 trusted 标记：插件 register 阶段发起的调用也能正确鉴权（不依赖注册完成）
    trustedMap.set(plugin.manifest.id, plugin.manifest.trusted === true);
    const ctx = makeContext(plugin);
    try {
      await plugin.register(ctx);
    } catch (err) {
      // register 抛错：撤销已注册的副作用，避免 effects 残留
      trustedMap.delete(plugin.manifest.id);
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
      services.services.register(entry.name, plugin.api, {
        access: accessFor(plugin, entry.name),
        providerId: plugin.manifest.id,
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
        trustedMap.delete(plugin.manifest.id);
        requiredInject.delete(plugin.manifest.id);
        services.dropServices(plugin.manifest.id);
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

  async function unregister(id: string): Promise<UnregisterResult> {
    const cascaded = await unregisterInternal(id, {});
    return { cascaded };
  }

  /** 计算：卸载提供方 id 后，哪些插件因必选服务消失而应被级联卸载 */
  function cascadeVictims(removedId: string, provided: string[]): string[] {
    const victims: string[] = [];
    for (const [pid, names] of requiredInject) {
      const broken = names.filter((n) => {
        if (!provided.includes(n)) return false;
        // 仍有其它提供方则保留
        return services.services.providers(n).length === 0;
      });
      if (broken.length > 0) victims.push(pid);
    }
    return victims;
  }

  /**
   * 热重载：卸载旧插件（含级联依赖方）→ 注册新插件。
   * next 必须与旧插件 id 一致。旧服务绑定/路由随卸载摘除，事件化调用自动走新实现。
   */
  async function reload(id: string, next: Plugin): Promise<ReloadResult> {
    const old = registry.get(id);
    if (!old) throw new PluginNotFoundError(id);
    if (next.manifest.id !== id) {
      throw new InvalidPluginError(`reload 插件 id 不一致：${next.manifest.id} !== ${id}`);
    }
    // 预检新插件（validate + 必选 inject），尽量在卸载前失败，减少回滚场景
    validatePlugin(next);
    const missingNext = missingRequiredInject(next);
    if (missingNext.length > 0) {
      throw new InvalidPluginError(`reload 新插件 inject 未就绪（${id}）：缺少 ${missingNext.join(', ')}`);
    }
    const provided = normalizeProvides(old).map((e) => e.name);
    const fromVersion = old.manifest.version;

    // 卸载旧插件（级联手动处理，保持 reload 返回的级联列表可观测）
    await unregisterInternal(id, { cascading: false });
    // 级联计算需在卸载后（提供方绑定已摘除，服务缺失才成立）
    const victims = cascadeVictims(id, provided);
    const cascaded: string[] = [];
    for (const vid of victims) {
      if (registry.has(vid)) {
        emit('inject-cascade', vid, { because: id, services: provided });
        const r = await unregister(vid);
        cascaded.push(vid, ...r.cascaded);
      }
    }

    // 注册新插件；失败则回滚旧插件，避免服务图永久残缺
    let registered: RegisteredPlugin;
    try {
      registered = await register(next);
    } catch (err) {
      emit('reload-failed', id, { from: fromVersion, error: String(err), cascaded });
      try {
        await register(old);
        throw new Error(`热重载失败（${id}）并已回滚旧版本 ${fromVersion}：${String(err)}`);
      } catch (rollbackErr) {
        throw new Error(
          `热重载失败（${id}）且回滚也失败：${String(err)} / ${String(rollbackErr)}`,
        );
      }
    }
    emit('reload', id, { from: fromVersion, to: next.manifest.version, cascaded });
    return { plugin: registered, cascaded, replaced: { id, version: fromVersion } };
  }

  /** unregister 内部实现：支持关闭级联（reload 需要手动控制级联顺序与观测） */
  async function unregisterInternal(
    id: string,
    opts: { cascading?: boolean },
  ): Promise<string[]> {
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
      runDisposers(effects.get(id) ?? [], id);
      effects.delete(id);
    }
    registry.delete(id);
    contexts.delete(id);
    trustedMap.delete(id);
    requiredInject.delete(id);
    services.dropServices(id);
    emit('unregister', id);

    if (opts.cascading === false) return [];
    const cascaded: string[] = [];
    const victims = cascadeVictims(id, provided);
    for (const vid of victims) {
      if (registry.has(vid)) {
        emit('inject-cascade', vid, { because: id, services: provided });
        const nested = await unregisterInternal(vid, {});
        cascaded.push(vid, ...nested);
      }
    }
    return cascaded;
  }

  return {
    register,
    unregister,
    reload,
  };
}
