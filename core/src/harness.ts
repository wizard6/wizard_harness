import { randomUUID } from 'node:crypto';
import type { EventBus } from './events/bus.js';
import type { PluginEvent } from './events/types.js';
import { discoverPlugins } from './discovery.js';
import { bootPlugins } from './registrar/boot.js';
import type { BootResult } from './registrar/boot.js';
import { createRegistrar } from './registrar/registrar.js';
import type { Plugin, PluginContext, Registrar, ReloadResult, ServiceRegistry } from './registrar/types.js';

/** 系统运行快照 */
export interface SystemStatus {
  id: string;
  name: string;
  startedAt: number;
  uptimeMs: number;
  plugins: { id: string }[];
  services: string[];
}

/** 程序主体上下文：整个 harness 的代表 */
export interface SystemContext {
  id: string;
  name: string;
  startedAt: number;
  /** 插件注册表（系统管插件） */
  registry: Registrar;
  /** 服务目录（系统提供/管理能力） */
  services: ServiceRegistry;
  /** 系统级配置（按插件 id 分片注入；运行时策略如 disabledPlugins 可热更新） */
  config: Readonly<Record<string, unknown>>;
  /** 系统级事件出口 */
  emit(event: PluginEvent): void;
  /** 运行快照 */
  status(): SystemStatus;
  /** 从系统视角切出单个插件的受限视图 */
  pluginContext(pluginId: string): PluginContext | undefined;
  /** 配置热更新：按插件 id 合并补丁，触发该插件 ctx.onConfig 通知（发 config-update 事件） */
  updateConfig(pluginId: string, patch: Record<string, unknown>): void;
  /** 运行时更新 disabledPlugins（观测台禁/启用插件；reload/boot 过滤与此一致） */
  setDisabledPlugins(ids: string[]): void;
  /** 热重载：显式传新插件，或（配置了 pluginsDir 时）重新扫描加载；发 reload 事件 */
  reload(pluginId: string, next?: Plugin): Promise<ReloadResult>;
  /**
   * Cordis 风格装配：按 inject/provides 拓扑排序后注册；
   * 缺必选 inject 的插件进入 pending（不加载）。
   */
  boot(plugins: Plugin[]): Promise<BootResult>;
}

export interface CreateHarnessOptions {
  bus: EventBus;
  config?: Readonly<Record<string, unknown>>;
  name?: string;
  /** 插件目录（harness.reload 无显式新插件时重新扫描用） */
  pluginsDir?: string;
}

/** 创建 harness 程序主体：注册表 + 服务目录 + 配置，统一对外呈现 */
export function createHarness(opts: CreateHarnessOptions): SystemContext {
  const { bus, config: initialConfig = {}, name = 'wizard-harness', pluginsDir } = opts;
  const runtimeConfig: Record<string, unknown> = { ...initialConfig };
  const id = randomUUID();
  const startedAt = Date.now();
  const registrar = createRegistrar({ bus, config: runtimeConfig });

  /** 热重载：优先用显式新插件；否则重新扫描 pluginsDir（ESM 缓存失效，且遵守壳策略过滤） */
  async function reload(pluginId: string, next?: Plugin): Promise<ReloadResult> {
    if (next) return registrar.reload(pluginId, next);
    if (!pluginsDir) {
      throw new Error('harness 未配置 pluginsDir，无法自动重新扫描（请显式传新插件或设置 pluginsDir）');
    }
    const { plugins } = await discoverPlugins(pluginsDir, { cacheBust: true });
    const disabled = new Set<string>((runtimeConfig.disabledPlugins as string[] | undefined) ?? []);
    const enableExperimental = new Set<string>(
      (runtimeConfig.enableExperimental as string[] | undefined) ?? [],
    );
    const fresh = plugins.find(
      (p) =>
        p.manifest.id === pluginId &&
        !disabled.has(p.manifest.id) &&
        !(p.manifest.tier === 'experimental' && !enableExperimental.has(p.manifest.id)),
    );
    if (!fresh) throw new Error(`重新扫描未找到可加载插件：${pluginId}（可能被 disabled/experimental 策略过滤）`);
    return registrar.reload(pluginId, fresh);
  }

  return {
    id,
    name,
    startedAt,
    registry: registrar,
    services: registrar.services,
    get config() {
      return runtimeConfig;
    },
    emit: (event) => bus.emit(event),
    status() {
      return {
        id,
        name,
        startedAt,
        uptimeMs: Date.now() - startedAt,
        plugins: registrar.list().map((p) => ({ id: p.manifest.id })),
        services: registrar.services.list(),
      };
    },
    pluginContext: (pluginId) => registrar.contextOf(pluginId),
    boot: (plugins) => bootPlugins(registrar, plugins),
    updateConfig: (pluginId, patch) => registrar.updateConfig(pluginId, patch),
    setDisabledPlugins(ids) {
      runtimeConfig.disabledPlugins = [...new Set(ids)];
    },
    reload,
  };
}

export type { BootResult };
