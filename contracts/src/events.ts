import type { PluginEvent, EventQuery } from '@wizard-harness/core';

/**
 * 服务契约层：events 服务。
 *
 * 注意：服务名 'events' 与 PluginContext 内置成员 ctx.events（事件观测侧）同名，
 * 故无法映射为属性访问，消费方用 ctx.get<EventsService>('events')。
 */
export const EVENTS_SERVICE = 'events';

/** events 服务接口：发布 / 订阅 / 查询事件 */
export interface EventsService {
  /** 发布一条事件（actor 为 plugin:events） */
  publish(action: string, target?: string, payload?: unknown): void;
  /** 订阅总线事件，返回取消订阅函数 */
  subscribe(listener: (event: PluginEvent) => void): () => void;
  /** 查询最近事件历史（按 actor/action/target/keyword 过滤） */
  history(query?: EventQuery): PluginEvent[];
  /** 当前缓冲的事件条数 */
  count(): number;
  /** 清空内存历史。不发事件。落盘账本由运行时壳一并截断。 */
  clear(): void;
}
