import type { PluginEvent } from '../events/types.js';

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
}

/** 注入给插件的上下文（生存期环境：配置 + 观测出口；注册能力由壳显式提供，不塞进 ctx） */
export interface PluginContext {
  config: Readonly<Record<string, unknown>>;
  /** 插件观测点：向事件总线发一条插件事件 */
  emit(event: Omit<PluginEvent, 'id' | 'ts' | 'actor'>): void;
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
  /** 对外接口：插件收敛的唯一公共 API，外部只通过它交互 */
  api?: unknown;
  /** 轻量独立弹窗页描述（可选） */
  ui?: PluginUi;
}

/** 注册成功的返回值：插件本体 + 注册时间 + 该插件专属上下文 */
export interface RegisteredPlugin {
  plugin: Plugin;
  registeredAt: number;
  ctx: PluginContext;
}

/** 注册器接口：登记 / 查找 / 枚举 / 注销 */
export interface Registrar {
  register(plugin: Plugin): Promise<RegisteredPlugin>;
  unregister(id: string): Promise<void>;
  get(id: string): Plugin | undefined;
  list(): Plugin[];
  has(id: string): boolean;
}
