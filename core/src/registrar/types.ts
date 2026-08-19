import type { PluginEvent } from '../events/types.js';

/** 插件成熟度分级：决定默认加载策略 */
export type PluginTier = 'core' | 'standard' | 'experimental';

/**
 * 服务作用域：决定谁能看见这条绑定。
 * - harness：全系统可见（再受 access 约束）
 * - plugin：仅提供方插件上下文可见；生命周期仍绑提供方
 */
export type ServiceScope = 'harness' | 'plugin';

/** provides 条目：字符串默认 scope=harness */
export type ProvideSpec = string | { name: string; scope?: ServiceScope };

/**
 * Cordis 风格依赖声明：
 * - `['logger']`：全部必选
 * - `{ logger: true, metrics: false }`：true 必选 / false 可选
 */
export type InjectSpec = string[] | Record<string, boolean>;

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
  /**
   * 本插件贡献的服务（可多名）。与插件 id 独立。
   * 字符串形式默认 scope=harness；对象可声明 plugin 私有作用域。
   */
  provides?: ProvideSpec[];
  /**
   * Cordis 风格：必选服务名。启动时未就绪则挂起（PENDING），不进入 register。
   * 也可用根上的 plugin.inject。`services` 仍兼容，等同于全必选 inject。
   */
  inject?: InjectSpec;
  /** @deprecated 请改用 inject；语义同 inject 字符串数组（全必选） */
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

/** 服务权限级别（看得见之后能不能用） */
export type ServiceAccess = 'low' | 'high';

/**
 * 服务生命周期分层（Cordis 式）：
 * - host：宿主级服务（核心/壳注册，如 bus/config），生命周期与宿主一致、长活稳定，
 *   消费方可放心长期缓存引用。
 * - plugin：插件级服务（插件 api 挂出），随提供方插件卸载而消失，
 *   消费方应「随用随取」，不长期缓存（引用是借用，不保证存活）。
 * 默认 'plugin'。
 */
export type ServiceLifetime = 'host' | 'plugin';

/**
 * 一条服务绑定三元组：提供者 × 作用域 ×（实例寿命跟提供者走）。
 * access 是权限门，不是作用域。
 */
export interface ServiceBinding {
  name: string;
  /** 提供方：插件 id，或壳侧登记时的 provider 键 */
  providerId: string;
  scope: ServiceScope;
  access: ServiceAccess;
  /** 生命周期分层（host=宿主级 / plugin=插件级，默认 plugin） */
  lifetime: ServiceLifetime;
}

export interface ServiceRegisterOptions {
  access?: ServiceAccess;
  /** 提供方 id（推荐） */
  providerId?: string;
  /** @deprecated 同 providerId */
  pluginId?: string;
  /** 默认 harness */
  scope?: ServiceScope;
  /** 生命周期分层，默认 'plugin'；壳/核心注册长活服务请显式传 'host' */
  lifetime?: ServiceLifetime;
  /**
   * 懒加载工厂：提供 factory 时，首次被 get 才调用创建实例并缓存（单例）。
   * factory 参数为该服务提供方插件的上下文（可取 config / services）。
   * 不提供 factory 时按普通预建对象绑定（api 即服务默认形态）。
   */
  factory?: (ctx: PluginContext) => unknown;
}

/**
 * 服务目录：服务名 × 提供方 多对多；每条带 scope。
 * 壳侧 get 看全表；插件 ctx 只看可见链（见 makeContext）。
 */
export interface ServiceRegistry {
  register(name: string, service: unknown, opts?: ServiceRegisterOptions): void;
  get<T = unknown>(name: string, providerId?: string): T | undefined;
  getAll<T = unknown>(name: string): T[];
  /** 提供该服务的 providerId */
  providers(name: string): string[];
  /** 该提供方当前挂出的服务名 */
  providedBy(providerId: string): string[];
  /** 绑定元数据（含 scope）；不传 name 则列出全部 */
  bindings(name?: string): ServiceBinding[];
  list(): string[];
  /** 不传 providerId 则摘掉该服务名下全部绑定 */
  unregister(name: string, providerId?: string): void;
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
  /**
   * 可逆副作用（Cordis）：注册一个随插件生命周期自动撤销的副作用。
   * callback 立即同步执行，返回值（若有）为撤销函数；插件卸载时按
   * 注册逆序（LIFO）自动执行全部撤销函数，即使 onStop 抛错也会执行。
   * 典型用途：ctx.effect(() => ctx.events.subscribe(listener))。
   */
  effect(callback: (ctx: PluginContext) => (() => void) | void): void;
  /**
   * Cordis：可选探测。必选请写 inject，就绪后也可用同名属性（运行时 Proxy，如 ctx.logger）。
   * 类型安全可对 PluginContext 做 declare module 扩展。
   *
   * 引用纪律：返回的引用是「借用」，不保证存活——
   * 插件级服务（lifetime='plugin'，默认）随提供方插件卸载而消失，应随用随取、勿长期缓存；
   * 宿主级服务（lifetime='host'，如 bus/config）长活稳定，可放心缓存。
   */
  get<T = unknown>(name: string): T | undefined;
  /** 服务消费侧：只读，且只看见当前插件可见作用域内的绑定 */
  services: {
    get<T = unknown>(name: string, providerId?: string): T | undefined;
    getAll<T = unknown>(name: string): T[];
    providers(name: string): string[];
    list(): string[];
    /**
     * 等待可见服务出现。超时返回 undefined。
     * 受 scope 与 high 门槛约束。
     */
    waitFor<T = unknown>(name: string, timeoutMs?: number): Promise<T | undefined>;
  };
  /**
   * 基于事件的服务调用（事件化 RPC）：
   * 向服务中心发送 service-call 事件 → 路由到该服务的提供方执行 → 收 service-result 事件。
   * 调用全程可观测、可审计；与直接 services.get(...).method() 等价但走事件通道。
   */
  call<T = unknown>(
    service: string,
    method: string,
    args?: unknown,
    opts?: { timeoutMs?: number },
  ): Promise<T>;
  /**
   * 配置热更新订阅：壳调用 harness.updateConfig 时收到通知。
   * 返回取消订阅函数。回调参数：(新配置, 旧配置, 本次补丁)。
   */
  onConfig(
    listener: (
      next: Readonly<Record<string, unknown>>,
      prev: Readonly<Record<string, unknown>>,
      patch: Record<string, unknown>,
    ) => void,
  ): () => void;
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
  /**
   * Cordis：`export const inject = ['logger']`。
   * 与 manifest.inject 二选一即可，根上优先。
   */
  inject?: InjectSpec;
  /** 依赖就绪后调用（Cordis 的 apply）；此时 inject 的服务已可 ctx.get / 属性取 */
  register(ctx: PluginContext): void | Promise<void>;
  onStart?(ctx: PluginContext): void | Promise<void>;
  onStop?(ctx: PluginContext): void | Promise<void>;
  /** 对外接口：注册后按 manifest.provides 挂到服务目录（Cordis 的 provide） */
  api?: unknown;
  /** 轻量独立弹窗页描述（可选） */
  ui?: PluginUi;
}

