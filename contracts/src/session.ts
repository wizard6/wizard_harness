/**
 * 服务契约层：session 服务。
 *
 * 契约属于系统而非任何插件：服务名 'session' 与 SessionService 在此绑定。
 * 领域：追加型会话日志（发生过什么）+ 少量会话元数据（title / workspace）。
 * scope 管「这次运行看得见什么」，本服务不管可见性。
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

export interface SessionStartOpts {
  id?: string;
  title?: string;
  /** 本会话编程工作区（绝对路径优先；相对路径按 cwd resolve） */
  workspace?: string;
}

export interface SessionPatch {
  title?: string;
  /** 传空字符串则清掉，工具回退到 dev-tools 默认 root */
  workspace?: string;
}

export interface SessionInfo {
  readonly id: string;
  readonly startedAt: number;
  readonly title?: string;
  readonly workspace?: string;
  readonly entries: number;
  readonly updatedAt: number;
}

export interface SessionInspect {
  readonly persistDir?: string;
  readonly currentId?: string;
  readonly sessions: readonly SessionInfo[];
}

export interface SessionPeek {
  readonly id: string;
  readonly startedAt: number;
  readonly title?: string;
  readonly workspace?: string;
  readonly entries: readonly SessionEntry[];
}

/** 一条会话的追加 / 回放句柄（append 会冻结写入的 data） */
export interface Session {
  readonly id: string;
  readonly startedAt: number;
  readonly title?: string;
  readonly workspace?: string;
  append(kind: SessionKind, data?: Record<string, unknown>): SessionEntry;
  replay(): readonly SessionEntry[];
}

/** session 服务：开会话、追加、只读回放、元数据。消费方用 ctx.session 或 ctx.get('session') */
export interface SessionService {
  start(opts?: SessionStartOpts): Session;
  /** 同 start，但只返回可 JSON 的元数据（弹窗 RPC 用） */
  open(opts?: SessionStartOpts): SessionInfo;
  get(id: string): Session | undefined;
  list(): readonly Session[];
  current(): Session | undefined;
  /** 改元数据；返回可 JSON 的 SessionInfo（弹窗 RPC 不能回传带方法的 Session） */
  patch(id: string, patch: SessionPatch): SessionInfo;
  inspect(): SessionInspect;
  peek(id: string): SessionPeek;
  /** 从日志投影出 message 条目（给后续 llm 用；不是第二份存储） */
  deriveMessages(sessionId: string): readonly SessionEntry[];
  /** 丢掉最老的条目，保留 keep 条并记一条 compact turn；返回丢掉的条数 */
  compact(sessionId: string, opts?: { keep?: number }): number;
}
