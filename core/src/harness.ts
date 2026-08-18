import { randomUUID } from 'node:crypto';
import type { EventBus } from './events/bus.js';
import type { PluginEvent } from './events/types.js';
import { createRegistrar } from './registrar/registrar.js';
import type { PluginContext, Registrar, ServiceRegistry } from './registrar/types.js';

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
  /** 系统级配置（按插件 id 分片注入） */
  config: Readonly<Record<string, unknown>>;
  /** 系统级事件出口 */
  emit(event: PluginEvent): void;
  /** 运行快照 */
  status(): SystemStatus;
  /** 从系统视角切出单个插件的受限视图 */
  pluginContext(pluginId: string): PluginContext | undefined;
}

export interface CreateHarnessOptions {
  bus: EventBus;
  config?: Readonly<Record<string, unknown>>;
  name?: string;
}

/** 创建 harness 程序主体：注册表 + 服务目录 + 配置，统一对外呈现 */
export function createHarness(opts: CreateHarnessOptions): SystemContext {
  const { bus, config = {}, name = 'wizard-harness' } = opts;
  const id = randomUUID();
  const startedAt = Date.now();
  const registrar = createRegistrar({ bus, config });

  return {
    id,
    name,
    startedAt,
    registry: registrar,
    services: registrar.services,
    config: Object.freeze({ ...config }),
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
  };
}