/** 注册成功时的返回值 */
export interface RegisteredPlugin {
  plugin: Plugin;
  registeredAt: number;
  ctx: PluginContext;
  /**
   * 两阶段启动：当 register 以 { deferStart: true } 调用时提供。
   * 手动执行 onStart（含失败回滚与 start 事件）；未 defer 时不存在
   * （onStart 已在 register 内执行）。
   */
  start?: () => Promise<void>;
}

/** register 选项 */
export interface RegisterOptions {
  /**
   * 延迟启动：true 时 register 只注册（挂服务、发 register 事件），
   * onStart 推迟到调用返回值的 start()。供 boot 两阶段装配使用
   * （先全部注册、再按拓扑序全部启动）。
   */
  deferStart?: boolean;
}

/** 热重载结果 */
export interface ReloadResult {
  plugin: RegisteredPlugin;
  /** 因级联而被卸载的依赖方插件 id */
  cascaded: string[];
  /** 被替换的旧插件信息 */
  replaced: { id: string; version: string };
}

/** 注册器接口：登记 / 查找 / 枚举 / 注销 + 服务目录 */
export interface Registrar {
  register(plugin: Plugin, opts?: RegisterOptions): Promise<RegisteredPlugin>;
  unregister(id: string): Promise<void>;
  get(id: string): Plugin | undefined;
  list(): Plugin[];
  has(id: string): boolean;
  /** 已注册插件的上下文（供 harness 派生视角） */
  contextOf(id: string): PluginContext | undefined;
  /** 壳视角的事件化服务调用（trusted 全权，跨进程网关复用） */
  call<T = unknown>(
    service: string,
    method: string,
    args?: unknown,
    opts?: { timeoutMs?: number },
  ): Promise<T>;
  /** 配置热更新：按插件 id 合并补丁，触发该插件 ctx.onConfig 通知（发 config-update 事件） */
  updateConfig(pluginId: string, patch: Record<string, unknown>): void;
  /** 热重载：卸载旧插件（含级联依赖方）→ 注册新插件（id 必须一致），发 reload 事件 */
  reload(id: string, next: Plugin): Promise<ReloadResult>;
  /** 服务目录（壳视角：全表） */
  services: ServiceRegistry;
}

export interface ProvidedEntry {
  name: string;
  scope: ServiceScope;
}

/** 规范化 provides；无 api 则空；缺省 provides 且有 api 时用 id@harness */
export function normalizeProvides(plugin: Plugin): ProvidedEntry[] {
  if (plugin.api === undefined) return [];
  const raw = plugin.manifest.provides;
  if (raw === undefined) return [{ name: plugin.manifest.id, scope: 'harness' }];
  const out: ProvidedEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = typeof item === 'string' ? item : item.name;
    const scope: ServiceScope =
      typeof item === 'string' ? 'harness' : (item.scope ?? 'harness');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, scope });
  }
  return out;
}

/** 插件实际挂出的服务名列表 */
export function providedServices(plugin: Plugin): string[] {
  return normalizeProvides(plugin).map((e) => e.name);
}

export interface InjectEntry {
  name: string;
  required: boolean;
}

/** 规范化 inject（根 inject > manifest.inject > 旧 services） */
export function normalizeInject(plugin: Plugin): InjectEntry[] {
  const raw = plugin.inject ?? plugin.manifest.inject ?? plugin.manifest.services;
  if (raw === undefined) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.filter((n) => n.length > 0))].map((name) => ({
      name,
      required: true,
    }));
  }
  return Object.entries(raw).map(([name, required]) => ({ name, required: required === true }));
}

/** 某绑定对 viewer 插件是否可见（壳侧不走此函数） */
export function isBindingVisible(
  binding: Pick<ServiceBinding, 'scope' | 'providerId'>,
  viewerPluginId: string,
): boolean {
  if (binding.scope === 'harness') return true;
  return binding.providerId === viewerPluginId;
}
