/**
 * 服务契约层：session 服务。
 *
 * 契约属于系统而非任何插件：服务名 'session' 与 SessionService 在此绑定。
 * 领域：追加型会话日志（发生过什么）。scope 管「这次运行看得见什么」，本服务不管可见性。
 * 薄切片：turn / message / tool-result；不做持久化、compaction、agent 循环。
 */
export const SESSION_SERVICE = 'session';

/** 本轮允许的三类条目（对齐计划：追加 turn / message / tool-result） */
export type SessionKind = 'turn' | 'message' | 'tool-result';

/** 只读日志条目：seq 在会话内单调递增 */
export interface SessionEntry {
  seq: number;
  time: number;
  kind: SessionKind;
  data: Record<string, unknown>;
}

/** 一条会话的追加 / 回放句柄（append 会冻结写入的 data） */
export interface Session {
  readonly id: string;
  readonly startedAt: number;
  readonly title?: string;
  append(kind: SessionKind, data?: Record<string, unknown>): SessionEntry;
  replay(): readonly SessionEntry[];
}

/** session 服务：开会话、追加、只读回放。消费方用 ctx.session 或 ctx.get('session') */
export interface SessionService {
  start(opts?: { id?: string; title?: string }): Session;
  get(id: string): Session | undefined;
  list(): readonly Session[];
  current(): Session | undefined;
  /** 从日志投影出 message 条目（给后续 llm 用；不是第二份存储） */
  deriveMessages(sessionId: string): readonly SessionEntry[];
  /** 丢掉最老的条目，保留 keep 条并记一条 compact turn；返回丢掉的条数 */
  compact(sessionId: string, opts?: { keep?: number }): number;
}
