import { appendFileSync } from 'node:fs';
import type { PluginEvent } from './types.js';

/**
 * 把事件追加写入 JSONL 文件（每行一条 JSON）。
 * 作为事件总线的一个订阅者使用：createEventBus().subscribe(createFileSink(path))。
 */
export function createFileSink(filePath: string): (event: PluginEvent) => void {
  return (event) => {
    appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
  };
}
