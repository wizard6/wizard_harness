import { readFileSync } from 'node:fs';
import type { PluginEvent } from './types.js';

/** 读取整个 JSONL 事件文件 */
export function readEvents(filePath: string): PluginEvent[] {
  const text = readFileSync(filePath, 'utf8');
  const events: PluginEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed) as PluginEvent);
  }
  return events;
}

export interface EventQuery {
  actor?: string;
  action?: string;
  target?: string;
  keyword?: string;
  /** 只返回最后 N 条 */
  limit?: number;
}

/** 按 actor / action / target / 关键字过滤事件 */
export function queryEvents(events: PluginEvent[], query: EventQuery): PluginEvent[] {
  const keyword = query.keyword?.toLowerCase();
  let out = events.filter((e) => {
    if (query.actor && e.actor !== query.actor) return false;
    if (query.action && e.action !== query.action) return false;
    if (query.target && e.target !== query.target) return false;
    if (keyword) {
      const blob = [e.actor, e.action, e.target, JSON.stringify(e.payload ?? {})]
        .join(' ')
        .toLowerCase();
      if (!blob.includes(keyword)) return false;
    }
    return true;
  });
  if (query.limit && query.limit > 0) out = out.slice(-query.limit);
  return out;
}

/**
 * 轮询追加新事件（轻量 tail，跨平台）。返回取消函数。
 */
export function tailEvents(
  filePath: string,
  onEvent: (event: PluginEvent) => void,
  opts?: { intervalMs?: number },
): () => void {
  const intervalMs = opts?.intervalMs ?? 500;
  let offset = 0;
  let timer: NodeJS.Timeout | undefined;

  const readNew = () => {
    let text: string;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      return; // 文件尚未存在
    }
    if (text.length <= offset) return;
    const chunk = text.slice(offset);
    offset = text.length;
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as PluginEvent);
      } catch {
        // 忽略半行/损坏
      }
    }
  };

  readNew();
  timer = setInterval(readNew, intervalMs);
  return () => {
    if (timer) clearInterval(timer);
  };
}
