import type { PluginEvent } from '../events/types.js';

/** 插件成熟度分级：决定默认加载策略 */
export type PluginTier = 'core' | 'standard' | 'experimental';

/** 插件元数据声明 */
export interface PluginManifest {
  /** 全局唯一 id */
  id: string;
  /** 语义化版本 */
  version: string;
  name?: string;
  description?: string;
  /** 依赖的其它插件 id */
  dependencies?: string[];
  /** 依赖的服务名（服务可被替换实现，解耦于具体插件） */
  services?: string[];
  /** 插件默认配置（与全局 config[pluginId] 合并，后者优先） */
  config?: Record<string, unknown>;
  /** 成熟度（默认 standard）：core=必须加载 / standard=默认加载 / experimental=默认跳过 */
  tier?: PluginTier;
  /** 信任标记（默认 false）：true 才能调用高权限服务 */
  trusted?: boolean;
  /** 该插件提供的哪些服务是高权限（仅 trusted 插件可调用） */
  highAccessServices?: string[];
}

/** 服务权限级别 */
export type ServiceAccess = 'low' | 'high';

/** 服务目录：插件 api 的公开投影，按名存取 */
export interface ServiceRegistry {
  register(name: string, service: unknown, opts?: { access?: ServiceAccess }): void;
  get<T = unknown>(name: string): T | undefined;
  list(): string[];
  unregister(name: string): void;
}

/**
 * 注入给插件的上下文（生存期环境）。
 * 只读视角：config 只读、services 只读、events 只读、emit 是单向出口。
 * 注册/注销/服务管理由壳（harness）显式提供，不塞进 ctx。
 */
export interface PluginContext {
  /** 该插件的合并配置（默认值 + 全局注入覆盖） */
  config: Readonly<Record<string, unknown>>;
  /** 插件观测点：向事件总线发一条插件事件 */
  emit(event: Omit<PluginEvent, 'id' | 'ts' | 'actor'>): void;
  /** 服务消费侧：取/列其它插件提供的能力（只读） */
  services: {
    get<T = unknown>(name: string): T | undefined;
    list(): string[];
    /**
     * 等待服务出现（解决注册顺序问题）。超时返回 undefined，由调用方降级。
     * 注意：同样受高权限门槛约束（非 trusted 拿 high 服务会一直等不到）。
     */
    waitFor<T = unknown>(name: string, timeoutMs?: number): Promise<T | undefined>;
  };
  /** 事件观测侧：订阅总线 / 查最近事件历史（只读） */
  events: {
    subscribe(listener: (event: PluginEvent) => void): () => void;
    history(): PluginEvent[];
  };
}

/** 插件轻量独立弹窗页描述（GUI 桌面壳层使用） */
export interface PluginUi {
  /** 弹窗标题 */
  title?: string;
  /** 弹窗页内容：HTML 字符串（轻量、快速开发） */
  content?: string;
  width?: number;
  height?: number;
}

/** 插件约定 */
export interface Plugin {
  manifest: PluginManifest;
  register(ctx: PluginContext): void | Promise<void>;
  onStart?(ctx: PluginContext): void | Promise<void>;
  onStop?(ctx: PluginContext): void | Promise<void>;
  /** 对外接口：插件收敛的唯一公共 API，注册后自动成为同名服务 */
  api?: unknown;
  /** 轻量独立弹窗页描述（可选） */
  ui?: PluginUi;
}

/** 注册成功的返回值 */
export interface RegisteredPlugin {
  plugin: Plugin;
  registeredAt: number;
  ctx: PluginContext;
}

/** 注册器接口：登记 / 查找 / 枚举 / 注销 + 服务目录 */
export interface Registrar {
  register(plugin: Plugin): Promise<RegisteredPlugin>;
  unregister(id: string): Promise<void>;
  get(id: string): Plugin | undefined;
  list(): Plugin[];
  has(id: string): boolean;
  /** 已注册插件的上下文（供 harness 派生视角） */
  contextOf(id: string): PluginContext | undefined;
  /** 服务目录：插件 api 自动注册（以插件 id 为名） */
  services: ServiceRegistry;
}
