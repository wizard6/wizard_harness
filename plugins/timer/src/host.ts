import { randomUUID } from 'node:crypto';
import type {
  TimerAction,
  TimerCreateOpts,
  TimerFlowDef,
  TimerInspect,
  TimerJobState,
  TimerJobView,
  TimerLogEntry,
  TimerOnError,
  TimerRunState,
  TimerRunView,
  TimerSchedule,
  TimerService,
  TimerUpdatePatch,
} from '@wizard-harness/contracts';
import type { ActionDeps } from './actions.js';
import { nextCronFire } from './cron.js';
import { actionAsFlow, runFlow } from './flow-runner.js';
import { materializeFlowPlan } from './flow-plan.js';
import { JobScheduler } from './scheduler.js';
import { TraceStore } from './trace.js';

const LIMITS = {
  MAX_JOBS: 128,
  MAX_LOGS: 500,
  MAX_RUNS: 200,
  DEFAULT_TIMEOUT_MS: 60_000,
  DEFAULT_RETRY_DELAY_MS: 5_000,
};

interface JobRow {
  id: string;
  label: string;
  state: TimerJobState;
  enabled: boolean;
  schedule: TimerSchedule;
  action: TimerAction;
  flow: TimerFlowDef;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  onError: TimerOnError;
  nextFireAt: number | null;
  lastFireAt: number | null;
  fireCount: number;
  lastError?: string;
  retriesLeft: number;
  activeRunId?: string;
}

interface RunRow {
  id: string;
  jobId: string;
  state: TimerRunState;
  startedAt: number;
  endedAt?: number;
  attempt: number;
  error?: string;
  summary?: string;
  ac: AbortController;
}

export interface TimerHostOpts extends ActionDeps {
  now?: () => number;
  log?: (level: TimerLogEntry['level'], message: string, meta?: { jobId?: string; runId?: string }) => void;
  maxJobs?: number;
}

function computeNext(schedule: TimerSchedule, after: number): number {
  if (schedule.kind === 'interval') {
    const ms = Math.max(100, Number(schedule.intervalMs ?? 60_000));
    return after + ms;
  }
  if (schedule.kind === 'once') {
    const ms = Math.max(0, Number(schedule.delayMs ?? 0));
    return after + ms;
  }
  const cron = String(schedule.cron ?? '').trim();
  if (!cron) throw new Error('cron 调度需要 cron 字段');
  return nextCronFire(cron, after);
}

function firstFire(schedule: TimerSchedule, now: number): number {
  if (schedule.kind === 'once') return now + Math.max(0, Number(schedule.delayMs ?? 0));
  if (schedule.kind === 'interval') return now + Math.max(100, Number(schedule.intervalMs ?? 60_000));
  return nextCronFire(String(schedule.cron ?? '').trim(), now - 1);
}

function resolveFlow(action: TimerAction, flow?: TimerFlowDef): TimerFlowDef {
  return flow ?? actionAsFlow(action);
}

function view(job: JobRow, activeRunId?: string): TimerJobView {
  return {
    id: job.id,
    label: job.label,
    state: job.state,
    enabled: job.enabled,
    schedule: job.schedule,
    action: job.action,
    flow: job.flow,
    timeoutMs: job.timeoutMs,
    maxRetries: job.maxRetries,
    retryDelayMs: job.retryDelayMs,
    onError: job.onError,
    nextFireAt: job.nextFireAt,
    lastFireAt: job.lastFireAt,
    fireCount: job.fireCount,
    lastError: job.lastError,
    activeRunId,
  };
}

