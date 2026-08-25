import type { Plugin } from '@wizard-harness/core';
import { TIMER_SERVICE } from '@wizard-harness/contracts';
import type {
  ConsoleService,
  PromptContextService,
  TimerService,
  ToolboxService,
  WorkflowService,
} from '@wizard-harness/contracts';
import { createTimerHost } from './host.js';
import { TIMER_HTML } from './page.js';

const state = { impl: undefined as TimerService | undefined };

function live(): TimerService {
  if (!state.impl) throw new Error('timer 未就绪');
  return state.impl;
}

const api: TimerService = {
  inspect: () => live().inspect(),
  list: () => live().list(),
  get: (id) => live().get(id),
  create: (opts) => live().create(opts),
  update: (id, patch) => live().update(id, patch),
  remove: (id) => live().remove(id),
  start: (id) => live().start(id),
  stop: (id) => live().stop(id),
  pause: (id) => live().pause(id),
  resume: (id) => live().resume(id),
  trigger: (id) => live().trigger(id),
  cancelRun: (runId) => live().cancelRun(runId),
  runs: (jobId, limit) => live().runs(jobId, limit),
  flowRuns: (jobId, limit) => live().flowRuns(jobId, limit),
  getTrace: (flowRunId) => live().getTrace(flowRunId),
  logs: (opts) => live().logs(opts),
  stopAll: () => live().stopAll(),
};

const timerPlugin: Plugin = {
  manifest: {
    id: 'timer',
    version: '0.1.0',
    name: '定时器',
    description: '高性能定时任务：interval / once / cron，可打断、重试兜底、运行日志与监控面板。',
    provides: [TIMER_SERVICE],
    config: {
      maxJobs: 64,
      defaultJobs: [],
    },
    tier: 'standard',
  },
  inject: { logger: false, console: false, toolbox: false, workflow: false },
  api,
  ui: {
    title: '定时器',
    width: 900,
    height: 640,
    rpc: {
      timer: [
        'inspect',
        'list',
        'get',
        'create',
        'update',
        'remove',
        'start',
        'stop',
        'pause',
        'resume',
        'trigger',
        'cancelRun',
        'runs',
        'logs',
        'flowRuns',
        'getTrace',
        'stopAll',
      ],
    },
    content: TIMER_HTML,
  },
  register(c) {
    const maxJobs = Math.max(1, Number(c.config.maxJobs ?? 64));
    state.impl = createTimerHost({
      maxJobs,
      toolbox: c.toolbox ?? c.get<ToolboxService>('toolbox'),
      workflow: c.workflow ?? c.get<WorkflowService>('workflow'),
      console: c.console ?? c.get<ConsoleService>('console'),
      emit: (action, target, payload) => c.emit({ action, target, payload }),
      log: (level, message, meta) => {
        const line = meta?.jobId ? `[${meta.jobId}] ${message}` : message;
        if (level === 'error') c.logger?.error?.(line);
        else if (level === 'warn') c.logger?.warn?.(line);
        else c.logger?.info?.(line);
      },
    });

    const defaults = Array.isArray(c.config.defaultJobs) ? c.config.defaultJobs : [];
    for (const row of defaults) {
      try {
        const job = state.impl.create(row as Parameters<TimerService['create']>[0]);
        if ((row as { autostart?: boolean }).autostart !== false) state.impl.start(job.id);
      } catch (err) {
        c.logger?.warn?.(`timer 默认任务跳过：${String(err)}`);
      }
    }

    const prompts = c.promptContext ?? c.get<PromptContextService>('promptContext');
    if (prompts) {
      prompts.section({
        name: 'tool:timer',
        order: 75,
        text:
          '定时器（timer.*）：可创建 interval / once / cron 任务，动作支持 event、toolbox、workflow、shell。' +
          '监控弹窗可启停、手动触发、取消运行；失败可重试或停止。',
      });
    }

    c.logger?.info?.(`timer 插件就绪（最多 ${maxJobs} 个任务）`);
    c.effect(() => () => {
      state.impl?.stopAll();
      state.impl = undefined;
    });
  },
};

export default timerPlugin;
