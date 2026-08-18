import type { PluginEvent } from './types.js';

export type EventSink = (event: PluginEvent) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  /** 订阅事件流，返回取消订阅函数 */
  subscribe(sink: EventSink): Unsubscribe;
  /** 派发一条事件给所有订阅者 */
  emit(event: PluginEvent): void;
}

export function createEventBus(): EventBus {
  const sinks = new Set<EventSink>();
  return {
    subscribe(sink: EventSink): Unsubscribe {
      sinks.add(sink);
      return () => {
        sinks.delete(sink);
      };
    },
    emit(event: PluginEvent): void {
      for (const sink of sinks) {
        try {
          sink(event);
        } catch (err) {
          // 单个 sink 异常隔离：不打断其它订阅者，也不向调用方抛出；错误留痕
          console.error('[bus] sink error:', err);
        }
      }
    },
  };
}
