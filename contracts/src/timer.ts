/** 定时任务调度：单进程 min-heap 唤醒、可打断执行、运行日志与监控 UI */
export const TIMER_SERVICE = 'timer';

export type TimerScheduleKind = 'interval' | 'once' | 'cron';
export type TimerActionKind = 'event' | 'toolbox' | 'workflow' | 'shell';
export type TimerJobState = 'stopped' | 'running' | 'paused';
export type TimerRunState = 'pending' | 'running' | 'ok' | 'error' | 'cancelled' | 'timeout';
export type TimerOnError = 'stop' | 'continue' | 'retry';

export interface TimerSchedule {
  readonly kind: TimerScheduleKind;
  /** interval：周期毫秒 */
  readonly intervalMs?: number;
  /** once：延迟毫秒 */
  readonly delayMs?: number;
  /** cron：分 时 日 月 周（5 段，UTC） */
  readonly cron?: string;
}

export interface TimerAction {
  readonly kind: TimerActionKind;
  /** event：action 名 */
  readonly action?: string;
  readonly target?: string;
  readonly payload?: Record<string, unknown>;
  /** toolbox：脚本名 */
  readonly script?: string;
  readonly args?: Record<string, unknown>;
  readonly workspace?: string;
  /** workflow：图 + 输入 */
  readonly graph?: { readonly id?: string; readonly nodes: readonly unknown[] };
  readonly input?: Record<string, unknown>;
  /** shell：命令 */
  readonly command?: string;
}

export type TimerTraceState = 'pending' | 'scheduled' | 'running' | 'ok' | 'error' | 'skipped' | 'cancelled' | 'timeout';
export type TimerTraceWhen = 'always' | 'ok' | 'error' | 'timeout' | 'cancelled';

export interface TimerFlowStep {
  readonly id?: string;
  readonly label?: string;
  /** 本步执行前等待（毫秒） */
  readonly delayMs?: number;
  readonly action: TimerAction;
}

export interface TimerFlowBranch {
  readonly when?: TimerTraceWhen;
  readonly label?: string;
  readonly delayMs?: number;
  readonly action?: TimerAction;
  readonly steps?: readonly TimerFlowStep[];
  readonly branches?: readonly TimerFlowBranch[];
}

export interface TimerFlowDef {
  readonly kind: 'chain' | 'tree';
  readonly rootLabel?: string;
  /** chain：顺序链条 */
  readonly steps?: readonly TimerFlowStep[];
  /** tree：根动作 */
  readonly action?: TimerAction;
  readonly branches?: readonly TimerFlowBranch[];
}

export interface TimerTraceNode {
  readonly id: string;
  readonly flowRunId: string;
  readonly nodeKey: string;
  readonly label: string;
  readonly state: TimerTraceState;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly scheduledAt?: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly error?: string;
  readonly summary?: string;
}

export interface TimerFlowRunView {
  readonly id: string;
  readonly jobId: string;
  readonly jobRunId: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly state: TimerRunState;
  readonly rootTraceId: string;
}

export interface TimerTraceTree {
  readonly flowRun: TimerFlowRunView;
  readonly nodes: readonly TimerTraceNode[];
}

export interface TimerJobView {
  readonly id: string;
  readonly label: string;
  readonly state: TimerJobState;
  readonly enabled: boolean;
  readonly schedule: TimerSchedule;
  readonly action: TimerAction;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly onError: TimerOnError;
  readonly nextFireAt: number | null;
  readonly lastFireAt: number | null;
  readonly fireCount: number;
  readonly lastError?: string;
  readonly activeRunId?: string;
  readonly flow?: TimerFlowDef;
}

export interface TimerRunView {
  readonly id: string;
  readonly jobId: string;
  readonly state: TimerRunState;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly attempt: number;
  readonly error?: string;
  readonly summary?: string;
}

export interface TimerLogEntry {
  readonly at: number;
  readonly level: 'info' | 'warn' | 'error';
  readonly jobId?: string;
  readonly runId?: string;
  readonly message: string;
}

export interface TimerInspect {
  readonly jobCount: number;
  readonly runningJobs: number;
  readonly activeRuns: number;
  readonly wakeAt: number | null;
}

export interface TimerCreateOpts {
  readonly id?: string;
  readonly label?: string;
  readonly schedule: TimerSchedule;
  readonly action?: TimerAction;
  readonly flow?: TimerFlowDef;
  readonly enabled?: boolean;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
  readonly onError?: TimerOnError;
  readonly autostart?: boolean;
}

export interface TimerUpdatePatch {
  readonly label?: string;
  readonly schedule?: TimerSchedule;
  readonly action?: TimerAction;
  readonly flow?: TimerFlowDef;
  readonly enabled?: boolean;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
  readonly onError?: TimerOnError;
}

export interface TimerService {
  inspect(): TimerInspect;
  list(): readonly TimerJobView[];
  get(id: string): TimerJobView | undefined;
  create(opts: TimerCreateOpts): TimerJobView;
  update(id: string, patch: TimerUpdatePatch): TimerJobView;
  remove(id: string): boolean;
  start(id: string): TimerJobView;
  stop(id: string): TimerJobView;
  pause(id: string): TimerJobView;
  resume(id: string): TimerJobView;
  trigger(id: string): Promise<TimerRunView>;
  cancelRun(runId: string): boolean;
  runs(jobId?: string, limit?: number): readonly TimerRunView[];
  logs(opts?: { jobId?: string; limit?: number }): readonly TimerLogEntry[];
  flowRuns(jobId?: string, limit?: number): readonly TimerFlowRunView[];
  getTrace(flowRunId: string): TimerTraceTree | undefined;
  stopAll(): void;
}
