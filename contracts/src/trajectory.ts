export const TRAJECTORY_SERVICE = 'trajectory';

/** 一条执行轨迹里的步骤类型 */
export type TrajectoryKind = 'run-start' | 'run-end' | 'prompt' | 'http' | 'tool' | 'complete';

export interface TrajectorySpan {
  seq: number;
  ts: number;
  kind: TrajectoryKind;
  data: Record<string, unknown>;
}

export interface Trajectory {
  readonly id: string;
  readonly startedAt: number;
  readonly agentId?: string;
  readonly sessionId?: string;
  append(kind: TrajectoryKind, data?: Record<string, unknown>): TrajectorySpan;
  replay(): readonly TrajectorySpan[];
}

export interface TrajectorySnapshot {
  id: string;
  startedAt: number;
  agentId?: string;
  sessionId?: string;
  spans: readonly TrajectorySpan[];
}

export interface TrajectorySummary {
  id: string;
  startedAt: number;
  agentId?: string;
  sessionId?: string;
  spans: number;
}

/**
 * 执行轨迹：session 记「说过什么」，本服务记「怎么跑出来的」。
 * 不落盘、不存密钥。
 */
export interface TrajectoryService {
  start(opts?: { agentId?: string; sessionId?: string }): Trajectory;
  get(id: string): Trajectory | undefined;
  current(): Trajectory | undefined;
  forSession(sessionId: string): Trajectory | undefined;
  list(): readonly TrajectorySummary[];
  latest(): TrajectorySnapshot | undefined;
  /** 纯数据快照，可供弹窗 RPC。无 id 时等同 latest。 */
  snapshot(id?: string): TrajectorySnapshot | undefined;
  /** 无活跃轨迹则按 session 开一条。没 session 且无 current 则跳过。 */
  record(sessionId: string | undefined, kind: TrajectoryKind, data?: Record<string, unknown>): TrajectorySpan | undefined;
}