export function createTimerHost(opts: TimerHostOpts = { emit: () => {} }): TimerService {
  const now = opts.now ?? Date.now;
  const jobs = new Map<string, JobRow>();
  const runs = new Map<string, RunRow>();
  const runHistory: TimerRunView[] = [];
  const logs: TimerLogEntry[] = [];
  const trace = new TraceStore(now);
  const maxJobs = Math.min(LIMITS.MAX_JOBS, Math.max(1, opts.maxJobs ?? LIMITS.MAX_JOBS));

  const pushLog = (level: TimerLogEntry['level'], message: string, meta?: { jobId?: string; runId?: string }) => {
    logs.push({ at: now(), level, message, jobId: meta?.jobId, runId: meta?.runId });
    if (logs.length > LIMITS.MAX_LOGS) logs.splice(0, logs.length - LIMITS.MAX_LOGS);
    opts.log?.(level, message, meta);
  };

  const scheduleJob = (job: JobRow) => {
    if (job.state !== 'running' || !job.enabled) {
      scheduler.set(job.id, 0);
      job.nextFireAt = null;
      return;
    }
    const at = job.nextFireAt && job.nextFireAt > now() ? job.nextFireAt : firstFire(job.schedule, now());
    job.nextFireAt = at;
    scheduler.set(job.id, at);
  };

  const finishRun = (run: RunRow, state: TimerRunState, summary?: string, error?: string) => {
    run.state = state;
    run.endedAt = now();
    run.summary = summary;
    run.error = error;
    const snapshot: TimerRunView = {
      id: run.id,
      jobId: run.jobId,
      state: run.state,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      attempt: run.attempt,
      error: run.error,
      summary: run.summary,
    };
    runHistory.push(snapshot);
    if (runHistory.length > LIMITS.MAX_RUNS) runHistory.splice(0, runHistory.length - LIMITS.MAX_RUNS);
    runs.delete(run.id);
    const job = jobs.get(run.jobId);
    if (job && job.activeRunId === run.id) job.activeRunId = undefined;
  };

  const executeRun = async (job: JobRow, attempt: number): Promise<void> => {
    const runId = `run-${randomUUID().slice(0, 10)}`;
    const ac = new AbortController();
    const run: RunRow = {
      id: runId,
      jobId: job.id,
      state: 'running',
      startedAt: now(),
      attempt,
      ac,
    };
    runs.set(runId, run);
    job.activeRunId = runId;
    const flow = job.flow;
    const plan = materializeFlowPlan(`flow-${runId}`, flow);
    const flowRun = trace.startFlowRun(job.id, runId, plan);
    pushLog('info', `执行开始（${flow.kind === 'chain' ? '链条' : '决策树'}）`, { jobId: job.id, runId });
    opts.emit('timer/run/start', runId, { jobId: job.id, attempt, flowRunId: flowRun.id });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, job.timeoutMs);
    const delay = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        ac.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new Error('cancelled'));
          },
          { once: true },
        );
      });
    try {
      const out = await runFlow(flow, {
        flowRunId: flowRun.id,
        signal: ac.signal,
        deps: opts,
        trace,
        delay,
      });
      clearTimeout(timeout);
      const state: TimerRunState = out.state === 'ok' ? 'ok' : out.state;
      finishRun(run, state, out.summary);
      trace.finishFlowRun(flowRun.id, state);
      job.lastError = undefined;
      job.retriesLeft = job.maxRetries;
      pushLog('info', `执行成功：${out.summary.slice(0, 120)}`, { jobId: job.id, runId });
      opts.emit('timer/run/done', runId, { jobId: job.id, summary: out.summary, flowRunId: flowRun.id });
    } catch (err) {
      clearTimeout(timeout);
      const msg = String(err);
      const state: TimerRunState = ac.signal.aborted ? (timedOut ? 'timeout' : 'cancelled') : 'error';
      finishRun(run, state, undefined, msg);
      trace.finishFlowRun(flowRun.id, state);
      job.lastError = msg;
      pushLog('error', `执行失败：${msg}`, { jobId: job.id, runId });
      opts.emit('timer/run/error', runId, { jobId: job.id, error: msg, state });

      if (state === 'cancelled') return;
      if (job.onError === 'stop') {
        job.state = 'stopped';
        job.nextFireAt = null;
        scheduler.remove(job.id);
        return;
      }
      if (job.onError === 'retry' && job.retriesLeft > 0) {
        job.retriesLeft -= 1;
        job.nextFireAt = now() + job.retryDelayMs;
        scheduler.set(job.id, job.nextFireAt);
        pushLog('warn', `将重试，剩余 ${job.retriesLeft} 次`, { jobId: job.id });
        return;
      }
    }
  };

  const fireJob = async (jobId: string, manual = false) => {
    const job = jobs.get(jobId);
    if (!job) return;
    if (job.activeRunId) {
      pushLog('warn', '上次执行未完成，跳过本次触发（防重叠）', { jobId });
      if (!manual && job.schedule.kind !== 'once') {
        job.nextFireAt = computeNext(job.schedule, now());
        scheduler.set(job.id, job.nextFireAt);
      }
      return;
    }
    job.lastFireAt = now();
    job.fireCount += 1;
    if (!manual) opts.emit('timer/job/fire', job.id, { label: job.label });
    await executeRun(job, 1);
    if (job.schedule.kind === 'once') {
      job.state = 'stopped';
      job.nextFireAt = null;
      scheduler.remove(job.id);
      return;
    }
    if (job.state === 'running') {
      job.nextFireAt = computeNext(job.schedule, now());
      scheduler.set(job.id, job.nextFireAt);
    }
  };

  const scheduler = new JobScheduler((ts) => {
    for (const id of scheduler.due(ts)) {
      void fireJob(id);
    }
  });

  const api: TimerService = {
    inspect(): TimerInspect {
      let runningJobs = 0;
      for (const j of jobs.values()) if (j.state === 'running') runningJobs += 1;
      return {
        jobCount: jobs.size,
        runningJobs,
        activeRuns: runs.size,
        wakeAt: scheduler.peekWakeAt(),
      };
    },
    list: () => [...jobs.values()].map((j) => view(j, j.activeRunId)),
    get: (id) => {
      const j = jobs.get(id);
      return j ? view(j, j.activeRunId) : undefined;
    },
    create(createOpts) {
      if (jobs.size >= maxJobs) throw new Error(`任务数上限 ${maxJobs}`);
      const id = String(createOpts.id ?? `job-${randomUUID().slice(0, 8)}`).trim();
      if (jobs.has(id)) throw new Error(`任务已存在：${id}`);
      const action =
        createOpts.action ??
        createOpts.flow?.steps?.[0]?.action ??
        createOpts.flow?.action ??
        ({ kind: 'event', action: 'timer/tick' } as TimerAction);
      const flow = resolveFlow(action, createOpts.flow);
      const job: JobRow = {
        id,
        label: String(createOpts.label ?? id).trim() || id,
        state: 'stopped',
        enabled: createOpts.enabled !== false,
        schedule: createOpts.schedule,
        action,
        flow,
        timeoutMs: Math.max(1000, Number(createOpts.timeoutMs ?? LIMITS.DEFAULT_TIMEOUT_MS)),
        maxRetries: Math.max(0, Number(createOpts.maxRetries ?? 0)),
        retryDelayMs: Math.max(500, Number(createOpts.retryDelayMs ?? LIMITS.DEFAULT_RETRY_DELAY_MS)),
        onError: createOpts.onError ?? 'continue',
        nextFireAt: null,
        lastFireAt: null,
        fireCount: 0,
        retriesLeft: Math.max(0, Number(createOpts.maxRetries ?? 0)),
      };
      jobs.set(id, job);
      pushLog('info', `创建任务 ${job.label}`, { jobId: id });
      opts.emit('timer/job/created', id, { label: job.label });
      if (createOpts.autostart) api.start(id);
      return view(job);
    },
    update(id, patch) {
      const job = jobs.get(id);
      if (!job) throw new Error(`任务不存在：${id}`);
      if (patch.label !== undefined) job.label = String(patch.label).trim() || job.label;
      if (patch.schedule) job.schedule = patch.schedule;
      if (patch.action) job.action = patch.action;
      if (patch.flow) job.flow = patch.flow;
      else if (patch.action) job.flow = resolveFlow(patch.action, job.flow);
      if (patch.flow && !patch.action) job.action = patch.flow.steps?.[0]?.action ?? job.action;
      if (patch.enabled !== undefined) job.enabled = Boolean(patch.enabled);
      if (patch.timeoutMs !== undefined) job.timeoutMs = Math.max(1000, Number(patch.timeoutMs));
      if (patch.maxRetries !== undefined) {
        job.maxRetries = Math.max(0, Number(patch.maxRetries));
        job.retriesLeft = job.maxRetries;
      }
      if (patch.retryDelayMs !== undefined) job.retryDelayMs = Math.max(500, Number(patch.retryDelayMs));
      if (patch.onError) job.onError = patch.onError;
      if (job.state === 'running') scheduleJob(job);
      return view(job, job.activeRunId);
    },
    remove(id) {
      const job = jobs.get(id);
      if (!job) return false;
      if (job.activeRunId) runs.get(job.activeRunId)?.ac.abort();
      scheduler.remove(id);
      jobs.delete(id);
      pushLog('info', `删除任务`, { jobId: id });
      return true;
    },
    start(id) {
      const job = jobs.get(id);
      if (!job) throw new Error(`任务不存在：${id}`);
      if (!job.enabled) throw new Error('任务已禁用');
      job.state = 'running';
      job.retriesLeft = job.maxRetries;
      scheduleJob(job);
      pushLog('info', '已启动', { jobId: id });
      opts.emit('timer/job/start', id, { label: job.label });
      return view(job, job.activeRunId);
    },
    stop(id) {
      const job = jobs.get(id);
      if (!job) throw new Error(`任务不存在：${id}`);
      if (job.activeRunId) runs.get(job.activeRunId)?.ac.abort();
      job.state = 'stopped';
      job.nextFireAt = null;
      scheduler.remove(id);
      pushLog('info', '已停止', { jobId: id });
      opts.emit('timer/job/stop', id, { label: job.label });
      return view(job);
    },
    pause(id) {
      const job = jobs.get(id);
      if (!job) throw new Error(`任务不存在：${id}`);
      job.state = 'paused';
      job.nextFireAt = null;
      scheduler.remove(id);
      pushLog('info', '已暂停', { jobId: id });
      return view(job, job.activeRunId);
    },
    resume(id) {
      const job = jobs.get(id);
      if (!job) throw new Error(`任务不存在：${id}`);
      return api.start(id);
    },
    async trigger(id) {
      const job = jobs.get(id);
      if (!job) throw new Error(`任务不存在：${id}`);
      const before = runHistory.length;
      await fireJob(id, true);
      const added = runHistory.slice(before);
      const last = added[added.length - 1];
      if (last) return last;
      throw new Error('触发后无运行记录');
    },
    cancelRun(runId) {
      const run = runs.get(runId);
      if (!run) return false;
      run.ac.abort();
      pushLog('warn', '运行已取消', { jobId: run.jobId, runId });
      opts.emit('timer/run/cancel', runId, { jobId: run.jobId });
      return true;
    },
    runs(jobId, limit = 50) {
      const active = [...runs.values()].map((r) => ({
        id: r.id,
        jobId: r.jobId,
        state: r.state,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        attempt: r.attempt,
        error: r.error,
        summary: r.summary,
      }));
      let pool = [...runHistory, ...active];
      if (jobId) pool = pool.filter((r) => r.jobId === jobId);
      return pool.slice(-limit);
    },
    logs(query = {}) {
      const lim = Math.min(200, Math.max(1, query.limit ?? 80));
      let rows = logs;
      if (query.jobId) rows = rows.filter((l) => l.jobId === query.jobId);
      return rows.slice(-lim);
    },
    flowRuns(jobId, limit = 30) {
      return trace.listFlowRuns(jobId, limit);
    },
    getTrace(flowRunId) {
      return trace.getTree(flowRunId);
    },
    stopAll() {
      for (const run of runs.values()) run.ac.abort();
      for (const id of [...jobs.keys()]) {
        const j = jobs.get(id)!;
        j.state = 'stopped';
        j.nextFireAt = null;
      }
      scheduler.clear();
      pushLog('info', '全部任务已停止');
    },
  };

  return api;
}
