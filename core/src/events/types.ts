export interface PluginEvent {
  /** 全局唯一事件 id */
  id: string;
  /** 事件时间（epoch 毫秒） */
  ts: number;
  /** 事件来源，如 core.registrar 或 plugin:<id> */
  actor: string;
  /** 动作名，如 register / unregister / start / stop / get */
  action: string;
  /** 目标（如插件 id），可选 */
  target?: string;
  /** 任意负载，可选 */
  payload?: unknown;
  /** 关联的追踪链 id，可选 */
  trace_id?: string;
}
