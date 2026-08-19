import type { PluginContext, EventQuery } from '@wizard-harness/core';
import type { LoggerService } from './logger.js';
import type { EventsService } from './events.js';
import type { ConsoleService } from './console.js';

export { LOGGER_SERVICE } from './logger.js';
export type { LoggerService } from './logger.js';
export { EVENTS_SERVICE } from './events.js';
export type { EventsService } from './events.js';
export { CONSOLE_SERVICE } from './console.js';
export type { ConsoleService, ExecResult } from './console.js';
/** 事件查询契约（core reader 定义，契约包统一转发） */
export type { EventQuery } from '@wizard-harness/core';

/**
 * Cordis 风格属性访问：ctx.logger ≡ ctx.get('logger')（运行时由 Proxy 注入）。
 * 仅对与 PluginContext 内置成员无名字冲突的服务建立映射：
 * - logger / console 名字空闲 → 属性访问
 * - events 与内置 ctx.events（事件观测侧）冲突 → 走 ctx.get<EventsService>('events')
 *
 * 消费方 import 本包（或任何导出）即引入此增强，ctx.logger 获得完整类型。
 */
declare module '@wizard-harness/core' {
  interface PluginContext {
    readonly logger?: LoggerService;
    readonly console?: ConsoleService;
  }
}
